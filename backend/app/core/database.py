import logging

from sqlalchemy import text

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

# We use an async engine because FastAPI is async.
engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)

if settings.DEBUG:
    logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)

AsyncSessionLocal = sessionmaker(
    bind=engine,  # type: ignore[call-overload]
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def ensure_idempotency_table() -> None:
    """
    Create idempotency_records if migrations have not been applied yet.

    This keeps request handling from failing hard in partially migrated
    environments while still allowing Alembic to own the canonical schema.
    """
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS idempotency_records (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                    endpoint VARCHAR NOT NULL,
                    idempotency_key VARCHAR NOT NULL,
                    response_body VARCHAR NOT NULL,
                    status_code INTEGER NOT NULL DEFAULT 200,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_records_user_endpoint_key
                ON idempotency_records (user_id, endpoint, idempotency_key)
                """
            )
        )
