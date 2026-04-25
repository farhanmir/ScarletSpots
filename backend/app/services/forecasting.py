import datetime
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

from app.services.forecast_provider import ForecastProvider
from app.services.traffic_signal_service import TrafficSignalService

LOT_DATA_PATH = Path(__file__).parent / "rutgers_parking_data.json"


@dataclass(frozen=True)
class LotProfile:
    campus: str
    garage: bool


class HeuristicForecastProvider(ForecastProvider):
    def __init__(self, traffic_service: TrafficSignalService | None = None):
        self._traffic_service = traffic_service or TrafficSignalService()
        self._profiles = _load_lot_profiles()

    def get_lot_forecast(
        self, lot_id: str, current_occupancy: int, capacity: int
    ) -> Dict[str, Any]:
        now = datetime.datetime.now(datetime.timezone.utc)
        current_minute = now.replace(second=0, microsecond=0)
        profile = self._profiles.get(lot_id, LotProfile(campus="default", garage=False))
        traffic_signal = self._traffic_service.get_signal_for_campus(profile.campus)
        baseline_pct = self._temporal_prior(current_minute) * self._lot_multiplier(
            capacity, profile
        )
        baseline_pct *= traffic_signal.multiplier
        baseline_pct = _clamp(baseline_pct, 1.0, 99.0)
        base_rate = (current_occupancy / max(1, capacity)) * 100.0

        def compute_point(target_time: datetime.datetime) -> Dict[str, Any]:
            minutes_ahead = max(0.0, (target_time - now).total_seconds() / 60.0)
            momentum_weight = max(0.0, 1.0 - (minutes_ahead / 120.0))
            target_baseline = self._temporal_prior(target_time) * self._lot_multiplier(
                capacity, profile
            )
            target_baseline *= traffic_signal.multiplier
            expected = (base_rate * momentum_weight) + (
                _clamp(target_baseline, 1.0, 99.0) * (1.0 - momentum_weight)
            )

            deterministic = random.Random(f"{lot_id}:{target_time.hour}:{target_time.minute}")
            variance = deterministic.uniform(-3.0, 3.0)  # nosec B311
            expected = _clamp(expected + variance, 0.0, 100.0)
            band_width = 5.0 + (minutes_ahead * 0.14)

            return {
                "time": target_time.isoformat().replace("+00:00", "Z"),
                "expected_occupancy": round(expected, 1),
                "low": round(max(0.0, expected - band_width), 1),
                "high": round(min(100.0, expected + band_width), 1),
                "label": HeuristicForecastProvider._get_label(expected),
                "confidence_interval": round(band_width, 1),
                "source": "heuristic",
            }

        slices = {
            "now": compute_point(current_minute),
            "15m": compute_point(current_minute + datetime.timedelta(minutes=15)),
            "30m": compute_point(current_minute + datetime.timedelta(minutes=30)),
            "60m": compute_point(current_minute + datetime.timedelta(minutes=60)),
        }
        curve = [
            compute_point(current_minute + datetime.timedelta(minutes=offset_min))
            for offset_min in range(-60, 181, 30)
        ]
        return {
            "slices": slices,
            "curve": curve,
            "metadata": {
                "generated_at": now.isoformat().replace("+00:00", "Z"),
                "source": "heuristic",
                "traffic_multiplier": round(traffic_signal.multiplier, 3),
                "traffic_source": traffic_signal.source,
            },
        }

    def bootstrap_current_snapshot(
        self,
        lot_id: str,
        current_occupancy: int,
        capacity: int,
        should_seed: bool = True,
    ) -> Dict[str, Any]:
        """Build current + forecast payload used by occupancy bootstrap endpoints."""
        forecast = self.get_lot_forecast(
            lot_id=lot_id,
            current_occupancy=current_occupancy,
            capacity=capacity,
        )
        now_slice = (forecast.get("slices") or {}).get("now") or {}

        if should_seed and current_occupancy <= 0:
            predicted_rate = float(now_slice.get("expected_occupancy") or 0.0)
            seeded_count = min(capacity, max(0, round(capacity * (predicted_rate / 100.0))))
            source = "seeded_heuristic"
            count = seeded_count
        else:
            count = max(0, current_occupancy)
            source = "realtime"
            predicted_rate = (count / max(1, capacity)) * 100.0

        confidence = float(now_slice.get("confidence_interval") or 8.0)
        return {
            "current": {
                "count": int(min(capacity, max(0, count))),
                "occupancy_rate": round(_clamp(predicted_rate, 0.0, 100.0), 1),
                "source": source,
                "confidence_interval": round(confidence, 1),
            },
            "forecast": forecast,
        }

    @staticmethod
    def _temporal_prior(target_time: datetime.datetime) -> float:
        is_weekend = target_time.weekday() >= 5
        hour = target_time.hour
        if is_weekend:
            if 10 <= hour <= 17:
                return 36.0
            if 18 <= hour <= 21:
                return 24.0
            return 10.0
        if 7 <= hour <= 9:
            return 72.0
        if 10 <= hour <= 14:
            return 88.0
        if 15 <= hour <= 17:
            return 66.0
        if 18 <= hour <= 21:
            return 38.0
        return 8.0

    @staticmethod
    def _lot_multiplier(capacity: int, profile: LotProfile) -> float:
        multiplier = 1.0
        if profile.garage:
            multiplier += 0.08
        if capacity >= 800:
            multiplier += 0.06
        elif capacity <= 120:
            multiplier -= 0.07

        campus = profile.campus.lower()
        if "college" in campus:
            multiplier += 0.04
        elif "busch" in campus:
            multiplier += 0.02
        elif "cook" in campus or "douglass" in campus:
            multiplier -= 0.02
        return _clamp(multiplier, 0.82, 1.25)

    @staticmethod
    def _get_label(rate: float) -> str:
        if rate >= 85:
            return "full"
        if rate >= 60:
            return "high"
        if rate >= 25:
            return "medium"
        return "low"


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _load_lot_profiles() -> dict[str, LotProfile]:
    try:
        with LOT_DATA_PATH.open("r", encoding="utf-8") as file:
            payload = json.load(file)
    except Exception:
        return {}

    profiles: dict[str, LotProfile] = {}
    if not isinstance(payload, list):
        return profiles
    for item in payload:
        if not isinstance(item, dict):
            continue
        lot_id = str(item.get("mapId") or "").strip()
        if not lot_id:
            continue
        address = item.get("address") if isinstance(item.get("address"), dict) else {}
        campus = str(address.get("campus") or "default").strip() or "default"
        profiles[lot_id] = LotProfile(campus=campus, garage=bool(item.get("garage")))
    return profiles
