"""GitHub Webhook ingress router with signature verification, deduplication, and background dispatch."""
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decrypt_token
from app.db import AsyncSessionLocal, get_db
from app.models import Commit, Event, Job, Node, Project, User, WebhookDelivery
from app.rate_limiter import RateLimiter
from app.services import github
from app.services.jobs import find_tag_in_text

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
webhook_limiter = RateLimiter(requests_limit=120, window_seconds=60)


async def _handle_push_event(db: AsyncSession, proj: Project, payload: dict[str, Any]) -> None:
    """Extract commits from push event, fetch missing details, persist, and queue match job."""
    owner = await db.get(User, proj.owner_id)
    token = decrypt_token(owner.gh_token_enc) if owner and owner.gh_token_enc else ""

    commits = payload.get("commits") or []
    if not commits and payload.get("head_commit"):
        commits = [payload["head_commit"]]

    stored_shas: list[str] = []

    for c in commits:
        sha = c.get("id") or c.get("sha")
        if not sha:
            continue

        # Avoid duplicate commits
        existing_stmt = select(Commit).where(
            Commit.project_id == proj.id,
            Commit.sha == sha,
        )
        if (await db.execute(existing_stmt)).scalar_one_or_none():
            continue

        message = c.get("message", "")
        author_info = c.get("author") or {}
        author_login = author_info.get("username") or author_info.get("name")

        ts_str = c.get("timestamp")
        try:
            committed_at = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except Exception:
            committed_at = datetime.now(timezone.utc)

        # Gather changed files
        added = c.get("added") or []
        modified = c.get("modified") or []
        removed = c.get("removed") or []
        files = list(set(added + modified + removed))

        # Fetch commit via GitHub API if files list is empty
        if not files and token:
            try:
                commit_detail = await github.fetch_commit(
                    token=token,
                    repo_owner=proj.repo_owner,
                    repo_name=proj.repo_name,
                    sha=sha,
                )
                files = [
                    f["filename"]
                    for f in commit_detail.get("files", [])
                    if "filename" in f
                ]
            except Exception:
                files = []

        new_commit = Commit(
            project_id=proj.id,
            sha=sha,
            author_login=author_login,
            message=message,
            files=files,
            committed_at=committed_at,
        )
        db.add(new_commit)
        stored_shas.append(sha)

    # Log audit event
    push_event = Event(
        project_id=proj.id,
        type="push",
        payload={
            "ref": payload.get("ref"),
            "commits": stored_shas,
            "pusher": payload.get("pusher", {}).get("name"),
        },
    )
    db.add(push_event)

    # Queue match job
    if stored_shas:
        match_job = Job(
            type="match",
            payload={
                "project_id": proj.id,
                "commit_shas": stored_shas,
                "ref": payload.get("ref", ""),
            },
            status="pending",
            attempts=0,
        )
        db.add(match_job)

    await db.commit()


async def _handle_pr_event(db: AsyncSession, project_id: int, payload: dict[str, Any]) -> None:
    action = payload.get("action")
    pr_data = payload.get("pull_request", {})
    is_merged = pr_data.get("merged", False)

    if action == "closed" and is_merged:
        pr_number = payload.get("number") or pr_data.get("number")
        head_ref = pr_data.get("head", {}).get("ref", "")
        pr_title = pr_data.get("title", "")
        pr_body = pr_data.get("body", "") or ""

        # Fetch all nodes to match against branch name or "closes nX"
        node_stmt = select(Node).where(Node.project_id == project_id)
        nodes = (await db.execute(node_stmt)).scalars().all()
        valid_keys = {n.key for n in nodes}

        matched_keys: list[str] = []
        for text in [head_ref, pr_title, pr_body]:
            tag = find_tag_in_text(text, valid_keys)
            if tag and tag not in matched_keys:
                matched_keys.append(tag)

        pr_event = Event(
            project_id=project_id,
            type="pull_request_merged",
            payload={
                "number": pr_number,
                "merged": True,
                "head_ref": head_ref,
                "title": pr_title,
                "matched_nodes": matched_keys,
            },
        )
        db.add(pr_event)

        if matched_keys:
            for k in matched_keys:
                node = next((n for n in nodes if n.key == k), None)
                judge_job = Job(
                    type="judge",
                    payload={
                        "project_id": project_id,
                        "node_id": node.id if node else None,
                        "node_key": k,
                        "signal": "pr_merged",
                        "pr_number": pr_number,
                        "pr_merged": True,
                    },
                    status="pending",
                    attempts=0,
                )
                db.add(judge_job)
        else:
            judge_job = Job(
                type="judge",
                payload={
                    "project_id": project_id,
                    "signal": "pr_merged",
                    "pr_number": pr_number,
                    "pr_merged": True,
                },
                status="pending",
                attempts=0,
            )
            db.add(judge_job)

        await db.commit()


