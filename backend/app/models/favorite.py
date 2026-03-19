from sqlalchemy import Column, DateTime, ForeignKey, PrimaryKeyConstraint, String, func
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.types import UUID_SQL


class UserFavorite(Base):
    __tablename__ = "user_favorites"

    user_id = Column(
        UUID_SQL, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False
    )
    lot_id = Column(String, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("Profile", backref="favorites")

    __table_args__ = (PrimaryKeyConstraint("user_id", "lot_id"),)
