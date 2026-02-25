from fastapi import APIRouter, Depends, HTTPException, Request
from uuid import UUID
from app.core.security import get_current_user, get_supabase
from app.core.limiter import limiter

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

@router.post("/init")
def init_lots():
    """Seed the database with standard Rutgers parking lots if empty."""
    from app.core.security import get_admin_supabase
    db = get_admin_supabase()
    
    # Check if we already have lots
    count_res = db.table("parking_lots").select("id", count="exact").limit(1).execute()
    if count_res.count and count_res.count > 0:
        return {"message": "Lots already initialized", "count": count_res.count}
        
    DEFAULT_LOTS = [
        {"name": "Lot 1 (Busch Student Center)", "campus": "Busch", "latitude": 40.5233, "longitude": -74.4587, "capacity": 250},
        {"name": "Lot 26 (Athletic Center)", "campus": "Livingston", "latitude": 40.5255, "longitude": -74.4367, "capacity": 400},
        {"name": "Lot 64 (College Ave)", "campus": "College Ave", "latitude": 40.5026, "longitude": -74.4517, "capacity": 150},
        {"name": "Yellow Lot", "campus": "Livingston", "latitude": 40.5215, "longitude": -74.4320, "capacity": 1200},
    ]
    
    try:
        res = db.table("parking_lots").insert(DEFAULT_LOTS).execute()
        return {"message": "Lots initialized", "data": res.data}
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
@limiter.limit("5/minute")
def report_occupancy(request: Request, lot_id: UUID, body: dict, current_user=Depends(get_current_user)):
    """Report occupancy for a lot (authenticated). limited to 5 requests per minute."""
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

from app.services.forecasting import ForecastingService

@router.get("/{lot_id}/forecast")
def get_lot_forecast(lot_id: UUID):
    """
    Predictive forecast for a parking lot with confidence bands.
    Returns 15m, 30m, and 60m time slices plus a 3-hour extended curve.
    """
    db = get_supabase()
    
    # Fetch lot to get current occupancy/capacity
    res = db.table("parking_lots").select("current_occupancy, capacity").eq("id", str(lot_id)).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Lot not found")
        
    lot = res.data
    return ForecastingService.get_lot_forecast(
        lot_id, 
        lot.get("current_occupancy", 0) or 0, 
        lot.get("capacity", 100) or 100
    )


@router.post("/custom")
def create_custom_geofence(body: dict, current_user=Depends(get_current_user)):
    """Create a new custom parking lot boundary."""
    # Note: In a real production app, check if current_user has 'admin' role.
    db = get_supabase()
    
    # Calculate approximate center for standard lat/lng
    coords = body.get("coordinates", [])
    if not coords or len(coords) < 3:
        raise HTTPException(status_code=400, detail="A geofence requires at least 3 coordinates")
        
    avg_lat = sum(p[0] for p in coords) / len(coords)
    avg_lng = sum(p[1] for p in coords) / len(coords)
    
    lot_data = {
        "name": body.get("name"),
        "campus": body.get("campus"),
        "latitude": avg_lat,
        "longitude": avg_lng,
        "coordinates": coords,
        "capacity": body.get("capacity", 50),
        "isCustom": True
    }
    
    try:
        # Supabase will automatically generate the UUID
        result = db.table("parking_lots").insert(lot_data).execute()
        return {"message": "Geofence created", "lot": result.data[0]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.put("/custom/{lot_id}")
def update_custom_geofence(lot_id: UUID, body: dict, current_user=Depends(get_current_user)):
    """Update an existing custom geofence."""
    db = get_supabase()
    
    coords = body.get("coordinates")
    update_data = {
        "name": body.get("name"),
        "campus": body.get("campus"),
        "capacity": body.get("capacity")
    }
    
    if coords and len(coords) >= 3:
        avg_lat = sum(p[0] for p in coords) / len(coords)
        avg_lng = sum(p[1] for p in coords) / len(coords)
        update_data["coordinates"] = coords
        update_data["latitude"] = avg_lat
        update_data["longitude"] = avg_lng
        
    try:
        result = db.table("parking_lots").update(update_data).eq("id", str(lot_id)).eq("isCustom", True).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Custom geofence not found")
        return {"message": "Geofence updated", "lot": result.data[0]}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.delete("/custom/{lot_id}")
def delete_custom_geofence(lot_id: UUID, current_user=Depends(get_current_user)):
    """Delete a custom geofence."""
    db = get_supabase()
    try:
        result = db.table("parking_lots").delete().eq("id", str(lot_id)).eq("isCustom", True).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Custom geofence not found")
        return {"message": "Geofence deleted"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
