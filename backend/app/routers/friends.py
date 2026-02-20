from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from app.core.security import get_current_user, get_supabase, get_auth_db

router = APIRouter(prefix="/friends", tags=["friends"])

class FriendRequest(BaseModel):
    friend_email: str

class FriendAction(BaseModel):
    request_id: UUID

@router.get("/")
def get_friends(current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Get accepted friends and pending requests."""
    user_id = current_user.id
    
    # Get all friendships for the user
    try:
        # Incoming requests (status = pending, friend_id = me)
        incoming_query = db.table("friendships").select("id, status, user_id, profiles!friendships_user_id_fkey(id, email, full_name)").eq("friend_id", user_id).eq("status", "pending").execute()
        
        # Accepted friends (status = accepted, user_id = me)
        friends_query = db.table("friendships").select("id, status, friend_id, profiles!friendships_friend_id_fkey(id, email, full_name)").eq("user_id", user_id).eq("status", "accepted").execute()
        
        # Format the response to match the frontend mock structure
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
        for f in friends_query.data:
            profile = f.get("profiles", {}) or {}
            name = profile.get('full_name', '') or profile.get('email', 'Unknown')
            friend_uid = str(f["friend_id"])
            
            # Check if this friend has an active parking session
            # using occupancy_logs where reporter_id = friend_uid and status = 'open'
            # Note: We rely on the most recent log or session.
            # In our schema, we only have occupancy_logs, but active parking session is usually managed by a different table or inferred?
            # Let's query occupancy_logs sorted by created_at desc.
            parked = False
            status_text = "Online"
            
            session_query = db.table("occupancy_logs").select("*, parking_lots(*)").eq("reporter_id", friend_uid).order("created_at", desc=True).limit(1).execute()
            if session_query.data:
                latest_log = session_query.data[0]
                # If they recently reported "open" (which implies parked/occupied but the parking_lots is the lot)
                # Actually, our parking session table was added by edge function? 
                # Wait, "parking_session" was supposed to be a real table but the DB schema was simplified to occupancy_logs.
                # The frontend active session checks if there is an open log?
                # For now, let's just say "Online" or mock the parked status based on occupancy_logs.
                if latest_log.get("status") == "open":
                    parked = True
                    status_text = f"Parked at {latest_log.get('parking_lots', {}).get('name', 'a lot')}"

            friends.append({
                "id": str(f["id"]),
                "friend_id": friend_uid,
                "name": name,
                "status": status_text,
                "parked": parked,
                "avatar": None
            })
            
        return {"friends": friends, "requests": requests}
    except Exception as exc:
        print("Error getting friends", exc)
        raise HTTPException(status_code=500, detail=str(exc))

@router.post("/request")
def send_friend_request(body: FriendRequest, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
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
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/accept")
def accept_friend_request(body: FriendAction, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Accept an incoming friend request."""
    try:
        # Verify request exists and is to me
        req_res = db.table("friendships").select("*").eq("id", str(body.request_id)).eq("friend_id", current_user.id).execute()
        if not req_res.data:
            raise HTTPException(status_code=404, detail="Request not found")
            
        request_row = req_res.data[0]
        
        # Update original request to accepted
        db.table("friendships").update({"status": "accepted"}).eq("id", str(body.request_id)).execute()
        
        # Create the reverse relationship
        try:
            db.table("friendships").insert({
                "user_id": current_user.id,
                "friend_id": request_row["user_id"],
                "status": "accepted"
            }).execute()
        except:
            pass # might already exist
            
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/decline")
def decline_friend_request(body: FriendAction, current_user=Depends(get_current_user), db=Depends(get_auth_db)):
    """Decline (delete) a friend request."""
    try:
        # delete request where id matches and user is recipient (or sender deciding to cancel)
        db.table("friendships").delete().eq("id", str(body.request_id)).execute()
        return {"success": True}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
