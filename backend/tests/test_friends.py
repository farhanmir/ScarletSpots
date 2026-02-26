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


def test_sharing_toggle_audit_log_branches():
    """TD-03: Test that sharing toggle correctly logs 'sharing_enabled' and 'sharing_disabled'."""
    from unittest.mock import patch, MagicMock
    from app.routers.friends import toggle_sharing, SharingToggle

    db_mock = MagicMock()
    # Mock the DB lookup for the friendship
    db_mock.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [{"friend_id": "123"}]

    user_mock = MagicMock()
    user_mock.id = "456"

    # Test True (Enabled)
    body_true = SharingToggle(enabled=True)
    with patch("app.routers.friends._log_sharing_event") as mock_log:
        toggle_sharing(friendship_id="00000000-0000-0000-0000-000000000000", body=body_true, current_user=user_mock, db=db_mock)
        mock_log.assert_called_with(db_mock, "456", "123", "sharing_enabled")
        
    # Test False (Disabled)
    body_false = SharingToggle(enabled=False)
    with patch("app.routers.friends._log_sharing_event") as mock_log:
        toggle_sharing(friendship_id="00000000-0000-0000-0000-000000000000", body=body_false, current_user=user_mock, db=db_mock)
        mock_log.assert_called_with(db_mock, "456", "123", "sharing_disabled")

