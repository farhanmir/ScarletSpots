from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_admin_auth_client
from app.main import app
from app.models.favorite import UserFavorite
from app.models.friendship import Friendship
from app.models.parking import SessionFeedback
from app.models.push import DevicePushToken
from app.models.user import Profile


@pytest.mark.asyncio
async def test_export_user_data_returns_profile_and_related_rows(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_user: SimpleNamespace,
    override_current_user,
):
    _ = override_current_user
    user_id = auth_user.id

    db_session.add(
        Profile(
            id=user_id,
            email=auth_user.email,
            first_name="Test",
            last_name="User",
            full_name="Test User",
            role="user",
        )
    )
    db_session.add(UserFavorite(user_id=user_id, lot_id="10002"))
    db_session.add(
        Friendship(
            user_id=user_id,
            friend_id="00000000-0000-0000-0000-000000000999",
            status="accepted",
            sharing_enabled=True,
        )
    )
    db_session.add(
        SessionFeedback(
            user_id=user_id,
            session_id=None,
            lot_id="10001",
            quality="correct",
            notes="good detection",
        )
    )
    db_session.add(DevicePushToken(user_id=user_id, token="ExponentPushToken[test]", platform="ios"))
    await db_session.commit()

    response = await client.get("/api/v1/users/me/export")
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["user_id"] == user_id
    assert payload["profile"]["email"] == auth_user.email
    assert isinstance(payload["sessions"], list)
    assert payload["favorites"][0]["lot_id"] == "10002"
    assert len(payload["friendships"]) == 1
    assert len(payload["session_feedback"]) == 1
    assert len(payload["push_tokens"]) == 1


@pytest.mark.asyncio
async def test_delete_my_account_requires_confirm_true(
    client: AsyncClient,
    auth_user: SimpleNamespace,
    override_current_user,
):
    _ = override_current_user

    admin_auth = MagicMock()
    app.dependency_overrides[get_admin_auth_client] = lambda: admin_auth
    try:
        response = await client.request("DELETE", "/api/v1/users/me", json={"confirm": False})
    finally:
        app.dependency_overrides.pop(get_admin_auth_client, None)

    assert response.status_code == 400
    assert "confirm=true is required" in response.text


@pytest.mark.asyncio
async def test_delete_my_account_removes_data_and_calls_auth_delete(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_user: SimpleNamespace,
    override_current_user,
):
    _ = override_current_user
    user_id = auth_user.id

    db_session.add(Profile(id=user_id, email=auth_user.email, role="user"))
    db_session.add(UserFavorite(user_id=user_id, lot_id="10002"))
    db_session.add(DevicePushToken(user_id=user_id, token="ExponentPushToken[delete]", platform="ios"))
    await db_session.commit()

    admin_auth = MagicMock()
    app.dependency_overrides[get_admin_auth_client] = lambda: admin_auth
    try:
        response = await client.request("DELETE", "/api/v1/users/me", json={"confirm": True})
    finally:
        app.dependency_overrides.pop(get_admin_auth_client, None)

    assert response.status_code == 200, response.text
    assert response.json()["success"] is True
    assert response.json()["auth_deleted"] is True
    admin_auth.auth.admin.delete_user.assert_called_once_with(user_id)

    profile = await db_session.get(Profile, user_id)
    assert profile is None
