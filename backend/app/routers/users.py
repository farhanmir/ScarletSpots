from types import SimpleNamespace
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from supabase import Client

from app.core.database import get_db
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.config import settings
from app.core.security import get_admin_auth_client, get_current_user, get_supabase
from app.models.favorite import UserFavorite
from app.models.friendship import Friendship
from app.models.parking import IdempotencyRecord, ParkingSession, SessionFeedback
from app.models.push import DevicePushToken
from app.models.user import Profile
from app.schemas.user import ProfileUpdate, SignupResponse, UserCreate
from app.services.push_notifications import (
    deactivate_device_push_token,
    upsert_device_push_token,
)

log = get_logger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


def _normalize_email(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip().lower()
    return normalized or None


def _can_access_diagnostics(email: str | None) -> bool:
    normalized = _normalize_email(email)
    if normalized is None or not settings.DIAGNOSTICS_ALLOWED_EMAILS:
        return False
    return normalized in settings.DIAGNOSTICS_ALLOWED_EMAILS


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
        raise HTTPException(status_code=401, detail="Invalid authenticated user id") from exc


def _profile_to_response(profile: Profile, fallback_email: str | None = None) -> dict:
    effective_email = profile.email or fallback_email
    return {
        "id": str(profile.id),
        "email": effective_email,
        "can_access_diagnostics": _can_access_diagnostics(effective_email),
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "full_name": profile.full_name,
        "avatar_url": profile.avatar_url,
        "permit_type": profile.permit_type,
        "secondary_permit_type": profile.secondary_permit_type,
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
        "secondary_permit_type",
        "latitude",
        "longitude",
        "role",
    ]:
        if field in payload:
            setattr(profile, field, payload[field])

    await db.commit()
    return profile


@router.post("/signup")
@limiter.limit("5/hour")
async def signup(
    request: Request,
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin_auth: Client = Depends(get_admin_auth_client),
):
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

        await _upsert_profile(db, _build_profile_payload(str(res.user.id), email, body.name))

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

        log.exception("Signup failed: %s", exc)
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
        email = getattr(current_user, "email", None)
        if profile is not None:
            return _profile_to_response(profile, fallback_email=email)

        meta = getattr(current_user, "user_metadata", {}) or {}
        name = meta.get("name", "")
        profile = await _upsert_profile(db, _build_profile_payload(str(user_id), email, name))
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
            profile = Profile(id=user_id, email=getattr(current_user, "email", None), role="user")
            db.add(profile)

        for key, value in update_data.items():
            setattr(profile, key, value)

        await db.commit()
        await db.refresh(profile)
        return _profile_to_response(profile, fallback_email=getattr(current_user, "email", None))
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


class AccountDeletionRequest(BaseModel):
    confirm: bool = False


class AccountDeletionResponse(BaseModel):
    success: bool
    auth_deleted: bool


@router.post("/password-reset")
@limiter.limit("3/hour")
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    supabase: Client = Depends(get_supabase),
):
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
        supabase.auth.reset_password_for_email(email)
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
            profile = Profile(id=user_id, email=getattr(current_user, "email", None), role="user")
            db.add(profile)

        if "latitude" in update_data:
            profile.latitude = update_data["latitude"]  # type: ignore[assignment]
        if "longitude" in update_data:
            profile.longitude = update_data["longitude"]  # type: ignore[assignment]

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


@router.get("/me/export")
async def export_user_data(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export a portable JSON snapshot of user-owned data."""
    user_id = _to_uuid_or_401(current_user)

    profile = await db.get(Profile, user_id)

    sessions = (
        await db.execute(
            select(ParkingSession).where(ParkingSession.user_id == user_id).order_by(ParkingSession.start_time.desc())
        )
    ).scalars().all()
    favorites = (
        await db.execute(select(UserFavorite).where(UserFavorite.user_id == user_id))
    ).scalars().all()
    friendships = (
        await db.execute(
            select(Friendship).where(or_(Friendship.user_id == user_id, Friendship.friend_id == user_id))
        )
    ).scalars().all()
    feedback = (
        await db.execute(
            select(SessionFeedback).where(SessionFeedback.user_id == user_id).order_by(SessionFeedback.created_at.desc())
        )
    ).scalars().all()
    push_tokens = (
        await db.execute(select(DevicePushToken).where(DevicePushToken.user_id == user_id))
    ).scalars().all()

    return {
        "user_id": str(user_id),
        "profile": _profile_to_response(profile) if profile else None,
        "sessions": [
            {
                "id": str(row.id),
                "lot_id": row.lot_id,
                "latitude": row.latitude,
                "longitude": row.longitude,
                "active": row.active,
                "auto_started": row.auto_started,
                "start_time": row.start_time,
                "end_time": row.end_time,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
            for row in sessions
        ],
        "favorites": [{"lot_id": row.lot_id, "created_at": row.created_at} for row in favorites],
        "friendships": [
            {
                "id": str(row.id),
                "user_id": str(row.user_id),
                "friend_id": str(row.friend_id),
                "status": row.status,
                "initiator_sharing_enabled": row.initiator_sharing_enabled,
                "recipient_sharing_enabled": row.recipient_sharing_enabled,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }
            for row in friendships
        ],
        "session_feedback": [
            {
                "id": str(row.id),
                "session_id": str(row.session_id) if row.session_id else None,
                "lot_id": row.lot_id,
                "quality": row.quality,
                "correct_lot_id": row.correct_lot_id,
                "notes": row.notes,
                "created_at": row.created_at,
            }
            for row in feedback
        ],
        "push_tokens": [
            {
                "token": row.token,
                "platform": row.platform,
                "active": row.active,
                "last_seen_at": row.last_seen_at,
            }
            for row in push_tokens
        ],
    }


@router.delete("/me")
async def delete_my_account(
    body: AccountDeletionRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    admin_auth: Client = Depends(get_admin_auth_client),
) -> AccountDeletionResponse:
    """Delete current account and user-owned data."""
    user_id = _to_uuid_or_401(current_user)

    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm=true is required")

    # Remove user-owned rows explicitly before auth deletion to avoid orphaned records.
    await db.execute(delete(SessionFeedback).where(SessionFeedback.user_id == user_id))
    await db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.user_id == user_id))
    await db.execute(delete(DevicePushToken).where(DevicePushToken.user_id == user_id))
    await db.execute(delete(UserFavorite).where(UserFavorite.user_id == user_id))
    await db.execute(delete(Friendship).where(or_(Friendship.user_id == user_id, Friendship.friend_id == user_id)))
    await db.execute(delete(ParkingSession).where(ParkingSession.user_id == user_id))
    await db.execute(delete(Profile).where(Profile.id == user_id))
    await db.commit()

    try:
        admin_auth.auth.admin.delete_user(str(user_id))
    except Exception as exc:
        log.warning("Auth delete failed for %s after DB cleanup: %s", user_id, exc)
        # DB cleanup already committed; return explicit partial status for follow-up.
        return AccountDeletionResponse(success=True, auth_deleted=False)

    return AccountDeletionResponse(success=True, auth_deleted=True)
