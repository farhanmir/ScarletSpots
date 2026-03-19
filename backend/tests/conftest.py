import uuid
from collections.abc import AsyncIterator, Generator
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.parking import ParkingSession

TEST_DATABASE_URL = "sqlite+aiosqlite://"

engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@event.listens_for(engine.sync_engine, "connect")
def _sqlite_register_gen_random_uuid(dbapi_connection, _connection_record) -> None:
    dbapi_connection.create_function("gen_random_uuid", 0, lambda: str(uuid.uuid4()))


@event.listens_for(ParkingSession, "before_insert")
def _ensure_parking_session_uuid(_mapper, _connection, target: ParkingSession) -> None:
    if getattr(target, "id", None) is None:
        target.id = str(uuid.uuid4())


@pytest.fixture(autouse=True, scope="session")
def mock_app_state():
    """Populate app.state for tests that import app without running lifespan."""
    app.state.supabase = MagicMock()
    app.state.admin_supabase = MagicMock()
    yield


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database() -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())

    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture(autouse=True)
def override_get_db_dependency() -> Generator[None, None, None]:
    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with TestingSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    _ = db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def auth_user() -> SimpleNamespace:
    return SimpleNamespace(
        id="00000000-0000-0000-0000-000000000123",
        email="test@rutgers.edu",
        user_metadata={"name": "Test User"},
    )


@pytest.fixture
def noop_ws_publish(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.core.websocket.manager.publish_occupancy_update",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.core.websocket.manager.publish_notification",
        AsyncMock(return_value=None),
    )


@pytest.fixture
def override_current_user(auth_user: SimpleNamespace) -> Generator[None, None, None]:
    app.dependency_overrides[get_current_user] = lambda: auth_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def init_cache_for_tests():
    """Ensure FastAPICache is initialized for routes using caching in tests."""
    from app.core.cache import close_cache, init_cache

    await init_cache()
    yield
    await close_cache()
