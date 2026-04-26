import datetime
import json
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
    student: bool
    employee: bool
    profile_type: str


PROFILE_OVERRIDES: dict[str, str] = {
    "10092": "garage_core",  # Public Safety Deck
    "10235": "garage_core",  # Livingston Deck
    "10201": "weekend_light",  # Plum Street Deck
    "10202": "weekend_light",  # Paterson St Deck
    "10214": "weekend_light",  # Wellness Plaza Deck
}

PROFILE_CURVES: dict[str, dict[str, list[float]]] = {
    "commuter_peak": {
        "weekday": [
            5, 5, 5, 5, 8, 20, 45, 70, 84, 90, 86, 82,
            78, 75, 72, 68, 60, 45, 30, 20, 14, 10, 8, 6,
        ],
        "weekend": [
            4, 4, 4, 4, 5, 8, 12, 18, 24, 30, 34, 38,
            40, 40, 38, 34, 28, 22, 18, 14, 10, 8, 6, 5,
        ],
    },
    "garage_core": {
        "weekday": [
            10, 10, 10, 10, 12, 18, 30, 45, 58, 68, 74, 78,
            80, 78, 76, 74, 70, 62, 54, 46, 38, 28, 18, 12,
        ],
        "weekend": [
            8, 8, 8, 8, 10, 12, 18, 26, 36, 44, 50, 56,
            60, 60, 56, 52, 48, 44, 38, 30, 24, 18, 12, 10,
        ],
    },
    "resident": {
        "weekday": [
            55, 54, 53, 52, 50, 46, 40, 34, 30, 28, 26, 25,
            24, 24, 25, 28, 34, 42, 50, 58, 64, 68, 70, 64,
        ],
        "weekend": [
            62, 62, 60, 58, 56, 52, 48, 44, 40, 38, 36, 34,
            34, 34, 36, 40, 46, 54, 60, 66, 70, 72, 72, 68,
        ],
    },
    "weekend_light": {
        "weekday": [
            8, 8, 8, 8, 10, 12, 18, 26, 32, 36, 38, 40,
            42, 42, 40, 36, 30, 24, 20, 16, 12, 10, 9, 8,
        ],
        "weekend": [
            4, 4, 4, 4, 5, 6, 8, 12, 18, 22, 24, 26,
            28, 28, 26, 24, 22, 18, 14, 10, 8, 6, 5, 4,
        ],
    },
}


