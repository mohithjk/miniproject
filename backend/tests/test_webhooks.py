import hashlib
import hmac
import json
from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Commit, Event, Job, WebhookDelivery
from app.routers.webhooks import process_webhook_event


def sign_body(secret: str, body_bytes: bytes) -> str:
    """Helper to compute GitHub X-Hub-Signature-256 header."""
    return "sha256=" + hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()


async def _setup_project(client: AsyncClient, create_user) -> tuple[int, str, str, str, dict[str, str]]:
    """Helper to create project and return (project_id, repo_owner, repo_name, webhook_secret, auth_headers)."""
    user, _, headers = await create_user(github_id=601, username="webhook_owner")
    repo_owner = "org-hooks"
    repo_name = f"repo-{user.id}"
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=["main.py"]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        resp = await client.post(
            "/projects",
            json={"repo_owner": repo_owner, "repo_name": repo_name},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        return data["id"], repo_owner, repo_name, data["webhook_secret"], headers


@pytest.mark.asyncio
async def test_webhook_missing_signature(client: AsyncClient, create_user):
    """Missing X-Hub-Signature-256 must return 400 Bad Request."""
    project_id, repo_owner, repo_name, secret, _ = await _setup_project(client, create_user)

    body = {
        "repository": {"name": repo_name, "owner": {"login": repo_owner}},
        "commits": [],
    }
    raw_body = json.dumps(body).encode("utf-8")

    resp = await client.post(
        "/webhooks/github",
        content=raw_body,
        headers={"Content-Type": "application/json", "X-GitHub-Event": "push"},
    )
    assert resp.status_code == 400
    assert "Missing X-Hub-Signature-256" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_webhook_invalid_signature(client: AsyncClient, create_user):
    """Invalid signature hash must return 401 Unauthorized."""
    project_id, repo_owner, repo_name, secret, _ = await _setup_project(client, create_user)

    body = {
        "repository": {"name": repo_name, "owner": {"login": repo_owner}},
        "commits": [],
    }
    raw_body = json.dumps(body).encode("utf-8")

    resp = await client.post(
        "/webhooks/github",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": "sha256=invalid_hash_value_12345",
            "X-GitHub-Event": "push",
        },
    )
    assert resp.status_code == 401
    assert "Invalid webhook signature" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_webhook_valid_signature_ping(client: AsyncClient, create_user, test_db: AsyncSession):
    """Valid signature ping event returns pong and stores ping audit event."""
    user, _, headers = await create_user(github_id=602, username="ping_owner")
    repo_owner = "ping-org"
    repo_name = f"ping-repo-{user.id}"
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=["main.py"]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": repo_owner, "repo_name": repo_name},
            headers=headers,
        )
        project_id = proj_resp.json()["id"]
        secret = proj_resp.json()["webhook_secret"]

    body = {
        "zen": "Responsive is better than fast.",
        "hook_id": 9999,
        "repository": {"name": repo_name, "owner": {"login": repo_owner}},
    }
    raw_body = json.dumps(body).encode("utf-8")
    sig = sign_body(secret, raw_body)

    resp = await client.post(
        "/webhooks/github",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": sig,
            "X-GitHub-Event": "ping",
            "X-GitHub-Delivery": "delivery-ping-1",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "pong"

    # Verify event stored
    evt_stmt = select(Event).where(Event.project_id == project_id, Event.type == "ping")
    evt = (await test_db.execute(evt_stmt)).scalar_one_or_none()
    assert evt is not None
    assert evt.payload["hook_id"] == 9999


@pytest.mark.asyncio
async def test_webhook_duplicate_delivery_deduplication(
    client: AsyncClient, create_user, test_db: AsyncSession
):
    """Duplicate X-GitHub-Delivery requests are ignored on subsequent attempts."""
    user, _, headers = await create_user(github_id=603, username="dedupe_owner")
    repo_owner = "dedupe-org"
    repo_name = f"dedupe-repo-{user.id}"
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": repo_owner, "repo_name": repo_name},
            headers=headers,
        )
        secret = proj_resp.json()["webhook_secret"]

    body = {
        "repository": {"name": repo_name, "owner": {"login": repo_owner}},
        "commits": [],
    }
    raw_body = json.dumps(body).encode("utf-8")
    sig = sign_body(secret, raw_body)
    delivery_id = "delivery-uuid-duplicate-test-123"

    # First delivery
    resp1 = await client.post(
        "/webhooks/github",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": sig,
            "X-GitHub-Delivery": delivery_id,
            "X-GitHub-Event": "push",
        },
    )
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "accepted"

    # Second delivery with same delivery ID
    resp2 = await client.post(
        "/webhooks/github",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": sig,
            "X-GitHub-Delivery": delivery_id,
            "X-GitHub-Event": "push",
        },
    )
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "ignored"
    assert resp2.json()["reason"] == "duplicate_delivery"


