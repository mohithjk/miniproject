from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.rate_limiter import RateLimiter


async def _setup_project_with_tree(client: AsyncClient, create_user) -> tuple[int, dict[str, str], int]:
    """Create project, approve plan, and return (project_id, headers, node_id)."""
    user, _, headers = await create_user(github_id=901, username="share_owner")
    with patch("app.services.github.fetch_readme", new_callable=AsyncMock, return_value="# Readme"), \
         patch("app.services.github.fetch_file_tree", new_callable=AsyncMock, return_value=["main.py"]), \
         patch("app.services.github.register_webhook", new_callable=AsyncMock, return_value={"id": 1}):
        proj_resp = await client.post(
            "/projects",
            json={"repo_owner": "share-org", "repo_name": f"share-repo-{user.id}"},
            headers=headers,
        )
        project_id = proj_resp.json()["id"]

        # Approve plan to create tree nodes
        approve_resp = await client.post(f"/projects/{project_id}/plan/approve", headers=headers)
        assert approve_resp.status_code == 200

        tree_resp = await client.get(f"/projects/{project_id}/tree", headers=headers)
        node_id = tree_resp.json()["nodes"][0]["id"]
        return project_id, headers, node_id


@pytest.mark.asyncio
async def test_create_and_view_share_link(client: AsyncClient, create_user):
    """
    POST /projects/{id}/share generates a viewer token.
    GET /view/{token} returns the tree without secret tokens or user credentials.
    """
    project_id, headers, _ = await _setup_project_with_tree(client, create_user)

    # 1. Create share link
    share_resp = await client.post(f"/projects/{project_id}/share", headers=headers)
    assert share_resp.status_code == 201
    share_data = share_resp.json()
    token = share_data["token"]
    assert len(token) > 20
    assert share_data["revoked"] is False

    # 2. Access read-only view with NO auth headers
    view_resp = await client.get(f"/view/{token}")
    assert view_resp.status_code == 200
    view_data = view_resp.json()

    assert "project" in view_data
    assert view_data["project"]["repo_name"].startswith("share-repo-")
    assert "nodes" in view_data
    assert "edges" in view_data
    assert len(view_data["nodes"]) >= 3

    # Security check: ensure NO tokens, emails, or secrets are leaked
    raw_text = view_resp.text
    assert "webhook_secret" not in raw_text
    assert "gh_token" not in raw_text
    assert "email" not in raw_text


@pytest.mark.asyncio
async def test_revoke_share_link(client: AsyncClient, create_user):
    """Revoking a share link causes GET /view/{token} to return 404."""
    project_id, headers, _ = await _setup_project_with_tree(client, create_user)

    # Create link
    share_resp = await client.post(f"/projects/{project_id}/share", headers=headers)
    token = share_resp.json()["token"]

    # Verify link works before revocation
    assert (await client.get(f"/view/{token}")).status_code == 200

    # Revoke link
    revoke_resp = await client.delete(f"/projects/{project_id}/share?token={token}", headers=headers)
    assert revoke_resp.status_code == 200

    # Verify link is now dead
    dead_resp = await client.get(f"/view/{token}")
    assert dead_resp.status_code == 404
    assert "revoked" in dead_resp.json()["detail"]


@pytest.mark.asyncio
async def test_viewer_token_cannot_call_write_endpoints(client: AsyncClient, create_user):
    """
    CRITICAL SECURITY TEST:
    Proves that a viewer token CANNOT be used to call ANY write endpoint or authenticated endpoint.
    Must return 401 Unauthorized across all protected endpoints.
    """
    project_id, headers, node_id = await _setup_project_with_tree(client, create_user)

    # Generate a viewer token
    share_resp = await client.post(f"/projects/{project_id}/share", headers=headers)
    viewer_token = share_resp.json()["token"]

    # Spoofed auth header using the viewer token
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}

    # 1. Cannot create project
    resp1 = await client.post(
        "/projects",
        json={"repo_owner": "hack", "repo_name": "hack"},
        headers=viewer_headers,
    )
    assert resp1.status_code == 401

    # 2. Cannot add/join members
    resp2 = await client.post(
        f"/projects/{project_id}/members",
        json={"role": "devops"},
        headers=viewer_headers,
    )
    assert resp2.status_code == 401

    # 3. Cannot edit plan
    resp3 = await client.put(
        f"/projects/{project_id}/plan",
        json={"nodes": []},
        headers=viewer_headers,
    )
    assert resp3.status_code == 401

    # 4. Cannot approve plan
    resp4 = await client.post(
        f"/projects/{project_id}/plan/approve",
        headers=viewer_headers,
    )
    assert resp4.status_code == 401

    # 5. Cannot confirm node completion
    resp5 = await client.post(
        f"/nodes/{node_id}/confirm",
        headers=viewer_headers,
    )
    assert resp5.status_code == 401

    # 6. Cannot revoke share links
    resp6 = await client.delete(
        f"/projects/{project_id}/share",
        headers=viewer_headers,
    )
    assert resp6.status_code == 401

    # 7. Cannot access authenticated private endpoints
    resp7 = await client.get(f"/projects/{project_id}", headers=viewer_headers)
    assert resp7.status_code == 401

    resp8 = await client.get("/notifications", headers=viewer_headers)
    assert resp8.status_code == 401


@pytest.mark.asyncio
async def test_rate_limiter_blocks_excessive_requests():
    """Unit test RateLimiter triggers 429 when threshold exceeded."""
    from fastapi import HTTPException, Request

    limiter = RateLimiter(requests_limit=3, window_seconds=60)
    fake_request = Request({"type": "http", "client": ("192.168.1.100", 50000)})

    # First 3 requests succeed
    await limiter(fake_request)
    await limiter(fake_request)
    await limiter(fake_request)

    # 4th request must raise 429 Too Many Requests
    with pytest.raises(HTTPException) as exc_info:
        await limiter(fake_request)
    assert exc_info.value.status_code == 429
    assert "Rate limit exceeded" in exc_info.value.detail
