from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user, get_admin_supabase
from typing import List

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/stats")
def get_admin_stats(current_user=Depends(get_current_user)):
    """
    Returns global system stats for the admin dashboard.
    """
    # In a real app, check if current_user.role == 'admin'
    admin_db = get_admin_supabase()
    
    try:
        # 1. Total Users
        users_res = admin_db.table("profiles").select("id", count="exact").execute()
        total_users = users_res.count or 0
        
        # 2. Active Sessions
        # We try parking_sessions if it exists, fallback to occupancy_logs
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
        raise HTTPException(status_code=500, detail=str(exc))

@router.get("/users")
def list_users(current_user=Depends(get_current_user)):
    """List all users (Admin only)."""
    admin_db = get_admin_supabase()
    try:
        # Use admin.list_users to get actual Auth users
        res = admin_db.auth.admin.list_users()
        users = []
        for u in res.users:
            users.append({
                "id": str(u.id),
                "email": u.email,
                "name": u.user_metadata.get("name", "N/A"),
                "created_at": u.created_at,
                "last_sign_in_at": u.last_sign_in_at
            })
        return {"users": users}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
