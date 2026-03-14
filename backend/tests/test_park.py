"""
Tests for the parking session lifecycle.

Coverage:
  - Auth-guard checks (no token → 4xx)
  - Happy-path start → active → end lifecycle
  - Partial-failure: atomic RPC raises → 500, no dangling session
  - Concurrent-start: second start while one is active is handled gracefully
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
        json={"lotId": "test"},
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
      - get_auth_db (FastAPI Depends) for get_active_session reads
      - get_admin_supabase (direct call) for start_parking_session_atomic and
        end_parking_session_atomic RPCs that mutate parking_sessions and
        lot_occupancy together in one transaction.
      - get_current_user (FastAPI Depends) for the authenticated user

    We override the Depends injections via app.dependency_overrides and patch
    the direct call to get_admin_supabase.
    """
    from unittest.mock import MagicMock, patch

    from app.core.security import get_auth_db, get_current_user

    mock_user = MagicMock()
    mock_user.id = "test-user-id"

    # ── Mock auth DB (only select reads — active-session check) ───────────────
    mock_db = MagicMock()

    # GET /active — no active session initially
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = (
        []
    )

    # ── Mock admin DB (atomic RPC calls) ───────────────────────────────────────
    mock_admin_db = MagicMock()

    # start_parking_session_atomic → returns the new session row
    start_rpc_data = [
        {
            "id": "session-1",
            "lot_id": "a0000000-0000-0000-0000-000000000001",
            "user_id": "test-user-id",
            "active": True,
            "start_time": "2026-02-26T00:00:00+00:00",
            "latitude": None,
            "longitude": None,
        }
    ]
    # end_parking_session_atomic → returns count of sessions ended (integer)
    end_rpc_data = 1

    def _rpc_side_effect(fn_name, params):
        mock_call = MagicMock()
        if fn_name == "start_parking_session_atomic":
            mock_call.execute.return_value.data = start_rpc_data
        elif fn_name == "end_parking_session_atomic":
            mock_call.execute.return_value.data = end_rpc_data
        else:
            mock_call.execute.return_value.data = None
        return mock_call

    mock_admin_db.rpc.side_effect = _rpc_side_effect

    # ── Override FastAPI dependencies ──────────────────────────────────────────
    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_auth_db] = lambda: mock_db

    try:
        with patch("app.routers.park.get_admin_supabase", return_value=mock_admin_db):
            # Start a session
            resp_start = client.post(
                "/api/v1/park/session",
                json={"lotId": "a0000000-0000-0000-0000-000000000001"},
            )
            assert resp_start.status_code == 200, resp_start.text
            data = resp_start.json()
            assert data["success"] is True
            assert data["session"]["id"] == "session-1"

            # Verify atomic start RPC was called (not the old split RPCs)
            start_call_args = mock_admin_db.rpc.call_args_list[0]
            assert start_call_args[0][0] == "start_parking_session_atomic"
            assert (
                start_call_args[0][1]["p_lot_id"]
                == "a0000000-0000-0000-0000-000000000001"
            )

            # End the session
            resp_end = client.post("/api/v1/park/session/end")
            assert resp_end.status_code == 200, resp_end.text
            assert resp_end.json()["success"] is True

            # Verify atomic end RPC was called
            end_call_args = mock_admin_db.rpc.call_args_list[-1]
            assert end_call_args[0][0] == "end_parking_session_atomic"
            assert end_call_args[0][1]["p_user_id"] == "test-user-id"
    finally:
        # Always clean up dependency overrides
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_auth_db, None)


