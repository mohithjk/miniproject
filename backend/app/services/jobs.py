"""Background job queue worker (SKIP LOCKED, retries) and job handlers."""
import re
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai_interface
from app.config import settings
from app.models import Commit, Event, Job, Node, NodeCommit, Project
from app.services.notify import create_notification
from app.services.unlock import (
    calculate_completion_score,
    decide_completion_action,
    unlock_node,
)


# --- Explicit Tag Matching Helpers ---
def find_tag_in_text(text: str, valid_keys: set[str]) -> Optional[str]:
    """
    Search for explicit node keys in commit messages or git branch/ref strings.
    Supports:
      - 'closes n1', 'close n1', 'fixes n1', 'fix n1', 'resolves n1'
      - '[n1]', '(n1)'
      - 'feat/n1', 'refs/heads/n1-auth', etc.
    """
    if not text:
        return None

    # Check action verbs
    action_match = re.search(
        r"\b(?:closes?|closed|fixes?|fixed|resolves?|resolved|ref)\s+([a-zA-Z0-9_-]+)",
        text,
        re.IGNORECASE,
    )
    if action_match:
        target = action_match.group(1).lower()
        for k in valid_keys:
            if k.lower() == target:
                return k

    # Check brackets or path prefixes
    for k in valid_keys:
        k_esc = re.escape(k)
        if re.search(rf"[\[\(]{k_esc}[\]\)]", text, re.IGNORECASE):
            return k
        if re.search(rf"(?:^|/|-){k_esc}(?:$|/|-|_|\b)", text, re.IGNORECASE):
            return k

    return None


def find_path_match(files: list[str], open_nodes: list[Node]) -> Optional[Node]:
    """Match commit to a node whose path_hints match any of the commit's changed files."""
    if not files:
        return None
    for node in open_nodes:
        if not node.path_hints:
            continue
        for hint in node.path_hints:
            norm_hint = hint.strip("/").lower()
            for f in files:
                norm_file = f.strip("/").lower()
                if norm_file.startswith(norm_hint):
                    return node
    return None


# --- Job Handlers ---
async def process_plan_job(job: Job, db: AsyncSession) -> dict[str, Any]:
    """Execute a 'plan' job: calls AI stub, saves draft plan event, and marks job done."""
    project_id = job.payload.get("project_id")
    readme = job.payload.get("readme", "")
    file_tree = job.payload.get("file_tree", [])

    try:
        plan_data = ai_interface.generate_plan(readme=readme, file_tree=file_tree)
    except Exception as exc:
        error_msg = f"Plan generation failed: {str(exc)}"
        event = Event(
            project_id=project_id,
            type="plan_failed",
            payload={"error": error_msg},
        )
        db.add(event)
        job.status = "failed"
        job.payload = {**job.payload, "error": error_msg}
        await db.commit()
        raise

    # Save draft plan as an append-only event
    event = Event(
        project_id=project_id,
        type="plan_draft",
        payload=plan_data,
    )
    db.add(event)

    job.status = "done"
    job.payload = {**job.payload, "result": plan_data}
    await db.commit()
    return plan_data


