from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Job, Node, Notification, Project
from app.services.jobs import process_judge_job
from scripts.simulate_webhooks import sign_payload


@pytest.mark.asyncio
async def test_judge_job_score_thresholds(test_db: AsyncSession):
    """Test process_judge_job under different score thresholds: auto_complete vs ask_confirm vs in_progress."""
    proj = Project(
        owner_id=1,
        repo_owner="org",
        repo_name="repo",
        webhook_secret="sec",
        plan_status="approved",
        status="active",
    )
    test_db.add(proj)
    await test_db.flush()

    node_high = Node(
        project_id=proj.id,
        key="n1",
        title="High Score Task",
        role="backend",
        status="ready",
        owner_id=1,
        path_hints=[],
    )
    node_med = Node(
        project_id=proj.id,
        key="n2",
        title="Med Score Task",
        role="frontend",
        status="in_progress",
        owner_id=1,
        path_hints=[],
    )
    node_low = Node(
        project_id=proj.id,
        key="n3",
        title="Low Score Task",
        role="devops",
        status="in_progress",
        owner_id=1,
        path_hints=["nonexistent/dir"],
    )
    test_db.add_all([node_high, node_med, node_low])
    await test_db.commit()

    # 1. High Score (PR merged=True, CI passed=True, files_exist=True -> 0.5 + 0.2 + 0.15 = 0.85 >= 0.8) -> auto_complete
    job_high = Job(
        type="judge",
        payload={
            "project_id": proj.id,
            "node_id": node_high.id,
            "pr_merged": True,
            "ci_passed": True,
        },
        status="pending",
    )
    test_db.add(job_high)
    await test_db.commit()

    res_high = await process_judge_job(job_high, test_db)
    assert res_high["results"][0]["action"] == "auto_complete"
    await test_db.refresh(node_high)
    assert node_high.status == "done"

    # 2. Medium Score (PR merged=True, CI passed=False, files_exist=True -> 0.5 + 0.15 = 0.65 -> ask_confirm)
    job_med = Job(
        type="judge",
        payload={
            "project_id": proj.id,
            "node_id": node_med.id,
            "pr_merged": True,
            "ci_passed": False,
        },
        status="pending",
    )
    test_db.add(job_med)
    await test_db.commit()

    res_med = await process_judge_job(job_med, test_db)
    assert res_med["results"][0]["action"] == "ask_confirm"
    await test_db.refresh(node_med)
    assert node_med.status == "in_progress"  # Not auto-completed

    # Verify "please confirm" notification created
    notif_stmt = select(Notification).where(Notification.node_id == node_med.id)
    notif = (await test_db.execute(notif_stmt)).scalar_one_or_none()
    assert notif is not None
    assert "confirm completion" in notif.message

    # 3. Low Score (PR merged=False, CI passed=False, files_exist=False -> 0.0 -> in_progress)
    job_low = Job(
        type="judge",
        payload={
            "project_id": proj.id,
            "node_id": node_low.id,
            "pr_merged": False,
            "ci_passed": False,
        },
        status="pending",
    )
    test_db.add(job_low)
    await test_db.commit()

    res_low = await process_judge_job(job_low, test_db)
    assert res_low["results"][0]["action"] == "in_progress"
    await test_db.refresh(node_low)
    assert node_low.status == "in_progress"


@pytest.mark.asyncio
async def test_node_confirm_permissions_and_status(client: AsyncClient, create_user, test_db: AsyncSession):
    """POST /nodes/{id}/confirm only works for owner and only for ready/in_progress nodes."""
    owner, _, owner_headers = await create_user(github_id=1301, username="owner_c")
    member, _, member_headers = await create_user(github_id=1302, username="member_c")
    other_member, _, other_headers = await create_user(github_id=1303, username="other_c")

    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):

        resp = await client.post(
            "/projects",
            json={"repo_owner": "org_c", "repo_name": "repo_c", "owner_role": "backend"},
            headers=owner_headers,
        )
        project_id = resp.json()["id"]

    # Join member and other_member
    await client.post(f"/projects/{project_id}/members", json={"role": "frontend"}, headers=member_headers)
    await client.post(f"/projects/{project_id}/members", json={"role": "devops"}, headers=other_headers)

    # Approve plan
    await client.post(f"/projects/{project_id}/plan/approve", headers=owner_headers)

    # Get n1 (ready, owned by owner) and n2 (locked)
    nodes = (await test_db.execute(select(Node).where(Node.project_id == project_id))).scalars().all()
    node_map = {n.key: n for n in nodes}
    n1 = node_map["n1"]
    n2 = node_map["n2"]

    # Assign n1 to member
    n1.owner_id = member.id
    await test_db.commit()

    # 1. other_member cannot confirm n1 (403 Forbidden)
    resp_other = await client.post(f"/nodes/{n1.id}/confirm", headers=other_headers)
    assert resp_other.status_code == 403

    # 2. Cannot confirm locked node n2 (400 Bad Request)
    resp_locked = await client.post(f"/nodes/{n2.id}/confirm", headers=owner_headers)
    assert resp_locked.status_code == 400
    assert "locked" in resp_locked.json()["detail"]

    # 3. Node owner (member) can confirm ready node n1
    resp_confirm = await client.post(f"/nodes/{n1.id}/confirm", headers=member_headers)
    assert resp_confirm.status_code == 200
    assert resp_confirm.json()["node_status"] == "done"

    # 4. Cannot confirm already done node (400 Bad Request)
    resp_done = await client.post(f"/nodes/{n1.id}/confirm", headers=owner_headers)
    assert resp_done.status_code == 400


@pytest.mark.asyncio
async def test_pr_merged_links_node_and_queues_judge(client: AsyncClient, create_user, test_db: AsyncSession):
    """PR merged event with branch or 'closes n2' in title links to node and queues judge job."""
    owner, _, headers = await create_user(github_id=1401, username="pr_owner")

    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=[]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):

        resp = await client.post(
            "/projects",
            json={"repo_owner": "pr_org", "repo_name": "pr_repo", "owner_role": "backend"},
            headers=headers,
        )
        project_id = resp.json()["id"]
        secret = resp.json()["webhook_secret"]

    await client.post(f"/projects/{project_id}/plan/approve", headers=headers)

    # Send PR merged webhook closing n2
    pr_payload = {
        "action": "closed",
        "number": 42,
        "repository": {"name": "pr_repo", "owner": {"login": "pr_org"}},
        "pull_request": {
            "number": 42,
            "merged": True,
            "title": "feat: closes n2",
            "head": {"ref": "feature/n2-auth"},
            "body": "This PR closes n2 completely.",
        },
    }
    import json
    raw_body = json.dumps(pr_payload).encode("utf-8")
    sig = sign_payload(secret, raw_body)

    resp_pr = await client.post(
        "/webhooks/github",
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": sig,
            "X-GitHub-Delivery": "pr-deliv-101",
        },
    )
    assert resp_pr.status_code == 200

    # Verify Event recorded with matched_nodes
    evt_stmt = select(Event).where(Event.project_id == project_id, Event.type == "pull_request_merged")
    evt = (await test_db.execute(evt_stmt)).scalar_one_or_none()
    assert evt is not None
    assert "n2" in evt.payload["matched_nodes"]

    # Verify Judge Job queued for n2
    job_stmt = select(Job).where(Job.type == "judge")
    job = (await test_db.execute(job_stmt)).scalars().first()
    assert job is not None
    assert job.payload["node_key"] == "n2"
    assert job.payload["pr_merged"] is True
