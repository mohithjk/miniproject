"""Node details inspection and manual completion confirmation router."""
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Commit, Member, Node, NodeCommit, Project, User
from app.schemas import MatchedCommitDetail, NodeDetailResponse, NodeSchema
from app.services.unlock import unlock_node

router = APIRouter(prefix="/nodes", tags=["nodes"])


async def get_node_with_membership_check(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Node:
    """Dependency ensuring node exists and authenticated user has project membership."""
    node = await db.get(Node, id)
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node with id {id} not found",
        )

    # Check project membership or ownership
    proj = await db.get(Project, node.project_id)
    if not proj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if proj.owner_id != current_user.id:
        mem_stmt = select(Member).where(
            Member.project_id == node.project_id,
            Member.user_id == current_user.id,
        )
        if not (await db.execute(mem_stmt)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not a member of this project",
            )

    return node


@router.get("/{id}", response_model=NodeDetailResponse)
async def get_node_detail(
    id: int,
    node: Node = Depends(get_node_with_membership_check),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve detailed node information, including matched commits, confidence, and methods."""
    stmt = (
        select(NodeCommit, Commit)
        .join(Commit, NodeCommit.commit_id == Commit.id)
        .where(NodeCommit.node_id == node.id)
        .order_by(Commit.committed_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    matched_commits = [
        MatchedCommitDetail(
            commit_id=c.id,
            sha=c.sha,
            message=c.message,
            author_login=c.author_login,
            confidence=nc.confidence,
            method=nc.method,
        )
        for nc, c in rows
    ]

    return NodeDetailResponse(
        node=NodeSchema.model_validate(node),
        commits=matched_commits,
    )


@router.post("/{id}/confirm")
async def confirm_node_completion(
    id: int,
    node: Node = Depends(get_node_with_membership_check),
    db: AsyncSession = Depends(get_db),
):
    """Manually confirm node completion, executing the unlock progression cascade."""
    result = await unlock_node(node.id, db)
    return {
        "status": "confirmed",
        "node_id": node.id,
        "node_status": "done",
        "unlock_result": result,
    }
