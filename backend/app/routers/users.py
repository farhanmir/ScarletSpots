from types import SimpleNamespace
from typing import Any
from uuid import UUID

from app.core.database import get_db
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.security import get_admin_auth_client, get_current_user
from app.models.user import Profile
from app.schemas.user import ProfileUpdate, SignupResponse, UserCreate
from app.services.push_notifications import (
    deactivate_device_push_token,
    upsert_device_push_token,
)
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


def _build_profile_payload(user_id: str, email: str | None, name: str | None) -> dict:
    first_name = None
    last_name = None
    if name:
        parts = name.strip().split(" ", 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else None

    return {
        "id": user_id,
        "email": email,
        "first_name": first_name,
        "last_name": last_name,
        "full_name": name.strip() if name else None,
        "role": "user",
    }


def _to_uuid_or_401(user: SimpleNamespace) -> UUID:
    try:
        return UUID(str(user.id))
    except Exception as exc:
        raise HTTPException(
            status_code=401, detail="Invalid authenticated user id"
        ) from exc


def _profile_to_response(profile: Profile, fallback_email: str | None = None) -> dict:
    return {
        "id": str(profile.id),
        "email": profile.email or fallback_email,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "full_name": profile.full_name,
        "avatar_url": profile.avatar_url,
        "permit_type": profile.permit_type,
        "latitude": profile.latitude,
        "longitude": profile.longitude,
        "role": profile.role,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
    }


async def _upsert_profile(db: AsyncSession, payload: dict) -> Profile:
    profile_id = UUID(payload["id"])
    profile = await db.get(Profile, profile_id)
    if profile is None:
        profile = Profile(id=profile_id)
        db.add(profile)

    for field in [
        "email",
        "first_name",
        "last_name",
        "full_name",
        "avatar_url",
        "permit_type",
        "latitude",
        "longitude",
        "role",
    ]:
        if field in payload:
            setattr(profile, field, payload[field])

    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/signup")
@limiter.limit("5/hour")
async def signup(
    request: Request,
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin_auth: Any = Depends(get_admin_auth_client),
):
    """
    Create a new user with Rutgers email validation.
    Mirrors the logic from the legacy Edge Function.
    """
    email = body.email.lower()
    if not (
        email.endswith("@rutgers.edu") or email.endswith("@scarletmail.rutgers.edu")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Rutgers email addresses are allowed (@rutgers.edu or @scarletmail.rutgers.edu)",
        )

    try:
        # Create user in Auth
        res = admin_auth.auth.admin.create_user(
            {
                "email": email,
                "password": body.password,
                "user_metadata": {"name": body.name},
                "email_confirm": True,
            }
        )

        await _upsert_profile(
            db, _build_profile_payload(str(res.user.id), email, body.name)
        )

        return SignupResponse(success=True, id=str(res.user.id), email=res.user.email)
    except Exception as exc:
        error_msg = str(exc).lower()
        # Handle duplicate email error from Supabase Auth
        if "already registered" in error_msg or "already exists" in error_msg:
            log.info("Signup failed: email already registered: %s", email)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email address has already been registered",
            ) from exc

        log.error("Signup failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Signup failed"
        ) from exc


@router.get("/me")
async def read_user_me(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the authenticated user's profile row, creating it if missing."""
    user_id = _to_uuid_or_401(current_user)
    try:
        profile = await db.get(Profile, user_id)
        if profile is not None:
            return _profile_to_response(profile)

        email = getattr(current_user, "email", None)
        meta = getattr(current_user, "user_metadata", {}) or {}
        name = meta.get("name", "")
        profile = await _upsert_profile(
            db, _build_profile_payload(str(user_id), email, name)
        )
        return _profile_to_response(profile, fallback_email=email)
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to read profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve profile")


@router.patch("/me")
async def update_user_me(
    body: ProfileUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the authenticated user's profile. Only first_name, last_name, avatar_url, permit_type allowed."""
    user_id = _to_uuid_or_401(current_user)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="Empty body")
    try:
        profile = await db.get(Profile, user_id)
        if profile is None:
            profile = Profile(
                id=user_id, email=getattr(current_user, "email", None), role="user"
            )
            db.add(profile)

        for key, value in update_data.items():
            setattr(profile, key, value)

        await db.commit()
        await db.refresh(profile)
        return _profile_to_response(profile)
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to update profile: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update profile")


class PasswordResetRequest(BaseModel):
    email: str


class PushTokenUpsertRequest(BaseModel):
    token: str
    platform: str | None = None


class PushTokenDeleteRequest(BaseModel):
    token: str


@router.post("/password-reset")
@limiter.limit("3/hour")
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    admin_auth: Any = Depends(get_admin_auth_client),
):
    """
    Send a password reset email via Supabase Auth.
    Rate limited to 3 requests per hour to prevent abuse.
    Always returns success to avoid email enumeration.
    """
    email = body.email.lower().strip()
    if not (
        email.endswith("@rutgers.edu") or email.endswith("@scarletmail.rutgers.edu")
    ):
        # Reject non-Rutgers emails but still return 200 to avoid enumeration
        return {
            "success": True,
            "message": "If that email exists, a reset link has been sent.",
        }

    try:
        admin_auth.auth.admin.generate_link(
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
async def update_location(
    body: ProfileUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the authenticated user's coordinates."""
    user_id = _to_uuid_or_401(current_user)

    # We only care about lat/lng here
    update_data = {}
    if body.latitude is not None:
        update_data["latitude"] = body.latitude
    if body.longitude is not None:
        update_data["longitude"] = body.longitude

    if not update_data:
        raise HTTPException(status_code=400, detail="Latitude or longitude required")

    try:
        profile = await db.get(Profile, user_id)
        if profile is None:
            profile = Profile(
                id=user_id, email=getattr(current_user, "email", None), role="user"
            )
            db.add(profile)

        if "latitude" in update_data:
            profile.latitude = str(update_data["latitude"])
        if "longitude" in update_data:
            profile.longitude = str(update_data["longitude"])

        await db.commit()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to update location: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update location")


@router.post("/me/push-token")
async def upsert_push_token(
    body: PushTokenUpsertRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register or refresh a device push token for the current user."""
    user_id = _to_uuid_or_401(current_user)
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="token is required")

    await upsert_device_push_token(db, user_id, token, platform=body.platform)
    return {"success": True}


@router.delete("/me/push-token")
async def delete_push_token(
    body: PushTokenDeleteRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a device push token for the current user."""
    user_id = _to_uuid_or_401(current_user)
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="token is required")

    removed = await deactivate_device_push_token(db, user_id, token)
    return {"success": True, "removed": removed}
