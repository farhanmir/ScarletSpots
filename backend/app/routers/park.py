import json
from contextlib import asynccontextmanager
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import case, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.security import get_current_user
from app.core.websocket import manager as ws_manager
from app.models.friendship import Friendship
from app.models.parking import IdempotencyRecord, LotOccupancy, ParkingSession
from app.models.parking import SessionFeedback as SessionFeedbackModel
from app.models.user import Profile
from app.services.push_notifications import send_push_to_users, send_silent_push_to_all

log = get_logger(__name__)

router = APIRouter(prefix="/park/session", tags=["parking_session"])


def _load_lot_display_name_map() -> dict[str, str]:
    data_file = Path(__file__).resolve().parent.parent / "services" / "rutgers_parking_data.json"
    try:
        with data_file.open("r", encoding="utf-8") as fh:
            lots = json.load(fh)
    except Exception:
        return {}

    mapping: dict[str, str] = {}
    for lot in lots if isinstance(lots, list) else []:
        if not isinstance(lot, dict):
            continue
        lot_id = str(lot.get("mapId") or "").strip()
        if not lot_id:
            continue
        display_name = (
            str(lot.get("shortName") or "").strip()
            or str(lot.get("propertyName") or "").strip()
            or f"Lot {lot_id}"
        )
        mapping[lot_id] = display_name
    return mapping


LOT_DISPLAY_NAME_BY_ID = _load_lot_display_name_map()


class ParkSessionCreate(BaseModel):
    lotId: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    confirmed: bool = True
    autoStarted: bool = False
    source: Optional[str] = None
    circling_started_at: Optional[datetime] = None
    circling_duration_seconds: Optional[int] = None


class ParkSessionEndRequest(BaseModel):
    source: Optional[str] = None


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
        raise HTTPException(status_code=401, detail="Invalid authenticated user id") from exc


def _session_response(session: ParkingSession) -> dict:
    return {
        "id": str(session.id),
        "lotId": str(session.lot_id),
        "latitude": session.latitude,
        "longitude": session.longitude,
        "startTime": session.start_time or session.created_at,
        "active": bool(session.active),
        "autoStarted": bool(session.auto_started),
        "startSource": session.start_source,
        "endSource": session.end_source,
        "circlingStartedAt": session.circling_started_at,
        "circlingDurationSeconds": session.circling_duration_seconds,
    }


@asynccontextmanager
async def _transaction_scope(db: AsyncSession):
    """Run writes inside a fresh transaction boundary."""
    if db.in_transaction():
        await db.rollback()
    async with db.begin():
        yield


async def _load_idempotent_response(
    db: AsyncSession,
    user_id: UUID,
    endpoint: str,
    idempotency_key: Optional[str],
) -> Optional[dict]:
    if not idempotency_key:
        return None
    stmt = select(IdempotencyRecord).where(
        IdempotencyRecord.user_id == user_id,
        IdempotencyRecord.endpoint == endpoint,
        IdempotencyRecord.idempotency_key == idempotency_key,
    )
    existing = (await db.execute(stmt)).scalars().first()
    if not existing:
        return None
    try:
        return json.loads(existing.response_body)
    except Exception:
        return None


async def _save_idempotent_response(
    db: AsyncSession,
    user_id: UUID,
    endpoint: str,
    idempotency_key: Optional[str],
    payload: dict,
) -> None:
    if not idempotency_key:
        return
    existing = await db.execute(
        select(IdempotencyRecord).where(
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.endpoint == endpoint,
            IdempotencyRecord.idempotency_key == idempotency_key,
        )
    )
    if existing.scalars().first() is not None:
        return
    db.add(
        IdempotencyRecord(
            user_id=user_id,
            endpoint=endpoint,
            idempotency_key=idempotency_key,
            response_body=json.dumps(payload, default=str),
            status_code=200,
        )
    )


