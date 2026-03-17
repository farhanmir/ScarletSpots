from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.security import get_current_user
from app.core.websocket import manager as ws_manager
from app.models.parking import LotOccupancy, ParkingSession
from app.models.parking import SessionFeedback as SessionFeedbackModel
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)

router = APIRouter(prefix="/park/session", tags=["parking_session"])


class ParkSessionCreate(BaseModel):
    lotId: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    confirmed: bool = True
    autoStarted: bool = False


class DetectionQuality(str, Enum):
    correct = "correct"
    wrong_lot = "wrong_lot"
    false_positive = "false_positive"
    missed = "missed"


class SessionFeedback(BaseModel):
    session_id: Optional[str] = None
    lot_id: str
    quality: DetectionQuality
    correct_lot_id: Optional[str] = None
    notes: Optional[str] = None


def _to_uuid_or_401(value: str) -> UUID:
    try:
        return UUID(str(value))
    except Exception as exc:
        raise HTTPException(
            status_code=401, detail="Invalid authenticated user id"
        ) from exc


def _session_response(session: ParkingSession) -> dict:
    return {
        "id": str(session.id),
        "lotId": str(session.lot_id),
        "latitude": session.latitude,
        "longitude": session.longitude,
        "startTime": session.start_time or session.created_at,
        "active": bool(session.active),
        "autoStarted": bool(session.auto_started),
    }


async def _get_active_sessions(db: AsyncSession, user_id: UUID) -> list[ParkingSession]:
    stmt = select(ParkingSession).where(
        ParkingSession.user_id == user_id,
        ParkingSession.active.is_(True),
    )
    return (await db.execute(stmt)).scalars().all()


@router.get("/active")
async def get_active_session(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the active parking session for the current user."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        sessions = await _get_active_sessions(db, user_id)
        if sessions:
            return {"session": _session_response(sessions[0])}
        return {"session": None}
    except Exception as exc:
        log.error("Failed to get active session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve active session")


@router.post("")
@limiter.limit("30/hour")
async def start_parking_session(
    request: Request,
    body: ParkSessionCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new parking session and increment local lot occupancy in one transaction."""
    user_id = _to_uuid_or_401(current_user.id)

    if not body.lotId or not body.lotId.strip():
        raise HTTPException(status_code=400, detail="lotId is required")

    lot_id = body.lotId.strip()
    changed_lot_counts: dict[str, int] = {}

    try:
        async with db.begin():
            existing_sessions = await _get_active_sessions(db, user_id)
            for existing in existing_sessions:
                existing.active = False
                existing.end_time = datetime.now(timezone.utc)

                old_occ = await db.get(LotOccupancy, existing.lot_id)
                if old_occ is not None:
                    old_occ.count = max(0, (old_occ.count or 0) - 1)
                    changed_lot_counts[existing.lot_id] = old_occ.count

            new_session = ParkingSession(
                user_id=user_id,
                lot_id=lot_id,
                latitude=body.latitude,
                longitude=body.longitude,
                active=True,
                auto_started=body.autoStarted,
            )
            db.add(new_session)

            occupancy = await db.get(LotOccupancy, lot_id)
            if occupancy is None:
                occupancy = LotOccupancy(lot_id=lot_id, count=1)
                db.add(occupancy)
            else:
                occupancy.count = (occupancy.count or 0) + 1
            changed_lot_counts[lot_id] = occupancy.count or 0

        await db.refresh(new_session)
        confirmed_occupancy = occupancy.count if occupancy else None

        for changed_lot_id, changed_count in changed_lot_counts.items():
            await ws_manager.publish_occupancy_update(changed_lot_id, changed_count)

        return {
            "success": True,
            "session": _session_response(new_session),
            "confirmedOccupancy": confirmed_occupancy,
        }
    except Exception as exc:
        log.error(
            "Failed to start parking session for user %s lot %s: %s",
            user_id,
            lot_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="Failed to start parking session")


@router.post("/end")
async def end_parking_session(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """End active parking session(s) and decrement occupancy atomically."""
    user_id = _to_uuid_or_401(current_user.id)
    changed_lot_counts: dict[str, int] = {}

    try:
        async with db.begin():
            active_sessions = await _get_active_sessions(db, user_id)
            for session in active_sessions:
                session.active = False
                session.end_time = datetime.now(timezone.utc)

                occupancy = await db.get(LotOccupancy, session.lot_id)
                if occupancy is not None:
                    occupancy.count = max(0, (occupancy.count or 0) - 1)
                    changed_lot_counts[session.lot_id] = occupancy.count

        for changed_lot_id, changed_count in changed_lot_counts.items():
            await ws_manager.publish_occupancy_update(changed_lot_id, changed_count)

        log.info(
            "Ended %d active session(s) for user %s", len(active_sessions), user_id
        )
        return {"success": True}
    except Exception as exc:
        log.error("Failed to end parking session for user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to end parking session")


@router.post("/feedback")
@limiter.limit("20/hour")
async def submit_session_feedback(
    request: Request,
    body: SessionFeedback,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit detection quality feedback for a parking session."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        session_id = UUID(body.session_id) if body.session_id else None

        feedback = SessionFeedbackModel(
            user_id=user_id,
            session_id=session_id,
            lot_id=body.lot_id,
            quality=body.quality.value,
            correct_lot_id=body.correct_lot_id,
            notes=body.notes,
        )
        db.add(feedback)
        await db.commit()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to store session feedback: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to store feedback")
