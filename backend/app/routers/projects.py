"""Projects management router for connecting repositories and inspecting project metadata."""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import decrypt_token, get_current_user, require_member
from app.config import settings
from app.db import get_db
from app.models import Event, Job, Member, Project, User
from app.schemas import ProjectCreate, ProjectResponse
from app.services import github

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Connect a GitHub repository to the coordinator.
    Fetches README and file tree, registers webhook on GitHub, and queues a plan job.
    """
    # 1. Check if repository is already connected
    existing_stmt = select(Project).where(
        Project.repo_owner == body.repo_owner,
        Project.repo_name == body.repo_name,
    )
    existing_res = await db.execute(existing_stmt)
    if existing_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Project for repository {body.repo_owner}/{body.repo_name} already exists",
        )

    # 2. Retrieve and decrypt user's GitHub access token
    if not current_user.gh_token_enc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub token missing for user. Please sign in via GitHub OAuth.",
        )
    token = decrypt_token(current_user.gh_token_enc)

    # 3. Fetch README and file tree via GitHub API
    readme_text = await github.fetch_readme(token, body.repo_owner, body.repo_name)
    file_tree = await github.fetch_file_tree(token, body.repo_owner, body.repo_name)

    # 4. Generate random secret and register repository webhook
    webhook_secret = secrets.token_hex(20)
    webhook_callback_url = f"{settings.WEBHOOK_BASE_URL.rstrip('/')}/webhooks/github"
    await github.register_webhook(
        token=token,
        repo_owner=body.repo_owner,
        repo_name=body.repo_name,
        webhook_url=webhook_callback_url,
        webhook_secret=webhook_secret,
    )

    # 5. Persist Project
    project = Project(
        owner_id=current_user.id,
        repo_owner=body.repo_owner,
        repo_name=body.repo_name,
        readme_text=readme_text,
        webhook_secret=webhook_secret,
        plan_status="draft",
        status="active",
    )
    db.add(project)
    await db.flush()

    # 6. Add creator as project member
    owner_role = body.owner_role.value if hasattr(body.owner_role, "value") else str(body.owner_role)
    creator_member = Member(
        project_id=project.id,
        user_id=current_user.id,
        role=owner_role,
    )
    db.add(creator_member)

    # 7. Queue 'plan' job
    plan_job = Job(
        type="plan",
        payload={
            "project_id": project.id,
            "readme": readme_text or "",
            "file_tree": file_tree,
        },
        status="pending",
        attempts=0,
    )
    db.add(plan_job)

    # 8. Log project creation event
    creation_event = Event(
        project_id=project.id,
        type="project_created",
        payload={
            "repo_owner": body.repo_owner,
            "repo_name": body.repo_name,
            "owner_id": current_user.id,
        },
    )
    db.add(creation_event)

    await db.commit()
    await db.refresh(project)

    return project


@router.get("/{id}", response_model=ProjectResponse)
async def get_project(
    id: int,
    project: Project = Depends(require_member),
):
    """Retrieve details for a project. Enforces membership verification."""
    return project