def test_start_session_atomic_rpc_failure():
    """When start_parking_session_atomic raises, a 500 is returned.

    Previously the code swallowed occupancy errors, inserted the session
    anyway, and returned success — leaving occupancy counts drifted.
    Now the single atomic RPC either succeeds entirely or the endpoint fails.
    """
    from unittest.mock import MagicMock, patch

    from app.core.security import get_auth_db, get_current_user

    mock_user = MagicMock()
    mock_user.id = "test-user-id"

    mock_db = MagicMock()
    # No existing active session
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = (
        []
    )

    mock_admin_db = MagicMock()
    # Simulate a database / network error inside the atomic RPC
    mock_admin_db.rpc.side_effect = Exception("DB connection lost")

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_auth_db] = lambda: mock_db

    try:
        with patch("app.routers.park.get_admin_supabase", return_value=mock_admin_db):
            resp = client.post(
                "/api/v1/park/session",
                json={"lotId": "10001"},
            )
            # Must fail — not silently succeed with a drifted occupancy count
            assert resp.status_code == 500, resp.text
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_auth_db, None)


def test_start_session_schema_mismatch_returns_actionable_error():
    """If DB schema incorrectly enforces NOT NULL coordinates, return a clear error."""
    from unittest.mock import MagicMock, patch

    from app.core.security import get_auth_db, get_current_user

    mock_user = MagicMock()
    mock_user.id = "test-user-id"

    mock_db = MagicMock()
    # No existing active session
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = (
        []
    )

    mock_admin_db = MagicMock()
    mock_admin_db.rpc.side_effect = Exception(
        "{'message': 'null value in column \"latitude\" of relation \"parking_sessions\" violates not-null constraint', 'code': '23502'}"
    )

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_auth_db] = lambda: mock_db

    try:
        with patch("app.routers.park.get_admin_supabase", return_value=mock_admin_db):
            resp = client.post(
                "/api/v1/park/session",
                json={"lotId": "10088"},
            )
            assert resp.status_code == 500, resp.text
            detail = resp.json().get("detail", "")
            assert "schema mismatch" in detail.lower()
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_auth_db, None)


def test_concurrent_start_ends_previous_session_then_starts_new():
    """When a user starts a second session while one is already active, the
    previous session is atomically ended before the new one is created.

    This exercises the guard path in start_parking_session that calls
    end_parking_session_atomic when an existing session is found.
    """
    from unittest.mock import MagicMock, patch

    from app.core.security import get_auth_db, get_current_user

    mock_user = MagicMock()
    mock_user.id = "test-user-id"

    mock_db = MagicMock()
    # Simulate an already-active session for this user
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {
            "id": "old-session",
            "lot_id": "10001",
            "active": True,
            "start_time": "2026-02-26T00:00:00+00:00",
            "latitude": None,
            "longitude": None,
        }
    ]

    mock_admin_db = MagicMock()
    new_session_row = [
        {
            "id": "new-session",
            "lot_id": "10002",
            "user_id": "test-user-id",
            "active": True,
            "start_time": "2026-02-26T01:00:00+00:00",
            "latitude": None,
            "longitude": None,
        }
    ]

    def _rpc_side_effect(fn_name, params):
        mock_call = MagicMock()
        if fn_name == "start_parking_session_atomic":
            mock_call.execute.return_value.data = new_session_row
        elif fn_name == "end_parking_session_atomic":
            mock_call.execute.return_value.data = 1
        else:
            mock_call.execute.return_value.data = None
        return mock_call

    mock_admin_db.rpc.side_effect = _rpc_side_effect

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_auth_db] = lambda: mock_db

    try:
        with patch("app.routers.park.get_admin_supabase", return_value=mock_admin_db):
            resp = client.post(
                "/api/v1/park/session",
                json={"lotId": "10002"},
            )
            assert resp.status_code == 200, resp.text
            data = resp.json()
            assert data["success"] is True
            assert data["session"]["id"] == "new-session"

            # end_parking_session_atomic must have been called first to close
            # the pre-existing session, then start_parking_session_atomic.
            rpc_calls = [c[0][0] for c in mock_admin_db.rpc.call_args_list]
            assert (
                rpc_calls[0] == "end_parking_session_atomic"
            ), "Expected end_parking_session_atomic to be called first"
            assert (
                rpc_calls[1] == "start_parking_session_atomic"
            ), "Expected start_parking_session_atomic to be called second"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_auth_db, None)
