"""
Tests for the /users/signup and /users/password-reset endpoints.

These tests mock the Keycloak admin facade (admin_auth.auth.admin.*) and
patch the async DB session so no live database or Keycloak instance is needed.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def _make_admin_mock(user_id: str = "00000000-0000-0000-0000-000000000123", email: str = "test@rutgers.edu") -> MagicMock:
    """Return a Keycloak admin facade mock that successfully creates a user."""
    mock = MagicMock()
    created_user = SimpleNamespace(id=user_id, email=email)
    mock.auth.admin.create_user.return_value = SimpleNamespace(user=created_user)
    return mock


def test_signup_creates_user_and_profile() -> None:
    """Happy-path: valid Rutgers email creates a Keycloak user and a DB profile."""
    user_id = "00000000-0000-0000-0000-000000000123"
    email = "test@rutgers.edu"
    admin_mock = _make_admin_mock(user_id=user_id, email=email)

    # Mock the async SQLAlchemy session so no live DB is needed
    mock_db = AsyncMock()
    mock_db.get.return_value = None   # profile doesn't exist yet → will be created
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()
    mock_profile = MagicMock()
    mock_profile.id = user_id
    mock_profile.email = email

    original_admin = app.state.admin_auth
    app.state.admin_auth = admin_mock
    try:
        with patch("app.routers.users.get_db", return_value=mock_db), \
             patch("app.routers.users._upsert_profile", new_callable=AsyncMock) as mock_upsert:
            mock_upsert.return_value = mock_profile
            response = client.post(
                "/api/v1/users/signup",
                json={"email": email, "password": "Password123!", "name": "Test User"},
            )
    finally:
        app.state.admin_auth = original_admin

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["id"] == user_id
    # Keycloak create_user was called once with correct payload
    admin_mock.auth.admin.create_user.assert_called_once()
    call_payload = admin_mock.auth.admin.create_user.call_args[0][0]
    assert call_payload["email"] == email


def test_signup_returns_409_when_email_already_registered() -> None:
    """Keycloak returns 'already exists' → endpoint should return 409."""
    admin_mock = MagicMock()
    admin_mock.auth.admin.create_user.side_effect = Exception(
        "User with email already exists"
    )

    original_admin = app.state.admin_auth
    app.state.admin_auth = admin_mock
    try:
        with patch("app.routers.users.get_db", return_value=AsyncMock()):
            response = client.post(
                "/api/v1/users/signup",
                json={
                    "email": "existing@rutgers.edu",
                    "password": "Password123!",
                    "name": "Test User",
                },
            )
    finally:
        app.state.admin_auth = original_admin

    assert response.status_code == 409
    assert (
        response.json()["detail"]
        == "A user with this email address has already been registered"
    )


def test_signup_rejects_non_rutgers_email() -> None:
    """Non-Rutgers email must be rejected with 400 before touching Keycloak."""
    admin_mock = _make_admin_mock()
    original_admin = app.state.admin_auth
    app.state.admin_auth = admin_mock
    try:
        response = client.post(
            "/api/v1/users/signup",
            json={"email": "user@gmail.com", "password": "Password123!", "name": "Test"},
        )
    finally:
        app.state.admin_auth = original_admin

    assert response.status_code == 400
    admin_mock.auth.admin.create_user.assert_not_called()
