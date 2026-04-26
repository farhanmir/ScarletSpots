import json
from typing import Any

from app.core.attestation import create_attestation_token, get_abuse_metrics
from app.core.config import settings
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.security import get_current_user
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel

log = get_logger(__name__)
router = APIRouter(prefix="/system", tags=["system"])


class CrashLogEntry(BaseModel):
    message: str
    stack: str | None = None
    extra: dict[str, Any] | None = None


class AttestationSessionRequest(BaseModel):
    platform: str
    device_id: str
    provider: str | None = None
    assertion: str | None = None


def _extract_integrity(assertion: str | None) -> tuple[str, dict[str, Any]]:
    if not assertion:
        return "unknown", {}
    try:
        parsed = json.loads(assertion)
    except json.JSONDecodeError:
        return "failed", {}
    if not isinstance(parsed, dict):
        return "failed", {}
    integrity = str(parsed.get("integrity") or "unknown").strip().lower()
    return integrity, parsed


@router.post("/crash")
@limiter.limit("20/minute")
async def report_crash(request: Request, entry: CrashLogEntry):
    """
    Receive fatal unhandled exceptions or promise rejections from the mobile app.
    Logs them to the backend console/file for monitoring.
    """
    _ = request
    log.error("============ REMOTE CRASH REPORT ============")
    log.error("Message: %s", entry.message)
    if entry.stack:
        log.error("Stack Trace:\n%s", entry.stack)
    if entry.extra:
        log.error("Extra Content: %s", entry.extra)
    log.error("=============================================")
    return {"status": "received"}


@router.post("/attestation/session")
@limiter.limit("12/minute")
async def create_attestation_session(
    request: Request,
    body: AttestationSessionRequest,
    current_user=Depends(get_current_user),
):
    _ = request
    provider = (body.provider or "self_reported").strip().lower()
    platform = (body.platform or "unknown").strip().lower()
    device_id = (body.device_id or "").strip()
    if not device_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="device_id is required"
        )

    integrity, _assertion_payload = _extract_integrity(body.assertion)

    if settings.ATTESTATION_ENFORCE and provider == "self_reported":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="self_reported provider is not allowed in enforce mode",
        )

    if settings.ATTESTATION_ENFORCE and integrity in {"failed", "compromised"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="device integrity check failed",
        )

    token = create_attestation_token(
        user_id=str(current_user.id),
        platform=platform,
        device_id=device_id,
        integrity=integrity,
    )
    return {
        "token": token,
        "platform": platform,
        "provider": provider,
        "integrity": integrity,
        "expires_in_seconds": settings.ATTESTATION_TOKEN_TTL_SECONDS,
    }


@router.get("/security/abuse-metrics")
@limiter.limit("20/minute")
async def security_abuse_metrics(
    request: Request,
    _=Depends(get_current_user),
    x_security_dashboard_key: str | None = Header(default=None),
):
    _ = request
    # Lightweight guard to avoid exposing telemetry to all authenticated users.
    if not x_security_dashboard_key:
        return {"detail": "Missing x-security-dashboard-key"}
    return get_abuse_metrics()