async def _handle_workflow_event(db: AsyncSession, project_id: int, payload: dict[str, Any]) -> None:
    action = payload.get("action")
    workflow_run = payload.get("workflow_run", {})
    conclusion = workflow_run.get("conclusion")

    if action == "completed":
        ci_event = Event(
            project_id=project_id,
            type="workflow_run",
            payload={
                "conclusion": conclusion,
                "name": workflow_run.get("name"),
                "head_branch": workflow_run.get("head_branch"),
            },
        )
        db.add(ci_event)

        judge_job = Job(
            type="judge",
            payload={
                "project_id": project_id,
                "signal": "ci_completed",
                "ci_passed": conclusion == "success",
                "conclusion": conclusion,
            },
            status="pending",
            attempts=0,
        )
        db.add(judge_job)
        await db.commit()


async def _process_event_with_db(db: AsyncSession, project_id: int, event_type: str, payload: dict[str, Any]) -> None:
    proj = await db.get(Project, project_id)
    if not proj:
        return

    if event_type == "push":
        await _handle_push_event(db, proj, payload)
    elif event_type == "pull_request":
        await _handle_pr_event(db, project_id, payload)
    elif event_type == "workflow_run":
        await _handle_workflow_event(db, project_id, payload)


async def process_webhook_event(
    project_id: int,
    event_type: str,
    payload: dict[str, Any],
    db: Optional[AsyncSession] = None,
) -> None:
    """Background processor for verified GitHub webhook events."""
    if db is not None:
        await _process_event_with_db(db, project_id, event_type, payload)
    else:
        async with AsyncSessionLocal() as session:
            await _process_event_with_db(session, project_id, event_type, payload)


@router.post("/github")
async def github_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(webhook_limiter),
):
    """
    Ingest GitHub webhooks.
    1. Read RAW body and parse repo information.
    2. Lookup project and verify HMAC-SHA256 signature using per-project secret.
    3. Deduplicate via X-GitHub-Delivery.
    4. Handle ping events immediately.
    5. Dispatch push/PR/CI event processing to background tasks.
    """
    raw_body = await request.body()
    signature_header = request.headers.get("X-Hub-Signature-256")
    delivery_id = request.headers.get("X-GitHub-Delivery")
    event_type = request.headers.get("X-GitHub-Event", "push")

    # 1. Parse JSON payload to locate repository
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    repo_info = payload.get("repository") or {}
    repo_name = repo_info.get("name")
    owner_info = repo_info.get("owner") or {}
    repo_owner = owner_info.get("login") or owner_info.get("name")

    if not repo_owner or not repo_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository information missing in webhook payload",
        )

    # 2. Look up project
    stmt = select(Project).where(
        Project.repo_owner == repo_owner,
        Project.repo_name == repo_name,
    )
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project not found for repository {repo_owner}/{repo_name}",
        )

    # 3. Verify HMAC-SHA256 signature on RAW body
    if not signature_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Hub-Signature-256 header",
        )

    secret_bytes = project.webhook_secret.encode("utf-8")
    computed_sig = "sha256=" + hmac.new(secret_bytes, raw_body, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_sig, signature_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )

    # 4. Deduplicate via X-GitHub-Delivery
    if delivery_id:
        delivery_stmt = select(WebhookDelivery).where(
            WebhookDelivery.delivery_id == delivery_id
        )
        if (await db.execute(delivery_stmt)).scalar_one_or_none():
            return {"status": "ignored", "reason": "duplicate_delivery", "delivery_id": delivery_id}

        db.add(WebhookDelivery(delivery_id=delivery_id))
        await db.commit()

    # 5. Handle ping event
    if event_type == "ping":
        ping_event = Event(
            project_id=project.id,
            type="ping",
            payload={"zen": payload.get("zen"), "hook_id": payload.get("hook_id")},
        )
        db.add(ping_event)
        await db.commit()
        return {"status": "ok", "message": "pong"}

    # 6. Dispatch background task and return 200 fast
    background_tasks.add_task(process_webhook_event, project.id, event_type, payload)

    return {
        "status": "accepted",
        "event": event_type,
        "delivery_id": delivery_id,
        "project_id": project.id,
    }
