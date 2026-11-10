import json
import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from scripts.simulate_webhooks import sign_payload


def test_simulator_signature_matches_backend():
    """Verify simulator sign_payload produces exact format expected by backend."""
    secret = "my_super_secret_123"
    body = b'{"hello":"world"}'
    sig = sign_payload(secret, body)
    assert sig.startswith("sha256=")
    assert len(sig) == 7 + 64


@pytest.mark.asyncio
async def test_simulate_webhooks_replay_with_test_client(client: AsyncClient, create_user):
    """Replay sample_commits.json against the backend webhooks endpoint."""
    user, _, headers = await create_user(github_id=999, username="sim_owner")

    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=["main.py"]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": "alice-org", "repo_name": f"sim-repo-{user.id}"},
            headers=headers,
        )
        assert proj_resp.status_code == 201
        data = proj_resp.json()
        secret = data["webhook_secret"]
        repo_name = data["repo_name"]
        repo_owner = data["repo_owner"]

    commits_file = os.path.join(os.path.dirname(__file__), "../scripts/sample_commits.json")
    with open(commits_file, "r", encoding="utf-8") as f:
        commits = json.load(f)

    # 1. Send Ping Handshake
    ping_payload = {
        "zen": "Testing flow",
        "hook_id": 111222,
        "repository": {"name": repo_name, "owner": {"login": repo_owner}},
    }
    raw_ping = json.dumps(ping_payload).encode("utf-8")
    ping_sig = sign_payload(secret, raw_ping)

    ping_resp = await client.post(
        "/webhooks/github",
        content=raw_ping,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": ping_sig,
            "X-GitHub-Event": "ping",
            "X-GitHub-Delivery": "sim-delivery-ping",
        },
    )
    assert ping_resp.status_code == 200
    assert ping_resp.json()["message"] == "pong"

    # 2. Replay all commits
    for idx, c in enumerate(commits):
        sha = c["sha"]
        push_payload = {
            "ref": "refs/heads/main",
            "pusher": {"name": c["author"]["name"]},
            "repository": {"name": repo_name, "owner": {"login": repo_owner}},
            "commits": [c],
            "head_commit": c,
        }
        raw_push = json.dumps(push_payload).encode("utf-8")
        push_sig = sign_payload(secret, raw_push)

        push_resp = await client.post(
            "/webhooks/github",
            content=raw_push,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": push_sig,
                "X-GitHub-Event": "push",
                "X-GitHub-Delivery": f"sim-delivery-{idx}-{sha[:8]}",
            },
        )
        assert push_resp.status_code == 200
        assert push_resp.json()["status"] == "accepted"
