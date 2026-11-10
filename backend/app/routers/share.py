"""Share link management and public read-only viewer endpoints."""
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_member
from app.db import get_db
from app.models import Edge, Event, Node, Project, ShareLink
from app.rate_limiter import RateLimiter
from app.schemas import (
    EdgeSchema,
    NodeSchema,
    ShareLinkResponse,
    ViewerProjectInfo,
    ViewerTreeResponse,
)

router = APIRouter(tags=["share"])
viewer_limiter = RateLimiter(requests_limit=60, window_seconds=60)


@router.post("/projects/{id}/share", response_model=ShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_share_link(
    id: int,
    project: Project = Depends(require_member),
    db: AsyncSession = Depends(get_db),
):
    """Generate a read-only viewer link for mentors or external observers."""
    token = secrets.token_urlsafe(32)

    share_link = ShareLink(
        project_id=project.id,
        token=token,
        revoked=False,
    )
    db.add(share_link)

    # Log audit event
    db.add(
        Event(
            project_id=project.id,
            type="share_link_created",
            payload={"token": token},
        )
    )

    await db.commit()
    await db.refresh(share_link)

    return ShareLinkResponse(
        id=share_link.id,
        project_id=share_link.project_id,
        token=share_link.token,
        revoked=share_link.revoked,
        created_at=share_link.created_at,
        share_url=f"/view/{share_link.token}",
    )


@router.delete("/projects/{id}/share")
async def revoke_share_link(
    id: int,
    token: Optional[str] = Query(default=None, description="Specific token to revoke; if omitted, revokes all for project"),
    project: Project = Depends(require_member),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an active viewer link so it can no longer be used."""
    if token:
        stmt = select(ShareLink).where(
            ShareLink.project_id == project.id,
            ShareLink.token == token,
        )
        link = (await db.execute(stmt)).scalar_one_or_none()
        if not link:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Share link with token '{token}' not found",
            )
        link.revoked = True
    else:
        stmt = select(ShareLink).where(
            ShareLink.project_id == project.id,
            ShareLink.revoked.is_(False),
        )
        links = (await db.execute(stmt)).scalars().all()
        for link in links:
            link.revoked = True

    db.add(
        Event(
            project_id=project.id,
            type="share_link_revoked",
            payload={"token": token or "all"},
        )
    )

    await db.commit()
    return {"status": "revoked", "project_id": project.id, "token": token or "all"}


@router.get("/view/{token}", response_model=ViewerTreeResponse)
async def view_shared_tree(
    token: str,
    db: AsyncSession = Depends(get_db),
    _rate_limit: None = Depends(viewer_limiter),
):
    """
    Public read-only viewer endpoint for mentors.
    Rate limited. Returns project graph without secrets, tokens, or emails.
    """
    # 1. Lookup share link
    stmt = select(ShareLink).where(ShareLink.token == token)
    share_link = (await db.execute(stmt)).scalar_one_or_none()

    if not share_link or share_link.revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viewer link is invalid or has been revoked",
        )

    # 2. Fetch project
    project = await db.get(Project, share_link.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated project not found",
        )

    # 3. Fetch nodes and edges
    node_stmt = select(Node).where(Node.project_id == project.id).order_by(Node.id.asc())
    nodes = (await db.execute(node_stmt)).scalars().all()

    edge_stmt = select(Edge).where(Edge.project_id == project.id).order_by(Edge.id.asc())
    edges = (await db.execute(edge_stmt)).scalars().all()

    # 4. Safe public view (no tokens, no secrets, no emails)
    return ViewerTreeResponse(
        project=ViewerProjectInfo(
            id=project.id,
            repo_owner=project.repo_owner,
            repo_name=project.repo_name,
            plan_status=project.plan_status,
            status=project.status,
        ),
        nodes=[NodeSchema.model_validate(n) for n in nodes],
        edges=[EdgeSchema.model_validate(e) for e in edges],
    )
