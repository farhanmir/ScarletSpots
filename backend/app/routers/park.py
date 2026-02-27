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
    spotNumber: str
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
                    "spotNumber": s.get("spot_number", ""),
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
    """Start a new parking session and atomically increment lot occupancy."""
    user_id = current_user.id

    if not body.lotId or not body.lotId.strip():
        raise HTTPException(status_code=400, detail="lotId is required")

    lot_id = body.lotId.strip()

    # If user already has an active session, end it first
    existing = get_active_session(current_user=current_user, db=db)
    if existing.get("session"):
        end_parking_session(current_user=current_user, db=db)

    new_count: Optional[int] = None
    try:
        admin_db = get_admin_supabase()
        rpc_res = admin_db.rpc(
            "increment_lot_occupancy", {"p_lot_id": lot_id}
        ).execute()
        if rpc_res.data:
            new_count = rpc_res.data if isinstance(rpc_res.data, int) else None
    except Exception as e:
        log.warning("Failed to increment lot occupancy for %s: %s", lot_id, e)

    try:
        session_data = {
            "user_id": user_id,
            "lot_id": lot_id,
            "spot_number": body.spotNumber,
            "latitude": body.latitude,
            "longitude": body.longitude,
            "active": True,
            "start_time": datetime.now(timezone.utc).isoformat(),
        }
        res = db.table("parking_sessions").insert(session_data).execute()
        new_session = res.data[0]

        return {
            "success": True,
            "confirmedOccupancy": new_count,
            "session": {
                "id": str(new_session["id"]),
                "lotId": str(new_session["lot_id"]),
                "spotNumber": new_session.get("spot_number", ""),
                "startTime": new_session.get("start_time") or new_session.get("created_at"),
                "active": True,
            },
        }
    except Exception as exc:
        log.error("Failed to start parking session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to start parking session")


@router.post("/end")
def end_parking_session(current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """End the active parking session and atomically decrement lot occupancy."""
    user_id = current_user.id

    try:
        active_res = (
            db.table("parking_sessions")
            .select("id, lot_id")
            .eq("user_id", user_id)
            .eq("active", True)
            .execute()
        )

        db.table("parking_sessions").update(
            {"active": False, "end_time": datetime.now(timezone.utc).isoformat()}
        ).eq("user_id", user_id).eq("active", True).execute()

        if active_res.data:
            lot_id = active_res.data[0]["lot_id"]
            try:
                admin_db = get_admin_supabase()
                admin_db.rpc("decrement_lot_occupancy", {"p_lot_id": lot_id}).execute()
            except Exception as e:
                log.warning("Failed to decrement lot occupancy for %s: %s", lot_id, e)

        return {"success": True}
    except Exception as exc:
        log.error("Failed to end parking session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to end parking session")


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
