"""
Tests for the friends router.
"""

from uuid import UUID

import pytest
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_friends_requires_auth():
    """GET /friends without auth should fail."""
    response = client.get("/api/v1/friends/")
    assert response.status_code in (401, 403)


def test_send_request_requires_auth():
    """POST /friends/request without auth should fail."""
    response = client.post(
        "/api/v1/friends/request", json={"friend_email": "test@test.com"}
    )
    assert response.status_code in (401, 403)


def test_block_requires_auth():
    """POST /friends/block without auth should fail."""
    response = client.post("/api/v1/friends/block", json={"user_id": "some-id"})
    assert response.status_code in (401, 403)


def test_unblock_requires_auth():
    """POST /friends/unblock without auth should fail."""
    response = client.post("/api/v1/friends/unblock", json={"user_id": "some-id"})
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_sharing_toggle_updates_friendship():
    """TD-03: Test that sharing toggle correctly updates sharing_enabled on the friendships table."""
    from unittest.mock import AsyncMock, MagicMock

    from app.models.friendship import Friendship
    from app.routers.friends import SharingToggle, toggle_sharing

    db_mock = MagicMock()
    friendship = Friendship(
        id="00000000-0000-0000-0000-000000000000",
        user_id="00000000-0000-0000-0000-000000000456",
        friend_id="00000000-0000-0000-0000-000000000123",
        status="accepted",
        sharing_enabled=False,
    )
    db_mock.get = AsyncMock(return_value=friendship)
    db_mock.commit = AsyncMock(return_value=None)

    user_mock = MagicMock()
    user_mock.id = "00000000-0000-0000-0000-000000000456"

    # Test True (Enabled) — should call update with sharing_enabled=True
    body_true = SharingToggle(enabled=True)
    result = await toggle_sharing(
        friendship_id=UUID("00000000-0000-0000-0000-000000000000"),
        body=body_true,
        current_user=user_mock,
        db=db_mock,
    )
    assert result == {"success": True, "sharing_enabled": True}

    # Test False (Disabled) — should call update with sharing_enabled=False
    body_false = SharingToggle(enabled=False)
    result = await toggle_sharing(
        friendship_id=UUID("00000000-0000-0000-0000-000000000000"),
        body=body_false,
        current_user=user_mock,
        db=db_mock,
    )
    assert result == {"success": True, "sharing_enabled": False}
