from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import auth_router
from app.config import settings
from app.db import get_db
from app.routers.members import router as members_router
from app.routers.nodes import router as nodes_router
from app.routers.notifications import router as notifications_router
from app.routers.plan import router as plan_router
from app.routers.projects import router as projects_router
from app.routers.share import router as share_router
from app.routers.tree import router as tree_router
from app.routers.webhooks import router as webhooks_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware with restricted origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(members_router)
app.include_router(plan_router)
app.include_router(tree_router)
app.include_router(nodes_router)
app.include_router(notifications_router)
app.include_router(share_router)
app.include_router(webhooks_router)


@app.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Health check endpoint checking application and database status."""
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"unreachable: {str(exc)}"

    return {
        "status": "healthy" if db_status == "ok" else "degraded",
        "database": db_status,
        "environment": settings.ENVIRONMENT,
    }
