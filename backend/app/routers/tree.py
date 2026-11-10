"""Tree visualization router for retrieving nodes and edges."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_member
from app.db import get_db
from app.models import Edge, Event, Node, Project
from app.schemas import EdgeSchema, NodeSchema, ProgressSchema, TreeResponse

router = APIRouter(tags=["tree"])


@router.get("/projects/{id}/tree", response_model=TreeResponse)
async def get_project_tree(
    id: int,
    project: Project = Depends(require_member),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve full dependency tree (nodes and edges with current states) for UI rendering."""
    # Fetch all nodes in project
    node_stmt = select(Node).where(Node.project_id == project.id).order_by(Node.id.asc())
    nodes = (await db.execute(node_stmt)).scalars().all()

    # Fetch all edges in project
    edge_stmt = select(Edge).where(Edge.project_id == project.id).order_by(Edge.id.asc())
    edges = (await db.execute(edge_stmt)).scalars().all()

    total_nodes = len(nodes)
    done_nodes = sum(1 for n in nodes if n.status == "done")
    percentage = round((done_nodes / total_nodes) * 100, 1) if total_nodes > 0 else 0.0

    last_event_stmt = select(func.max(Event.id)).where(Event.project_id == project.id)
    last_event_id = (await db.execute(last_event_stmt)).scalar() or 0

    return TreeResponse(
        project_id=project.id,
        nodes=[NodeSchema.model_validate(n) for n in nodes],
        edges=[EdgeSchema.model_validate(e) for e in edges],
        progress=ProgressSchema(done=done_nodes, total=total_nodes, percentage=percentage),
        last_event_id=last_event_id,
    )
