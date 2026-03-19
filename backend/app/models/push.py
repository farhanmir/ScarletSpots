from app.core.database import Base
from app.models.types import UUID_SQL
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, func


class DevicePushToken(Base):
    __tablename__ = "device_push_tokens"

    id = Column(UUID_SQL, primary_key=True, server_default=func.gen_random_uuid())
    user_id = Column(
        UUID_SQL,
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token = Column(String, nullable=False, unique=True)
    platform = Column(String, nullable=True)
    active = Column(Boolean, nullable=False, default=True, server_default="true")
    last_seen_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
