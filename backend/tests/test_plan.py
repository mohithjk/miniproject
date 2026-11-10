from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Edge, Event, Job, Node, Project
from app.services.jobs import process_plan_job


async def _create_test_project(client: AsyncClient, create_user) -> tuple[int, dict[str, str]]:
    """Helper to create a test user and an initial project in draft state."""
    user, _, headers = await create_user(github_id=501, username="plan_owner")
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Title"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=["main.py"]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        resp = await client.post(
            "/projects",
            json={"repo_owner": "owner", "repo_name": f"plan-repo-{user.id}"},
            headers=headers,
        )
        assert resp.status_code == 201
        return resp.json()["id"], headers


@pytest.mark.asyncio
async def test_process_plan_job(test_db: AsyncSession):
    """Directly test executing a background plan job."""
    job = Job(
        type="plan",
        payload={"project_id": 999, "readme": "Hello README", "file_tree": ["app.py"]},
        status="pending",
        attempts=0,
    )
    test_db.add(job)
    await test_db.commit()
    await test_db.refresh(job)

    result = await process_plan_job(job, test_db)
    assert job.status == "done"
    assert "nodes" in result
    assert len(result["nodes"]) >= 3


@pytest.mark.asyncio
async def test_get_draft_plan(client: AsyncClient, create_user):
    """GET /projects/{id}/plan should return draft nodes."""
    project_id, headers = await _create_test_project(client, create_user)

    resp = await client.get(f"/projects/{project_id}/plan", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert len(data["nodes"]) >= 3
    keys = [n["key"] for n in data["nodes"]]
    assert "n1" in keys


@pytest.mark.asyncio
async def test_update_draft_plan_valid(client: AsyncClient, create_user):
    """PUT /projects/{id}/plan updates the draft plan when valid."""
    project_id, headers = await _create_test_project(client, create_user)

    valid_plan = {
        "nodes": [
            {
                "key": "n1",
                "title": "Backend Setup",
                "role": "backend",
                "done_criteria": "API running",
                "path_hints": ["backend/"],
                "depends_on": [],
            },
            {
                "key": "n2",
                "title": "Frontend Setup",
                "role": "frontend",
                "done_criteria": "UI running",
                "path_hints": ["frontend/"],
                "depends_on": ["n1"],
            },
            {
                "key": "n3",
                "title": "Deploy CI/CD",
                "role": "devops",
                "done_criteria": "Pipeline passes",
                "path_hints": [".github/"],
                "depends_on": ["n1"],
            },
        ]
    }

    put_resp = await client.put(f"/projects/{project_id}/plan", json=valid_plan, headers=headers)
    assert put_resp.status_code == 200
    assert len(put_resp.json()["nodes"]) == 3

    # Verify retrieval reflects update
    get_resp = await client.get(f"/projects/{project_id}/plan", headers=headers)
    assert get_resp.status_code == 200
    assert len(get_resp.json()["nodes"]) == 3


@pytest.mark.asyncio
async def test_plan_validation_cycle_detection(client: AsyncClient, create_user):
    """PUT /projects/{id}/plan must reject circular dependencies with 400 Bad Request."""
    project_id, headers = await _create_test_project(client, create_user)

    cyclic_plan = {
        "nodes": [
            {"key": "n1", "title": "Node 1", "role": "backend", "depends_on": ["n2"]},
            {"key": "n2", "title": "Node 2", "role": "frontend", "depends_on": ["n1"]},
        ]
    }

    resp = await client.put(f"/projects/{project_id}/plan", json=cyclic_plan, headers=headers)
    assert resp.status_code == 400
    assert "Cycle detected" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_plan_validation_missing_dependency(client: AsyncClient, create_user):
    """PUT /projects/{id}/plan must reject dependencies on non-existent keys."""
    project_id, headers = await _create_test_project(client, create_user)

    missing_dep_plan = {
        "nodes": [
            {"key": "n1", "title": "Node 1", "role": "backend", "depends_on": ["n_ghost"]},
        ]
    }

    resp = await client.put(f"/projects/{project_id}/plan", json=missing_dep_plan, headers=headers)
    assert resp.status_code == 400
    assert "non-existent node 'n_ghost'" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_plan_validation_self_dependency(client: AsyncClient, create_user):
    """PUT /projects/{id}/plan must reject nodes depending on themselves."""
    project_id, headers = await _create_test_project(client, create_user)

    self_dep_plan = {
        "nodes": [
            {"key": "n1", "title": "Node 1", "role": "backend", "depends_on": ["n1"]},
        ]
    }

    resp = await client.put(f"/projects/{project_id}/plan", json=self_dep_plan, headers=headers)
    assert resp.status_code == 400
    assert "cannot depend on itself" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_plan_validation_invalid_role(client: AsyncClient, create_user):
    """PUT /projects/{id}/plan must reject unrecognized roles."""
    project_id, headers = await _create_test_project(client, create_user)

    invalid_role_plan = {
        "nodes": [
            {"key": "n1", "title": "Node 1", "role": "invalid_ninja", "depends_on": []},
        ]
    }

    resp = await client.put(f"/projects/{project_id}/plan", json=invalid_role_plan, headers=headers)
    assert resp.status_code == 422 or resp.status_code == 400


@pytest.mark.asyncio
async def test_plan_validation_duplicate_key(client: AsyncClient, create_user):
    """PUT /projects/{id}/plan must reject plans with duplicate node keys."""
    project_id, headers = await _create_test_project(client, create_user)

    dup_key_plan = {
        "nodes": [
            {"key": "n1", "title": "Node 1", "role": "backend", "depends_on": []},
            {"key": "n1", "title": "Node 1 Duplicate", "role": "frontend", "depends_on": []},
        ]
    }

    resp = await client.put(f"/projects/{project_id}/plan", json=dup_key_plan, headers=headers)
    assert resp.status_code == 400
    assert "Duplicate node key" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_approve_plan_creates_nodes_and_edges(
    client: AsyncClient, create_user, test_db: AsyncSession
):
    """
    POST /projects/{id}/plan/approve should:
    - activate the tree
    - mark root nodes ready, dependent nodes locked
    - create all edges with hidden state
    """
    project_id, headers = await _create_test_project(client, create_user)

    # Approve the draft plan
    approve_resp = await client.post(f"/projects/{project_id}/plan/approve", headers=headers)
    assert approve_resp.status_code == 200
    data = approve_resp.json()
    assert data["plan_status"] == "approved"
    assert data["nodes_created"] >= 3
    assert data["edges_created"] >= 2

    # Verify project status in DB
    proj = await test_db.get(Project, project_id)
    assert proj.plan_status == "approved"

    # Verify nodes in DB: n1 has no dependencies (root) -> ready; n2, n3 depend on n1 -> locked
    nodes_stmt = select(Node).where(Node.project_id == project_id)
    nodes = (await test_db.execute(nodes_stmt)).scalars().all()
    node_map = {n.key: n for n in nodes}

    assert node_map["n1"].status == "ready"
    assert node_map["n2"].status == "locked"
    assert node_map["n3"].status == "locked"

    # Verify edges in DB: all start 'hidden'
    edges_stmt = select(Edge).where(Edge.project_id == project_id)
    edges = (await test_db.execute(edges_stmt)).scalars().all()
    assert len(edges) >= 2
    for edge in edges:
        assert edge.state == "hidden"

    # Verify cannot approve twice
    dup_approve = await client.post(f"/projects/{project_id}/plan/approve", headers=headers)
    assert dup_approve.status_code == 400

    # Verify cannot edit approved plan
    edit_resp = await client.put(f"/projects/{project_id}/plan", json={"nodes": []}, headers=headers)
    assert edit_resp.status_code == 400

    # Verify GET /plan reconstructs approved tree
    get_plan = await client.get(f"/projects/{project_id}/plan", headers=headers)
    assert get_plan.status_code == 200
    reconstructed = get_plan.json()
    assert len(reconstructed["nodes"]) == len(nodes)


@pytest.mark.asyncio
async def test_plan_validation_node_count_limits(client: AsyncClient, create_user):
    """PUT /projects/{id}/plan must enforce node count between 3 and 40."""
    project_id, headers = await _create_test_project(client, create_user)

    # 1. Test too few nodes (2 nodes < 3)
    too_few_plan = {
        "nodes": [
            {
                "key": "n1",
                "title": "Backend Setup",
                "role": "backend",
                "done_criteria": "API running",
                "path_hints": ["backend/"],
                "depends_on": [],
            },
            {
                "key": "n2",
                "title": "Frontend Setup",
                "role": "frontend",
                "done_criteria": "UI running",
                "path_hints": ["frontend/"],
                "depends_on": ["n1"],
            },
        ]
    }
    resp_few = await client.put(f"/projects/{project_id}/plan", json=too_few_plan, headers=headers)
    assert resp_few.status_code == 400
    assert "between 3 and 40" in resp_few.json()["detail"]

    # 2. Test too many nodes (41 nodes > 40)
    too_many_nodes = [
        {
            "key": f"n{i}",
            "title": f"Task {i}",
            "role": "backend",
            "done_criteria": f"Task {i} done",
            "path_hints": [],
            "depends_on": [] if i == 1 else [f"n{i-1}"],
        }
        for i in range(1, 42)
    ]
    resp_many = await client.put(f"/projects/{project_id}/plan", json={"nodes": too_many_nodes}, headers=headers)
    assert resp_many.status_code == 400
    assert "between 3 and 40" in resp_many.json()["detail"]


@pytest.mark.asyncio
async def test_plan_generation_failure_and_retry(client: AsyncClient, create_user, test_db: AsyncSession):
    """Plan generation errors must be saved as readable events on the project and allow retry."""
    user, _, headers = await create_user(github_id=502, username="retry_owner")

    # Create project without auto-running background job
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        resp = await client.post(
            "/projects",
            json={"repo_owner": "failorg", "repo_name": "failrepo", "owner_role": "backend"},
            headers=headers,
        )
        assert resp.status_code == 201
        project_id = resp.json()["id"]

    # Mock ai_interface.generate_plan to fail
    with patch("app.ai_interface.generate_plan", side_effect=RuntimeError("AI model timeout")):
        # Direct GET /plan will attempt generation and fail
        get_resp = await client.get(f"/projects/{project_id}/plan", headers=headers)
        assert get_resp.status_code == 500
        assert "AI model timeout" in get_resp.json()["detail"]

    # Verify readable error event saved
    evt_stmt = select(Event).where(Event.project_id == project_id, Event.type == "plan_failed")
    evt = (await test_db.execute(evt_stmt)).scalar_one_or_none()
    assert evt is not None
    assert "AI model timeout" in evt.payload["error"]

    # Retry planning
    retry_resp = await client.post(f"/projects/{project_id}/plan/retry", headers=headers)
    assert retry_resp.status_code == 200
    assert retry_resp.json()["status"] == "plan_retry_queued"

    # Now GET /plan succeeds when AI generation works
    success_plan = await client.get(f"/projects/{project_id}/plan", headers=headers)
    assert success_plan.status_code == 200
    assert len(success_plan.json()["nodes"]) == 3

