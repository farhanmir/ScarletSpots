from __future__ import annotations

import asyncio
import contextlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logger import get_logger
from app.models.parking import ParkingSession
from app.models.user import Profile
from app.services.permit_notifications import load_permit_rules
from app.services.push_notifications import send_push_to_users

log = get_logger(__name__)

SCAN_INTERVAL_SECONDS = 300
REMINDER_COOLDOWN = timedelta(hours=6)


def _load_lot_display_name_map() -> dict[str, str]:
    path = Path(__file__).resolve().parent / "rutgers_parking_data.json"
    try:
        with path.open("r", encoding="utf-8") as fh:
            lots = json.load(fh)
    except Exception:
        return {}

    mapping: dict[str, str] = {}
    for lot in lots if isinstance(lots, list) else []:
        if not isinstance(lot, dict):
            continue
        lot_id = str(lot.get("mapId") or "").strip()
        if not lot_id:
            continue
        display_name = (
            str(lot.get("shortName") or "").strip()
            or str(lot.get("propertyName") or "").strip()
            or f"Lot {lot_id}"
        )
        mapping[lot_id] = display_name
    return mapping


LOT_DISPLAY_NAME_BY_ID = _load_lot_display_name_map()


class NotificationScheduler:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None

    async def startup(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run_loop())

    async def shutdown(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run_loop(self) -> None:
        while True:
            try:
                await self._scan_active_sessions()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("Notification scheduler scan failed: %s", exc)
            with contextlib.suppress(asyncio.CancelledError):
                await asyncio.sleep(SCAN_INTERVAL_SECONDS)

    async def _scan_active_sessions(self) -> None:
        permit_rules = load_permit_rules()
        now = datetime.now(timezone.utc)
        local_now = now.astimezone(ZoneInfo(settings.CAMPUS_TIMEZONE))

        async with AsyncSessionLocal() as db:
            stmt = (
                select(ParkingSession, Profile)
                .join(Profile, Profile.id == ParkingSession.user_id)
                .where(
                    ParkingSession.active.is_(True),
                    Profile.notify_parking_restrictions.is_(True),
                )
            )
            rows = (await db.execute(stmt)).all()
            for session, profile in rows:
                if not session.lot_id:
                    continue
                if session.last_restriction_notification_at and (
                    now - session.last_restriction_notification_at
                ) < REMINDER_COOLDOWN:
                    continue

                result = permit_rules.access_state(
                    lot_id=session.lot_id,
                    primary=profile.permit_type,
                    secondary=profile.secondary_permit_type,
                    now=local_now,
                )
                if result.state != "restricted_now":
                    continue

                lot_name = LOT_DISPLAY_NAME_BY_ID.get(session.lot_id, f"Lot {session.lot_id}")
                await send_push_to_users(
                    db,
                    [profile.id],
                    title="ScarletSpots",
                    body=f"Your permit no longer allows parking in {lot_name}. Move your car when you can.",
                    data={
                        "type": "parking_restriction",
                        "lotId": session.lot_id,
                        "message": result.message,
                    },
                    preference_field="notify_parking_restrictions",
                )
                session.last_restriction_notification_at = now  # type: ignore[assignment]
            await db.commit()


notification_scheduler = NotificationScheduler()
