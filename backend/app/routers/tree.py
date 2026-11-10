"""Tree visualization router for retrieving nodes and edges."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_member
from app.db import get_db
from app.models import Edge, Node, Project
from app.schemas import EdgeSchema, NodeSchema, TreeResponse

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

    return TreeResponse(
        project_id=project.id,
        nodes=[NodeSchema.model_validate(n) for n in nodes],
        edges=[EdgeSchema.model_validate(e) for e in edges],
    )
