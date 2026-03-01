"""
Parking session router.

Manages the lifecycle of a user's parking session:
  POST /park/session         — start session (increments lot_occupancy)
  POST /park/session/end     — end session   (decrements lot_occupancy)
  GET  /park/session/active  — get current active session
  POST /park/session/feedback — report detection quality (feeds forecast model)

Lot IDs are the mapId strings from the bundled rutgers_parking_data.json
(e.g. "10001"), not UUIDs. The lot_occupancy table keyed on lot_id TEXT.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.security import get_admin_supabase, get_auth_db, get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

log = get_logger(__name__)

router = APIRouter(prefix="/park/session", tags=["parking_session"])


class ParkSessionCreate(BaseModel):
    lotId: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    confirmed: bool = True


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


@router.get("/active")
def get_active_session(current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Get the active parking session for the current user."""
    try:
        res = (
            db.table("parking_sessions")
            .select("*")
            .eq("user_id", current_user.id)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if res.data:
            s = res.data[0]
            return {
                "session": {
                    "id": str(s["id"]),
                    "lotId": str(s["lot_id"]),
                    "latitude": s.get("latitude"),
                    "longitude": s.get("longitude"),
                    "startTime": s.get("start_time") or s.get("created_at"),
                    "active": True,
                }
            }
        return {"session": None}
    except Exception as exc:
        log.error("Failed to get active session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve active session")


@router.post("")
@limiter.limit("30/hour")
def start_parking_session(
    request: Request,
    body: ParkSessionCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_auth_db),
):
    """Start a new parking session and atomically increment lot occupancy.

    Uses start_parking_session_atomic RPC so the session INSERT and the
    lot_occupancy upsert live in a single database transaction — partial
    failures cannot leave counts inconsistent.
    """
    user_id = current_user.id

    if not body.lotId or not body.lotId.strip():
        raise HTTPException(status_code=400, detail="lotId is required")

    lot_id = body.lotId.strip()

    # If user already has an active session, end it first (DB unique index is
    # the hard safety net; this makes the UX seamless).
    existing = get_active_session(current_user=current_user, db=db)
    if existing.get("session"):
        end_parking_session(current_user=current_user)

    try:
        admin_db = get_admin_supabase()
        rpc_res = admin_db.rpc(
            "start_parking_session_atomic",
            {
                "p_user_id": str(user_id),
                "p_lot_id": lot_id,
                "p_latitude": body.latitude,
                "p_longitude": body.longitude,
            },
        ).execute()
    except Exception as exc:
        log.error(
            "Atomic start session RPC failed for user %s lot %s: %s",
            user_id,
            lot_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="Failed to start parking session")

    if not rpc_res.data:
        log.error(
            "start_parking_session_atomic returned no data for user %s lot %s",
            user_id,
            lot_id,
        )
        raise HTTPException(status_code=500, detail="Failed to start parking session")

    new_session = rpc_res.data[0]

    # Fetch the confirmed occupancy count so the mobile client can render
    # the exact value without waiting for a realtime event.
    confirmed_occupancy: Optional[int] = None
    try:
        occ_res = (
            admin_db.table("lot_occupancy")
            .select("count")
            .eq("lot_id", lot_id)
            .single()
            .execute()
        )
        if occ_res.data:
            confirmed_occupancy = occ_res.data.get("count")
    except Exception as exc:
        log.warning("Could not fetch confirmed occupancy for lot %s: %s", lot_id, exc)

    return {
        "success": True,
        "session": {
            "id": str(new_session["id"]),
            "lotId": str(new_session["lot_id"]),
            "startTime": new_session.get("start_time") or new_session.get("created_at"),
            "active": True,
        },
        "confirmedOccupancy": confirmed_occupancy,
    }


@router.post("/end")
def end_parking_session(current_user=Depends(get_current_user)):
    """End the active parking session and atomically decrement lot occupancy.

    Uses end_parking_session_atomic RPC so the session UPDATE and the
    lot_occupancy decrement live in a single transaction.  If the user
    somehow ended up with multiple active sessions (data inconsistency
    predating the unique index), all are closed and their lots decremented.
    Errors in the occupancy step are no longer swallowed — the whole call
    fails so the client knows to retry.
    """
    user_id = current_user.id

    try:
        admin_db = get_admin_supabase()
        rpc_res = admin_db.rpc(
            "end_parking_session_atomic",
            {"p_user_id": str(user_id)},
        ).execute()
    except Exception as exc:
        log.error("Atomic end session RPC failed for user %s: %s", user_id, exc)
        raise HTTPException(status_code=500, detail="Failed to end parking session")

    ended_count = rpc_res.data if isinstance(rpc_res.data, int) else 0
    log.info("Ended %d active session(s) for user %s", ended_count, user_id)
    return {"success": True}


@router.post("/feedback")
@limiter.limit("20/hour")
def submit_session_feedback(
    request: Request,
    body: SessionFeedback,
    current_user=Depends(get_current_user),
    db=Depends(get_auth_db),
):
    """
    Submit detection quality feedback for a parking session.

    Used to improve the auto-detection pipeline and the ML forecast model.
    Stored in session_feedback table for periodic model retraining.
    """
    try:
        feedback_data = {
            "user_id": current_user.id,
            "session_id": body.session_id,
            "lot_id": body.lot_id,
            "quality": body.quality.value,
            "correct_lot_id": body.correct_lot_id,
            "notes": body.notes,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        db.table("session_feedback").insert(feedback_data).execute()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to store session feedback: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to store feedback")
