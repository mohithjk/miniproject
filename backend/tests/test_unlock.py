import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Edge, Member, Node, Notification, Project
from app.services.unlock import (
    calculate_completion_score,
    decide_completion_action,
    unlock_node,
)


async def _create_test_tree(test_db: AsyncSession, project_owner_id: int):
    """
    Creates a project with:
      n1 (root, ready) -> n2 (locked) -> n4 (locked)
      n3 (root, ready) ---------------> n4
    So:
      - n2 has single parent: n1
      - n4 has two parents: n2 and n3
    """
    proj = Project(
        owner_id=project_owner_id,
        repo_owner="unlock-org",
        repo_name=f"unlock-repo-{project_owner_id}",
        webhook_secret="secret123",
        plan_status="approved",
        status="active",
    )
    test_db.add(proj)
    await test_db.flush()

    # Add member for roles: frontend, backend, security
    test_db.add(Member(project_id=proj.id, user_id=project_owner_id, role="backend"))

    n1 = Node(project_id=proj.id, key="n1", title="Node 1", role="backend", status="ready")
    n2 = Node(project_id=proj.id, key="n2", title="Node 2", role="frontend", status="locked")
    n3 = Node(project_id=proj.id, key="n3", title="Node 3", role="security", status="ready")
    n4 = Node(project_id=proj.id, key="n4", title="Node 4", role="devops", status="locked")

    test_db.add_all([n1, n2, n3, n4])
    await test_db.flush()

    e1 = Edge(project_id=proj.id, from_node=n1.id, to_node=n2.id, state="hidden")
    e2 = Edge(project_id=proj.id, from_node=n2.id, to_node=n4.id, state="hidden")
    e3 = Edge(project_id=proj.id, from_node=n3.id, to_node=n4.id, state="hidden")

    test_db.add_all([e1, e2, e3])
    await test_db.commit()

    return proj, {"n1": n1, "n2": n2, "n3": n3, "n4": n4}, {"e1": e1, "e2": e2, "e3": e3}


@pytest.mark.asyncio
async def test_single_parent_unlock(test_db: AsyncSession, create_user):
    """When a single-parent root node completes: child unlocks to ready, edge becomes dotted."""
    user, _, _ = await create_user(github_id=801, username="unlock_user_1")
    proj, nodes, edges = await _create_test_tree(test_db, user.id)

    n1, n2 = nodes["n1"], nodes["n2"]
    e1 = edges["e1"]

    assert n1.status == "ready"
    assert n2.status == "locked"
    assert e1.state == "hidden"

    # Complete n1
    result = await unlock_node(n1.id, test_db)
    assert result["status"] == "done"
    assert "n2" in result["unlocked_children"]

    # Verify n1 is done
    await test_db.refresh(n1)
    assert n1.status == "done"
    assert n1.done_at is not None

    # Verify n2 is now ready and edge e1 is dotted
    await test_db.refresh(n2)
    await test_db.refresh(e1)
    assert n2.status == "ready"
    assert e1.state == "dotted"


@pytest.mark.asyncio
async def test_two_parents_unlock(test_db: AsyncSession, create_user):
    """Node with two parents (n4 depends on n2 and n3) unlocks ONLY when BOTH parents are done."""
    user, _, _ = await create_user(github_id=802, username="unlock_user_2")
    proj, nodes, edges = await _create_test_tree(test_db, user.id)

    n1, n2, n3, n4 = nodes["n1"], nodes["n2"], nodes["n3"], nodes["n4"]
    e2, e3 = edges["e2"], edges["e3"]

    # Unlock n1 -> n2 becomes ready
    await unlock_node(n1.id, test_db)
    await test_db.refresh(n2)
    assert n2.status == "ready"

    # Complete parent 1 (n3) -> n4 must still be locked because n2 is not done
    res_n3 = await unlock_node(n3.id, test_db)
    assert "n4" not in res_n3["unlocked_children"]

    await test_db.refresh(n4)
    await test_db.refresh(e3)
    assert n4.status == "locked"
    assert e3.state == "hidden"

    # Complete parent 2 (n2) -> n4 unlocks, e2 and e3 become dotted
    res_n2 = await unlock_node(n2.id, test_db)
    assert "n4" in res_n2["unlocked_children"]

    await test_db.refresh(n4)
    await test_db.refresh(e2)
    await test_db.refresh(e3)
    assert n4.status == "ready"
    assert e2.state == "dotted"
    assert e3.state == "dotted"


