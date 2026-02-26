from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user, get_auth_db
from app.core.logger import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/compass", tags=["compass"])


@router.get("")
def get_compass_target(current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """
    Get the user's parked car location for compass navigation.
    Returns the active parking session coordinates and lot info.
    """
    user_id = current_user.id

    try:
        res = (
            db.table("parking_sessions")
            .select("*, parking_lots(name, campus, latitude, longitude)")
            .eq("user_id", user_id)
            .eq("active", True)
            .order("start_time", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            session = res.data[0]
            lot = session.get("parking_lots") or {}
            return {
                "target": {
                    "sessionId": str(session["id"]),
                    "lotId": str(session["lot_id"]),
                    "lotName": lot.get("name", "Unknown Lot"),
                    "campus": lot.get("campus", ""),
                    "latitude": lot.get("latitude", session.get("latitude")),
                    "longitude": lot.get("longitude", session.get("longitude")),
                    "spotNumber": session.get("spot_number", ""),
                    "startTime": session.get("start_time", session.get("created_at")),
                }
            }

        return {"target": None}
    except Exception as exc:
        log.error("Compass target lookup failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve compass target")
