from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from app.core.security import get_current_user, get_supabase, get_auth_db
from app.core.limiter import limiter
from app.core.logger import get_logger

log = get_logger(__name__)

router = APIRouter(prefix="/friends", tags=["friends"])

class FriendRequest(BaseModel):
    friend_email: str

class FriendAction(BaseModel):
    request_id: UUID

@router.get("")
def get_friends(current_user=Depends(get_current_user), db=Depends(get_auth_db), limit: int = 50, offset: int = 0):
    """Get accepted friends and pending requests."""
    user_id = current_user.id
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    
    # Get all friendships for the user
    try:
        def _format_friend(db_client, friendship, profile):
            name = profile.get('full_name', '') or profile.get('email', 'Unknown')
            uid = str(profile["id"])
            parked = False
            status_text = "Online"
            
            session_query = db_client.table("occupancy_logs").select("*, parking_lots(*)").eq("reporter_id", uid).order("created_at", desc=True).limit(1).execute()
            if session_query.data:
                latest_log = session_query.data[0]
                if latest_log.get("status") == "open":
                    parked = True
                    status_text = f"Parked at {latest_log.get('parking_lots', {}).get('name', 'a lot')}"

            return {
                "id": str(friendship["id"]),
                "friend_id": uid,
                "name": name,
                "status": status_text,
                "parked": parked,
                "avatar": None,
                "sharing_enabled": friendship.get("sharing_enabled", True)
            }

        # 1. Incoming requests (status = pending, friend_id = me)
        incoming_query = db.table("friendships").select("id, status, user_id, profiles!friendships_user_id_fkey(id, email, full_name)", count="exact").eq("friend_id", user_id).eq("status", "pending").range(offset, offset + limit - 1).execute()
        
        # 2. Accepted friends: we check both directions
        # Query A: Where I am the initiator
        q1 = db.table("friendships").select(
            "id, status, user_id, friend_id, sharing_enabled, "
            "friend:profiles!friendships_friend_id_fkey(id, email, full_name)", count="exact"
        ).eq("user_id", user_id).eq("status", "accepted").range(offset, offset + limit - 1).execute()
        
        # Query B: Where I am the target
        q2 = db.table("friendships").select(
            "id, status, user_id, friend_id, sharing_enabled, "
            "initiator:profiles!friendships_user_id_fkey(id, email, full_name)", count="exact"
        ).eq("friend_id", user_id).eq("status", "accepted").range(offset, offset + limit - 1).execute()
        
        requests = []
        for req in incoming_query.data:
            profile = req.get("profiles", {}) or {}
            name = profile.get('full_name', '') or profile.get('email', 'Unknown')
            requests.append({
                "id": str(req["id"]),
                "user_id": str(req["user_id"]),
                "name": name,
                "status": "Incoming Request",
                "avatar": None
            })
            
        friends = []
        # Process Initiator Query
        for f in q1.data:
            friend_profile = f.get("friend")
            if friend_profile:
                friends.append(_format_friend(db, f, friend_profile))

        # Process Target Query
        for f in q2.data:
            friend_profile = f.get("initiator")
            if friend_profile:
                friends.append(_format_friend(db, f, friend_profile))
            
        return {
            "friends": friends,
            "requests": requests,
            "total_friends": (q1.count or 0) + (q2.count or 0),
            "total_requests": incoming_query.count or 0,
            "limit": limit,
            "offset": offset
        }
    except Exception as exc:
        log.error("Error getting friends: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve friends")

@router.post("/request")
@limiter.limit("20/hour")
def send_friend_request(request: Request, body: FriendRequest, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Send a friend request by email."""
    try:
        # Find friend by email
        friend_res = db.table("profiles").select("id").eq("email", body.friend_email).execute()
        if not friend_res.data:
            raise HTTPException(status_code=404, detail="User not found")
            
        friend_id = friend_res.data[0]["id"]
        
        if friend_id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot add yourself")
            
        # Insert request
        payload = {
            "user_id": current_user.id,
            "friend_id": friend_id,
            "status": "pending"
        }
        res = db.table("friendships").insert(payload).execute()
        return {"success": True, "data": res.data[0]}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to send friend request: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to send friend request")


@router.post("/accept")
def accept_friend_request(body: FriendAction, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Accept an incoming friend request."""
    try:
        # Verify request exists and is to me
        req_res = db.table("friendships").select("*").eq("id", str(body.request_id)).eq("friend_id", current_user.id).execute()
        if not req_res.data:
            raise HTTPException(status_code=404, detail="Request not found")
            
        # Update original request to accepted
        db.table("friendships").update({"status": "accepted"}).eq("id", str(body.request_id)).execute()
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to accept friend request: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to accept friend request")


@router.post("/decline")
def decline_friend_request(body: FriendAction, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Decline (delete) a friend request."""
    try:
        db.table("friendships").delete().eq("id", str(body.request_id)).execute()
        return {"success": True}
    except Exception as exc:
        log.error("Failed to decline friend request: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to decline friend request")


class BlockAction(BaseModel):
    user_id: str


@router.post("/block")
def block_user(body: BlockAction, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Block a user. Removes existing friendship and prevents future requests."""
    try:
        target_id = body.user_id

        # Delete any existing friendships in both directions
        db.table("friendships").delete().eq("user_id", current_user.id).eq("friend_id", target_id).execute()
        db.table("friendships").delete().eq("user_id", target_id).eq("friend_id", current_user.id).execute()

        # Insert a blocked record
        db.table("friendships").insert({
            "user_id": current_user.id,
            "friend_id": target_id,
            "status": "blocked"
        }).execute()

        # Audit log
        _log_sharing_event(db, current_user.id, target_id, "blocked")

        return {"success": True}
    except Exception as exc:
        log.error("Failed to block user: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to block user")


@router.post("/unblock")
def unblock_user(body: BlockAction, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Unblock a user."""
    try:
        db.table("friendships").delete().eq("user_id", current_user.id).eq("friend_id", body.user_id).eq("status", "blocked").execute()

        _log_sharing_event(db, current_user.id, body.user_id, "unblocked")

        return {"success": True}
    except Exception as exc:
        log.error("Failed to unblock user: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to unblock user")


class SharingToggle(BaseModel):
    enabled: bool


@router.put("/{friendship_id}/sharing")
def toggle_sharing(friendship_id: UUID, body: SharingToggle, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Toggle per-friend location sharing."""
    try:
        # Verify the friendship belongs to the current user
        res = db.table("friendships").select("*").eq("id", str(friendship_id)).eq("user_id", current_user.id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Friendship not found")

        friendship = res.data[0]

        # Upsert sharing setting
        try:
            db.table("friend_sharing_settings").upsert({
                "user_id": current_user.id,
                "friend_id": friendship["friend_id"],
                "sharing_enabled": body.enabled
            }, on_conflict="user_id,friend_id").execute()
        except Exception:
            # Table may not exist yet — update the friendship itself as fallback
            db.table("friendships").update({
                "sharing_enabled": body.enabled
            }).eq("id", str(friendship_id)).execute()

        _log_sharing_event(
            db, current_user.id, friendship["friend_id"],
            "sharing_enabled" if body.enabled else "sharing_disabled"
        )

        return {"success": True, "sharing_enabled": body.enabled}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to toggle sharing: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to toggle sharing")


def _log_sharing_event(db, user_id: str, target_id: str, action: str):
    """Write an audit log entry for sharing state changes."""
    try:
        db.table("event_logs").insert({
            "user_id": user_id,
            "target_id": target_id,
            "action": action,
            "entity_type": "friendship"
        }).execute()
    except Exception:
        pass  # Audit logging should never block the main action
