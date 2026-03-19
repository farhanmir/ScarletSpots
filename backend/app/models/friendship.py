import uuid

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, func
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.types import UUID_SQL


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(
        UUID_SQL,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        server_default=func.gen_random_uuid(),
    )
    user_id = Column(
        UUID_SQL,
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    friend_id = Column(
        UUID_SQL,
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    status = Column(String, default="pending")  # pending, accepted, blocked
    sharing_enabled = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    initiator = relationship(
        "Profile", foreign_keys=[user_id], backref="initiated_friendships"
    )
    friend = relationship(
        "Profile", foreign_keys=[friend_id], backref="received_friendships"
    )
