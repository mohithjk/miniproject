"""Notification service for in-app notifications and optional Discord/Slack webhooks."""
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Member, Notification, Project


async def send_chat_webhook(message: str) -> None:
    """Dispatch optional notification to Discord and/or Slack webhooks."""
    async with httpx.AsyncClient() as client:
        if settings.DISCORD_WEBHOOK_URL:
            try:
                await client.post(
                    settings.DISCORD_WEBHOOK_URL,
                    json={"content": message},
                    timeout=5.0,
                )
            except Exception:
                pass

        if settings.SLACK_WEBHOOK_URL:
            try:
                await client.post(
                    settings.SLACK_WEBHOOK_URL,
                    json={"text": message},
                    timeout=5.0,
                )
            except Exception:
                pass


async def create_notification(
    db: AsyncSession,
    user_id: int,
    project_id: int,
    message: str,
    node_id: Optional[int] = None,
) -> Notification:
    """Create an in-app notification record and fire external chat webhooks."""
    notif = Notification(
        user_id=user_id,
        project_id=project_id,
        message=message,
        node_id=node_id,
        is_read=False,
    )
    db.add(notif)
    await send_chat_webhook(message)
    return notif


async def notify_role_unlocked(
    db: AsyncSession,
    project_id: int,
    role: str,
    node_id: int,
    node_key: str,
    node_title: str,
) -> list[Notification]:
    """
    Find members with the given role in the project and notify them of the unlocked node.
    If no members exist for that role, fallback to notifying the project owner.
    """
    message = f"Node [{node_key}] '{node_title}' has unlocked and is ready for your role ({role})!"

    stmt = select(Member).where(Member.project_id == project_id, Member.role == role)
    members = (await db.execute(stmt)).scalars().all()

    notifications: list[Notification] = []

    if members:
        for m in members:
            n = await create_notification(
                db=db,
                user_id=m.user_id,
                project_id=project_id,
                message=message,
                node_id=node_id,
            )
            notifications.append(n)
    else:
        # Fallback: notify project owner
        proj = await db.get(Project, project_id)
        if proj:
            n = await create_notification(
                db=db,
                user_id=proj.owner_id,
                project_id=project_id,
                message=f"[Unassigned Role: {role}] {message}",
                node_id=node_id,
            )
            notifications.append(n)

    return notifications
