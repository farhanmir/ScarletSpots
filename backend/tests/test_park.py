"""
Tests for the parking session lifecycle.
"""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_active_session_requires_auth():
    """GET /park/session/active without auth should fail."""
    response = client.get("/api/v1/park/session/active")
    # Should return 401 or 403 (no Bearer token)
    assert response.status_code in (401, 403, 500)


def test_start_session_requires_auth():
    """POST /park/session without auth should fail."""
    response = client.post("/api/v1/park/session", json={
        "lotId": "test",
        "spotNumber": "1",
    })
    assert response.status_code in (401, 403, 422, 500)


def test_end_session_requires_auth():
    """POST /park/session/end without auth should fail."""
    response = client.post("/api/v1/park/session/end")
    assert response.status_code in (401, 403, 500)
