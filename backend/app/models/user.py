from sqlalchemy import Boolean, Column, DateTime, Float, String, func

from app.core.database import Base
from app.models.types import UUID_SQL


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID_SQL, primary_key=True)
    email = Column(String, unique=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    full_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    permit_type = Column(String, nullable=True)
    secondary_permit_type = Column(String, nullable=True)
    role = Column(String, default="user")
    notify_parking_restrictions = Column(Boolean, nullable=False, default=True, server_default="true")
    notify_friend_same_lot = Column(Boolean, nullable=False, default=False, server_default="false")
    notify_auto_park_started = Column(Boolean, nullable=False, default=True, server_default="true")
    notify_auto_park_ended = Column(Boolean, nullable=False, default=True, server_default="true")

    # Location tracking (added in recent migration)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
