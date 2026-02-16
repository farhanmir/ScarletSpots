from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID
from app.core.security import get_current_user, get_supabase

router = APIRouter(prefix="/lots", tags=["lots"])


@router.get("/")
def list_lots(campus: str | None = None):
    """List all parking lots, optionally filtered by campus."""
    db = get_supabase()
    query = db.table("parking_lots").select("*")
    if campus:
        query = query.eq("campus", campus)
    try:
        return query.execute().data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{lot_id}")
def get_lot(lot_id: UUID):
    """Get a single lot by ID."""
    db = get_supabase()
    try:
        row = db.table("parking_lots").select("*").eq("id", str(lot_id)).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Lot not found")
        return row.data
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/{lot_id}/occupancy")
def report_occupancy(lot_id: UUID, body: dict, current_user=Depends(get_current_user)):
    """Report occupancy for a lot (authenticated)."""
    db = get_supabase()
    log_data = {
        "lot_id": str(lot_id),
        "reporter_id": current_user.id,
        "occupancy_level": body.get("occupancy_level"),
        "status": body.get("status", "open"),
        "confidence_score": body.get("confidence_score", 1.0),
    }
    try:
        result = db.table("occupancy_logs").insert(log_data).execute()
        db.table("parking_lots").update(
            {"current_occupancy": body.get("occupancy_level", 0)}
        ).eq("id", str(lot_id)).execute()
        return result.data[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
