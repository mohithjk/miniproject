from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Node


@pytest.mark.asyncio
async def test_node_detail_and_tree_progress(client: AsyncClient, create_user, test_db: AsyncSession):
    """Test GET /nodes/{id} and GET /projects/{id}/tree with progress and last_event_id."""
    owner, _, headers = await create_user(github_id=1201, username="tree_owner")

    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):

        resp = await client.post(
            "/projects",
            json={"repo_owner": "treeorg", "repo_name": "treerepo", "owner_role": "backend"},
            headers=headers,
        )
        assert resp.status_code == 201
        project_id = resp.json()["id"]

    # Approve plan (creates nodes: n1 ready, n2 locked, n3 locked)
    appr_resp = await client.post(f"/projects/{project_id}/plan/approve", headers=headers)
    assert appr_resp.status_code == 200

    # Query n1
    n1_stmt = select(Node).where(Node.project_id == project_id, Node.key == "n1")
    n1 = (await test_db.execute(n1_stmt)).scalar_one()

    # Log an AI decision event for n1
    test_db.add(
        Event(
            project_id=project_id,
            type="node_evaluated",
            payload={
                "node_id": n1.id,
                "node_key": "n1",
                "verdict": "done",
                "confidence": 0.95,
                "reason": "API tests passing and schema verified",
            },
        )
    )
    await test_db.commit()

    # 1. GET /nodes/{id}
    detail_resp = await client.get(f"/nodes/{n1.id}", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()

    assert detail["title"] == n1.title
    assert detail["role"] == n1.role
    assert detail["status"] == "ready"
    assert detail["done_criteria"] == n1.done_criteria
    assert detail["owner"] is not None
    assert detail["owner"]["id"] == owner.id
    assert detail["owner"]["username"] == "tree_owner"

    assert detail["latest_ai_decision"] is not None
    assert detail["latest_ai_decision"]["verdict"] == "done"
    assert detail["latest_ai_decision"]["confidence"] == 0.95
    assert "schema verified" in detail["latest_ai_decision"]["reason"]

    # 2. GET /projects/{id}/tree
    tree_resp = await client.get(f"/projects/{project_id}/tree", headers=headers)
    assert tree_resp.status_code == 200
    tree_data = tree_resp.json()

    assert "progress" in tree_data
    progress = tree_data["progress"]
    assert progress["total"] == 3
    assert progress["done"] == 0
    assert progress["percentage"] == 0.0

    assert "last_event_id" in tree_data
    assert tree_data["last_event_id"] > 0
    initial_event_id = tree_data["last_event_id"]

    # Now confirm n1 -> completed
    confirm_resp = await client.post(f"/nodes/{n1.id}/confirm", headers=headers)
    assert confirm_resp.status_code == 200

    # Tree progress should reflect 1 done out of 3 (33.3%)
    tree_resp2 = await client.get(f"/projects/{project_id}/tree", headers=headers)
    assert tree_resp2.status_code == 200
    tree_data2 = tree_resp2.json()

    assert tree_data2["progress"]["done"] == 1
    assert tree_data2["progress"]["total"] == 3
    assert tree_data2["progress"]["percentage"] == 33.3
    assert tree_data2["last_event_id"] > initial_event_id