async def process_match_job(job: Job, db: AsyncSession) -> dict[str, Any]:
    """
    Execute a 'match' job:
    1. Retrieve open candidate nodes (ready or in_progress).
    2. Try explicit tag matching (commit message or branch ref).
    3. Try path-based matching (commit files matching node path_hints).
    4. Fall back to AI stub matching.
    5. Write node_commits association.
    6. Transition a 'ready' node to 'in_progress' on its first match.
    """
    project_id = job.payload.get("project_id")
    commit_shas = job.payload.get("commit_shas") or []
    ref = job.payload.get("ref", "")

    # Fetch open candidate nodes in the project (ready or in_progress)
    node_stmt = (
        select(Node)
        .where(
            Node.project_id == project_id,
            Node.status.in_(["ready", "in_progress"]),
        )
        .order_by(Node.id.asc())
    )
    open_nodes = (await db.execute(node_stmt)).scalars().all()
    if not open_nodes:
        job.status = "done"
        job.payload = {**job.payload, "result": "no_open_nodes"}
        await db.commit()
        return {"matched": [], "reason": "no_open_nodes"}

    # Fetch commits to match
    commit_stmt = select(Commit).where(Commit.project_id == project_id)
    if commit_shas:
        commit_stmt = commit_stmt.where(Commit.sha.in_(commit_shas))
    commits = (await db.execute(commit_stmt)).scalars().all()

    valid_keys = {n.key for n in open_nodes}
    key_to_node = {n.key: n for n in open_nodes}
    matches: list[dict[str, Any]] = []

    for c in commits:
        matched_node: Optional[Node] = None
        method = "llm"
        confidence = 0.85

        # 1. Explicit tag matching
        tag_key = find_tag_in_text(c.message, valid_keys) or find_tag_in_text(ref, valid_keys)
        if tag_key and tag_key in key_to_node:
            matched_node = key_to_node[tag_key]
            method = "tag"
            confidence = 1.0

        # 2. Path-based matching
        if not matched_node and c.files:
            path_node = find_path_match(c.files, open_nodes)
            if path_node:
                matched_node = path_node
                method = "path"
                confidence = 0.9

        # 3. AI stub matching fallback
        if not matched_node:
            open_payload = [
                {"key": n.key, "title": n.title, "description": n.description, "role": n.role}
                for n in open_nodes
            ]
            commit_payload = {
                "sha": c.sha,
                "message": c.message,
                "files": c.files,
                "author": c.author_login,
            }
            ai_res = ai_interface.match_commit(commit_payload, open_payload)
            ai_key = ai_res.get("node_key")
            if ai_key and ai_key in key_to_node:
                matched_node = key_to_node[ai_key]
                method = ai_res.get("method", "llm")
                confidence = float(ai_res.get("confidence", 0.85))

        # Persist match if found
        if matched_node:
            nc_stmt = select(NodeCommit).where(
                NodeCommit.node_id == matched_node.id,
                NodeCommit.commit_id == c.id,
            )
            existing_nc = (await db.execute(nc_stmt)).scalar_one_or_none()
            if not existing_nc:
                db.add(
                    NodeCommit(
                        node_id=matched_node.id,
                        commit_id=c.id,
                        confidence=confidence,
                        method=method,
                    )
                )

            # Transition 'ready' node to 'in_progress' on first matched commit
            if matched_node.status == "ready":
                matched_node.status = "in_progress"
                db.add(
                    Event(
                        project_id=project_id,
                        type="node_in_progress",
                        payload={
                            "node_id": matched_node.id,
                            "node_key": matched_node.key,
                            "commit_sha": c.sha,
                            "method": method,
                        },
                    )
                )

            matches.append({
                "commit_sha": c.sha,
                "node_key": matched_node.key,
                "method": method,
                "confidence": confidence,
            })

    job.status = "done"
    job.payload = {**job.payload, "result": matches}
    await db.commit()
    return {"matched": matches}


