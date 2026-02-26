from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone
from app.core.security import get_current_user, get_supabase, get_auth_db
from app.core.limiter import limiter
from app.core.logger import get_logger

log = get_logger(__name__)


def _validate_uuid(value: str, field_name: str = "lotId") -> str:
    """Validate that a string is a valid UUID and return it. Raises HTTPException if not."""
    try:
        UUID(value)
        return value
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=400,
            detail=f"'{field_name}' must be a valid UUID, got: {value}"
        )

router = APIRouter(prefix="/park/session", tags=["parking_session"])

class ParkSessionCreate(BaseModel):
    lotId: str
    spotNumber: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    confirmed: bool = True

@router.get("/active")
def get_active_session(current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Get the active parking session for the current user."""
    try:
        res = db.table("parking_sessions").select("*").eq("user_id", current_user.id).eq("active", True).execute()
        if res.data:
            session = res.data[0]
            return {
                "session": {
                    "id": str(session["id"]),
                    "lotId": str(session["lot_id"]),
                    "spotNumber": session.get("spot_number", ""),
                    "latitude": session.get("latitude"),
                    "longitude": session.get("longitude"),
                    "startTime": session.get("start_time", session.get("created_at")),
                    "active": True
                }
            }
        return {"session": None}
    except Exception as exc:
        log.error("Failed to get active session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve active session")

@router.post("")
@limiter.limit("30/hour")
def start_parking_session(request: Request, body: ParkSessionCreate, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Start a new parking session."""
    user_id = current_user.id
    
    # Validate lotId is a proper UUID before hitting the database
    _validate_uuid(body.lotId, "lotId")
    
    # Check if already active
    active = get_active_session(current_user=current_user, db=db)
    if active.get("session"):
        # End existing session first
        end_parking_session(current_user=current_user, db=db)

    try:
        # Compute occupancy level from lot data
        occupancy_level = 0
        try:
            lot_db = get_supabase()
            lot_res = lot_db.table("parking_lots").select("capacity, current_occupancy").eq("id", body.lotId).single().execute()
            if lot_res.data:
                capacity = lot_res.data.get("capacity", 0) or 0
                current = lot_res.data.get("current_occupancy", 0) or 0
                if capacity > 0:
                    occupancy_level = min(100, int((current + 1) / capacity * 100))
        except Exception as e:
            log.warning("Could not fetch lot data for occupancy: %s", e)

        # Insert into parking_sessions (authoritative)
        session_data = {
            "user_id": user_id,
            "lot_id": body.lotId,
            "spot_number": body.spotNumber,
            "latitude": body.latitude,
            "longitude": body.longitude,
            "active": True,
            "start_time": datetime.now(timezone.utc).isoformat()
        }
        res = db.table("parking_sessions").insert(session_data).execute()
        new_session = res.data[0]
        
        # Also log to occupancy_logs (side-effect for reporting)
        try:
            db.table("occupancy_logs").insert({
                "lot_id": body.lotId,
                "reporter_id": user_id,
                "status": "open",
                "occupancy_level": occupancy_level
            }).execute()
        except Exception as e:
            log.warning("Failed to write occupancy log on park start: %s", e)

        return {
            "success": True, 
            "session": {
                "id": str(new_session["id"]),
                "lotId": str(new_session["lot_id"]),
                "spotNumber": new_session.get("spot_number", ""),
                "startTime": new_session.get("start_time", new_session.get("created_at")),
                "active": True
            }
        }
    except Exception as exc:
        log.error("Failed to start parking session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to start parking session")

@router.post("/end")
def end_parking_session(current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """End the active parking session."""
    user_id = current_user.id
    
    try:
        # Find current active session to get lot_id for occupancy log
        active_res = db.table("parking_sessions").select("id, lot_id").eq("user_id", user_id).eq("active", True).execute()
        
        # Mark session inactive
        db.table("parking_sessions").update({
            "active": False,
            "end_time": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user_id).eq("active", True).execute()

        # Write occupancy log (side-effect)
        if active_res.data:
            try:
                db.table("occupancy_logs").insert({
                    "lot_id": active_res.data[0]["lot_id"],
                    "reporter_id": user_id,
                    "status": "closed",
                    "occupancy_level": 0
                }).execute()
            except Exception as e:
                log.warning("Failed to write occupancy log on park end: %s", e)
            
        return {"success": True}
    except Exception as exc:
        log.error("Failed to end parking session: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to end parking session")
