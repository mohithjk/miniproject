"""Node details inspection and manual completion confirmation router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Commit, Event, Member, Node, NodeCommit, Project, User
from app.schemas import (
    AIDecisionInfo,
    MatchedCommitDetail,
    NodeDetailResponse,
    NodeOwnerInfo,
    NodeOwnerUpdate,
    NodeSchema,
)
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

    # Fetch owner details if assigned
    owner_info = None
    if node.owner_id:
        owner_user = await db.get(User, node.owner_id)
        if owner_user:
            owner_info = NodeOwnerInfo(
                id=owner_user.id,
                username=owner_user.username,
                avatar_url=owner_user.avatar_url,
            )

    # Fetch latest AI decision event for this node
    latest_decision = None
    evt_stmt = (
        select(Event)
        .where(
            Event.project_id == node.project_id,
            Event.type.in_(["node_evaluated", "judge_completed", "node_judged"]),
        )
        .order_by(Event.id.desc())
    )
    events = (await db.execute(evt_stmt)).scalars().all()
    for evt in events:
        p = evt.payload or {}
        if p.get("node_id") == node.id or p.get("node_key") == node.key:
            latest_decision = AIDecisionInfo(
                verdict=p.get("verdict", "unknown"),
                confidence=float(p.get("confidence", 0.0)),
                reason=p.get("reason", ""),
            )
            break

    return NodeDetailResponse(
        node=NodeSchema.model_validate(node),
        title=node.title,
        role=node.role,
        status=node.status,
        done_criteria=node.done_criteria,
        owner=owner_info,
        commits=matched_commits,
        latest_ai_decision=latest_decision,
    )


@router.post("/{id}/confirm")
async def confirm_node_completion(
    id: int,
    node: Node = Depends(get_node_with_membership_check),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually confirm node completion, executing the unlock progression cascade.
    Only the node owner or project owner can confirm, and node must be 'ready' or 'in_progress'.
    """
    proj = await db.get(Project, node.project_id)
    is_proj_owner = proj and proj.owner_id == current_user.id
    is_node_owner = node.owner_id is not None and node.owner_id == current_user.id

    if not is_proj_owner and not is_node_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the node owner or project owner can confirm completion",
        )

    if node.status not in ["ready", "in_progress"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm node with status '{node.status}'. Only 'ready' or 'in_progress' nodes can be confirmed.",
        )

    result = await unlock_node(node.id, db)
    return {
        "status": "confirmed",
        "node_id": node.id,
        "node_status": "done",
        "unlock_result": result,
    }


@router.patch("/{id}/owner")
async def update_node_owner(
    id: int,
    body: NodeOwnerUpdate,
    node: Node = Depends(get_node_with_membership_check),
    db: AsyncSession = Depends(get_db),
):
    """Manually assign or change the owner of a node."""
    if body.owner_id is not None:
        # Check target user is a project member or owner
        proj = await db.get(Project, node.project_id)
        if proj.owner_id != body.owner_id:
            mem_stmt = select(Member).where(
                Member.project_id == node.project_id,
                Member.user_id == body.owner_id,
            )
            if not (await db.execute(mem_stmt)).scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Target user is not a member of this project",
                )

    node.owner_id = body.owner_id
    db.add(
        Event(
            project_id=node.project_id,
            type="node_owner_updated",
            payload={"node_id": node.id, "owner_id": body.owner_id},
        )
    )
    await db.commit()
    await db.refresh(node)
    return {"status": "ok", "node_id": node.id, "owner_id": node.owner_id}