async def process_judge_job(job: Job, db: AsyncSession) -> dict[str, Any]:
    """
    Execute a 'judge' job:
    1. Gather signals: pr_merged, ci_passed, files_exist.
    2. Determine candidate target nodes.
    3. Call ai_interface.judge_completion for each target node.
    4. Calculate score via calculate_completion_score.
    5. If score >= 0.8: auto-complete via unlock_node.
    6. If 0.5 <= score < 0.8: create 'please confirm' notification for node owner.
    7. If score < 0.5: leave in_progress.
    8. Log node_evaluated event.
    """
    project_id = job.payload.get("project_id")
    target_node_id = job.payload.get("node_id")
    target_node_key = job.payload.get("node_key")

    # Signal 1: CI passed
    ci_passed = job.payload.get("ci_passed")
    if ci_passed is None:
        ci_evt_stmt = (
            select(Event)
            .where(Event.project_id == project_id, Event.type == "workflow_run")
            .order_by(Event.id.desc())
        )
        ci_evt = (await db.execute(ci_evt_stmt)).scalars().first()
        ci_passed = bool(ci_evt and ci_evt.payload.get("conclusion") == "success")

    # Signal 2: PR merged
    pr_merged = bool(job.payload.get("pr_merged", False))
    if not pr_merged:
        pr_evt_stmt = (
            select(Event)
            .where(Event.project_id == project_id, Event.type == "pull_request_merged")
            .order_by(Event.id.desc())
        )
        pr_evt = (await db.execute(pr_evt_stmt)).scalars().first()
        pr_merged = bool(pr_evt and pr_evt.payload.get("merged", False))

    # Candidate nodes
    if target_node_id:
        target_nodes = [await db.get(Node, target_node_id)]
        target_nodes = [n for n in target_nodes if n and n.status in ["ready", "in_progress"]]
    elif target_node_key:
        stmt = select(Node).where(
            Node.project_id == project_id,
            Node.key == target_node_key,
            Node.status.in_(["ready", "in_progress"]),
        )
        target_nodes = (await db.execute(stmt)).scalars().all()
    else:
        stmt = select(Node).where(
            Node.project_id == project_id,
            Node.status.in_(["ready", "in_progress"]),
        )
        target_nodes = (await db.execute(stmt)).scalars().all()

    # Changed files across all commits in project for files_exist check
    commits_stmt = select(Commit).where(Commit.project_id == project_id)
    all_commits = (await db.execute(commits_stmt)).scalars().all()
    all_changed_files: set[str] = set()
    for c in all_commits:
        for f in (c.files or []):
            all_changed_files.add(f.strip("/").lower())

    results = []
    for node in target_nodes:
        # Signal 3: expected_files_exist
        files_exist = False
        if not node.path_hints:
            files_exist = True
        else:
            for hint in node.path_hints:
                norm_hint = hint.strip("/").lower()
                if any(f.startswith(norm_hint) for f in all_changed_files):
                    files_exist = True
                    break

        # Matched commits diff summary
        nc_stmt = (
            select(Commit)
            .join(NodeCommit, NodeCommit.commit_id == Commit.id)
            .where(NodeCommit.node_id == node.id)
        )
        matched_commits = (await db.execute(nc_stmt)).scalars().all()
        diff_summary = "\n".join(
            f"Commit {c.sha[:7]}: {c.message} (files: {', '.join(c.files or [])})"
            for c in matched_commits
        ) or "No commit diff summary available"

        signals = {
            "pr_merged": pr_merged,
            "ci_passed": ci_passed,
            "files_exist": files_exist,
        }

        node_dict = {
            "key": node.key,
            "title": node.title,
            "description": node.description,
            "role": node.role,
            "done_criteria": node.done_criteria,
        }

        judge_res = ai_interface.judge_completion(
            node=node_dict,
            diff_summary=diff_summary,
            signals=signals,
        )
        verdict = judge_res.get("verdict", "not_done")
        confidence = float(judge_res.get("confidence", 0.0))
        reason = judge_res.get("reason", "")

        score = calculate_completion_score(
            pr_merged=pr_merged,
            ci_passed=ci_passed,
            expected_files_exist=files_exist,
            verdict=verdict,
            judge_confidence=confidence,
        )

        action = decide_completion_action(score)

        db.add(
            Event(
                project_id=project_id,
                type="node_evaluated",
                payload={
                    "node_id": node.id,
                    "node_key": node.key,
                    "verdict": verdict,
                    "confidence": confidence,
                    "score": score,
                    "reason": reason,
                    "action": action,
                    "signals": signals,
                },
            )
        )

        if action == "auto_complete":
            await unlock_node(node.id, db)
        elif action == "ask_confirm":
            recipient_id = node.owner_id
            if not recipient_id:
                proj = await db.get(Project, project_id)
                recipient_id = proj.owner_id if proj else None
            if recipient_id:
                await create_notification(
                    db=db,
                    user_id=recipient_id,
                    project_id=project_id,
                    node_id=node.id,
                    message=f"Node [{node.key}] '{node.title}' reached score {score:.2f}. Please confirm completion.",
                )

        results.append({
            "node_key": node.key,
            "node_id": node.id,
            "score": score,
            "action": action,
            "verdict": verdict,
        })

    job.status = "done"
    job.payload = {**job.payload, "result": results}
    await db.commit()
    return {"results": results}