@pytest.mark.asyncio
async def test_chain_unlock_and_project_completion(test_db: AsyncSession, create_user):
    """
    Linear chain: n1 -> n2 -> n3.
    As each node completes: incoming edges become solid, next node becomes ready.
    When all nodes are done, project.status becomes 'completed'.
    """
    user, _, _ = await create_user(github_id=803, username="unlock_user_3")

    proj = Project(
        owner_id=user.id,
        repo_owner="chain-org",
        repo_name="chain-repo",
        webhook_secret="sec",
        plan_status="approved",
        status="active",
    )
    test_db.add(proj)
    await test_db.flush()

    n1 = Node(project_id=proj.id, key="n1", title="Step 1", role="backend", status="ready")
    n2 = Node(project_id=proj.id, key="n2", title="Step 2", role="frontend", status="locked")
    n3 = Node(project_id=proj.id, key="n3", title="Step 3", role="devops", status="locked")
    test_db.add_all([n1, n2, n3])
    await test_db.flush()

    e1 = Edge(project_id=proj.id, from_node=n1.id, to_node=n2.id, state="hidden")
    e2 = Edge(project_id=proj.id, from_node=n2.id, to_node=n3.id, state="hidden")
    test_db.add_all([e1, e2])
    await test_db.commit()

    # Step 1: Complete n1 -> n2 ready, e1 dotted
    await unlock_node(n1.id, test_db)
    await test_db.refresh(n2)
    await test_db.refresh(e1)
    assert n2.status == "ready"
    assert e1.state == "dotted"

    # Step 2: Complete n2 -> e1 solid (incoming to n2), n3 ready, e2 dotted
    await unlock_node(n2.id, test_db)
    await test_db.refresh(e1)
    await test_db.refresh(n3)
    await test_db.refresh(e2)
    assert e1.state == "solid"
    assert n3.status == "ready"
    assert e2.state == "dotted"

    # Step 3: Complete n3 -> e2 solid (incoming to n3), project completed!
    res3 = await unlock_node(n3.id, test_db)
    assert res3["project_completed"] is True

    await test_db.refresh(e2)
    await test_db.refresh(proj)
    assert e2.state == "solid"
    assert proj.status == "completed"


@pytest.mark.asyncio
async def test_unlock_idempotency(test_db: AsyncSession, create_user):
    """Calling unlock_node multiple times on the same node must be idempotent."""
    user, _, _ = await create_user(github_id=804, username="unlock_user_4")
    proj, nodes, _ = await _create_test_tree(test_db, user.id)

    n1 = nodes["n1"]
    res1 = await unlock_node(n1.id, test_db)
    assert res1["status"] == "done"

    # Second call
    res2 = await unlock_node(n1.id, test_db)
    assert res2["status"] == "already_done"
    assert res2["unlocked_children"] == []


def test_completion_decision_scoring():
    """Verify completion scoring thresholds according to Core Rule 4."""
    # 1. PR merged (0.5) + CI passed (0.2) + expected files (0.15) = 0.85 -> auto_complete (>=0.8)
    score1 = calculate_completion_score(pr_merged=True, ci_passed=True, expected_files_exist=True)
    assert score1 == 0.85
    assert decide_completion_action(score1) == "auto_complete"

    # 2. PR merged (0.5) + expected files (0.15) = 0.65 -> ask_confirm (0.5 - 0.8)
    score2 = calculate_completion_score(pr_merged=True, ci_passed=False, expected_files_exist=True)
    assert score2 == 0.65
    assert decide_completion_action(score2) == "ask_confirm"

    # 3. Only CI passed (0.2) = 0.2 -> in_progress (<0.5)
    score3 = calculate_completion_score(pr_merged=False, ci_passed=True, expected_files_exist=False)
    assert score3 == 0.2
    assert decide_completion_action(score3) == "in_progress"


@pytest.mark.asyncio
async def test_node_confirm_and_detail_endpoints(client: AsyncClient, create_user, test_db: AsyncSession):
    """Test POST /nodes/{id}/confirm, GET /nodes/{id}, and GET /projects/{id}/tree."""
    user, _, headers = await create_user(github_id=805, username="endpoint_user")
    proj, nodes, _ = await _create_test_tree(test_db, user.id)
    n1 = nodes["n1"]

    # 1. GET /projects/{id}/tree
    tree_resp = await client.get(f"/projects/{proj.id}/tree", headers=headers)
    assert tree_resp.status_code == 200
    tree_data = tree_resp.json()
    assert len(tree_data["nodes"]) == 4
    assert len(tree_data["edges"]) == 3

    # 2. GET /nodes/{id}
    detail_resp = await client.get(f"/nodes/{n1.id}", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["node"]["key"] == "n1"
    assert "commits" in detail

    # 3. POST /nodes/{id}/confirm
    confirm_resp = await client.post(f"/nodes/{n1.id}/confirm", headers=headers)
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["node_status"] == "done"

    # Node is now done
    await test_db.refresh(n1)
    assert n1.status == "done"


@pytest.mark.asyncio
async def test_notifications_endpoints(client: AsyncClient, create_user, test_db: AsyncSession):
    """Test GET /notifications and POST /notifications/{id}/read."""
    user, _, headers = await create_user(github_id=806, username="notif_user")

    # Seed notification
    notif = Notification(
        user_id=user.id,
        project_id=1,
        message="Node [n2] is unlocked!",
        is_read=False,
    )
    test_db.add(notif)
    await test_db.commit()
    await test_db.refresh(notif)

    # 1. GET /notifications
    list_resp = await client.get("/notifications", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 1
    assert items[0]["id"] == notif.id
    assert items[0]["is_read"] is False

    # 2. POST /notifications/{id}/read
    read_resp = await client.post(f"/notifications/{notif.id}/read", headers=headers)
    assert read_resp.status_code == 200
    assert read_resp.json()["is_read"] is True

    await test_db.refresh(notif)
    assert notif.is_read is True
