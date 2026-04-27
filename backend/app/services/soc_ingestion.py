import datetime as dt
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SOCClassEvent:
    building_name: str
    starts_at: dt.datetime
    ends_at: dt.datetime
    expected_attendance: float


def minute_of_week(when: dt.datetime) -> int:
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt.timezone.utc)
    local = when.astimezone(dt.timezone.utc)
    return (local.weekday() * 24 * 60) + (local.hour * 60) + local.minute


def parse_soc_payload(payload: list[dict[str, Any]]) -> list[SOCClassEvent]:
    events: list[SOCClassEvent] = []
    for row in payload:
        try:
            building_name = str(row.get("building_name") or "").strip()
            starts_at = dt.datetime.fromisoformat(str(row.get("starts_at")).replace("Z", "+00:00"))
            ends_at = dt.datetime.fromisoformat(str(row.get("ends_at")).replace("Z", "+00:00"))
            expected_attendance = float(row.get("expected_attendance") or row.get("max_capacity") or 0)
        except Exception:
            continue
        if not building_name or expected_attendance <= 0 or ends_at <= starts_at:
            continue
        events.append(
            SOCClassEvent(
                building_name=building_name,
                starts_at=starts_at,
                ends_at=ends_at,
                expected_attendance=expected_attendance,
            )
        )
    return events


def parse_rutgers_soc_courses_payload(
    payload: list[dict[str, Any]],
    default_attendance: float = 35.0,
) -> list[SOCClassEvent]:
    """
    Parse Rutgers SOC course payload (courses.json) into SOCClassEvent rows.

    Rutgers SOC does not expose explicit enrollment caps in this endpoint, so
    expected attendance is estimated by meeting mode.
    """
    events: list[SOCClassEvent] = []
    for course in payload:
        if not isinstance(course, dict):
            continue
        sections = course.get("sections")
        if not isinstance(sections, list):
            continue
        for section in sections:
            if not isinstance(section, dict):
                continue
            meetings = section.get("meetingTimes")
            if not isinstance(meetings, list):
                continue
            for meeting in meetings:
                event = _meeting_to_event(meeting, default_attendance=default_attendance)
                if event is not None:
                    events.append(event)
    return events


def build_campus_building_to_lot_weights(
    building_keys: list[str],
    lot_campus_by_id: dict[str, str],
    lot_capacity_by_id: dict[str, int],
) -> dict[str, dict[str, float]]:
    """
    Build a coarse Rutgers SOC mapping:
    synthetic building key (e.g. "CAC:SC") -> lot weights in same campus.
    """
    lots_by_campus: dict[str, list[str]] = {}
    for lot_id, campus in lot_campus_by_id.items():
        campus_key = _canonical_campus_name(campus)
        if not campus_key:
            continue
        lots_by_campus.setdefault(campus_key, []).append(lot_id)

    mapping: dict[str, dict[str, float]] = {}
    for key in building_keys:
        campus_abbrev, _ = _split_building_key(key)
        campus_key = _campus_abbrev_to_campus_key(campus_abbrev)
        lot_ids = lots_by_campus.get(campus_key, [])
        if not lot_ids:
            continue
        total_capacity = sum(max(0, lot_capacity_by_id.get(lot_id, 0)) for lot_id in lot_ids)
        if total_capacity <= 0:
            uniform = 1.0 / max(1, len(lot_ids))
            mapping[key] = {lot_id: round(uniform, 6) for lot_id in lot_ids}
            continue
        mapping[key] = {
            lot_id: round(max(0.0, lot_capacity_by_id.get(lot_id, 0)) / total_capacity, 6)
            for lot_id in lot_ids
        }
    return mapping


def build_lot_pressure_buckets(
    events: list[SOCClassEvent],
    building_to_lot_weights: dict[str, dict[str, float]],
    bucket_minutes: int = 5,
) -> dict[str, dict[int, float]]:
    pressure_by_lot: dict[str, dict[int, float]] = {}
    for event in events:
        lot_weights = building_to_lot_weights.get(event.building_name, {})
        if not lot_weights:
            continue
        end_mow = minute_of_week(event.ends_at)
        release_start = min(10079, end_mow)
        release_end = min(10080, release_start + 60)
        bucket = release_start - (release_start % bucket_minutes)
        while bucket < release_end:
            for lot_id, weight in lot_weights.items():
                if weight <= 0:
                    continue
                weighted = event.expected_attendance * weight
                pressure_by_lot.setdefault(lot_id, {})
                pressure_by_lot[lot_id][bucket] = pressure_by_lot[lot_id].get(bucket, 0.0) + weighted
            bucket += bucket_minutes

    normalized: dict[str, dict[int, float]] = {}
    global_peak = max((value for buckets in pressure_by_lot.values() for value in buckets.values()), default=0.0)
    if global_peak <= 0:
        return normalized
    for lot_id, buckets in pressure_by_lot.items():
        normalized[lot_id] = {}
        for minute_bucket, value in buckets.items():
            normalized[lot_id][minute_bucket] = round(min(2.0, value / global_peak), 4)
    return normalized


