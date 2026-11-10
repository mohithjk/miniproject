"""Project members management router for joining or assigning roles."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Event, Member, Project, User
from app.schemas import MemberCreate, MemberResponse

router = APIRouter(prefix="/projects/{id}/members", tags=["members"])


@router.post("", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def add_or_join_member(
    id: int,
    body: MemberCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Join a project with a role, or add another user to the project.
    Self-joining requires user authentication; adding someone else requires membership.
    """
    stmt = select(Project).where(Project.id == id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Determine target user
    if body.user_id is None or body.user_id == current_user.id:
        target_user_id = current_user.id
        target_username = current_user.username
    else:
        caller_is_owner = project.owner_id == current_user.id
        member_check = await db.execute(
            select(Member).where(Member.project_id == id, Member.user_id == current_user.id)
        )
        if not caller_is_owner and not member_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You must be a member of the project to add other users",
            )

        target_user = await db.get(User, body.user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with id {body.user_id} not found",
            )
        target_user_id = target_user.id
        target_username = target_user.username

    # Check for duplicate membership
    existing_member_stmt = select(Member).where(
        Member.project_id == id,
        Member.user_id == target_user_id,
    )
    existing_res = await db.execute(existing_member_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member of this project",
        )

    role_str = body.role.value if hasattr(body.role, "value") else str(body.role)
    new_member = Member(
        project_id=id,
        user_id=target_user_id,
        role=role_str,
    )
    db.add(new_member)

    # Log member join event
    event = Event(
        project_id=id,
        type="member_joined",
        payload={
            "user_id": target_user_id,
            "role": role_str,
            "added_by": current_user.id,
        },
    )
    db.add(event)

    await db.commit()
    await db.refresh(new_member)

    return MemberResponse(
        id=new_member.id,
        project_id=new_member.project_id,
        user_id=new_member.user_id,
        role=new_member.role,
        username=target_username,
    )
