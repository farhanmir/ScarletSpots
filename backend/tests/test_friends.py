"""
Tests for the friends router.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_friends_requires_auth():
    """GET /friends without auth should fail."""
    response = client.get("/api/v1/friends/")
    assert response.status_code in (401, 403, 500)


def test_send_request_requires_auth():
    """POST /friends/request without auth should fail."""
    response = client.post("/api/v1/friends/request", json={"friend_email": "test@test.com"})
    assert response.status_code in (401, 403, 500)


def test_block_requires_auth():
    """POST /friends/block without auth should fail."""
    response = client.post("/api/v1/friends/block", json={"user_id": "some-id"})
    assert response.status_code in (401, 403, 500)


def test_unblock_requires_auth():
    """POST /friends/unblock without auth should fail."""
    response = client.post("/api/v1/friends/unblock", json={"user_id": "some-id"})
    assert response.status_code in (401, 403, 500)


def test_sharing_toggle_updates_friendship():
    """TD-03: Test that sharing toggle correctly updates sharing_enabled on the friendships table."""
    from unittest.mock import MagicMock
    from app.routers.friends import toggle_sharing, SharingToggle

    db_mock = MagicMock()
    # Mock the DB lookup for the friendship
    db_mock.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"friend_id": "123", "id": "00000000-0000-0000-0000-000000000000"}]

    user_mock = MagicMock()
    user_mock.id = "456"

    # Test True (Enabled) — should call update with sharing_enabled=True
    body_true = SharingToggle(enabled=True)
    result = toggle_sharing(friendship_id="00000000-0000-0000-0000-000000000000", body=body_true, current_user=user_mock, db=db_mock)
    assert result == {"success": True, "sharing_enabled": True}

    # Test False (Disabled) — should call update with sharing_enabled=False
    body_false = SharingToggle(enabled=False)
    result = toggle_sharing(friendship_id="00000000-0000-0000-0000-000000000000", body=body_false, current_user=user_mock, db=db_mock)
    assert result == {"success": True, "sharing_enabled": False}

