"""Background job queue worker (SKIP LOCKED, retries) and job handlers."""
import re
from typing import Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import ai_interface
from app.config import settings
from app.models import Commit, Event, Job, Node, NodeCommit, Project


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

    # Call AI planning stub
    plan_data = ai_interface.generate_plan(readme=readme, file_tree=file_tree)

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
    """Placeholder for 'judge' job to be completed in Stage 6."""
    job.status = "done"
    job.payload = {**job.payload, "result": "judge_acknowledged"}
    await db.commit()
    return {"status": "ok"}


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
        .where(Event.project_id == project_id, Event.type == "plan_draft")
        .order_by(Event.id.desc())
    )
    latest_event = (await db.execute(event_stmt)).scalar_one_or_none()
    if latest_event:
        return latest_event.payload

    job_stmt = (
        select(Job)
        .where(Job.type == "plan", Job.status == "pending")
        .order_by(Job.id.desc())
    )
    for job in (await db.execute(job_stmt)).scalars().all():
        if job.payload.get("project_id") == project_id:
            job.attempts += 1
            return await process_plan_job(job, db)

    proj = await db.get(Project, project_id)
    plan_data = ai_interface.generate_plan(readme=proj.readme_text or "" if proj else "", file_tree=[])
    event = Event(
        project_id=project_id,
        type="plan_draft",
        payload=plan_data,
    )
    db.add(event)
    await db.commit()
    return plan_data