async def _get_active_sessions(db: AsyncSession, user_id: str) -> list[ParkingSession]:
    stmt = select(ParkingSession).where(
        ParkingSession.user_id == user_id,
        ParkingSession.active.is_(True),
    ).limit(1)
    return list((await db.execute(stmt)).scalars().all())


async def _decrement_lot_occupancy_atomic(db: AsyncSession, lot_id: str) -> int:
    await db.execute(
        update(LotOccupancy)
        .where(LotOccupancy.lot_id == lot_id)
        .values(
            count=case(
                (LotOccupancy.count > 0, LotOccupancy.count - 1),
                else_=0,
            )
        )
    )
    row = await db.get(LotOccupancy, lot_id)
    return int(row.count or 0) if row is not None else 0


async def _increment_lot_occupancy_atomic(db: AsyncSession, lot_id: str) -> int:
    updated = await db.execute(
        update(LotOccupancy)
        .where(LotOccupancy.lot_id == lot_id)
        .values(count=LotOccupancy.count + 1)
    )
    if getattr(updated, "rowcount", 0) == 0:
        try:
            db.add(LotOccupancy(lot_id=lot_id, count=1))
            await db.flush()
        except IntegrityError:
            await db.execute(
                update(LotOccupancy)
                .where(LotOccupancy.lot_id == lot_id)
                .values(count=LotOccupancy.count + 1)
            )

    row = await db.get(LotOccupancy, lot_id)
    return int(row.count or 0) if row is not None else 0


async def _get_friend_user_ids(db: AsyncSession, user_id: str) -> list[str]:
    stmt = select(Friendship).where(
        Friendship.status == "accepted",
        or_(Friendship.user_id == user_id, Friendship.friend_id == user_id),
    )
    rows = (await db.execute(stmt)).scalars().all()
    friend_ids: list[str] = []
    user_id_str = str(user_id)
    for friendship in rows:
        if str(friendship.user_id) == user_id_str:
            if friendship.initiator_sharing_enabled:
                friend_ids.append(str(friendship.friend_id))
        elif friendship.recipient_sharing_enabled:
            friend_ids.append(str(friendship.user_id))
    return friend_ids


