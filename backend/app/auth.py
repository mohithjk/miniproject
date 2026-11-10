"""Authentication, token encryption, JWT handling, and GitHub OAuth endpoints."""
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import jwt
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import Member, Project, User
from app.schemas import TokenResponse, UserResponse

auth_router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


# --- Fernet Token Encryption ---
def _get_fernet() -> Fernet:
    return Fernet(settings.FERNET_KEY.encode())


def encrypt_token(token: str) -> str:
    """Encrypt a plain GitHub access token."""
    if not token:
        return ""
    f = _get_fernet()
    return f.encrypt(token.encode()).decode()


def decrypt_token(token_enc: str) -> str:
    """Decrypt an encrypted GitHub access token."""
    if not token_enc:
        return ""
    f = _get_fernet()
    try:
        return f.decrypt(token_enc.encode()).decode()
    except InvalidToken:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt GitHub token: encryption key mismatch or corrupted token",
        )


# --- JWT Handling ---
def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT session token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT access token."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# --- FastAPI Dependencies ---
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency to extract and verify the logged-in User."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    user_id_raw = payload.get("sub")
    if not user_id_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id_raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def require_member(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    """
    Enforce that the authenticated user is a member of the project identified
    by 'id' or 'project_id' in the route path.
    """
    raw_id = request.path_params.get("id") or request.path_params.get("project_id")
    if not raw_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project ID missing from path parameters",
        )

    try:
        project_id = int(raw_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    # Fetch project
    stmt = select(Project).where(Project.id == project_id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Check membership: either member record exists or user is the project owner
    member_stmt = select(Member).where(
        Member.project_id == project_id,
        Member.user_id == current_user.id,
    )
    member_result = await db.execute(member_stmt)
    member = member_result.scalar_one_or_none()

    if not member and project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You are not a member of this project",
        )

    return project


# --- GitHub OAuth Endpoints ---
@auth_router.get("/github/login")
async def github_login():
    """Redirect user to GitHub OAuth authorize screen."""
    github_auth_url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&redirect_uri={settings.GITHUB_REDIRECT_URI}"
        "&scope=read:user%20public_repo"
    )
    return RedirectResponse(url=github_auth_url)


@auth_router.get("/github/callback", response_model=TokenResponse)
async def github_callback(
    code: str,
    db: AsyncSession = Depends(get_db),
):
    """Exchange GitHub OAuth code for access token, upsert user, and return JWT."""
    token_url = "https://github.com/login/oauth/access_token"
    token_payload = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "client_secret": settings.GITHUB_CLIENT_SECRET,
        "code": code,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
    }

    async with httpx.AsyncClient() as client:
        # 1. Exchange code for GitHub token
        token_res = await client.post(
            token_url,
            json=token_payload,
            headers={"Accept": "application/json"},
        )
        if token_res.status_code != status.HTTP_200_OK:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to retrieve token from GitHub",
            )

        token_data = token_res.json()
        gh_access_token = token_data.get("access_token")
        if not gh_access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"GitHub OAuth error: {token_data.get('error_description', 'No access token')}",
            )

        # 2. Fetch user profile
        user_res = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {gh_access_token}",
                "User-Agent": "AI-Project-Coordinator",
            },
        )
        if user_res.status_code != status.HTTP_200_OK:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to fetch user profile from GitHub",
            )

        profile = user_res.json()
        gh_id = profile["id"]
        username = profile.get("login") or f"user_{gh_id}"
        avatar_url = profile.get("avatar_url")

    # 3. Upsert user in database
    encrypted_token = encrypt_token(gh_access_token)
    stmt = select(User).where(User.github_id == gh_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        user.username = username
        user.avatar_url = avatar_url
        user.gh_token_enc = encrypted_token
    else:
        user = User(
            github_id=gh_id,
            username=username,
            avatar_url=avatar_url,
            gh_token_enc=encrypted_token,
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)

    # 4. Issue JWT session token
    jwt_token = create_access_token(user.id)
    return TokenResponse(
        access_token=jwt_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )
