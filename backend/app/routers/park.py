from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone
from app.core.security import get_current_user, get_supabase, get_auth_db


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
        # First try to see if there is a parking_sessions table
        try:
            res = db.table("parking_sessions").select("*").eq("user_id", current_user.id).eq("active", True).execute()
            if res.data:
                session = res.data[0]
                return {
                    "session": {
                        "id": str(session["id"]),
                        "lotId": str(session["lot_id"]),
                        "spotNumber": session.get("spot_number", ""),
                        "startTime": session.get("start_time", session.get("created_at")),
                        "active": True
                    }
                }
        except Exception as e:
            # Fallback to occupancy logs if parking_sessions doesn't exist
            res = db.table("occupancy_logs").select("*").eq("reporter_id", current_user.id).eq("status", "open").order("created_at", desc=True).limit(1).execute()
            if res.data:
                log = res.data[0]
                return {
                    "session": {
                        "id": str(log["id"]),
                        "lotId": str(log["lot_id"]),
                        "spotNumber": "Unknown",
                        "startTime": log.get("created_at"),
                        "active": True
                    }
                }
        
        return {"session": None}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.post("")
def start_parking_session(body: ParkSessionCreate, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
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
        # Try to insert into parking_sessions
        session_data = {
            "user_id": user_id,
            "lot_id": body.lotId,
            "spot_number": body.spotNumber,
            "active": True,
            "start_time": datetime.now(timezone.utc).isoformat()
        }
        res = db.table("parking_sessions").insert(session_data).execute()
        new_session = res.data[0]
        
        # Also log to occupancy_logs
        try:
            db.table("occupancy_logs").insert({
                "lot_id": body.lotId,
                "reporter_id": user_id,
                "status": "open",
                "occupancy_level": 100 # Assuming parked means lot is +1 occupied
            }).execute()
        except Exception:
            pass

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
    except Exception as e:
        # Fallback to pure occupancy_logs if parking_sessions doesn't exist
        try:
            res = db.table("occupancy_logs").insert({
                "lot_id": body.lotId,
                "reporter_id": user_id,
                "status": "open",
                "occupancy_level": 100
            }).execute()
            new_log = res.data[0]
            return {
                "success": True,
                "session": {
                    "id": str(new_log["id"]),
                    "lotId": str(new_log["lot_id"]),
                    "spotNumber": body.spotNumber,
                    "startTime": new_log.get("created_at"),
                    "active": True
                }
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

@router.post("/end")
def end_parking_session(current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """End the active parking session."""
    user_id = current_user.id
    
    try:
        # Update parking_sessions
        try:
            db.table("parking_sessions").update({
                "active": False,
                "end_time": datetime.now(timezone.utc).isoformat()
            }).eq("user_id", user_id).eq("active", True).execute()
        except:
            pass
            
        # Update occupancy_logs
        try:
            active_log = db.table("occupancy_logs").select("*").eq("reporter_id", user_id).eq("status", "open").order("created_at", desc=True).limit(1).execute()
            if active_log.data:
                db.table("occupancy_logs").insert({
                    "lot_id": active_log.data[0]["lot_id"],
                    "reporter_id": user_id,
                    "status": "closed",
                    "occupancy_level": 0
                }).execute()
        except:
            pass
            
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
