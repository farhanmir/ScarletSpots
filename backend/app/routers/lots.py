from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from uuid import UUID
from app.core.security import get_current_user, get_supabase, require_admin
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.services.forecast_provider import ForecastProvider
from app.services.forecasting import HeuristicForecastProvider

log = get_logger(__name__)

def get_forecast_provider() -> ForecastProvider:
    return HeuristicForecastProvider()

router = APIRouter(prefix="/lots", tags=["lots"])


@router.get("")
def list_lots(campus: str | None = None, limit: int = 50, offset: int = 0):
    """List all parking lots, optionally filtered by campus."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    
    db = get_supabase()
    query = db.table("parking_lots").select("*")
    if campus:
        query = query.eq("campus", campus)
    
    query = query.range(offset, offset + limit - 1)
    
    try:
        data = query.execute().data
        # Append derived fields expected by mobile client interfaces
        for lot in data:
            cap = lot.get("capacity") or 0
            occ = lot.get("current_occupancy") or 0
            lot["occupiedCount"] = occ
            lot["occupancyRate"] = (occ / cap * 100) if cap > 0 else 0
            
            # Parse coordinates back into objects
            coords = lot.get("coordinates")
            if coords and isinstance(coords, str):
                import json
                try:
                    lot["coordinates"] = json.loads(coords)
                except Exception:
                    pass
        return data
    except Exception as exc:
        log.error("Failed to list lots: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list lots")

@router.post("/init")
def init_lots(current_user=Depends(require_admin)):
    """Seed the database with standard Rutgers parking lots if empty. Requires admin role."""
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
        log.error("Failed to init lots: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to initialize lots")


@router.get("/{lot_id}")
def get_lot(lot_id: UUID):
    """Get a single lot by ID."""
    db = get_supabase()
    try:
        row = db.table("parking_lots").select("*").eq("id", str(lot_id)).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Lot not found")
        lot = row.data
        cap = lot.get("capacity") or 0
        occ = lot.get("current_occupancy") or 0
        lot["occupiedCount"] = occ
        lot["occupancyRate"] = (occ / cap * 100) if cap > 0 else 0
        
        # Parse coordinates back into objects
        coords = lot.get("coordinates")
        if coords and isinstance(coords, str):
            import json
            try:
                lot["coordinates"] = json.loads(coords)
            except Exception:
                pass
                
        return lot
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to get lot: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve lot")


class OccupancyReport(BaseModel):
    occupancy_level: int
    status: str = "open"
    confidence_score: float = 1.0


@router.post("/{lot_id}/occupancy")
@limiter.limit("5/minute")
def report_occupancy(request: Request, lot_id: UUID, body: OccupancyReport, current_user=Depends(get_current_user)):
    """Report occupancy for a lot (authenticated). limited to 5 requests per minute."""
    db = get_supabase()
    log_data = {
        "lot_id": str(lot_id),
        "reporter_id": current_user.id,
        "occupancy_level": body.occupancy_level,
        "status": body.status,
        "confidence_score": body.confidence_score,
    }
    try:
        result = db.table("occupancy_logs").insert(log_data).execute()
        db.table("parking_lots").update(
            {"current_occupancy": body.occupancy_level}
        ).eq("id", str(lot_id)).execute()
        return result.data[0]
    except Exception as exc:
        log.error("Failed to report occupancy: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to report occupancy")

@router.get("/{lot_id}/forecast")
def get_lot_forecast(lot_id: UUID, provider: ForecastProvider = Depends(get_forecast_provider)):
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
    occupancy = lot.get("current_occupancy", 0) or 0
    capacity = lot.get("capacity", 100) or 100
    forecast = provider.get_lot_forecast(lot_id, occupancy, capacity)
    return forecast


@router.post("/custom")
def create_custom_geofence(body: dict, current_user=Depends(require_admin)):
    """Create a new custom parking lot boundary. Requires admin role."""
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
        "is_custom": True
    }
    
    try:
        # Supabase will automatically generate the UUID
        result = db.table("parking_lots").insert(lot_data).execute()
        return {"message": "Geofence created", "lot": result.data[0]}
    except Exception as exc:
        log.error("Failed to create geofence: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create geofence")

@router.put("/custom/{lot_id}")
def update_custom_geofence(lot_id: UUID, body: dict, current_user=Depends(require_admin)):
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
        result = db.table("parking_lots").update(update_data).eq("id", str(lot_id)).eq("is_custom", True).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Custom geofence not found")
        return {"message": "Geofence updated", "lot": result.data[0]}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to update geofence: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update geofence")

@router.delete("/custom/{lot_id}")
def delete_custom_geofence(lot_id: UUID, current_user=Depends(require_admin)):
    """Delete a custom geofence."""
    db = get_supabase()
    try:
        result = db.table("parking_lots").delete().eq("id", str(lot_id)).eq("is_custom", True).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Custom geofence not found")
        return {"message": "Geofence deleted"}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to delete geofence: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete geofence")
