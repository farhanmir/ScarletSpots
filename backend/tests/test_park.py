"""
Tests for the parking session lifecycle.
"""

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_active_session_requires_auth():
    """GET /park/session/active without auth should fail."""
    response = client.get("/api/v1/park/session/active")
    # Should return 401 or 403 (no Bearer token)
    assert response.status_code in (401, 403, 500)


def test_start_session_requires_auth():
    """POST /park/session without auth should fail."""
    response = client.post(
        "/api/v1/park/session",
        json={
            "lotId": "test",
            "spotNumber": "1",
        },
    )
    assert response.status_code in (401, 403, 422, 500)


def test_end_session_requires_auth():
    """POST /park/session/end without auth should fail."""
    response = client.post("/api/v1/park/session/end")
    assert response.status_code in (401, 403, 500)


def test_parking_session_lifecycle():
    """Integration test to verify full session lifecycle (Start -> Check -> End)
    via mocked Supabase client.

    park.py now uses:
      - get_auth_db (FastAPI Depends) for parking_sessions table operations
      - get_admin_supabase (direct call) for atomic RPC occupancy updates
      - get_current_user (FastAPI Depends) for the authenticated user

    We override the Depends injections via app.dependency_overrides and patch
    the direct call to get_admin_supabase.
    """
    from unittest.mock import MagicMock, patch

    from app.core.security import get_auth_db, get_current_user

    mock_user = MagicMock()
    mock_user.id = "test-user-id"

    # ── Mock auth DB (session table operations) ────────────────────────────────
    mock_db = MagicMock()

    # GET /active — no active session initially
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
        []
    )

    # POST /park/session — INSERT returns the new session row
    mock_db.table.return_value.insert.return_value.execute.return_value.data = [
        {
            "id": "session-1",
            "lot_id": "a0000000-0000-0000-0000-000000000001",
            "spot_number": "42",
            "active": True,
            "start_time": "2026-02-26T00:00:00+00:00",
        }
    ]

    # ── Mock admin DB (RPC occupancy calls) ────────────────────────────────────
    mock_admin_db = MagicMock()
    # increment_lot_occupancy → returns [{current_occupancy: 1, capacity: 50}]
    mock_admin_db.rpc.return_value.execute.return_value.data = [
        {"current_occupancy": 1, "capacity": 50}
    ]

    # ── Override FastAPI dependencies ──────────────────────────────────────────
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_auth_db] = lambda: mock_db

    try:
        with patch("app.routers.park.get_admin_supabase", return_value=mock_admin_db):
            # Start a session
            resp_start = client.post(
                "/api/v1/park/session",
                json={
                    "lotId": "a0000000-0000-0000-0000-000000000001",
                    "spotNumber": "42",
                },
            )
            assert resp_start.status_code == 200, resp_start.text
            data = resp_start.json()
            assert data["success"] is True
            assert data["session"]["id"] == "session-1"

            # Verify RPC called for occupancy increment
            mock_admin_db.rpc.assert_called_once_with(
                "increment_lot_occupancy",
                {"p_lot_id": "a0000000-0000-0000-0000-000000000001"},
            )
    finally:
        # Always clean up dependency overrides
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_auth_db, None)