class HeuristicForecastProvider(ForecastProvider):
    def __init__(self, traffic_service: TrafficSignalService | None = None):
        self._traffic_service = traffic_service or TrafficSignalService()
        self._profiles = _load_lot_profiles()

    def get_lot_forecast(
        self, lot_id: str, current_occupancy: int, capacity: int
    ) -> Dict[str, Any]:
        now = datetime.datetime.now(datetime.timezone.utc)
        current_minute = now.replace(second=0, microsecond=0)
        current_state = self.describe_current_state(
            lot_id=lot_id,
            current_occupancy=current_occupancy,
            capacity=capacity,
        )
        profile = self._profiles.get(
            lot_id,
            LotProfile(
                campus="default",
                garage=False,
                student=False,
                employee=False,
                profile_type="commuter_peak",
            ),
        )
        traffic_signal = self._traffic_service.get_signal_for_campus(profile.campus)
        traffic_multiplier = self._traffic_adjustment(traffic_signal.multiplier)
        base_rate = float(current_state["occupancy_rate"])
        signal_strength = str(current_state["signal_strength"])
        mode = "observed_informed" if signal_strength == "strong" else "pattern_based"

        def compute_point(target_time: datetime.datetime) -> Dict[str, Any]:
            minutes_ahead = max(0.0, (target_time - now).total_seconds() / 60.0)
            if signal_strength == "strong":
                momentum_weight = max(0.2, 1.0 - (minutes_ahead / 150.0))
            elif signal_strength == "sparse":
                momentum_weight = max(0.05, 0.35 - (minutes_ahead / 240.0))
            else:
                momentum_weight = 0.0

            typical_rate = self._typical_rate(
                target_time=target_time,
                capacity=capacity,
                profile=profile,
                traffic_multiplier=traffic_multiplier,
            )
            expected = (base_rate * momentum_weight) + (
                typical_rate * (1.0 - momentum_weight)
            )
            expected = _clamp(expected, 0.0, 100.0)
            band_width = 5.0 + (minutes_ahead * 0.14)
            if signal_strength == "none":
                band_width += 4.0
            elif signal_strength == "sparse":
                band_width += 2.0

            return {
                "time": target_time.isoformat().replace("+00:00", "Z"),
                "expected_occupancy": round(expected, 1),
                "low": round(max(0.0, expected - band_width), 1),
                "high": round(min(100.0, expected + band_width), 1),
                "label": HeuristicForecastProvider._get_label(expected),
                "confidence_interval": round(band_width, 1),
                "source": mode,
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
                "mode": mode,
                "current_source": current_state["source"],
                "signal_strength": current_state["signal_strength"],
                "confidence": current_state["confidence"],
                "profile_type": profile.profile_type,
                "traffic_multiplier": round(traffic_multiplier, 3),
                "traffic_source": traffic_signal.source,
            },
        }

    def describe_current_state(
        self,
        lot_id: str,
        current_occupancy: int,
        capacity: int,
    ) -> Dict[str, Any]:
        """Classify observed vs typical signal for pre-launch occupancy output."""
        now = datetime.datetime.now(datetime.timezone.utc).replace(second=0, microsecond=0)
        profile = self._profiles.get(
            lot_id,
            LotProfile(
                campus="default",
                garage=False,
                student=False,
                employee=False,
                profile_type="commuter_peak",
            ),
        )
        traffic_signal = self._traffic_service.get_signal_for_campus(profile.campus)
        traffic_multiplier = self._traffic_adjustment(traffic_signal.multiplier)

        observed_count = int(min(capacity, max(0, current_occupancy)))
        observed_rate = (observed_count / max(1, capacity)) * 100.0
        typical_rate = self._typical_rate(
            target_time=now,
            capacity=capacity,
            profile=profile,
            traffic_multiplier=traffic_multiplier,
        )
        typical_count = int(min(capacity, max(0, round(capacity * (typical_rate / 100.0)))))
        sparse_limit = max(3, round(capacity * 0.02))

        if observed_count <= 0:
            source = "typical_pattern"
            confidence = "low"
            signal_strength = "none"
            display_mode = "pattern"
            count = typical_count
            predicted_rate = typical_rate
        elif observed_count <= sparse_limit:
            source = "mixed"
            confidence = "medium"
            signal_strength = "sparse"
            display_mode = "pattern"
            predicted_rate = (typical_rate * 0.7) + (observed_rate * 0.3)
            count = int(min(capacity, max(0, round(capacity * (predicted_rate / 100.0)))))
        else:
            source = "observed"
            confidence = "high"
            signal_strength = "strong"
            display_mode = "live"
            count = observed_count
            predicted_rate = observed_rate

        confidence_interval = 12.0 if signal_strength == "none" else 9.0 if signal_strength == "sparse" else 5.0
        return {
            "count": int(min(capacity, max(0, count))),
            "occupancy_rate": round(_clamp(predicted_rate, 0.0, 100.0), 1),
            "observed_count": observed_count,
            "observed_occupancy_rate": round(_clamp(observed_rate, 0.0, 100.0), 1),
            "typical_count": typical_count,
            "typical_occupancy_rate": round(_clamp(typical_rate, 0.0, 100.0), 1),
            "source": source,
            "confidence": confidence,
            "signal_strength": signal_strength,
            "display_mode": display_mode,
            "confidence_interval": confidence_interval,
            "profile_type": profile.profile_type,
        }

    def bootstrap_current_snapshot(
        self,
        lot_id: str,
        current_occupancy: int,
        capacity: int,
        should_seed: bool = True,
        prefer_heuristic_for_sparse_realtime: bool = False,
        sparse_realtime_max_ratio: float = 0.015,
    ) -> Dict[str, Any]:
        """Build current + forecast payload used by occupancy bootstrap endpoints."""
        _ = (should_seed, prefer_heuristic_for_sparse_realtime, sparse_realtime_max_ratio)
        current = self.describe_current_state(
            lot_id=lot_id,
            current_occupancy=current_occupancy,
            capacity=capacity,
        )
        forecast = self.get_lot_forecast(
            lot_id=lot_id,
            current_occupancy=current_occupancy,
            capacity=capacity,
        )
        return {"current": current, "forecast": forecast}

    def _typical_rate(
        self,
        target_time: datetime.datetime,
        capacity: int,
        profile: LotProfile,
        traffic_multiplier: float,
    ) -> float:
        curve = PROFILE_CURVES.get(profile.profile_type) or PROFILE_CURVES["commuter_peak"]
        day_key = "weekend" if target_time.weekday() >= 5 else "weekday"
        base_rate = curve[day_key][target_time.hour]
        capacity_bias = 1.0
        if capacity >= 800:
            capacity_bias += 0.05
        elif capacity <= 120:
            capacity_bias -= 0.05
        if "college" in profile.campus.lower():
            capacity_bias += 0.03
        elif "cook" in profile.campus.lower() or "douglass" in profile.campus.lower():
            capacity_bias -= 0.03
        return _clamp(base_rate * capacity_bias * traffic_multiplier, 1.0, 99.0)

    @staticmethod
    def _traffic_adjustment(multiplier: float) -> float:
        # Traffic is only a weak context feature pre-launch; never let it dominate.
        damped = 1.0 + ((multiplier - 1.0) * 0.35)
        return _clamp(damped, 0.94, 1.08)

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
        garage = bool(item.get("garage"))
        student = bool(item.get("student"))
        employee = bool(item.get("employee"))
        profile_type = _choose_profile_type(
            lot_id=lot_id,
            campus=campus,
            garage=garage,
            student=student,
            employee=employee,
            capacity=int(item.get("totalSpaces") or 0),
        )
        profiles[lot_id] = LotProfile(
            campus=campus,
            garage=garage,
            student=student,
            employee=employee,
            profile_type=profile_type,
        )
    return profiles


def _choose_profile_type(
    lot_id: str,
    campus: str,
    garage: bool,
    student: bool,
    employee: bool,
    capacity: int,
) -> str:
    override = PROFILE_OVERRIDES.get(lot_id)
    if override:
        return override
    campus_key = campus.lower()
    if garage:
        return "garage_core"
    if "health" in campus_key or "camden" in campus_key or "newark" in campus_key:
        return "weekend_light"
    if "cook" in campus_key or "douglass" in campus_key:
        if student and not employee and capacity <= 250:
            return "resident"
        return "weekend_light"
    if student and not employee:
        return "commuter_peak"
    if not student and not employee:
        return "weekend_light"
    return "commuter_peak"
