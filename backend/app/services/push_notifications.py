from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logger import get_logger
from app.models.push import DevicePushToken
from app.models.user import Profile

log = get_logger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
APNS_PRODUCTION_URL = "https://api.push.apple.com"
APNS_SANDBOX_URL = "https://api.sandbox.push.apple.com"
BATCH_SIZE = 100
APNS_TOKEN_TTL_SECONDS = 50 * 60

_apns_jwt_cache: tuple[str, float] | None = None


def _build_expo_headers() -> dict[str, str]:
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if settings.EXPO_PUSH_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_PUSH_ACCESS_TOKEN}"
    return headers


def _apns_base_url() -> str:
    return APNS_SANDBOX_URL if settings.APNS_USE_SANDBOX else APNS_PRODUCTION_URL


def _load_apns_private_key() -> str | None:
    if settings.APNS_PRIVATE_KEY.strip():
        return settings.APNS_PRIVATE_KEY.replace("\\n", "\n")
    if settings.APNS_PRIVATE_KEY_PATH.strip():
        path = Path(settings.APNS_PRIVATE_KEY_PATH.strip())
        try:
            return path.read_text(encoding="utf-8")
        except OSError as exc:
            log.warning("Failed to read APNS private key file %s: %s", path, exc)
    return None


def _apns_is_configured() -> bool:
    return bool(
        settings.APNS_KEY_ID.strip()
        and settings.APNS_TEAM_ID.strip()
        and settings.APNS_BUNDLE_ID.strip()
        and _load_apns_private_key()
    )


def _looks_like_expo_token(token: str) -> bool:
    return token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")


def _looks_like_apns_token(token: str) -> bool:
    compact = token.strip().lower()
    return len(compact) >= 64 and all(ch in "0123456789abcdef" for ch in compact)


def _normalize_transport(platform: str | None, token: str) -> str | None:
    normalized_platform = (platform or "").strip().lower()
    if _looks_like_expo_token(token):
        return "expo"
    if normalized_platform in {"expo", "expo-ios", "expo-android"}:
        return "expo"
    if _looks_like_apns_token(token) and normalized_platform in {"ios", "apns", ""}:
        return "apns"
    return None


def _collect_invalid_expo_tokens(result: dict[str, Any]) -> set[str]:
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


def _apns_jwt_token() -> str | None:
    global _apns_jwt_cache

    private_key = _load_apns_private_key()
    if not private_key:
        return None

    now = time.time()
    if _apns_jwt_cache is not None and now < _apns_jwt_cache[1]:
        return _apns_jwt_cache[0]

    issued_at = int(now)
    token = jwt.encode(
        {"iss": settings.APNS_TEAM_ID.strip(), "iat": issued_at},
        private_key,
        algorithm="ES256",
        headers={"kid": settings.APNS_KEY_ID.strip()},
    )
    _apns_jwt_cache = (token, now + APNS_TOKEN_TTL_SECONDS)
    return token


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

    row.user_id = user_id  # type: ignore[assignment]
    row.platform = platform  # type: ignore[assignment]
    row.active = True  # type: ignore[assignment]
    row.last_seen_at = datetime.now(timezone.utc)  # type: ignore[assignment]
    await db.commit()


