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
