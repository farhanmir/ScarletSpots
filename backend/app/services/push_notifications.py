from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from app.core.config import settings
from app.core.logger import get_logger
from app.models.push import DevicePushToken
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

log = get_logger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BATCH_SIZE = 100


def _build_expo_headers() -> dict[str, str]:
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if settings.EXPO_PUSH_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_PUSH_ACCESS_TOKEN}"
    return headers


def _collect_invalid_tokens(result: dict[str, Any]) -> set[str]:
    invalid: set[str] = set()
    for item in result.get("data", []):
        if item.get("status") != "error":
            continue
        details = item.get("details") or {}
        token = details.get("expoPushToken")
        reason = str(item.get("message") or "")
        if not token:
            continue
        if "DeviceNotRegistered" in reason or "not registered" in reason.lower():
            invalid.add(token)
    return invalid


async def upsert_device_push_token(
    db: AsyncSession,
    user_id: UUID,
    token: str,
    platform: str | None = None,
) -> None:
    """Create or reactivate a push token mapping for the user."""
    if not token:
        return

    stmt = select(DevicePushToken).where(DevicePushToken.token == token)
    row = (await db.execute(stmt)).scalar_one_or_none()

    if row is None:
        db.add(
            DevicePushToken(
                user_id=user_id,
                token=token,
                platform=platform,
                active=True,
            )
        )
        await db.commit()
        return

    row.user_id = user_id
    row.platform = platform
    row.active = True
    row.last_seen_at = datetime.now(timezone.utc)
    await db.commit()


async def deactivate_device_push_token(
    db: AsyncSession, user_id: UUID, token: str
) -> bool:
    stmt = select(DevicePushToken).where(
        DevicePushToken.user_id == user_id,
        DevicePushToken.token == token,
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return False

    row.active = False
    await db.commit()
    return True


async def send_push_to_users(
    db: AsyncSession,
    user_ids: list[UUID],
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> None:
    """Best-effort push notification dispatch via Expo Push Service."""
    if not user_ids:
        return

    stmt = select(DevicePushToken).where(
        DevicePushToken.user_id.in_(user_ids),
        DevicePushToken.active.is_(True),
    )
    tokens = [row.token for row in (await db.execute(stmt)).scalars().all()]
    if not tokens:
        return

    payload = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
            "priority": "high",
            "sound": "default",
        }
        for token in tokens
    ]

    headers = _build_expo_headers()

    batches = [payload[i : i + BATCH_SIZE] for i in range(0, len(payload), BATCH_SIZE)]

    async def _send_batch(
        client: httpx.AsyncClient, batch_payload: list[dict[str, Any]]
    ) -> dict[str, Any]:
        response = await client.post(EXPO_PUSH_URL, json=batch_payload, headers=headers)
        response.raise_for_status()
        return response.json()

    results: list[dict[str, Any]] = []
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            batch_results = await asyncio.gather(
                *[_send_batch(client, batch) for batch in batches],
                return_exceptions=True,
            )
    except Exception as exc:
        log.warning("Push dispatch failed for users=%s: %s", user_ids, exc)
        return

    for result in batch_results:
        if isinstance(result, Exception):
            log.warning("Push batch dispatch failed for users=%s: %s", user_ids, result)
            continue
        results.append(result)

    invalid_tokens: set[str] = set()
    for result in results:
        invalid_tokens.update(_collect_invalid_tokens(result))
    if invalid_tokens:
        invalid_stmt = select(DevicePushToken).where(
            DevicePushToken.token.in_(list(invalid_tokens))
        )
        rows = (await db.execute(invalid_stmt)).scalars().all()
        for row in rows:
            row.active = False
        await db.commit()