async def deactivate_device_push_token(db: AsyncSession, user_id: UUID, token: str) -> bool:
    stmt = select(DevicePushToken).where(
        DevicePushToken.user_id == user_id,
        DevicePushToken.token == token,
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        return False

    row.active = False  # type: ignore[assignment]
    await db.commit()
    return True


async def _load_target_tokens(
    db: AsyncSession,
    user_ids: list[UUID],
    preference_field: str | None,
) -> list[DevicePushToken]:
    effective_user_ids = user_ids
    if preference_field:
        if not hasattr(Profile, preference_field):
            log.warning("Unknown push preference field: %s", preference_field)
            return []
        pref_stmt = select(Profile.id).where(
            Profile.id.in_(user_ids),
            getattr(Profile, preference_field).is_(True),
        )
        effective_user_ids = [row[0] for row in (await db.execute(pref_stmt)).all()]
        if not effective_user_ids:
            return []

    stmt = select(DevicePushToken).where(
        DevicePushToken.user_id.in_(effective_user_ids),
        DevicePushToken.active.is_(True),
    )
    rows = list((await db.execute(stmt)).scalars().all())
    deduped: dict[str, DevicePushToken] = {}
    for row in rows:
        deduped[row.token] = row
    return list(deduped.values())


async def _deactivate_tokens(db: AsyncSession, tokens: set[str]) -> None:
    if not tokens:
        return
    stmt = select(DevicePushToken).where(DevicePushToken.token.in_(list(tokens)))
    rows = (await db.execute(stmt)).scalars().all()
    for row in rows:
        row.active = False  # type: ignore[assignment]
    await db.commit()


async def _send_expo_pushes(
    *,
    tokens: list[str],
    title: str | None,
    body: str | None,
    data: dict[str, Any] | None,
    sound: str | None,
    content_available: bool,
) -> set[str]:
    if not tokens:
        return set()

    payload: list[dict[str, Any]] = []
    for token in tokens:
        message: dict[str, Any] = {
            "to": token,
            "data": data or {},
            "priority": "high",
        }
        if title is not None:
            message["title"] = title
        if body is not None:
            message["body"] = body
        if sound is not None:
            message["sound"] = sound
        if content_available:
            message["contentAvailable"] = True
        payload.append(message)

    headers = _build_expo_headers()
    batches = [payload[i : i + BATCH_SIZE] for i in range(0, len(payload), BATCH_SIZE)]

    async def _send_batch(
        client: httpx.AsyncClient, batch_payload: list[dict[str, Any]]
    ) -> dict[str, Any]:
        response = await client.post(EXPO_PUSH_URL, json=batch_payload, headers=headers)
        response.raise_for_status()
        return response.json()

    invalid_tokens: set[str] = set()
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            batch_results = await asyncio.gather(
                *[_send_batch(client, batch) for batch in batches],
                return_exceptions=True,
            )
    except Exception as exc:
        log.warning("Expo push dispatch failed for %d token(s): %s", len(tokens), exc)
        return set()

    for result in batch_results:
        if isinstance(result, Exception):
            log.warning("Expo push batch dispatch failed: %s", result)
            continue
        if isinstance(result, dict):
            invalid_tokens.update(_collect_invalid_expo_tokens(result))
    return invalid_tokens


async def _send_apns_pushes(
    *,
    tokens: list[str],
    title: str | None,
    body: str | None,
    data: dict[str, Any] | None,
    sound: str | None,
    push_type: str,
    priority: str,
) -> set[str]:
    if not tokens or not _apns_is_configured():
        if tokens and not _apns_is_configured():
            log.warning("APNS push skipped because APNS credentials are not configured.")
        return set()

    auth_token = _apns_jwt_token()
    if not auth_token:
        log.warning("APNS push skipped because the APNS auth token could not be created.")
        return set()

    headers = {
        "authorization": f"bearer {auth_token}",
        "apns-topic": settings.APNS_BUNDLE_ID.strip(),
        "apns-push-type": push_type,
        "apns-priority": priority,
    }

    invalid_tokens: set[str] = set()
    base_url = _apns_base_url()
    async with httpx.AsyncClient(http2=True, timeout=10) as client:
        for token in tokens:
            aps: dict[str, Any] = {}
            if title is not None or body is not None:
                alert_payload = {}
                if title is not None:
                    alert_payload["title"] = title
                if body is not None:
                    alert_payload["body"] = body
                aps["alert"] = alert_payload
            if sound is not None:
                aps["sound"] = sound
            if push_type == "background":
                aps["content-available"] = 1

            payload: dict[str, Any] = {"aps": aps}
            if data:
                payload.update(data)

            try:
                response = await client.post(
                    f"{base_url}/3/device/{token}",
                    headers=headers,
                    json=payload,
                )
            except Exception as exc:
                log.warning("APNS request failed for token=%s: %s", token[-8:], exc)
                continue

            if response.status_code == 200:
                continue

            try:
                body_json = response.json()
            except ValueError:
                body_json = {}
            reason = str(body_json.get("reason") or "")
            log.warning(
                "APNS push failed status=%s token=%s reason=%s",
                response.status_code,
                token[-8:],
                reason or "unknown",
            )
            if response.status_code in {400, 410} and reason in {
                "BadDeviceToken",
                "DeviceTokenNotForTopic",
                "Unregistered",
            }:
                invalid_tokens.add(token)
    return invalid_tokens


async def send_push_to_users(
    db: AsyncSession,
    user_ids: list[UUID],
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    preference_field: str | None = None,
) -> None:
    """Best-effort push notification dispatch using APNS for native iOS tokens and Expo for Expo tokens."""
    if not user_ids:
        return

    target_rows = await _load_target_tokens(db, user_ids, preference_field)
    if not target_rows:
        return

    expo_tokens = [
        row.token
        for row in target_rows
        if _normalize_transport(row.platform, row.token) == "expo"
    ]
    apns_tokens = [
        row.token
        for row in target_rows
        if _normalize_transport(row.platform, row.token) == "apns"
    ]

    invalid_expo_tokens, invalid_apns_tokens = await asyncio.gather(
        _send_expo_pushes(
            tokens=expo_tokens,
            title=title,
            body=body,
            data=data,
            sound="default",
            content_available=False,
        ),
        _send_apns_pushes(
            tokens=apns_tokens,
            title=title,
            body=body,
            data=data,
            sound="default",
            push_type="alert",
            priority="10",
        ),
    )

    await _deactivate_tokens(db, invalid_expo_tokens.union(invalid_apns_tokens))


async def send_silent_push_to_all(
    db: AsyncSession,
    *,
    data: dict[str, Any],
) -> None:
    """Dispatches a silent background push to all active devices to update UI/widgets."""
    stmt = select(DevicePushToken).where(DevicePushToken.active.is_(True))
    rows = list((await db.execute(stmt)).scalars().all())
    if not rows:
        return

    deduped: dict[str, DevicePushToken] = {}
    for row in rows:
        deduped[row.token] = row
    target_rows = list(deduped.values())

    expo_tokens = [
        row.token
        for row in target_rows
        if _normalize_transport(row.platform, row.token) == "expo"
    ]
    apns_tokens = [
        row.token
        for row in target_rows
        if _normalize_transport(row.platform, row.token) == "apns"
    ]

    invalid_expo_tokens, invalid_apns_tokens = await asyncio.gather(
        _send_expo_pushes(
            tokens=expo_tokens,
            title=None,
            body=None,
            data=data,
            sound=None,
            content_available=True,
        ),
        _send_apns_pushes(
            tokens=apns_tokens,
            title=None,
            body=None,
            data=data,
            sound=None,
            push_type="background",
            priority="5",
        ),
    )

    await _deactivate_tokens(db, invalid_expo_tokens.union(invalid_apns_tokens))
