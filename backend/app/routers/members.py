"""Project members management router for joining or assigning roles."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Event, Member, Node, Project, User
from app.schemas import MemberCreate, MemberResponse, MemberUpdateRole

router = APIRouter(prefix="/projects/{id}/members", tags=["members"])


@router.get("", response_model=list[MemberResponse])
async def list_members(
    id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all members of a project with their roles."""
    stmt = select(Project).where(Project.id == id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Check caller is member or owner
    if project.owner_id != current_user.id:
        mem_check = await db.execute(
            select(Member).where(Member.project_id == id, Member.user_id == current_user.id)
        )
        if not mem_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not a member of this project",
            )

    members_stmt = (
        select(Member, User.username)
        .join(User, Member.user_id == User.id)
        .where(Member.project_id == id)
        .order_by(Member.id)
    )
    rows = (await db.execute(members_stmt)).all()

    return [
        MemberResponse(
            id=m.id,
            project_id=m.project_id,
            user_id=m.user_id,
            role=m.role,
            username=username,
        )
        for m, username in rows
    ]


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


@router.patch("/{user_id}", response_model=MemberResponse)
async def update_member_role(
    id: int,
    user_id: int,
    body: MemberUpdateRole,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update a member's role in the project.
    A member can update their own role, or the project owner can update any member's role.
    """
    project = await db.get(Project, id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    caller_is_owner = project.owner_id == current_user.id
    if not caller_is_owner and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only change your own role unless you are the project owner",
        )

    stmt = (
        select(Member, User.username)
        .join(User, Member.user_id == User.id)
        .where(Member.project_id == id, Member.user_id == user_id)
    )
    res = (await db.execute(stmt)).first()
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this project",
        )

    member, username = res
    old_role = member.role
    member.role = body.role.value

    event = Event(
        project_id=id,
        type="member_role_updated",
        payload={
            "user_id": user_id,
            "old_role": old_role,
            "new_role": member.role,
            "updated_by": current_user.id,
        },
    )
    db.add(event)
    await db.commit()
    await db.refresh(member)

    return MemberResponse(
        id=member.id,
        project_id=member.project_id,
        user_id=member.user_id,
        role=member.role,
        username=username,
    )


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
async def remove_member(
    id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a member from the project.
    Only the project owner can remove other members (or a member can remove themselves).
    The project owner cannot be removed.
    """
    project = await db.get(Project, id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    if user_id == project.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The project owner cannot be removed from the project",
        )

    caller_is_owner = project.owner_id == current_user.id
    if not caller_is_owner and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the project owner can remove other members",
        )

    stmt = select(Member).where(Member.project_id == id, Member.user_id == user_id)
    member = (await db.execute(stmt)).scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this project",
        )

    # Unassign this member from any nodes they own
    node_stmt = select(Node).where(Node.project_id == id, Node.owner_id == user_id)
    owned_nodes = (await db.execute(node_stmt)).scalars().all()
    for n in owned_nodes:
        n.owner_id = None

    await db.delete(member)

    event = Event(
        project_id=id,
        type="member_removed",
        payload={
            "user_id": user_id,
            "removed_by": current_user.id,
        },
    )
    db.add(event)
    await db.commit()

    return {"status": "removed", "user_id": user_id, "project_id": id}
