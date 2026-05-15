import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.types import UUID_SQL


class ParkingSession(Base):
    __tablename__ = "parking_sessions"

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
    lot_id = Column(String, nullable=False)  # MapId string from rutgers_parking_data.json
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    deck_level_label = Column(String, nullable=True)
    deck_level_key = Column(String, nullable=True)
    altitude_meters = Column(Float, nullable=True)
    altitude_accuracy_meters = Column(Float, nullable=True)
    start_time = Column(DateTime(timezone=True), server_default=func.now())
    end_time = Column(DateTime(timezone=True), nullable=True)
    active = Column(Boolean, default=True, server_default=text("true"), nullable=False)
    auto_started = Column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )
    start_source = Column(String, nullable=True)
    end_source = Column(String, nullable=True)
    circling_started_at = Column(DateTime(timezone=True), nullable=True)
    circling_duration_seconds = Column(Integer, nullable=True)
    last_restriction_notification_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("Profile", backref="parking_sessions")


class LotOccupancy(Base):
    __tablename__ = "lot_occupancy"

    lot_id = Column(String, primary_key=True)  # MapId string
    count = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SessionFeedback(Base):
    __tablename__ = "session_feedback"

    id = Column(
        UUID_SQL,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        server_default=func.gen_random_uuid(),
    )
    user_id = Column(
        UUID_SQL,
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    session_id = Column(
        UUID_SQL,
        ForeignKey("parking_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    lot_id = Column(String, nullable=False)
    quality = Column(String, nullable=False)  # correct, wrong_lot, false_positive, missed
    correct_lot_id = Column(String, nullable=True)
    notes = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

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
    endpoint = Column(String, nullable=False)
    idempotency_key = Column(String, nullable=False)
    response_body = Column(String, nullable=False)
    status_code = Column(Integer, nullable=False, server_default=text("200"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SOCSnapshot(Base):
    __tablename__ = "soc_snapshots"

    id = Column(
        UUID_SQL,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        server_default=func.gen_random_uuid(),
    )
    term_code = Column(String, nullable=True)
    source_hash = Column(String, nullable=True)
    captured_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class SOCLotPressure(Base):
    __tablename__ = "soc_lot_pressure"

    id = Column(
        UUID_SQL,
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
        server_default=func.gen_random_uuid(),
    )
    snapshot_id = Column(
        UUID_SQL,
        ForeignKey("soc_snapshots.id", ondelete="CASCADE"),
        nullable=False,
    )
    lot_id = Column(String, nullable=False)
    start_minute_of_week = Column(Integer, nullable=False)
    end_minute_of_week = Column(Integer, nullable=False)
    pressure_index = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
