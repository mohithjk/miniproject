from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Commit, Event, Job, Node, NodeCommit
from app.services.jobs import (
    run_worker_once,
)


@pytest.mark.asyncio
async def test_worker_retries_and_failure(test_db: AsyncSession):
    """Jobs that raise exceptions retry up to MAX_JOB_ATTEMPTS, then transition to failed."""
    failing_job = Job(
        type="unknown_broken_type",
        payload={"dummy": 123},
        status="pending",
        attempts=0,
    )
    test_db.add(failing_job)
    await test_db.commit()
    await test_db.refresh(failing_job)

    # 1. First failure -> retried (pending)
    await run_worker_once(test_db)
    await test_db.refresh(failing_job)
    assert failing_job.attempts == 1
    assert failing_job.status == "pending"

    # 2. Second failure -> retried (pending)
    await run_worker_once(test_db)
    await test_db.refresh(failing_job)
    assert failing_job.attempts == 2
    assert failing_job.status == "pending"

    # 3. Third failure (exceeds MAX_JOB_ATTEMPTS) -> failed
    await run_worker_once(test_db)
    await test_db.refresh(failing_job)
    assert failing_job.attempts >= settings.MAX_JOB_ATTEMPTS
    assert failing_job.status == "failed"


@pytest.mark.asyncio
async def test_explicit_tag_message_matching(client: AsyncClient, create_user, test_db: AsyncSession):
    """Commit with 'closes n1' matches via tag, writes node_commits, and transitions ready to in_progress."""
    user, _, headers = await create_user(github_id=701, username="matcher_owner")
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": "match-org", "repo_name": "match-repo-1"},
            headers=headers,
        )
        project_id = proj_resp.json()["id"]

        # Approve plan to create nodes (n1 starts 'ready')
        await client.post(f"/projects/{project_id}/plan/approve", headers=headers)

    # Verify n1 is ready
    n1 = (await test_db.execute(
        select(Node).where(Node.project_id == project_id, Node.key == "n1")
    )).scalar_one()
    assert n1.status == "ready"

    # Create commit with 'closes n1'
    commit = Commit(
        project_id=project_id,
        sha="1111111111111111111111111111111111111111",
        author_login="matcher_owner",
        message="feat: base skeleton complete, closes n1",
        files=["backend/app/main.py"],
        committed_at=commit_time(),
    )
    test_db.add(commit)

    match_job = Job(
        type="match",
        payload={"project_id": project_id, "commit_shas": [commit.sha]},
        status="pending",
        attempts=0,
    )
    test_db.add(match_job)
    await test_db.commit()

    # Process match job via worker
    await run_worker_once(test_db)
    await test_db.refresh(match_job)
    assert match_job.status == "done"

    # Verify node_commits record
    nc = (await test_db.execute(
        select(NodeCommit).where(NodeCommit.node_id == n1.id, NodeCommit.commit_id == commit.id)
    )).scalar_one_or_none()
    assert nc is not None
    assert nc.method == "tag"
    assert nc.confidence == 1.0

    # Verify node moved from 'ready' to 'in_progress'
    await test_db.refresh(n1)
    assert n1.status == "in_progress"

    # Verify audit event
    evt = (await test_db.execute(
        select(Event).where(Event.project_id == project_id, Event.type == "node_in_progress")
    )).scalar_one_or_none()
    assert evt is not None
    assert evt.payload["node_key"] == "n1"


