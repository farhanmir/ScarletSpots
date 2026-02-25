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