def build_source_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def write_pressure_cache(
    output_path: Path,
    lot_pressure: dict[str, dict[int, float]],
    source_hash: str,
    captured_at: dt.datetime | None = None,
) -> None:
    captured_at = captured_at or dt.datetime.now(dt.timezone.utc)
    serializable = {
        "captured_at": captured_at.isoformat().replace("+00:00", "Z"),
        "source_hash": source_hash,
        "buckets": {lot_id: {str(k): v for k, v in bucket.items()} for lot_id, bucket in lot_pressure.items()},
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(serializable, indent=2), encoding="utf-8")


def _meeting_to_event(meeting: dict[str, Any], default_attendance: float) -> SOCClassEvent | None:
    if not isinstance(meeting, dict):
        return None
    meeting_mode = str(meeting.get("meetingModeDesc") or "").upper()
    if "ONLINE" in meeting_mode:
        return None
    campus_abbrev = str(meeting.get("campusAbbrev") or "").strip().upper()
    building_code = str(meeting.get("buildingCode") or "").strip().upper()
    if not campus_abbrev or not building_code:
        return None

    meeting_day = str(meeting.get("meetingDay") or "").strip().upper()
    if not meeting_day:
        return None
    day_idx = _meeting_day_to_weekday(meeting_day)
    if day_idx is None:
        return None

    start_military = str(meeting.get("startTimeMilitary") or meeting.get("startTime") or "").strip()
    end_military = str(meeting.get("endTimeMilitary") or meeting.get("endTime") or "").strip()
    start_hm = _parse_hhmm(start_military, str(meeting.get("pmCode") or ""))
    end_hm = _parse_hhmm(end_military, str(meeting.get("pmCode") or ""))
    if start_hm is None or end_hm is None:
        return None

    week_start = _current_week_start_utc()
    starts_at = week_start + dt.timedelta(days=day_idx, hours=start_hm[0], minutes=start_hm[1])
    ends_at = week_start + dt.timedelta(days=day_idx, hours=end_hm[0], minutes=end_hm[1])
    if ends_at <= starts_at:
        ends_at += dt.timedelta(days=1)

    building_key = f"{campus_abbrev}:{building_code}"
    return SOCClassEvent(
        building_name=building_key,
        starts_at=starts_at,
        ends_at=ends_at,
        expected_attendance=_meeting_mode_attendance(meeting_mode, default_attendance),
    )


def _meeting_day_to_weekday(token: str) -> int | None:
    token = token.strip().upper()
    mapping = {"M": 0, "T": 1, "W": 2, "TH": 3, "F": 4, "S": 5, "SU": 6, "U": 6}
    return mapping.get(token)


def _parse_hhmm(raw: str, pm_code: str) -> tuple[int, int] | None:
    digits = re.sub(r"[^0-9]", "", raw or "")
    if len(digits) not in (3, 4):
        return None
    digits = digits.zfill(4)
    hour = int(digits[:2])
    minute = int(digits[2:])
    if minute < 0 or minute > 59:
        return None

    # If Rutgers provided non-military times, use PM/AM hint.
    if hour <= 12:
        code = (pm_code or "").strip().upper()
        if code == "P" and hour < 12:
            hour += 12
        elif code == "A" and hour == 12:
            hour = 0
    if hour > 23:
        return None
    return hour, minute


def _meeting_mode_attendance(meeting_mode: str, default_attendance: float) -> float:
    mode = (meeting_mode or "").upper()
    if "LAB" in mode:
        return 22.0
    if "REC" in mode:
        return 28.0
    if "SEM" in mode:
        return 20.0
    if "LEC" in mode:
        return 45.0
    if "IND" in mode:
        return 8.0
    return float(default_attendance)


def _current_week_start_utc(now: dt.datetime | None = None) -> dt.datetime:
    now = now or dt.datetime.now(dt.timezone.utc)
    now = now.astimezone(dt.timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight - dt.timedelta(days=midnight.weekday())


def _split_building_key(key: str) -> tuple[str, str]:
    if ":" not in key:
        return "", key
    campus, building = key.split(":", 1)
    return campus.strip().upper(), building.strip().upper()


def _campus_abbrev_to_campus_key(campus_abbrev: str) -> str:
    lookup = {
        "CAC": "college avenue",
        "BUS": "busch",
        "LIV": "livingston",
        "CD": "cook douglass",
        "D/C": "cook douglass",
        "DCC": "cook douglass",
    }
    return lookup.get(campus_abbrev.strip().upper(), "")


def _canonical_campus_name(campus: str) -> str:
    value = (campus or "").strip().lower()
    if not value:
        return ""
    if "college avenue" in value:
        return "college avenue"
    if "busch" in value:
        return "busch"
    if "livingston" in value:
        return "livingston"
    if "cook" in value or "douglass" in value:
        return "cook douglass"
    return value