@pytest.mark.asyncio
async def test_explicit_tag_branch_matching(client: AsyncClient, create_user, test_db: AsyncSession):
    """Commit on branch 'refs/heads/n1-feature' matches via tag."""
    user, _, headers = await create_user(github_id=702, username="branch_owner")
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": "match-org", "repo_name": "match-repo-2"},
            headers=headers,
        )
        project_id = proj_resp.json()["id"]
        await client.post(f"/projects/{project_id}/plan/approve", headers=headers)

    n1 = (await test_db.execute(
        select(Node).where(Node.project_id == project_id, Node.key == "n1")
    )).scalar_one()

    commit = Commit(
        project_id=project_id,
        sha="2222222222222222222222222222222222222222",
        author_login="branch_owner",
        message="work in progress without explicit message tag",
        files=["backend/app/models.py"],
        committed_at=commit_time(),
    )
    test_db.add(commit)

    match_job = Job(
        type="match",
        payload={
            "project_id": project_id,
            "commit_shas": [commit.sha],
            "ref": "refs/heads/n1-feature",
        },
        status="pending",
        attempts=0,
    )
    test_db.add(match_job)
    await test_db.commit()

    await run_worker_once(test_db)

    nc = (await test_db.execute(
        select(NodeCommit).where(NodeCommit.node_id == n1.id, NodeCommit.commit_id == commit.id)
    )).scalar_one_or_none()
    assert nc is not None
    assert nc.method == "tag"
    assert nc.confidence == 1.0


@pytest.mark.asyncio
async def test_path_based_matching(client: AsyncClient, create_user, test_db: AsyncSession):
    """Commit matching node path_hints without tags matches with method='path'."""
    user, _, headers = await create_user(github_id=703, username="path_owner")
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": "match-org", "repo_name": "match-repo-3"},
            headers=headers,
        )
        project_id = proj_resp.json()["id"]
        await client.post(f"/projects/{project_id}/plan/approve", headers=headers)

    n1 = (await test_db.execute(
        select(Node).where(Node.project_id == project_id, Node.key == "n1")
    )).scalar_one()
    # n1 path_hints contains 'backend/app'

    commit = Commit(
        project_id=project_id,
        sha="3333333333333333333333333333333333333333",
        author_login="path_owner",
        message="refactor: clean up dependencies",
        files=["backend/app/config.py"],  # matches n1 path hint
        committed_at=commit_time(),
    )
    test_db.add(commit)

    match_job = Job(
        type="match",
        payload={
            "project_id": project_id,
            "commit_shas": [commit.sha],
            "ref": "refs/heads/main",
        },
        status="pending",
        attempts=0,
    )
    test_db.add(match_job)
    await test_db.commit()

    await run_worker_once(test_db)

    nc = (await test_db.execute(
        select(NodeCommit).where(NodeCommit.node_id == n1.id, NodeCommit.commit_id == commit.id)
    )).scalar_one_or_none()
    assert nc is not None
    assert nc.method == "path"
    assert nc.confidence == 0.9


@pytest.mark.asyncio
async def test_ai_stub_matching_fallback(client: AsyncClient, create_user, test_db: AsyncSession):
    """When no tags and no paths match, AI match stub is called with method='llm'."""
    user, _, headers = await create_user(github_id=704, username="ai_owner")
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": "match-org", "repo_name": "match-repo-4"},
            headers=headers,
        )
        project_id = proj_resp.json()["id"]
        await client.post(f"/projects/{project_id}/plan/approve", headers=headers)

    n1 = (await test_db.execute(
        select(Node).where(Node.project_id == project_id, Node.key == "n1")
    )).scalar_one()

    commit = Commit(
        project_id=project_id,
        sha="4444444444444444444444444444444444444444",
        author_login="ai_owner",
        message="misc: general updates",
        files=["other_unrelated_dir/notes.txt"],  # Does not match any path hint
        committed_at=commit_time(),
    )
    test_db.add(commit)

    match_job = Job(
        type="match",
        payload={
            "project_id": project_id,
            "commit_shas": [commit.sha],
            "ref": "refs/heads/main",
        },
        status="pending",
        attempts=0,
    )
    test_db.add(match_job)
    await test_db.commit()

    await run_worker_once(test_db)

    nc = (await test_db.execute(
        select(NodeCommit).where(NodeCommit.node_id == n1.id, NodeCommit.commit_id == commit.id)
    )).scalar_one_or_none()
    assert nc is not None
    assert nc.method == "llm"


def commit_time():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)
