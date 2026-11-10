from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Job, Member, Project


@pytest.mark.asyncio
async def test_create_project_success(client: AsyncClient, create_user, test_db: AsyncSession):
    """POST /projects should fetch repo info, register webhook, queue plan job, and add creator as member."""
    user, token, headers = await create_user(github_id=101, username="alice")

    payload = {
        "repo_owner": "alice-org",
        "repo_name": "demo-app",
        "owner_role": "backend",
    }

    mock_readme = "# Demo App\nWelcome to our microservices project."
    mock_tree = ["backend/main.py", "frontend/package.json", "docs/spec.md"]
    mock_hook = {"id": 12345, "active": True}

    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=mock_readme) as mock_fetch_readme, \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=mock_tree) as mock_fetch_tree, \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value=mock_hook) as mock_reg_webhook:

        response = await client.post("/projects", json=payload, headers=headers)
        assert response.status_code == 201
        data = response.json()

        assert data["repo_owner"] == "alice-org"
        assert data["repo_name"] == "demo-app"
        assert data["owner_id"] == user.id
        assert data["plan_status"] == "draft"
        assert data["status"] == "active"
        assert data["readme_text"] == mock_readme
        assert "webhook_secret" in data

        project_id = data["id"]

        # Verify creator was added as member
        mem_stmt = select(Member).where(Member.project_id == project_id, Member.user_id == user.id)
        mem_res = await test_db.execute(mem_stmt)
        member = mem_res.scalar_one_or_none()
        assert member is not None
        assert member.role == "backend"

        # Verify 'plan' job queued
        job_stmt = select(Job).where(Job.type == "plan")
        job_res = await test_db.execute(job_stmt)
        job = job_res.scalar_one_or_none()
        assert job is not None
        assert job.status == "pending"
        assert job.payload["project_id"] == project_id
        assert job.payload["file_tree"] == mock_tree

        # Verify project_created event logged
        event_stmt = select(Event).where(Event.project_id == project_id, Event.type == "project_created")
        event_res = await test_db.execute(event_stmt)
        event = event_res.scalar_one_or_none()
        assert event is not None


@pytest.mark.asyncio
async def test_create_project_duplicate_fails(client: AsyncClient, create_user):
    """Connecting the same repository twice should return 400 Bad Request."""
    user, _, headers = await create_user(github_id=102, username="bob")

    payload = {"repo_owner": "bob-org", "repo_name": "repeat-repo", "owner_role": "devops"}

    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):

        # First connection succeeds
        res1 = await client.post("/projects", json=payload, headers=headers)
        assert res1.status_code == 201

        # Second connection fails
        res2 = await client.post("/projects", json=payload, headers=headers)
        assert res2.status_code == 400
        assert "already exists" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_get_project_membership_authorization(client: AsyncClient, create_user):
    """Only project members can view project details via GET /projects/{id}."""
    owner, _, owner_headers = await create_user(github_id=201, username="project_owner")
    outsider, _, outsider_headers = await create_user(github_id=202, username="outsider")

    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):

        create_res = await client.post(
            "/projects",
            json={"repo_owner": "secure-org", "repo_name": "secrets", "owner_role": "security"},
            headers=owner_headers,
        )
        assert create_res.status_code == 201
        project_id = create_res.json()["id"]

    # 1. Project owner can access
    owner_view = await client.get(f"/projects/{project_id}", headers=owner_headers)
    assert owner_view.status_code == 200
    assert owner_view.json()["id"] == project_id

    # 2. Non-member receives 403 Forbidden
    outsider_view = await client.get(f"/projects/{project_id}", headers=outsider_headers)
    assert outsider_view.status_code == 403
    assert "not a member" in outsider_view.json()["detail"]

    # 3. Non-existent project returns 404
    missing_view = await client.get("/projects/99999", headers=owner_headers)
    assert missing_view.status_code == 404


@pytest.mark.asyncio
async def test_join_and_add_members(client: AsyncClient, create_user):
    """POST /projects/{id}/members allows users to self-join or members to add others."""
    owner, _, owner_headers = await create_user(github_id=301, username="team_lead")
    dev_frontend, _, dev_headers = await create_user(github_id=302, username="frontend_dev")
    dev_ai, _, _ = await create_user(github_id=303, username="ai_engineer")

    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value=""), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):

        create_res = await client.post(
            "/projects",
            json={"repo_owner": "team-org", "repo_name": "ai-app", "owner_role": "backend"},
            headers=owner_headers,
        )
        project_id = create_res.json()["id"]

    # 1. Frontend dev self-joins project
    join_res = await client.post(
        f"/projects/{project_id}/members",
        json={"role": "frontend"},
        headers=dev_headers,
    )
    assert join_res.status_code == 201
    join_data = join_res.json()
    assert join_data["user_id"] == dev_frontend.id
    assert join_data["role"] == "frontend"

    # Frontend dev can now view the project
    dev_view = await client.get(f"/projects/{project_id}", headers=dev_headers)
    assert dev_view.status_code == 200

    # 2. Duplicate self-join fails
    dup_join = await client.post(
        f"/projects/{project_id}/members",
        json={"role": "frontend"},
        headers=dev_headers,
    )
    assert dup_join.status_code == 400
    assert "already a member" in dup_join.json()["detail"]

    # 3. Existing member adds AI engineer
    add_ai_res = await client.post(
        f"/projects/{project_id}/members",
        json={"role": "ai_ml", "user_id": dev_ai.id},
        headers=dev_headers,
    )
    assert add_ai_res.status_code == 201
    assert add_ai_res.json()["user_id"] == dev_ai.id
    assert add_ai_res.json()["role"] == "ai_ml"
