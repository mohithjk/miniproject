import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth import create_access_token, encrypt_token
from app.db import Base, get_db
from app.main import app
from app.models import User

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def test_db(monkeypatch):
    """Create a fresh in-memory database for each test function."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Patch background task session factory to use the test database
    monkeypatch.setattr("app.routers.webhooks.AsyncSessionLocal", session_factory)

    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(test_db: AsyncSession):
    """Async HTTP test client with overridden database dependency."""
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def create_user(test_db: AsyncSession):
    """Factory fixture to create test users in the test database."""
    async def _create(
        github_id: int = 12345,
        username: str = "testdev",
        gh_token: str = "gho_test_token_secret_123",
    ) -> tuple[User, str, dict[str, str]]:
        user = User(
            github_id=github_id,
            username=username,
            avatar_url=f"https://github.com/{username}.png",
            gh_token_enc=encrypt_token(gh_token) if gh_token else None,
        )
        test_db.add(user)
        await test_db.commit()
        await test_db.refresh(user)

        token = create_access_token(user.id)
        headers = {"Authorization": f"Bearer {token}"}
        return user, token, headers

    return _create
