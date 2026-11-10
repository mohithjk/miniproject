"""Plan management router for viewing, editing, and approving project dependency trees."""
from graphlib import CycleError, TopologicalSorter

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, require_member
from app.db import get_db
from app.models import Edge, Event, Job, Member, Node, Project, User
from app.schemas import PlanApproveResponse, PlanNodeSchema, PlanSchema, RoleEnum
from app.services.jobs import get_or_generate_draft_plan
from app.services.notify import notify_role_unlocked

router = APIRouter(prefix="/projects/{id}/plan", tags=["plan"])

VALID_ROLES = {role.value for role in RoleEnum}


def validate_plan(nodes: list[PlanNodeSchema]) -> None:
    """
    Validate plan integrity:
    1. At least one node
    2. Unique node keys
    3. Valid roles
    4. All dependencies exist
    5. No self dependencies
    6. No cycles (using graphlib.TopologicalSorter)
    """
    if not nodes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan must contain at least one node",
        )

    node_keys: set[str] = set()
    graph: dict[str, set[str]] = {}

    for node in nodes:
        if node.key in node_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate node key '{node.key}' found in plan",
            )
        node_keys.add(node.key)

        role_str = node.role.value if hasattr(node.role, "value") else str(node.role)
        if role_str not in VALID_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role '{role_str}' for node '{node.key}'. Allowed: {', '.join(sorted(VALID_ROLES))}",
            )

    for node in nodes:
        deps = node.depends_on
        for dep in deps:
            if dep == node.key:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Node '{node.key}' cannot depend on itself",
                )
            if dep not in node_keys:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Node '{node.key}' depends on non-existent node '{dep}'",
                )
        graph[node.key] = set(deps)

    # Cycle detection via standard library graphlib
    ts = TopologicalSorter(graph)
    try:
        ts.prepare()
    except CycleError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cycle detected in plan dependencies: {exc}",
        )

    # Node count check (between 3 and 40)
    if len(nodes) < 3 or len(nodes) > 40:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Plan node count must be between 3 and 40 (got {len(nodes)})",
        )


@router.get("", response_model=PlanSchema)
async def get_plan(
    id: int,
    project: Project = Depends(require_member),
    db: AsyncSession = Depends(get_db),
):
    """
    View project plan. If draft, returns current draft;
    if approved, reconstructs the plan from persisted nodes and edges.
    """
    if project.plan_status == "approved":
        # Load from persisted nodes and edges
        node_stmt = select(Node).where(Node.project_id == project.id).order_by(Node.id)
        nodes = (await db.execute(node_stmt)).scalars().all()

        edge_stmt = select(Edge).where(Edge.project_id == project.id)
        edges = (await db.execute(edge_stmt)).scalars().all()

        id_to_key = {n.id: n.key for n in nodes}
        incoming_deps: dict[str, list[str]] = {n.key: [] for n in nodes}
        for edge in edges:
            to_key = id_to_key.get(edge.to_node)
            from_key = id_to_key.get(edge.from_node)
            if to_key and from_key:
                incoming_deps[to_key].append(from_key)

        plan_nodes = [
            PlanNodeSchema(
                key=n.key,
                title=n.title,
                description=n.description,
                role=RoleEnum(n.role),
                done_criteria=n.done_criteria,
                path_hints=n.path_hints or [],
                depends_on=incoming_deps.get(n.key, []),
            )
            for n in nodes
        ]
        return PlanSchema(nodes=plan_nodes)

    # Draft plan
    draft_dict = await get_or_generate_draft_plan(project.id, db)
    return PlanSchema.model_validate(draft_dict)


@router.put("", response_model=PlanSchema)
async def update_plan(
    id: int,
    body: PlanSchema,
    project: Project = Depends(require_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit draft plan with cycle and dependency validation."""
    if project.plan_status == "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan has already been approved and cannot be modified",
        )

    # Validate plan rules
    validate_plan(body.nodes)

    plan_dict = body.model_dump()

    # Append draft update event
    event = Event(
        project_id=project.id,
        type="plan_draft",
        payload=plan_dict,
    )
    db.add(event)

    audit_event = Event(
        project_id=project.id,
        type="plan_updated",
        payload={"updated_by": current_user.id, "node_count": len(body.nodes)},
    )
    db.add(audit_event)

    await db.commit()
    return body


@router.post("/approve", response_model=PlanApproveResponse)
async def approve_plan(
    id: int,
    project: Project = Depends(require_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve draft plan: creates nodes and edges in the database.
    Edges start in 'hidden' state.
    Root nodes (no dependencies) start in 'ready' state; other nodes start 'locked'.
    """
    if project.plan_status == "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plan has already been approved",
        )

    # 1. Fetch latest draft plan
    draft_dict = await get_or_generate_draft_plan(project.id, db)
    plan = PlanSchema.model_validate(draft_dict)
    validate_plan(plan.nodes)

    # 2. Update project plan status to approved
    project.plan_status = "approved"

    # Fetch members of this project to auto-assign owners to root nodes
    members_stmt = select(Member).where(Member.project_id == project.id)
    project_members = (await db.execute(members_stmt)).scalars().all()
    role_to_members: dict[str, list[Member]] = {}
    for m in project_members:
        role_to_members.setdefault(m.role, []).append(m)

    # 3. Create Node entities (roots are 'ready', others 'locked')
    created_nodes: list[Node] = []
    for item in plan.nodes:
        is_root = len(item.depends_on) == 0
        node_role = item.role.value if hasattr(item.role, "value") else str(item.role)
        owner_id = None
        if is_root:
            matching_members = role_to_members.get(node_role, [])
            if len(matching_members) == 1:
                owner_id = matching_members[0].user_id

        node = Node(
            project_id=project.id,
            key=item.key,
            title=item.title,
            description=item.description,
            role=node_role,
            done_criteria=item.done_criteria,
            path_hints=item.path_hints,
            status="ready" if is_root else "locked",
            owner_id=owner_id,
        )
        db.add(node)
        created_nodes.append(node)

    await db.flush()  # Populate node.id values

    # Send notifications for ready root nodes
    for node in created_nodes:
        if node.status == "ready":
            await notify_role_unlocked(
                db=db,
                project_id=project.id,
                role=node.role,
                node_id=node.id,
                node_key=node.key,
                node_title=node.title,
            )

    key_to_id = {node.key: node.id for node in created_nodes}

    # 4. Create Edge entities (all start with state 'hidden')
    created_edges: list[Edge] = []
    for item in plan.nodes:
        to_node_id = key_to_id[item.key]
        for parent_key in item.depends_on:
            from_node_id = key_to_id[parent_key]
            edge = Edge(
                project_id=project.id,
                from_node=from_node_id,
                to_node=to_node_id,
                state="hidden",
            )
            db.add(edge)
            created_edges.append(edge)

    # 5. Record approval event
    approval_event = Event(
        project_id=project.id,
        type="plan_approved",
        payload={
            "approved_by": current_user.id,
            "nodes_count": len(created_nodes),
            "edges_count": len(created_edges),
        },
    )
    db.add(approval_event)

    await db.commit()

    return PlanApproveResponse(
        project_id=project.id,
        nodes_created=len(created_nodes),
        edges_created=len(created_edges),
        plan_status="approved",
    )


@router.post("/retry")
async def retry_plan(
    id: int,
    project: Project = Depends(require_member),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retry plan generation if planning previously failed or is in draft.
    Blocked if the plan has already been approved.
    """
    if project.plan_status == "approved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot retry planning: plan has already been approved",
        )

    # Queue a new plan job
    job = Job(
        type="plan",
        status="pending",
        attempts=0,
        payload={
            "project_id": project.id,
            "readme": project.readme_text or "",
            "file_tree": [],
        },
    )
    db.add(job)

    db.add(
        Event(
            project_id=project.id,
            type="plan_retry_requested",
            payload={"requested_by": current_user.id},
        )
    )
    await db.commit()
    await db.refresh(job)

    return {
        "status": "plan_retry_queued",
        "project_id": project.id,
        "job_id": job.id,
    }
