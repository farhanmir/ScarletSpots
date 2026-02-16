from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user, get_supabase

router = APIRouter(prefix="/users", tags=["users"])


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
