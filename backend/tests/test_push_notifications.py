from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from app.models.push import DevicePushToken
from app.models.user import Profile
from app.services import push_notifications


@pytest.mark.asyncio
async def test_send_push_routes_ios_tokens_to_apns_and_expo_tokens_to_expo(db_session, monkeypatch):
    user_id = UUID("00000000-0000-0000-0000-000000000123")
    db_session.add(Profile(id=user_id, email="test@rutgers.edu"))
    db_session.add_all(
        [
            DevicePushToken(user_id=user_id, token="a" * 64, platform="ios", active=True),
            DevicePushToken(
                user_id=user_id,
                token="ExponentPushToken[test-token]",
                platform="ios",
                active=True,
            ),
        ]
    )
    await db_session.commit()

    expo_mock = AsyncMock(return_value=set())
    apns_mock = AsyncMock(return_value=set())
    monkeypatch.setattr(push_notifications, "_send_expo_pushes", expo_mock)
    monkeypatch.setattr(push_notifications, "_send_apns_pushes", apns_mock)
    monkeypatch.setattr(push_notifications, "_deactivate_tokens", AsyncMock(return_value=None))

    await push_notifications.send_push_to_users(
        db_session,
        [user_id],
        title="ScarletSpots",
        body="Test body",
    )

    assert expo_mock.await_count == 1
    assert apns_mock.await_count == 1
    assert expo_mock.await_args.kwargs["tokens"] == ["ExponentPushToken[test-token]"]
    assert apns_mock.await_args.kwargs["tokens"] == ["a" * 64]


@pytest.mark.asyncio
async def test_send_silent_push_routes_ios_tokens_to_apns_and_expo_tokens_to_expo(db_session, monkeypatch):
    user_id = UUID("00000000-0000-0000-0000-000000000123")
    db_session.add(Profile(id=user_id, email="test@rutgers.edu"))
    db_session.add_all(
        [
            DevicePushToken(user_id=user_id, token="b" * 64, platform="ios", active=True),
            DevicePushToken(
                user_id=user_id,
                token="ExponentPushToken[silent-test]",
                platform="expo",
                active=True,
            ),
        ]
    )
    await db_session.commit()

    expo_mock = AsyncMock(return_value=set())
    apns_mock = AsyncMock(return_value=set())
    monkeypatch.setattr(push_notifications, "_send_expo_pushes", expo_mock)
    monkeypatch.setattr(push_notifications, "_send_apns_pushes", apns_mock)
    monkeypatch.setattr(push_notifications, "_deactivate_tokens", AsyncMock(return_value=None))

    await push_notifications.send_silent_push_to_all(
        db_session,
        data={"type": "lot_occupancy_update"},
    )

    assert expo_mock.await_count == 1
    assert apns_mock.await_count == 1
    assert expo_mock.await_args.kwargs["tokens"] == ["ExponentPushToken[silent-test]"]
    assert apns_mock.await_args.kwargs["tokens"] == ["b" * 64]


def test_normalize_transport_prefers_token_shape():
    assert push_notifications._normalize_transport("ios", "c" * 64) == "apns"
    assert (
        push_notifications._normalize_transport("ios", "ExponentPushToken[token]")
        == "expo"
    )
    assert push_notifications._normalize_transport("unknown", "not-a-push-token") is None