# --- Worker Queue Processor ---
async def fetch_and_lock_next_job(db: AsyncSession) -> Optional[Job]:
    """
    Select the next pending job using SELECT ... FOR UPDATE SKIP LOCKED
    with attempt limits.
    """
    stmt = (
        select(Job)
        .where(
            Job.status == "pending",
            Job.attempts < settings.MAX_JOB_ATTEMPTS,
        )
        .order_by(Job.id.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    job = (await db.execute(stmt)).scalar_one_or_none()
    if not job:
        return None

    job.status = "running"
    job.attempts += 1
    await db.commit()
    await db.refresh(job)
    return job


async def process_single_job(job: Job, db: AsyncSession) -> dict[str, Any]:
    """Execute a single locked job based on its type and handle retries/failure."""
    try:
        if job.type == "plan":
            return await process_plan_job(job, db)
        elif job.type == "match":
            return await process_match_job(job, db)
        elif job.type == "judge":
            return await process_judge_job(job, db)
        else:
            raise ValueError(f"Unknown job type: {job.type}")
    except Exception as exc:
        if job.attempts >= settings.MAX_JOB_ATTEMPTS:
            job.status = "failed"
            project_id = job.payload.get("project_id") if isinstance(job.payload, dict) else None
            if project_id:
                db.add(
                    Event(
                        project_id=project_id,
                        type="job_failed",
                        payload={
                            "job_id": job.id,
                            "job_type": job.type,
                            "attempts": job.attempts,
                            "error": str(exc),
                        },
                    )
                )
        else:
            job.status = "pending"  # Re-enqueue for retry
        job.payload = {**job.payload, "error": str(exc)}
        await db.commit()
        raise


async def run_worker_once(db: AsyncSession) -> Optional[Job]:
    """Fetch and process a single pending job from the jobs queue."""
    job = await fetch_and_lock_next_job(db)
    if not job:
        return None
    try:
        await process_single_job(job, db)
    except Exception:
        pass
    return job


async def run_worker_until_empty(db: AsyncSession, max_jobs: int = 50) -> int:
    """Process pending jobs until queue is empty or max_jobs processed."""
    processed = 0
    for _ in range(max_jobs):
        job = await run_worker_once(db)
        if not job:
            break
        processed += 1
    return processed


async def get_or_generate_draft_plan(project_id: int, db: AsyncSession) -> dict[str, Any]:
    """Retrieve existing draft plan event or process pending plan job for project."""
    event_stmt = (
        select(Event)
        .where(Event.project_id == project_id, Event.type.in_(["plan_draft", "plan_failed"]))
        .order_by(Event.id.desc())
    )
    latest_event = (await db.execute(event_stmt)).scalars().first()
    if latest_event and latest_event.type == "plan_draft":
        return latest_event.payload

    job_stmt = (
        select(Job)
        .where(Job.type == "plan", Job.status == "pending")
        .order_by(Job.id.desc())
    )
    for job in (await db.execute(job_stmt)).scalars().all():
        if job.payload.get("project_id") == project_id:
            job.attempts += 1
            try:
                return await process_plan_job(job, db)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Plan generation failed: {str(exc)}",
                )

    if latest_event and latest_event.type == "plan_failed":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=latest_event.payload.get("error", "Plan generation failed"),
        )

    proj = await db.get(Project, project_id)
    try:
        plan_data = ai_interface.generate_plan(readme=proj.readme_text or "" if proj else "", file_tree=[])
    except Exception as exc:
        error_msg = f"Plan generation failed: {str(exc)}"
        db.add(
            Event(
                project_id=project_id,
                type="plan_failed",
                payload={"error": error_msg},
            )
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg,
        )

    event = Event(
        project_id=project_id,
        type="plan_draft",
        payload=plan_data,
    )
    db.add(event)
    await db.commit()
    return plan_data
