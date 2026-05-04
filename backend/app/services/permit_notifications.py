from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from app.core.config import settings


NO_PERMIT_ALL = "__all"
NO_PERMIT_COMMUTER = "__commuter_all"


@dataclass(frozen=True)
class PermitAccessResult:
    state: str
    message: str


class PermitRules:
    def __init__(self, mapping: dict[str, set[str]], schedules: dict[str, dict[str, Any]]) -> None:
        self.mapping = mapping
        self.schedules = schedules
        self.commuter_lot_ids = {
            lot["id"]
            for permit, lots in _load_mapping_rows().items()
            if "commuter" in permit.lower()
            for lot in lots
            if lot.get("id")
        }

    def localized_now(self, now: datetime | None = None) -> datetime:
        current = now or datetime.now()
        target_tz = ZoneInfo(settings.CAMPUS_TIMEZONE)
        if current.tzinfo is None:
            return current.replace(tzinfo=target_tz)
        return current.astimezone(target_tz)

    def access_state(
        self,
        *,
        lot_id: str,
        primary: str | None,
        secondary: str | None,
        now: datetime | None = None,
    ) -> PermitAccessResult:
        current = self.localized_now(now)

        if primary == NO_PERMIT_ALL:
            return PermitAccessResult("open_now", "All lots are allowed for your current filter.")
        if primary == NO_PERMIT_COMMUTER:
            if lot_id in self.commuter_lot_ids:
                return PermitAccessResult("open_now", "This commuter-accessible lot is allowed.")
            return PermitAccessResult("unavailable", "This lot is outside your commuter-only filter.")

        has_mapped_access = False

        if self.allows_access(lot_id=lot_id, permit_type=primary):
            has_mapped_access = True
            if self.is_lot_available_now(permit_type=primary, lot_id=lot_id, now=current) is not False:
                return PermitAccessResult("open_now", "Your primary permit allows this lot right now.")

        if self.allows_access(lot_id=lot_id, permit_type=secondary):
            has_mapped_access = True
            if self.is_secondary_permit_available_now(
                permit_type=secondary,
                lot_id=lot_id,
                now=current,
            ) is not False:
                return PermitAccessResult("open_now", "Your secondary permit allows this lot right now.")

        if has_mapped_access:
            return PermitAccessResult("restricted_now", "Your permit does not allow this lot at the current time.")

        return PermitAccessResult("unavailable", "Your permit does not allow this lot.")

    def allows_access(self, *, lot_id: str, permit_type: str | None) -> bool:
        if not permit_type:
            return False
        if permit_type == NO_PERMIT_ALL:
            return True
        if permit_type == NO_PERMIT_COMMUTER:
            return lot_id in self.commuter_lot_ids
        return lot_id in self.mapping.get(permit_type, set())

    def is_lot_available_now(
        self,
        *,
        permit_type: str | None,
        lot_id: str,
        now: datetime,
    ) -> bool | None:
        if not permit_type:
            return None

        permit_schedule = self.schedules.get(permit_type, {}).get(lot_id)
        if not permit_schedule:
            return None

        day_index = (now.weekday() + 1) % 7  # Python Mon=0, JSON Sun=0
        slots = permit_schedule.get("schedule") or []
        if day_index >= len(slots):
            return False

        current_minutes = now.hour * 60 + now.minute
        todays_slots = slots[day_index] or []
        if not todays_slots:
            return False

        for slot in todays_slots:
            start = _parse_hhmm_to_minutes(slot.get("start"))
            end = _parse_hhmm_to_minutes(slot.get("end"))
            if start is None or end is None:
                continue
            if current_minutes >= start and current_minutes < end:
                return True
        return False

    def is_secondary_permit_available_now(
        self,
        *,
        permit_type: str | None,
        lot_id: str,
        now: datetime,
    ) -> bool | None:
        if not permit_type:
            return None

        permit_schedule = self.schedules.get(permit_type, {}).get(lot_id)
        if not permit_schedule:
            return None

        text_1 = str(permit_schedule.get("time_text_1") or "").strip().lower()
        text_2 = str(permit_schedule.get("time_text_2") or "").strip().lower()
        is_main_lot_schedule = (
            text_1 == "monday - friday, 6am - 12am"
            and text_2 == "saturday - sunday, 6am - 12am"
        )
        if not is_main_lot_schedule:
            return self.is_lot_available_now(permit_type=permit_type, lot_id=lot_id, now=now)

        if now.weekday() >= 5:
            return False
        minutes = now.hour * 60 + now.minute
        return minutes >= 10 * 60 and minutes < 24 * 60


def _parse_hhmm_to_minutes(value: Any) -> int | None:
    raw = str(value or "").strip()
    if not raw or ":" not in raw:
        return None
    try:
        hour_text, minute_text = raw.split(":", 1)
        hour = int(hour_text)
        minute = int(minute_text)
    except ValueError:
        return None
    if hour == 24:
        if minute != 0:
            return None
        return 24 * 60
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _sources_dir() -> Path:
    return Path(__file__).resolve().parents[3] / "ios" / "data-sources"


@lru_cache(maxsize=1)
def _load_mapping_rows() -> dict[str, list[dict[str, Any]]]:
    path = _sources_dir() / "permit_mapping.json"
    with path.open("r", encoding="utf-8") as fh:
        loaded = json.load(fh)
    return loaded if isinstance(loaded, dict) else {}


@lru_cache(maxsize=1)
def load_permit_rules() -> PermitRules:
    mapping_rows = _load_mapping_rows()
    schedules_path = _sources_dir() / "permit_schedules.json"
    with schedules_path.open("r", encoding="utf-8") as fh:
        schedules = json.load(fh)

    mapping = {
        permit: {
            str(row.get("id")).strip()
            for row in rows
            if isinstance(row, dict) and str(row.get("id") or "").strip()
        }
        for permit, rows in mapping_rows.items()
        if isinstance(rows, list)
    }
    return PermitRules(mapping=mapping, schedules=schedules if isinstance(schedules, dict) else {})
