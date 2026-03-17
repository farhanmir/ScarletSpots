from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_signup_retries_profile_upsert_when_optional_profile_columns_are_missing() -> None:
    admin_db = MagicMock()
    created_user = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000123",
        email="test@rutgers.edu",
    )
    admin_db.auth.admin.create_user.return_value = SimpleNamespace(user=created_user)

    profiles_table = MagicMock()
    captured_payloads: list[dict] = []

    def upsert_side_effect(payload: dict) -> MagicMock:
        captured_payloads.append(dict(payload))
        execute_result = MagicMock()
        if len(captured_payloads) == 1:
            execute_result.execute.side_effect = Exception(
                "{'message': \"Could not find the 'first_name' column of 'profiles' in the schema cache\", 'code': 'PGRST204'}"
            )
        else:
            execute_result.execute.return_value = SimpleNamespace(
                data=[{"id": created_user.id, "email": created_user.email}]
            )
        return execute_result

    admin_db.table.return_value = profiles_table
    profiles_table.upsert.side_effect = upsert_side_effect

    original_admin_db = app.state.admin_supabase
    app.state.admin_supabase = admin_db
    try:
        response = client.post(
            "/api/v1/users/signup",
            json={
                "email": created_user.email,
                "password": "Password123!",
                "name": "Test User",
            },
        )
    finally:
        app.state.admin_supabase = original_admin_db

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert len(captured_payloads) == 2

    first_payload = captured_payloads[0]
    second_payload = captured_payloads[1]

    assert first_payload["first_name"] == "Test"
    assert first_payload["last_name"] == "User"
    assert "first_name" not in second_payload
    assert second_payload["last_name"] == "User"


def test_signup_returns_409_when_email_already_registered() -> None:
    admin_db = MagicMock()
    admin_db.auth.admin.create_user.side_effect = Exception("User with email already registered")

    original_admin_db = app.state.admin_supabase
    app.state.admin_supabase = admin_db
    try:
        response = client.post(
            "/api/v1/users/signup",
            json={
                "email": "existing@rutgers.edu",
                "password": "Password123!",
                "name": "Test User",
            },
        )
    finally:
        app.state.admin_supabase = original_admin_db

    assert response.status_code == 409
    assert response.json()["detail"] == "A user with this email address has already been registered"
