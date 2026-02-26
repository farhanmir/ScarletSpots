from fastapi import APIRouter, Depends, HTTPException, Request
from app.core.security import require_admin, get_admin_supabase
from app.core.limiter import limiter
from app.core.logger import get_logger
from typing import List

log = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/stats")
@limiter.limit("60/minute")
def get_admin_stats(request: Request, current_user=Depends(require_admin)):
    """
    Returns global system stats for the admin dashboard.
    Requires admin role.
    """
    admin_db = get_admin_supabase()
    
    try:
        # 1. Total Users
        users_res = admin_db.table("profiles").select("id", count="exact").execute()
        total_users = users_res.count or 0
        
        # 2. Active Sessions
        active_sessions = 0
        try:
            sessions_res = admin_db.table("parking_sessions").select("id", count="exact").eq("active", True).execute()
            active_sessions = sessions_res.count or 0
        except:
            # Fallback
            logs_res = admin_db.table("occupancy_logs").select("id", count="exact").eq("status", "open").execute()
            active_sessions = logs_res.count or 0
            
        # 3. Total Geofences (Lots)
        lots_res = admin_db.table("parking_lots").select("id, name, campus, capacity, current_occupancy").execute()
        lots = lots_res.data or []
        total_geofences = len(lots)
        
        # 4. Total Capacity
        total_capacity = sum(lot.get("capacity", 0) or 0 for lot in lots)
        
        return {
            "totalUsers": total_users,
            "activeSessions": active_sessions,
            "totalGeofences": total_geofences,
            "totalCapacity": total_capacity,
            "lots": lots
        }
    except Exception as exc:
        log.error("Admin stats failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve admin stats")

@router.get("/users")
@limiter.limit("60/minute")
def list_users(request: Request, limit: int = 50, offset: int = 0, current_user=Depends(require_admin)):
    """List all users. Requires admin role."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    
    admin_db = get_admin_supabase()
    try:
        res = admin_db.table("profiles").select("*", count="exact").range(offset, offset + limit - 1).execute()
        users = []
        for u in res.data:
            users.append({
                "id": str(u.get("id")),
                "email": u.get("email"),
                "name": u.get("full_name") or u.get("first_name", "N/A"),
                "created_at": u.get("created_at")
            })
        return {
            "data": users,
            "total": res.count or 0,
            "limit": limit,
            "offset": offset
        }
    except Exception as exc:
        log.error("Admin list users failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve user list")
