from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.security import get_admin_supabase, get_current_user, get_supabase
from app.schemas.user import ProfileUpdate, SignupResponse, UserCreate

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
    if not (email.endswith("@rutgers.edu") or email.endswith("@scarletmail.rutgers.edu")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Rutgers email addresses are allowed (@rutgers.edu or @scarletmail.rutgers.edu)",
        )

    admin_db = get_admin_supabase()

    try:
        # Create user in Auth
        res = admin_db.auth.admin.create_user(
            {
                "email": email,
                "password": body.password,
                "user_metadata": {"name": body.name},
                "email_confirm": True,
            }
        )

        # Explicitly create the profiles row — there is no DB trigger.
        # Split name into first/last if provided.
        first_name = None
        last_name = None
        if body.name:
            parts = body.name.strip().split(" ", 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else None

        admin_db.table("profiles").upsert(
            {
                "id": str(res.user.id),
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "role": "user",
            }
        ).execute()

        return SignupResponse(success=True, id=str(res.user.id), email=res.user.email)
    except Exception as exc:
        log.error("Signup failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Signup failed"
        )


@router.get("/me")
def read_user_me(current_user=Depends(get_current_user)):
    """Return the authenticated user's profile row, creating it if missing."""
    db = get_supabase()
    admin_db = get_admin_supabase()
    user_id = current_user.id
    try:
        row = db.table("profiles").select("*").eq("id", user_id).single().execute()
        if row.data:
            return row.data
        # Profile missing — auto-create it from auth metadata (handles users
        # created before the explicit profile insert was added to signup).
        email = getattr(current_user, "email", None)
        meta = getattr(current_user, "user_metadata", {}) or {}
        name = meta.get("name", "")
        parts = name.strip().split(" ", 1) if name else []
        upserted = (
            admin_db.table("profiles")
            .upsert(
                {
                    "id": user_id,
                    "email": email,
                    "first_name": parts[0] if parts else None,
                    "last_name": parts[1] if len(parts) > 1 else None,
                    "role": "user",
                }
            )
            .execute()
        )
        return upserted.data[0] if upserted.data else {"id": user_id, "email": email}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to read profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve profile")


@router.patch("/me")
def update_user_me(body: ProfileUpdate, current_user=Depends(get_current_user)):
    """Update the authenticated user's profile. Only first_name, last_name, avatar_url, permit_type allowed."""
    admin_db = get_admin_supabase()
    user_id = current_user.id
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        # Upsert so PATCH works even if the profile row was never created.
        row = admin_db.table("profiles").upsert({"id": user_id, **update_data}).execute()
        if not row.data:
            raise HTTPException(status_code=500, detail="Failed to update profile")
        return row.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to update profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update profile")


class PasswordResetRequest(BaseModel):
    email: str


@router.post("/password-reset")
@limiter.limit("3/hour")
def request_password_reset(request: Request, body: PasswordResetRequest):
    """
    Send a password reset email via Supabase Auth.
    Rate limited to 3 requests per hour to prevent abuse.
    Always returns success to avoid email enumeration.
    """
    email = body.email.lower().strip()
    if not (email.endswith("@rutgers.edu") or email.endswith("@scarletmail.rutgers.edu")):
        # Reject non-Rutgers emails but still return 200 to avoid enumeration
        return {
            "success": True,
            "message": "If that email exists, a reset link has been sent.",
        }

    try:
        admin_db = get_admin_supabase()
        admin_db.auth.admin.generate_link(
            {
                "type": "recovery",
                "email": email,
            }
        )
    except Exception as exc:
        log.warning("Password reset failed for %s: %s", email, exc)
        # Do not surface errors to caller — prevents email enumeration

    return {
        "success": True,
        "message": "If that email exists, a reset link has been sent.",
    }


@router.post("/me/location")
def update_location(body: ProfileUpdate, current_user=Depends(get_current_user)):
    """Update the authenticated user's coordinates."""
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
        if "column" in err_msg.lower() and (
            "latitude" in err_msg.lower() or "longitude" in err_msg.lower()
        ):
            log.warning(
                "Location update failed: columns missing in database. Run migration 20260306_add_profile_location.sql."
            )
            raise HTTPException(
                status_code=501,
                detail="Location tracking not yet enabled on server. Please contact administrator to run schema migrations.",
            )

        log.error("Failed to update location via admin_db: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update location")
