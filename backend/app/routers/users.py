from fastapi import APIRouter, Depends, HTTPException, status
from app.core.security import get_current_user, get_supabase, get_admin_supabase
from app.schemas.user import UserCreate

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/signup")
def signup(body: UserCreate):
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
        
        return {"success": True, "user": res.user}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


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
        raise HTTPException(status_code=500, detail=str(exc))


@router.patch("/me")
def update_user_me(body: dict, current_user=Depends(get_current_user)):
    """Update the authenticated user's profile."""
    db = get_supabase()
    user_id = current_user.id
    if not body:
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        row = db.table("profiles").update(body).eq("id", user_id).execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        return row.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
