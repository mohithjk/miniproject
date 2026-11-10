"""GitHub API integration service for fetching repository content, commits, and registering webhooks."""
from typing import Any, Optional
import httpx
from fastapi import HTTPException, status

GITHUB_API_BASE = "https://api.github.com"


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "AI-Project-Coordinator",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def fetch_readme(token: str, repo_owner: str, repo_name: str) -> Optional[str]:
    """Fetch raw README content from GitHub repository."""
    url = f"{GITHUB_API_BASE}/repos/{repo_owner}/{repo_name}/readme"
    headers = _headers(token)
    headers["Accept"] = "application/vnd.github.raw+json"

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)
        if response.status_code == status.HTTP_200_OK:
            return response.text
        if response.status_code == status.HTTP_404_NOT_FOUND:
            return None
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub API error fetching README: {response.status_code} {response.text}",
        )


async def fetch_file_tree(token: str, repo_owner: str, repo_name: str) -> list[str]:
    """Fetch recursive list of file paths (blobs) for the repository default branch."""
    async with httpx.AsyncClient() as client:
        repo_url = f"{GITHUB_API_BASE}/repos/{repo_owner}/{repo_name}"
        repo_resp = await client.get(repo_url, headers=_headers(token))
        if repo_resp.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository {repo_owner}/{repo_name} not found on GitHub",
            )
        if repo_resp.status_code != status.HTTP_200_OK:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"GitHub API error fetching repo info: {repo_resp.text}",
            )

        default_branch = repo_resp.json().get("default_branch", "main")

        tree_url = f"{GITHUB_API_BASE}/repos/{repo_owner}/{repo_name}/git/trees/{default_branch}?recursive=1"
        tree_resp = await client.get(tree_url, headers=_headers(token))
        if tree_resp.status_code != status.HTTP_200_OK:
            return []

        tree_data = tree_resp.json().get("tree", [])
        return [item["path"] for item in tree_data if item.get("type") == "blob"]


async def fetch_commit(token: str, repo_owner: str, repo_name: str, sha: str) -> dict[str, Any]:
    """Fetch detailed commit information including modified/added files."""
    url = f"{GITHUB_API_BASE}/repos/{repo_owner}/{repo_name}/commits/{sha}"
    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=_headers(token))
        if response.status_code == status.HTTP_200_OK:
            return response.json()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub API error fetching commit {sha}: {response.status_code} {response.text}",
        )


async def register_webhook(
    token: str,
    repo_owner: str,
    repo_name: str,
    webhook_url: str,
    webhook_secret: str,
) -> dict[str, Any]:
    """Register repository webhook on GitHub for push, PR, and workflow events."""
    url = f"{GITHUB_API_BASE}/repos/{repo_owner}/{repo_name}/hooks"
    payload = {
        "name": "web",
        "active": True,
        "events": ["push", "pull_request", "workflow_run", "ping"],
        "config": {
            "url": webhook_url,
            "content_type": "json",
            "secret": webhook_secret,
            "insecure_ssl": "0",
        },
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=_headers(token), json=payload)
        if response.status_code in (status.HTTP_201_CREATED, status.HTTP_200_OK):
            return response.json()

        if response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY:
            return {"status": "already_exists", "message": "Hook already configured"}

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to register GitHub webhook: {response.status_code} {response.text}",
        )
