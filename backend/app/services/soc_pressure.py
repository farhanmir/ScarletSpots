import datetime as dt
import json
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings

SOC_PRESSURE_CACHE_PATH = Path(__file__).parent / "soc_lot_pressure_cache.json"


@dataclass(frozen=True)
class SOCPressureSignal:
    multiplier: float
    pressure_index: float
    source: str
    snapshot_at: str | None
    stale: bool


class SOCPressureService:
    def __init__(self, cache_path: Path | None = None):
        self._cache_path = cache_path or SOC_PRESSURE_CACHE_PATH
        self._loaded = False
        self._snapshot_at: dt.datetime | None = None
        self._buckets: dict[str, dict[int, float]] = {}

    def get_signal(self, lot_id: str, target_time: dt.datetime) -> SOCPressureSignal:
        if not settings.SOC_FORECAST_ENABLED:
            return SOCPressureSignal(1.0, 0.0, "disabled", None, stale=True)
        self._load_if_needed()
        if not self._buckets:
            return SOCPressureSignal(1.0, 0.0, "missing", self._snapshot_iso(), stale=True)

        minute_of_week = (target_time.weekday() * 24 * 60) + (target_time.hour * 60) + target_time.minute
        minute_of_week -= minute_of_week % 5
        index = float(self._buckets.get(lot_id, {}).get(minute_of_week, 0.0))
        multiplier = 1.0 + (index * 0.25)
        multiplier = max(settings.SOC_PRESSURE_MIN_MULTIPLIER, min(settings.SOC_PRESSURE_MAX_MULTIPLIER, multiplier))
        stale = self._is_stale()
        source = "soc_cache" if index > 0 else "soc_cache_empty"
        return SOCPressureSignal(multiplier, index, source, self._snapshot_iso(), stale)

    def _load_if_needed(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        try:
            payload = json.loads(self._cache_path.read_text(encoding="utf-8"))
        except Exception:
            self._buckets = {}
            self._snapshot_at = None
            return
        captured = payload.get("captured_at")
        if isinstance(captured, str):
            try:
                self._snapshot_at = dt.datetime.fromisoformat(captured.replace("Z", "+00:00"))
            except Exception:
                self._snapshot_at = None
        raw = payload.get("buckets") if isinstance(payload, dict) else None
        if not isinstance(raw, dict):
            self._buckets = {}
            return
        parsed: dict[str, dict[int, float]] = {}
        for lot_id, bucket_map in raw.items():
            if not isinstance(bucket_map, dict):
                continue
            parsed[lot_id] = {}
            for key, value in bucket_map.items():
                try:
                    parsed[lot_id][int(key)] = float(value)
                except Exception:
                    continue
        self._buckets = parsed

    def _is_stale(self) -> bool:
        if self._snapshot_at is None:
            return True
        age_minutes = (dt.datetime.now(dt.timezone.utc) - self._snapshot_at).total_seconds() / 60.0
        return age_minutes > settings.SOC_PRESSURE_STALE_MINUTES

    def _snapshot_iso(self) -> str | None:
        if self._snapshot_at is None:
            return None
        return self._snapshot_at.isoformat().replace("+00:00", "Z")
