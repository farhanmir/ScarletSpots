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

import datetime
import random

@router.get("/{lot_id}/forecast")
def get_lot_forecast(lot_id: UUID):
    """Get a heuristic 3-hour predictive forecast for a parking lot."""
    # In a real app, this would query a ML model or historical DB views.
    # For Phase 6 V2, we generate a heuristic curve based on current time.
    
    now = datetime.datetime.now()
    # Normalize to top of the hour for clean graphs
    current_hour = now.replace(minute=0, second=0, microsecond=0)
    
    forecast_data = []
    
    # We want -1h (past), 0h (current), +1h, +2h, +3h
    hours_offset = [-1, 0, 1, 2, 3]
    
    # Seed the random generator slightly deterministically based on lot_id and current hour
    # so the graph doesn't jitter wildly if called multiple times in the same hour
    seed_str = str(lot_id) + str(current_hour.hour)
    random.seed(seed_str)
    
    # Base occupancy depends on time of day (Heuristic: busy mid-day)
    base_occupancy = 20
    if 9 <= current_hour.hour <= 15:
        base_occupancy = 80
    elif 16 <= current_hour.hour <= 20:
        base_occupancy = 50
        
    for offset in hours_offset:
        target_time = current_hour + datetime.timedelta(hours=offset)
        
        # Add some random walk / variance to the base
        variance = random.randint(-15, 15)
        expected_occ = max(5, min(98, base_occupancy + variance))
        
        # Adjust for night time completely dying down
        if target_time.hour < 6 or target_time.hour > 22:
            expected_occ = max(1, min(10, expected_occ - 40))
            
        forecast_data.append({
            "time": target_time.isoformat(),
            "expected_occupancy": expected_occ
        })
        
        # Move the base for the next hour specifically to make a logical curve
        if target_time.hour < 12:
            base_occupancy += 10 # Filling up in morning
        elif target_time.hour > 15:
            base_occupancy -= 15 # Emptying in evening

    return forecast_data

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
