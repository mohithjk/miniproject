from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Member, Node, Project
from app.services.unlock import unlock_node


async def _create_test_project(client: AsyncClient, headers: dict) -> int:
    payload = {
        "repo_owner": "testorg",
        "repo_name": f"testrepo-{headers.get('Authorization', '')[-6:]}",
        "owner_role": "backend",
    }
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=["app.py"]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        resp = await client.post("/projects", json=payload, headers=headers)
        assert resp.status_code == 201
        return resp.json()["id"]


@pytest.mark.asyncio
async def test_members_list_and_role_management(client: AsyncClient, create_user, test_db: AsyncSession):
    # Owner
    owner, _, owner_headers = await create_user(github_id=201, username="owner_user")
    # Member 1
    m1, _, m1_headers = await create_user(github_id=202, username="dev_frontend")
    # Member 2
    m2, _, m2_headers = await create_user(github_id=203, username="dev_devops")
    # Outsider
    _, _, outsider_headers = await create_user(github_id=204, username="outsider")

    project_id = await _create_test_project(client, owner_headers)

    # 1. Join project
    join_resp = await client.post(
        f"/projects/{project_id}/members",
        json={"role": "frontend"},
        headers=m1_headers,
    )
    assert join_resp.status_code == 201
    assert join_resp.json()["role"] == "frontend"
    assert join_resp.json()["username"] == "dev_frontend"

    # Add second member
    join_resp2 = await client.post(
        f"/projects/{project_id}/members",
        json={"role": "devops"},
        headers=m2_headers,
    )
    assert join_resp2.status_code == 201

    # 2. GET /projects/{id}/members
    # Outsider rejected
    out_resp = await client.get(f"/projects/{project_id}/members", headers=outsider_headers)
    assert out_resp.status_code == 403

    # Member can list
    list_resp = await client.get(f"/projects/{project_id}/members", headers=m1_headers)
    assert list_resp.status_code == 200
    members = list_resp.json()
    assert len(members) == 3  # owner + m1 + m2
    usernames = {m["username"] for m in members}
    assert "owner_user" in usernames
    assert "dev_frontend" in usernames
    assert "dev_devops" in usernames

    # 3. Member changes own role
    patch_self = await client.patch(
        f"/projects/{project_id}/members/{m1.id}",
        json={"role": "security"},
        headers=m1_headers,
    )
    assert patch_self.status_code == 200
    assert patch_self.json()["role"] == "security"

    # 4. Member cannot change someone else's role
    patch_other = await client.patch(
        f"/projects/{project_id}/members/{m2.id}",
        json={"role": "backend"},
        headers=m1_headers,
    )
    assert patch_other.status_code == 403

    # 5. Project owner can change any member's role
    patch_by_owner = await client.patch(
        f"/projects/{project_id}/members/{m2.id}",
        json={"role": "ai_ml"},
        headers=owner_headers,
    )
    assert patch_by_owner.status_code == 200
    assert patch_by_owner.json()["role"] == "ai_ml"

    # 6. Removing members
    # Non-owner cannot remove member
    del_forbidden = await client.delete(
        f"/projects/{project_id}/members/{m2.id}",
        headers=m1_headers,
    )
    assert del_forbidden.status_code == 403

    # Cannot remove project owner
    del_owner = await client.delete(
        f"/projects/{project_id}/members/{owner.id}",
        headers=owner_headers,
    )
    assert del_owner.status_code == 400

    # Project owner removes member
    del_success = await client.delete(
        f"/projects/{project_id}/members/{m2.id}",
        headers=owner_headers,
    )
    assert del_success.status_code == 200
    assert del_success.json()["status"] == "removed"

    # Verify member is gone
    list_after = await client.get(f"/projects/{project_id}/members", headers=owner_headers)
    assert len(list_after.json()) == 2


@pytest.mark.asyncio
async def test_node_auto_owner_assignment_and_manual_update(client: AsyncClient, create_user, test_db: AsyncSession):
    owner, _, owner_headers = await create_user(github_id=301, username="owner301")
    frontend_user, _, fe_headers = await create_user(github_id=302, username="fe_dev")

    project_id = await _create_test_project(client, owner_headers)

    # Join frontend user
    await client.post(
        f"/projects/{project_id}/members",
        json={"role": "frontend"},
        headers=fe_headers,
    )

    # Put a draft plan with root node (backend) and child node (frontend)
    plan_body = {
        "nodes": [
            {
                "key": "n1",
                "title": "Backend Setup",
                "role": "backend",
                "depends_on": [],
                "done_criteria": "Server runs",
                "path_hints": ["backend/"],
            },
            {
                "key": "n2",
                "title": "Frontend Setup",
                "role": "frontend",
                "depends_on": ["n1"],
                "done_criteria": "UI renders",
                "path_hints": ["frontend/"],
            },
            {
                "key": "n3",
                "title": "DevOps Setup",
                "role": "devops",
                "depends_on": ["n1"],
                "done_criteria": "CI configured",
                "path_hints": [".github/"],
            },
        ]
    }
    await client.put(f"/projects/{project_id}/plan", json=plan_body, headers=owner_headers)

    # Approve plan
    appr_resp = await client.post(f"/projects/{project_id}/plan/approve", headers=owner_headers)
    assert appr_resp.status_code == 200

    # Check n1 (root, backend) - owner was added with owner_role "backend"
    n1_stmt = select(Node).where(Node.project_id == project_id, Node.key == "n1")
    n1 = (await test_db.execute(n1_stmt)).scalar_one()
    assert n1.status == "ready"
    assert n1.owner_id == owner.id  # unique backend member

    # Check n2 (child, frontend) - currently locked, owner_id is None
    n2_stmt = select(Node).where(Node.project_id == project_id, Node.key == "n2")
    n2 = (await test_db.execute(n2_stmt)).scalar_one()
    assert n2.status == "locked"

    # Now unlock n1 -> n2 unlocks, becomes ready, and gets auto-assigned frontend_user.id
    unlock_res = await unlock_node(n1.id, test_db)
    assert "n2" in unlock_res["unlocked_children"]

    await test_db.refresh(n2)
    assert n2.status == "ready"
    assert n2.owner_id == frontend_user.id

    # Test manual owner change via PATCH /nodes/{id}/owner
    patch_owner_resp = await client.patch(
        f"/nodes/{n2.id}/owner",
        json={"owner_id": owner.id},
        headers=owner_headers,
    )
    assert patch_owner_resp.status_code == 200
    assert patch_owner_resp.json()["owner_id"] == owner.id

    # Test manual owner change with invalid non-member user ID
    patch_invalid_resp = await client.patch(
        f"/nodes/{n2.id}/owner",
        json={"owner_id": 999999},
        headers=owner_headers,
    )
    assert patch_invalid_resp.status_code == 400
