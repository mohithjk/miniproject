"""Node unlock service, dependency cascade progression, and completion decision scoring."""
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Edge, Event, Node, Project
from app.services.notify import notify_role_unlocked


def calculate_completion_score(
    pr_merged: bool = False,
    ci_passed: bool = False,
    expected_files_exist: bool = False,
    verdict: str = "not_done",
    judge_confidence: float = 1.0,
) -> float:
    """
    Calculate completion score according to Core Rule 4:
    score = 0.5 (if PR merged) + 0.2 (if CI passed) + 0.15 (if expected files exist) + 0.15*confidence (if verdict done)
    """
    score = 0.0
    if pr_merged:
        score += settings.SCORE_PR_MERGED
    if ci_passed:
        score += settings.SCORE_CI_PASSED
    if expected_files_exist:
        score += settings.SCORE_FILES_EXIST
    if verdict == "done":
        score += settings.SCORE_JUDGE_WEIGHT * float(judge_confidence)
    return round(score, 4)


def decide_completion_action(score: float) -> str:
    """
    Map score to completion decision:
    - >= 0.8: 'auto_complete'
    - 0.5 to 0.8: 'ask_confirm'
    - < 0.5: 'in_progress'
    """
    if score >= settings.AUTO_COMPLETE_THRESHOLD:
        return "auto_complete"
    elif score >= settings.CONFIRM_THRESHOLD:
        return "ask_confirm"
    return "in_progress"


async def unlock_node(node_id: int, db: AsyncSession) -> dict[str, Any]:
    """
    Execute node completion in ONE atomic transaction:
    1. Idempotency: If node is already done, return early.
    2. Mark node 'done' with done_at timestamp.
    3. Make all its incoming edges 'solid'.
    4. For each child node: if ALL parents are done, set child to 'ready', make its
       incoming edges 'dotted', and notify the role owner.
    5. Log events.
    6. If all project nodes are done, mark project status 'completed'.
    """
    node = await db.get(Node, node_id)
    if not node:
        raise ValueError(f"Node with id {node_id} not found")

    # 1. Idempotent check
    if node.status == "done":
        return {
            "status": "already_done",
            "node_id": node.id,
            "node_key": node.key,
            "unlocked_children": [],
            "project_completed": False,
        }

    # 2. Mark node done
    node.status = "done"
    node.done_at = datetime.now(timezone.utc)

    # 3. Make all incoming edges solid
    incoming_stmt = select(Edge).where(Edge.to_node == node.id)
    incoming_edges = (await db.execute(incoming_stmt)).scalars().all()
    for in_edge in incoming_edges:
        in_edge.state = "solid"

    # 4. Log node_done event
    db.add(
        Event(
            project_id=node.project_id,
            type="node_done",
            payload={"node_id": node.id, "node_key": node.key, "role": node.role},
        )
    )

    # 5. Check child nodes (targets of outgoing edges)
    outgoing_stmt = select(Edge).where(Edge.from_node == node.id)
    outgoing_edges = (await db.execute(outgoing_stmt)).scalars().all()

    unlocked_children: list[str] = []

    for out_edge in outgoing_edges:
        child_id = out_edge.to_node
        child = await db.get(Node, child_id)
        if not child or child.status == "done":
            continue

        # Check if ALL parents of child are now 'done'
        child_incoming_stmt = select(Edge).where(Edge.to_node == child.id)
        child_incoming_edges = (await db.execute(child_incoming_stmt)).scalars().all()
        parent_ids = [e.from_node for e in child_incoming_edges]

        parents_stmt = select(Node).where(Node.id.in_(parent_ids))
        parents = (await db.execute(parents_stmt)).scalars().all()

        all_parents_done = all(p.status == "done" for p in parents)
        if all_parents_done:
            # Unlock child: set to ready
            if child.status == "locked":
                child.status = "ready"

            # Make incoming edges to child dotted
            for e in child_incoming_edges:
                e.state = "dotted"

            # Notify role owner
            await notify_role_unlocked(
                db=db,
                project_id=node.project_id,
                role=child.role,
                node_id=child.id,
                node_key=child.key,
                node_title=child.title,
            )

            # Log node_unlocked event
            db.add(
                Event(
                    project_id=node.project_id,
                    type="node_unlocked",
                    payload={"node_id": child.id, "node_key": child.key, "role": child.role},
                )
            )
            unlocked_children.append(child.key)

    # 6. Check if entire project is completed
    incomplete_stmt = select(Node).where(
        Node.project_id == node.project_id,
        Node.status != "done",
    )
    incomplete_nodes = (await db.execute(incomplete_stmt)).scalars().all()
    project_completed = len(incomplete_nodes) == 0

    if project_completed:
        proj = await db.get(Project, node.project_id)
        if proj and proj.status != "completed":
            proj.status = "completed"
            db.add(
                Event(
                    project_id=node.project_id,
                    type="project_completed",
                    payload={"completed_at": datetime.now(timezone.utc).isoformat()},
                )
            )

    await db.commit()

    return {
        "status": "done",
        "node_id": node.id,
        "node_key": node.key,
        "unlocked_children": unlocked_children,
        "project_completed": project_completed,
    }
