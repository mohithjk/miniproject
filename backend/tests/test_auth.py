from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, Response

from app.auth import create_access_token, decode_access_token, decrypt_token, encrypt_token


def test_fernet_token_encryption_roundtrip():
    """Verify that GitHub tokens can be encrypted and cleanly decrypted."""
    raw_token = "gho_super_secret_github_token_999"
    encrypted = encrypt_token(raw_token)
    assert encrypted != raw_token
    assert "gho_" not in encrypted

    decrypted = decrypt_token(encrypted)
    assert decrypted == raw_token


def test_jwt_create_and_decode():
    """Verify JWT access token generation and claims parsing."""
    user_id = 42
    token = create_access_token(user_id)
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)
    assert "exp" in payload


@pytest.mark.asyncio
async def test_github_login_redirect(client: AsyncClient):
    """GET /auth/github/login should redirect to GitHub with required scopes."""
    response = await client.get("/auth/github/login", follow_redirects=False)
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert "github.com/login/oauth/authorize" in location
    assert "read:user" in location
    assert "public_repo" in location


@pytest.mark.asyncio
async def test_github_callback_success(client: AsyncClient):
    """GET /auth/github/callback exchanges code, creates user, and returns JWT."""
    fake_code = "gh_code_abc123"

    mock_client = AsyncMock()
    mock_client.post.return_value = Response(
        200, json={"access_token": "gho_mock_access_token_123", "token_type": "bearer"}
    )
    mock_client.get.return_value = Response(
        200,
        json={
            "id": 88888,
            "login": "octocat",
            "avatar_url": "https://avatars.githubusercontent.com/u/88888",
        },
    )
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    with patch("app.auth.httpx.AsyncClient", return_value=mock_client):
        response = await client.get(f"/auth/github/callback?code={fake_code}")
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["github_id"] == 88888
        assert data["user"]["username"] == "octocat"


@pytest.mark.asyncio
async def test_protected_route_without_token(client: AsyncClient):
    """Requests without Authorization header must return 401."""
    response = await client.get("/projects/1")
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]


@pytest.mark.asyncio
async def test_protected_route_with_invalid_token(client: AsyncClient):
    """Requests with malformed token must return 401."""
    headers = {"Authorization": "Bearer invalid.jwt.token"}
    response = await client.get("/projects/1", headers=headers)
    assert response.status_code == 401