@pytest.mark.asyncio
async def test_process_push_webhook_stores_commits(
    client: AsyncClient, create_user, test_db: AsyncSession
):
    """Push event stores commits in database, logs push event, and queues match job."""
    user, _, headers = await create_user(github_id=604, username="commit_owner")
    repo_owner = "commit-org"
    repo_name = f"commit-repo-{user.id}"
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": repo_owner, "repo_name": repo_name},
            headers=headers,
        )
        project_id = proj_resp.json()["id"]

    push_payload = {
        "ref": "refs/heads/main",
        "pusher": {"name": "commit_owner"},
        "commits": [
            {
                "id": "abc111222333444555666777888999000aaabbb",
                "message": "feat: add user authentication",
                "timestamp": "2026-11-10T12:00:00Z",
                "author": {"username": "commit_owner"},
                "added": ["app/auth.py"],
                "modified": ["app/main.py"],
                "removed": [],
            }
        ],
    }

    # Execute processor with test_db
    await process_webhook_event(project_id, "push", push_payload, db=test_db)

    # 1. Verify commit record
    c_stmt = select(Commit).where(Commit.project_id == project_id)
    commit = (await test_db.execute(c_stmt)).scalar_one_or_none()
    assert commit is not None
    assert commit.sha == "abc111222333444555666777888999000aaabbb"
    assert commit.author_login == "commit_owner"
    assert "app/auth.py" in commit.files
    assert "app/main.py" in commit.files

    # 2. Verify push event
    evt_stmt = select(Event).where(Event.project_id == project_id, Event.type == "push")
    evt = (await test_db.execute(evt_stmt)).scalar_one_or_none()
    assert evt is not None
    assert commit.sha in evt.payload["commits"]

    # 3. Verify queued match job
    job_stmt = select(Job).where(Job.type == "match")
    job = (await test_db.execute(job_stmt)).scalar_one_or_none()
    assert job is not None
    assert job.payload["project_id"] == project_id
    assert commit.sha in job.payload["commit_shas"]


@pytest.mark.asyncio
async def test_process_push_fetches_missing_files_from_api(
    client: AsyncClient, create_user, test_db: AsyncSession
):
    """When commit files are missing in push payload, fetch details via GitHub API."""
    user, _, headers = await create_user(github_id=605, username="api_fetch_owner")
    repo_owner = "api-org"
    repo_name = f"api-repo-{user.id}"
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": repo_owner, "repo_name": repo_name},
            headers=headers,
        )
        project_id = proj_resp.json()["id"]

    sha = "fff999888777666555444333222111000eeeddd"
    push_payload_no_files = {
        "ref": "refs/heads/main",
        "pusher": {"name": "api_fetch_owner"},
        "commits": [
            {
                "id": sha,
                "message": "fix: update db configuration",
                "timestamp": "2026-11-10T12:30:00Z",
                "author": {"username": "api_fetch_owner"},
                "added": [],
                "modified": [],
                "removed": [],
            }
        ],
    }

    mock_commit_detail = {
        "sha": sha,
        "files": [
            {"filename": "app/db.py", "status": "modified"},
            {"filename": "alembic.ini", "status": "modified"},
        ],
    }

    with patch("app.services.github.fetch_commit", new_callable=AsyncMock, return_value=mock_commit_detail) as mock_fetch:
        await process_webhook_event(project_id, "push", push_payload_no_files, db=test_db)
        assert mock_fetch.called

    c_stmt = select(Commit).where(Commit.project_id == project_id, Commit.sha == sha)
    commit = (await test_db.execute(c_stmt)).scalar_one_or_none()
    assert commit is not None
    assert "app/db.py" in commit.files
    assert "alembic.ini" in commit.files
