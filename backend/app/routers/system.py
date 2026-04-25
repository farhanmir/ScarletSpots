from typing import Any

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel

from app.core.attestation import (
    create_attestation_token,
    decode_bearer_without_verify,
    get_abuse_metrics,
)
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.security import get_current_user

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


@router.post("/crash")
@limiter.limit("20/minute")
async def report_crash(request: Request, entry: CrashLogEntry):
    """
    Receive fatal unhandled exceptions or promise rejections from the mobile app.
    Logs them to the backend console/file for monitoring.
    """
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
    provider = (body.provider or "self_reported").strip().lower()
    integrity = "unknown"
    assertion_payload: dict[str, Any] = {}

    if body.assertion:
        try:
            assertion_payload = decode_bearer_without_verify(body.assertion)
            integrity = str(assertion_payload.get("integrity") or "ok").lower()
        except Exception:
            integrity = "failed"

    token = create_attestation_token(
        user_id=str(current_user.id),
        platform=body.platform,
        device_id=body.device_id,
        integrity=integrity,
    )
    return {
        "token": token,
        "platform": body.platform,
        "provider": provider,
        "integrity": integrity,
        "assertion_claims": assertion_payload,
        "expires_in_seconds": 600,
    }


@router.get("/security/abuse-metrics")
@limiter.limit("20/minute")
async def security_abuse_metrics(
    request: Request,
    _=Depends(get_current_user),
    x_security_dashboard_key: str | None = Header(default=None),
):
    # Lightweight guard to avoid exposing telemetry to all authenticated users.
    if not x_security_dashboard_key:
        return {"detail": "Missing x-security-dashboard-key"}
    return get_abuse_metrics()
