import logging

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
