from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user, get_auth_db
from app.core.logger import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/favorites", tags=["favorites"])

@router.get("")
def get_favorites(current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """List all favorite lots for the current user."""
    try:
        # Fetch lot IDs from user_favorites
        res = db.table("user_favorites").select("lot_id").eq("user_id", current_user.id).execute()
        lot_ids = [row["lot_id"] for row in res.data]

        if not lot_ids:
            return {"favorite_lots": []}

        # Fetch lot details from parking_lots
        lots_res = db.table("parking_lots").select("*").in_("id", lot_ids).execute()
        return {"favorite_lots": lots_res.data}
    except Exception as exc:
        log.error("Failed to get favorites: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve favorites")

@router.post("/{lot_id}")
def add_favorite(lot_id: str, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Add a lot to favorites."""
    try:
        # Check if already exists
        check = db.table("user_favorites").select("*").eq("user_id", current_user.id).eq("lot_id", lot_id).execute()
        if check.data:
            return {"success": True, "message": "Already favorited"}

        db.table("user_favorites").insert({
            "user_id": current_user.id,
            "lot_id": lot_id
        }).execute()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to add favorite: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to add favorite")

@router.delete("/{lot_id}")
def remove_favorite(lot_id: str, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Remove a lot from favorites."""
    try:
        db.table("user_favorites").delete().eq("user_id", current_user.id).eq("lot_id", lot_id).execute()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to remove favorite: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to remove favorite")
