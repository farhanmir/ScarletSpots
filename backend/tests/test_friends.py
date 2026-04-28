"""
Tests for the friends router.
"""

from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_friends_requires_auth():
    """GET /friends without auth should fail."""
    response = client.get("/api/v1/friends/")
    assert response.status_code in (401, 403)


def test_send_request_requires_auth():
    """POST /friends/request without auth should fail."""
    response = client.post("/api/v1/friends/request", json={"friend_email": "test@test.com"})
    assert response.status_code in (401, 403)


def test_block_requires_auth():
    """POST /friends/block without auth should fail."""
    response = client.post("/api/v1/friends/block", json={"user_id": "some-id"})
    assert response.status_code in (401, 403)


def test_unblock_requires_auth():
    """POST /friends/unblock without auth should fail."""
    response = client.post("/api/v1/friends/unblock", json={"user_id": "some-id"})
    assert response.status_code in (401, 403)


def test_unfriend_requires_auth():
    """POST /friends/unfriend without auth should fail."""
    response = client.post(
        "/api/v1/friends/unfriend",
        json={"request_id": "00000000-0000-0000-0000-000000000001"},
    )
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_sharing_toggle_updates_friendship():
    """TD-03: Test that sharing toggle correctly updates sharing_enabled on the friendships table."""
    from unittest.mock import AsyncMock, MagicMock

    from app.models.friendship import Friendship
    from app.routers.friends import SharingToggle, toggle_sharing

    db_mock = MagicMock()
    user_id = UUID("00000000-0000-0000-0000-000000000456")
    friendship_id = UUID("00000000-0000-0000-0000-000000000000")

    friendship = Friendship(
        id=friendship_id,
        user_id=user_id,
        friend_id=UUID("00000000-0000-0000-0000-000000000123"),
        status="accepted",
        initiator_sharing_enabled=False,
        recipient_sharing_enabled=False,
    )
    db_mock.get = AsyncMock(return_value=friendship)
    db_mock.commit = AsyncMock(return_value=None)

    user_mock = MagicMock()
    user_mock.id = str(user_id)

    # Test True (Enabled) — should call update with sharing_enabled=True
    body_true = SharingToggle(enabled=True)
    result = await toggle_sharing(
        friendship_id=friendship_id,
        body=body_true,
        current_user=user_mock,
        db=db_mock,
    )
    assert result == {"success": True, "sharing_enabled": True}
    assert friendship.initiator_sharing_enabled is True
    assert friendship.recipient_sharing_enabled is False

    # Test False (Disabled) — should call update with sharing_enabled=False
    body_false = SharingToggle(enabled=False)
    result = await toggle_sharing(
        friendship_id=friendship_id,
        body=body_false,
        current_user=user_mock,
        db=db_mock,
    )
    assert result == {"success": True, "sharing_enabled": False}
    assert friendship.initiator_sharing_enabled is False
    assert friendship.recipient_sharing_enabled is False


@pytest.mark.asyncio
async def test_sharing_toggle_updates_recipient_owned_flag():
    from unittest.mock import AsyncMock, MagicMock

    from app.models.friendship import Friendship
    from app.routers.friends import SharingToggle, toggle_sharing

    db_mock = MagicMock()
    initiator_id = UUID("00000000-0000-0000-0000-000000000456")
    recipient_id = UUID("00000000-0000-0000-0000-000000000123")
    friendship_id = UUID("00000000-0000-0000-0000-000000000000")

    friendship = Friendship(
        id=friendship_id,
        user_id=initiator_id,
        friend_id=recipient_id,
        status="accepted",
        initiator_sharing_enabled=True,
        recipient_sharing_enabled=False,
    )
    db_mock.get = AsyncMock(return_value=friendship)
    db_mock.commit = AsyncMock(return_value=None)

    recipient_user_mock = MagicMock()
    recipient_user_mock.id = str(recipient_id)

    body = SharingToggle(enabled=True)
    result = await toggle_sharing(
        friendship_id=friendship_id,
        body=body,
        current_user=recipient_user_mock,
        db=db_mock,
    )
    assert result == {"success": True, "sharing_enabled": True}
    assert friendship.initiator_sharing_enabled is True
    assert friendship.recipient_sharing_enabled is True


@pytest.mark.asyncio
async def test_accept_friend_request():
    """Test that a friend request can be accepted by the recipient."""
    from unittest.mock import AsyncMock, MagicMock

    from app.models.friendship import Friendship
    from app.routers.friends import FriendAction, accept_friend_request

    db_mock = MagicMock()
    recipient_id = UUID("00000000-0000-0000-0000-000000000789")
    request_id = UUID("00000000-0000-0000-0000-000000000001")

    friendship = Friendship(
        id=request_id,
        user_id=UUID("00000000-0000-0000-0000-000000000123"),  # sender
        friend_id=recipient_id,  # recipient
        status="pending",
    )
    db_mock.get = AsyncMock(return_value=friendship)
    db_mock.commit = AsyncMock(return_value=None)

    recipient_user_mock = MagicMock()
    recipient_user_mock.id = str(recipient_id)

    body = FriendAction(request_id=request_id)
    result = await accept_friend_request(
        body=body,
        current_user=recipient_user_mock,
        db=db_mock,
    )
    assert result == {"success": True}
    assert friendship.status == "accepted"


@pytest.mark.asyncio
async def test_accept_friend_request_unauthorized():
    """Test that someone other than the recipient cannot accept the request."""
    from unittest.mock import AsyncMock, MagicMock

    from fastapi import HTTPException

    from app.models.friendship import Friendship
    from app.routers.friends import FriendAction, accept_friend_request

    db_mock = MagicMock()
    recipient_id = UUID("00000000-0000-0000-0000-000000000789")
    stranger_id = UUID("00000000-0000-0000-0000-000000000999")
    request_id = UUID("00000000-0000-0000-0000-000000000001")

    friendship = Friendship(
        id=request_id,
        user_id=UUID("00000000-0000-0000-0000-000000000123"),  # sender
        friend_id=recipient_id,  # recipient
        status="pending",
    )
    db_mock.get = AsyncMock(return_value=friendship)

    stranger_user_mock = MagicMock()
    stranger_user_mock.id = str(stranger_id)

    body = FriendAction(request_id=request_id)

    with pytest.raises(HTTPException) as excinfo:
        await accept_friend_request(
            body=body,
            current_user=stranger_user_mock,
            db=db_mock,
        )
    assert excinfo.value.status_code == 404
    assert friendship.status == "pending"


@pytest.mark.asyncio
async def test_unfriend_removes_accepted_friendship_for_participant():
    from unittest.mock import AsyncMock, MagicMock

    from app.models.friendship import Friendship
    from app.routers.friends import FriendAction, unfriend

    db_mock = MagicMock()
    user_id = UUID("00000000-0000-0000-0000-000000000456")
    friend_id = UUID("00000000-0000-0000-0000-000000000123")
    friendship_id = UUID("00000000-0000-0000-0000-000000000000")

    friendship = Friendship(
        id=friendship_id,
        user_id=user_id,
        friend_id=friend_id,
        status="accepted",
    )
    db_mock.get = AsyncMock(return_value=friendship)
    db_mock.delete = AsyncMock(return_value=None)
    db_mock.commit = AsyncMock(return_value=None)

    user_mock = MagicMock()
    user_mock.id = str(user_id)

    body = FriendAction(request_id=friendship_id)
    result = await unfriend(body=body, current_user=user_mock, db=db_mock)

    assert result == {"success": True}
    db_mock.delete.assert_awaited_once_with(friendship)
    db_mock.commit.assert_awaited_once()
