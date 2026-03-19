from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from app.core.security import get_admin_auth_client
from app.main import app
from app.models.user import Profile
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_signup_creates_profile_via_sqlalchemy_upsert(
    client: AsyncClient,
    db_session: AsyncSession,
):
    created_user = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000777",
        email="newuser@rutgers.edu",
    )
    admin_auth = MagicMock()
    admin_auth.auth.admin.create_user.return_value = SimpleNamespace(user=created_user)

    app.dependency_overrides[get_admin_auth_client] = lambda: admin_auth
    try:
        response = await client.post(
            "/api/v1/users/signup",
            json={
                "email": created_user.email,
                "password": "Password123!",
                "name": "New User",
            },
        )
    finally:
        app.dependency_overrides.pop(get_admin_auth_client, None)

    assert response.status_code == 200, response.text
    assert response.json()["success"] is True

    profile = await db_session.get(Profile, created_user.id)
    assert profile is not None
    assert profile.email == created_user.email
    assert profile.first_name == "New"
    assert profile.last_name == "User"


@pytest.mark.asyncio
async def test_signup_returns_409_when_email_already_registered(client: AsyncClient):
    admin_auth = MagicMock()
    admin_auth.auth.admin.create_user.side_effect = Exception(
        "User with email already registered"
    )

    app.dependency_overrides[get_admin_auth_client] = lambda: admin_auth
    try:
        response = await client.post(
            "/api/v1/users/signup",
            json={
                "email": "existing@rutgers.edu",
                "password": "Password123!",
                "name": "Existing User",
            },
        )
    finally:
        app.dependency_overrides.pop(get_admin_auth_client, None)

    assert response.status_code == 409
    assert (
        response.json()["detail"]
        == "A user with this email address has already been registered"
    )