@router.get("/active")
async def get_active_session(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the active parking session for the current user."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        sessions = await _get_active_sessions(db, str(user_id))
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
    """Start a new parking session and mutate occupancy with atomic SQL updates."""
    user_id = _to_uuid_or_401(current_user.id)
    idempotency_key = request.headers.get("Idempotency-Key")
    endpoint_key = "/park/session"

    replay = await _load_idempotent_response(
        db,
        user_id,
        endpoint_key,
        idempotency_key,
    )
    if replay is not None:
        replay["_idempotentReplay"] = True
        return replay

    if not body.lotId or not body.lotId.strip():
        raise HTTPException(status_code=400, detail="lotId is required")

    lot_id = body.lotId.strip()
    changed_lot_counts: dict[str, int] = {}
    friend_targets: list[str] = []
    display_name: str | None = None

    try:
        async with _transaction_scope(db):
            ended_sessions = await db.execute(
                update(ParkingSession)
                .where(
                    ParkingSession.user_id == user_id,
                    ParkingSession.active.is_(True),
                )
                .values(active=False, end_time=text("CURRENT_TIMESTAMP"))
                .returning(ParkingSession.lot_id)
            )
            ended_lot_ids = [row[0] for row in ended_sessions.fetchall() if row[0]]
            for ended_lot_id in ended_lot_ids:
                changed_lot_counts[ended_lot_id] = await _decrement_lot_occupancy_atomic(
                    db, ended_lot_id
                )

            new_session = ParkingSession(
                user_id=user_id,
                lot_id=lot_id,
                latitude=body.latitude,
                longitude=body.longitude,
                active=True,
                auto_started=body.autoStarted,
                start_source=(body.source or "").strip() or None,
                circling_started_at=body.circling_started_at,
                circling_duration_seconds=(
                    max(0, min(14400, int(body.circling_duration_seconds)))
                    if body.circling_duration_seconds is not None
                    else None
                ),
            )
            db.add(new_session)
            await db.flush()

            changed_lot_counts[lot_id] = await _increment_lot_occupancy_atomic(db, lot_id)
            response_payload = {
                "success": True,
                "session": _session_response(new_session),
                "confirmedOccupancy": changed_lot_counts.get(lot_id),
            }
            await _save_idempotent_response(
                db,
                user_id,
                endpoint_key,
                idempotency_key,
                response_payload,
            )

        profile = await db.get(Profile, user_id)
        if profile is not None:
            display_name = profile.full_name or profile.first_name or profile.email
        friend_targets = list(dict.fromkeys(await _get_friend_user_ids(db, str(user_id))))

        for changed_lot_id, changed_count in changed_lot_counts.items():
            await ws_manager.publish_occupancy_update(changed_lot_id, changed_count)

        if changed_lot_counts:
            await send_silent_push_to_all(
                db,
                data={
                    "type": "lot_occupancy_update",
                    "updates": [{"lotId": lid, "count": cnt} for lid, cnt in changed_lot_counts.items()],
                },
            )

        if friend_targets:
            actor = display_name or "Your friend"
            lot_display = LOT_DISPLAY_NAME_BY_ID.get(lot_id, f"Lot {lot_id}")
            await send_push_to_users(
                db,
                [UUID(tid) for tid in friend_targets],
                title="ScarletSpots",
                body=f"{actor} parked at {lot_display}.",
                data={
                    "type": "session_started",
                    "lotId": lot_id,
                    "autoStarted": bool(body.autoStarted),
                },
            )

        if body.autoStarted:
            lot_display = LOT_DISPLAY_NAME_BY_ID.get(lot_id, f"Lot {lot_id}")
            await send_push_to_users(
                db,
                [user_id],
                title="ScarletSpots",
                body=f"We auto-started your parking at {lot_display}.",
                data={
                    "type": "auto_started",
                    "lotId": lot_id,
                },
            )
        return response_payload
    except IntegrityError as exc:
        log.warning(
            "Active-session uniqueness conflict for user %s lot %s: %s",
            user_id,
            lot_id,
            exc,
        )
        raise HTTPException(
            status_code=409,
            detail="An active parking session already exists for this user",
        ) from exc
    except HTTPException:
        raise
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
    request: Request,
    body: Optional[ParkSessionEndRequest] = None,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """End active parking sessions and decrement occupancy with atomic SQL updates."""
    user_id = _to_uuid_or_401(current_user.id)
    idempotency_key = request.headers.get("Idempotency-Key")
    endpoint_key = "/park/session/end"
    replay = await _load_idempotent_response(
        db,
        user_id,
        endpoint_key,
        idempotency_key,
    )
    if replay is not None:
        replay["_idempotentReplay"] = True
        return replay
    changed_lot_counts: dict[str, int] = {}

    try:
        async with _transaction_scope(db):
            ended_sessions = await db.execute(
                update(ParkingSession)
                .where(
                    ParkingSession.user_id == user_id,
                    ParkingSession.active.is_(True),
                )
                .values(
                    active=False,
                    end_time=text("CURRENT_TIMESTAMP"),
                    end_source=((body.source or "").strip() if body else None) or None,
                )
                .returning(ParkingSession.lot_id)
            )
            ended_lot_ids = [row[0] for row in ended_sessions.fetchall() if row[0]]
            for ended_lot_id in ended_lot_ids:
                changed_lot_counts[ended_lot_id] = await _decrement_lot_occupancy_atomic(
                    db, ended_lot_id
                )
            response_payload = {"success": True}
            await _save_idempotent_response(
                db,
                user_id,
                endpoint_key,
                idempotency_key,
                response_payload,
            )

        for changed_lot_id, changed_count in changed_lot_counts.items():
            await ws_manager.publish_occupancy_update(changed_lot_id, changed_count)

        log.info("Ended %d active session(s) for user %s", len(ended_lot_ids), user_id)
        return response_payload
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
