import base64
import hashlib
import hmac
import json
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request, status
from jose import jwt
from jose.exceptions import JWTError

from app.core.config import settings
from app.core.logger import get_logger
from app.core.security import get_current_user

log = get_logger(__name__)

_TOKEN_MAX_AGE_SECONDS = max(60, settings.ATTESTATION_NONCE_MAX_AGE_SECONDS)
_ABUSE_WINDOW_SECONDS = 60
_ABUSE_MAX_EVENTS_PER_WINDOW = 80
_abuse_events: dict[str, deque[float]] = defaultdict(deque)
_abuse_blocks: dict[str, float] = {}


@dataclass
class AttestationResult:
    trusted: bool
    reason: str
    claims: dict


def _now() -> int:
    return int(time.time())


def _clean_abuse_window(key: str, now_ts: float) -> None:
    queue = _abuse_events[key]
    threshold = now_ts - _ABUSE_WINDOW_SECONDS
    while queue and queue[0] < threshold:
        queue.popleft()


def _signing_secret() -> str:
    secret = (settings.ATTESTATION_SIGNING_SECRET or "").strip()
    if not secret:
        # Fallback keeps rollout possible in monitor mode, but is not ideal for prod.
        secret = settings.SUPABASE_JWT_SECRET
    return secret or ""


def _sign_payload(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    secret = _signing_secret().encode("utf-8")
    digest = hmac.new(secret, raw, hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    data = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    return f"{data}.{signature}"


def _verify_signed_payload(token: str) -> dict:
    if "." not in token:
        raise HTTPException(status_code=401, detail="Invalid attestation token format")
    encoded_data, encoded_signature = token.split(".", 1)
    padded_data = encoded_data + "=" * ((4 - len(encoded_data) % 4) % 4)
    padded_sig = encoded_signature + "=" * ((4 - len(encoded_signature) % 4) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded_data.encode("utf-8"))
        sent_sig = base64.urlsafe_b64decode(padded_sig.encode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Malformed attestation token") from exc

    secret = _signing_secret().encode("utf-8")
    expected_sig = hmac.new(secret, raw, hashlib.sha256).digest()
    if not hmac.compare_digest(sent_sig, expected_sig):
        raise HTTPException(status_code=401, detail="Invalid attestation signature")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid attestation payload") from exc
    return payload


def create_attestation_token(
    *,
    user_id: str,
    platform: str,
    device_id: str,
    integrity: str = "unknown",
    ttl_seconds: int = 600,
) -> str:
    now_ts = _now()
    payload = {
        "sub": user_id,
        "platform": platform,
        "device_id": device_id,
        "integrity": integrity,
        "iat": now_ts,
        "exp": now_ts + ttl_seconds,
    }
    return _sign_payload(payload)


def _record_abuse_event(user_or_ip: str) -> None:
    now_ts = time.time()
    unblock_at = _abuse_blocks.get(user_or_ip)
    if unblock_at and now_ts < unblock_at:
        raise HTTPException(status_code=429, detail="Access temporarily blocked")
    if unblock_at and now_ts >= unblock_at:
        _abuse_blocks.pop(user_or_ip, None)

    queue = _abuse_events[user_or_ip]
    _clean_abuse_window(user_or_ip, now_ts)
    queue.append(now_ts)
    if len(queue) > _ABUSE_MAX_EVENTS_PER_WINDOW:
        _abuse_blocks[user_or_ip] = now_ts + 15 * 60
        raise HTTPException(status_code=429, detail="High-frequency access blocked")


def get_abuse_metrics() -> dict:
    now_ts = time.time()
    active = {}
    for key in list(_abuse_events.keys()):
        _clean_abuse_window(key, now_ts)
        if _abuse_events[key]:
            active[key] = len(_abuse_events[key])
    blocked = {
        key: max(0, int(until - now_ts))
        for key, until in _abuse_blocks.items()
        if until > now_ts
    }
    return {
        "window_seconds": _ABUSE_WINDOW_SECONDS,
        "max_events_per_window": _ABUSE_MAX_EVENTS_PER_WINDOW,
        "active_keys": active,
        "blocked_keys": blocked,
    }


def _validate_attestation_token(
    *,
    token: str | None,
    user_id: str,
) -> AttestationResult:
    if not token:
        return AttestationResult(trusted=False, reason="missing_token", claims={})

    claims = _verify_signed_payload(token)
    now_ts = _now()
    exp = int(claims.get("exp") or 0)
    issued = int(claims.get("iat") or 0)
    token_user = str(claims.get("sub") or "")
    integrity = str(claims.get("integrity") or "unknown")

    if token_user != user_id:
        return AttestationResult(trusted=False, reason="subject_mismatch", claims=claims)
    if exp < now_ts:
        return AttestationResult(trusted=False, reason="expired", claims=claims)
    if issued > now_ts + 5 or now_ts - issued > _TOKEN_MAX_AGE_SECONDS:
        return AttestationResult(trusted=False, reason="stale", claims=claims)
    if integrity in {"failed", "compromised"}:
        return AttestationResult(trusted=False, reason="integrity_failed", claims=claims)
    return AttestationResult(trusted=True, reason="ok", claims=claims)


def _client_key(request: Request, user_id: str) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{user_id}:{ip}"


async def require_high_value_access(
    request: Request,
    current_user=Depends(get_current_user),
    x_attestation_token: str | None = Header(default=None),
    x_attestation_platform: str | None = Header(default=None),
):
    # Always track request patterns for scraping detection.
    key = _client_key(request, current_user.id)
    _record_abuse_event(key)

    if not settings.REQUIRE_AUTH_ON_AVAILABILITY:
        return {"allowed": True, "reason": "auth_not_required"}

    if not settings.REQUIRE_ATTESTATION_ON_AVAILABILITY:
        return {"allowed": True, "reason": "attestation_not_required"}

    result = _validate_attestation_token(
        token=x_attestation_token,
        user_id=str(current_user.id),
    )
    if result.trusted:
        return {"allowed": True, "reason": "attested", "claims": result.claims}

    grace_deadline = _now() + settings.ATTESTATION_ALLOW_GRACE_MINUTES * 60
    if not settings.ATTESTATION_ENFORCE:
        log.warning(
            "High-value attestation bypass (monitor): user=%s reason=%s platform=%s grace_until=%s",
            current_user.id,
            result.reason,
            x_attestation_platform or "unknown",
            grace_deadline,
        )
        return {"allowed": True, "reason": f"monitor_{result.reason}"}

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Attestation required ({result.reason})",
    )


def decode_bearer_without_verify(token: str) -> dict:
    try:
        payload = jwt.get_unverified_claims(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid attestation assertion") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid attestation assertion payload")
    return payload
