from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.database import get_db
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.security import get_current_user
from app.core.websocket import manager as ws_manager
from app.models.friendship import Friendship
from app.models.parking import ParkingSession
from app.models.user import Profile

log = get_logger(__name__)

router = APIRouter(prefix="/friends", tags=["friends"])


class FriendRequest(BaseModel):
    friend_email: str


class FriendAction(BaseModel):
    request_id: UUID


class BlockAction(BaseModel):
    user_id: str


class SharingToggle(BaseModel):
    enabled: bool


def _to_uuid_or_401(value: str) -> UUID:
    try:
        return UUID(str(value))
    except Exception as exc:
        raise HTTPException(
            status_code=401, detail="Invalid authenticated user id"
        ) from exc


@router.get("")
async def get_friends(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
):
    """Get accepted friends and pending requests."""
    user_id = _to_uuid_or_401(current_user.id)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    try:
        incoming_profile = aliased(Profile)
        incoming_stmt = (
            select(Friendship, incoming_profile)
            .join(incoming_profile, incoming_profile.id == Friendship.user_id)
            .where(Friendship.friend_id == user_id, Friendship.status == "pending")
            .order_by(Friendship.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        incoming_rows = (await db.execute(incoming_stmt)).all()

        incoming_total_stmt = select(func.count(Friendship.id)).where(
            Friendship.friend_id == user_id,
            Friendship.status == "pending",
        )
        total_requests = (await db.execute(incoming_total_stmt)).scalar_one() or 0

        friend_profile_a = aliased(Profile)
        accepted_a_stmt = (
            select(Friendship, friend_profile_a)
            .join(friend_profile_a, friend_profile_a.id == Friendship.friend_id)
            .where(Friendship.user_id == user_id, Friendship.status == "accepted")
        )

        friend_profile_b = aliased(Profile)
        accepted_b_stmt = (
            select(Friendship, friend_profile_b)
            .join(friend_profile_b, friend_profile_b.id == Friendship.user_id)
            .where(Friendship.friend_id == user_id, Friendship.status == "accepted")
        )

        accepted_rows = (await db.execute(accepted_a_stmt)).all() + (
            await db.execute(accepted_b_stmt)
        ).all()

        friend_ids: list[str] = []
        for _, profile in accepted_rows:
            friend_ids.append(profile.id)

        active_sessions: dict[UUID, str] = {}
        if friend_ids:
            active_stmt = select(ParkingSession.user_id, ParkingSession.lot_id).where(
                ParkingSession.user_id.in_(friend_ids),
                ParkingSession.active.is_(True),
            )
            for uid, lot_id in (await db.execute(active_stmt)).all():
                active_sessions[uid] = lot_id

        requests = []
        for friendship, profile in incoming_rows:
            name = profile.full_name or profile.email or "Unknown"
            requests.append(
                {
                    "id": str(friendship.id),
                    "user_id": str(friendship.user_id),
                    "name": name,
                    "status": "Incoming Request",
                    "avatar": profile.avatar_url,
                }
            )

        friends = []
        seen_friend_ids: set[str] = set()
        for friendship, profile in accepted_rows:
            if profile.id in seen_friend_ids:
                continue
            seen_friend_ids.add(profile.id)

            sharing = bool(friendship.sharing_enabled)
            parked = sharing and profile.id in active_sessions
            lot_id = active_sessions.get(profile.id) if parked else None
            status_text = f"Parked at Lot {lot_id}" if lot_id else "Not parked"

            friends.append(
                {
                    "id": str(friendship.id),
                    "friend_id": str(profile.id),
                    "name": profile.full_name or profile.email or "Unknown",
                    "status": status_text,
                    "parked": parked,
                    "lot_id": lot_id,
                    "avatar": profile.avatar_url,
                    "sharing_enabled": sharing,
                }
            )

        blocked_profile = aliased(Profile)
        blocked_stmt = (
            select(Friendship, blocked_profile)
            .join(blocked_profile, blocked_profile.id == Friendship.friend_id)
            .where(Friendship.user_id == user_id, Friendship.status == "blocked")
        )
        blocked_rows = (await db.execute(blocked_stmt)).all()

        blocked = []
        for friendship, profile in blocked_rows:
            blocked.append(
                {
                    "id": str(friendship.id),
                    "friend_id": str(friendship.friend_id),
                    "name": profile.full_name or profile.email or "Unknown",
                    "avatar": profile.avatar_url,
                }
            )

        return {
            "friends": friends,
            "requests": requests,
            "blocked": blocked,
            "total_friends": len(friends),
            "total_requests": total_requests,
            "limit": limit,
            "offset": offset,
        }
    except Exception as exc:
        log.error("Error getting friends: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve friends")


@router.post("/request")
@limiter.limit("20/hour")
async def send_friend_request(
    request: Request,
    body: FriendRequest,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a friend request by email."""
    try:
        user_id = _to_uuid_or_401(current_user.id)

        friend_stmt = select(Profile).where(
            func.lower(Profile.email) == body.friend_email.lower()
        )
        friend = (await db.execute(friend_stmt)).scalar_one_or_none()
        if friend is None:
            raise HTTPException(status_code=404, detail="User not found")

        if friend.id == user_id:
            raise HTTPException(status_code=400, detail="Cannot add yourself")

        existing_stmt = select(Friendship).where(
            or_(
                and_(Friendship.user_id == user_id, Friendship.friend_id == friend.id),
                and_(Friendship.user_id == friend.id, Friendship.friend_id == user_id),
            )
        )
        existing = (await db.execute(existing_stmt)).scalar_one_or_none()

        if existing is not None:
            if existing.status == "accepted":
                return {
                    "success": True,
                    "message": "Already friends",
                    "data": {
                        "id": str(existing.id),
                        "status": existing.status,
                    },
                }
            if existing.status == "pending":
                return {
                    "success": True,
                    "message": "Request already exists",
                    "data": {
                        "id": str(existing.id),
                        "status": existing.status,
                    },
                }
            if existing.status == "blocked":
                raise HTTPException(
                    status_code=403, detail="Cannot send request to this user"
                )

        friendship = Friendship(user_id=user_id, friend_id=friend.id, status="pending")
        db.add(friendship)
        await db.commit()
        await db.refresh(friendship)

        await ws_manager.publish_notification(
            str(friend.id),
            {
                "event": "friend_request",
                "request_id": str(friendship.id),
                "from_user_id": str(user_id),
            },
        )

        return {
            "success": True,
            "data": {
                "id": str(friendship.id),
                "user_id": str(friendship.user_id),
                "friend_id": str(friendship.friend_id),
                "status": friendship.status,
                "sharing_enabled": bool(friendship.sharing_enabled),
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to send friend request: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to send friend request")


@router.post("/accept")
async def accept_friend_request(
    body: FriendAction,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept an incoming friend request."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        friendship = await db.get(Friendship, body.request_id)
        if friendship is None or friendship.friend_id != user_id:
            raise HTTPException(status_code=404, detail="Request not found")

        friendship.status = "accepted"
        await db.commit()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to accept friend request: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to accept friend request")


@router.post("/decline")
async def decline_friend_request(
    body: FriendAction,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Decline (delete) a friend request."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        await db.execute(
            delete(Friendship).where(
                Friendship.id == body.request_id,
                Friendship.friend_id == user_id,
                Friendship.status == "pending",
            )
        )
        await db.commit()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to decline friend request: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to decline friend request")


@router.post("/block")
async def block_user(
    body: BlockAction,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Block a user. Removes existing friendship and prevents future requests."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        target_id = _to_uuid_or_401(body.user_id)

        await db.execute(
            delete(Friendship).where(
                or_(
                    and_(
                        Friendship.user_id == user_id, Friendship.friend_id == target_id
                    ),
                    and_(
                        Friendship.user_id == target_id, Friendship.friend_id == user_id
                    ),
                )
            )
        )

        db.add(Friendship(user_id=user_id, friend_id=target_id, status="blocked"))
        await db.commit()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to block user: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to block user")


@router.post("/unblock")
async def unblock_user(
    body: BlockAction,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unblock a user."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        target_id = _to_uuid_or_401(body.user_id)

        await db.execute(
            delete(Friendship).where(
                Friendship.user_id == user_id,
                Friendship.friend_id == target_id,
                Friendship.status == "blocked",
            )
        )
        await db.commit()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to unblock user: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to unblock user")


@router.put("/{friendship_id}/sharing")
async def toggle_sharing(
    friendship_id: UUID,
    body: SharingToggle,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle per-friend location sharing."""
    try:
        user_id = _to_uuid_or_401(current_user.id)
        friendship = await db.get(Friendship, friendship_id)
        if friendship is None or friendship.user_id != user_id:
            raise HTTPException(status_code=404, detail="Friendship not found")

        friendship.sharing_enabled = body.enabled
        await db.commit()

        return {"success": True, "sharing_enabled": body.enabled}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to toggle sharing: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to toggle sharing")
