from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.logger import get_logger

log = get_logger(__name__)
router = APIRouter(prefix="/system", tags=["system"])

class CrashLogEntry(BaseModel):
    message: str
    stack: str | None = None
    extra: dict[str, Any] | None = None

@router.post("/crash")
async def report_crash(entry: CrashLogEntry):
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
