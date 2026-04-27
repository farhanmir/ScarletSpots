import datetime as dt
import hashlib
import json
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
        start_mow = minute_of_week(event.starts_at)
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
