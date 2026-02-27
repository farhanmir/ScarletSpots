from fastapi import APIRouter, Depends, HTTPException, Request, status
from app.core.security import get_current_user, get_supabase, get_admin_supabase
from app.core.limiter import limiter
from app.schemas.user import UserCreate, ProfileUpdate, SignupResponse
from app.core.logger import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/signup")
@limiter.limit("5/hour")
def signup(request: Request, body: UserCreate):
    """
    Create a new user with Rutgers email validation.
    Mirrors the logic from the legacy Edge Function.
    """
    email = body.email.lower()
    if not (email.endswith('@rutgers.edu') or email.endswith('@scarletmail.rutgers.edu')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Rutgers email addresses are allowed (@rutgers.edu or @scarletmail.rutgers.edu)"
        )

    admin_db = get_admin_supabase()
    
    try:
        # Create user in Auth
        res = admin_db.auth.admin.create_user({
            "email": email,
            "password": body.password,
            "user_metadata": {"name": body.name},
            "email_confirm": True
        })
        
        # Profile creation is usually handled by a DB trigger in Supabase, 
        # but if not, we can insert it here.
        
        return SignupResponse(success=True, id=str(res.user.id), email=res.user.email)
    except Exception as exc:
        log.error("Signup failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Signup failed")


@router.get("/me")
def read_user_me(current_user=Depends(get_current_user)):
    """Return the authenticated user's profile row."""
    db = get_supabase()
    user_id = current_user.id
    try:
        row = db.table("profiles").select("*").eq("id", user_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        return row.data
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to read profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve profile")


@router.patch("/me")
def update_user_me(body: ProfileUpdate, current_user=Depends(get_current_user)):
    """Update the authenticated user's profile. Only first_name, last_name, avatar_url allowed."""
    db = get_supabase()
    user_id = current_user.id
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        row = db.table("profiles").update(update_data).eq("id", user_id).execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        return row.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to update profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update profile")

@router.post("/me/location")
def update_location(body: ProfileUpdate, current_user=Depends(get_current_user)):
    """Update the authenticated user's coordinates."""
    db = get_supabase()
    user_id = current_user.id
    
    # We only care about lat/lng here
    update_data = {}
    if body.latitude is not None:
        update_data["latitude"] = body.latitude
    if body.longitude is not None:
        update_data["longitude"] = body.longitude
        
    if not update_data:
        raise HTTPException(status_code=400, detail="Latitude or longitude required")
        
    try:
        # We use admin_db (service role) to bypass RLS for coordinates,
        # ensuring the mobile app's rapid background updates don't fail
        # on strict session/policy checks.
        admin_db = get_admin_supabase()
        admin_db.table("profiles").update(update_data).eq("id", user_id).execute()
        return {"success": True}
    except Exception as exc:
        # Check for missing column error specifically (PostgREST usually returns 400 for undefined column)
        err_msg = str(exc)
        if "column" in err_msg.lower() and ("latitude" in err_msg.lower() or "longitude" in err_msg.lower()):
            log.warning("Location update failed: columns missing in database. Run migration 20260306_add_profile_location.sql.")
            raise HTTPException(
                status_code=501, 
                detail="Location tracking not yet enabled on server. Please contact administrator to run schema migrations."
            )
        
        log.error("Failed to update location via admin_db: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update location")
