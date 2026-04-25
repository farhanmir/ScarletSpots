import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import httpx

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger(__name__)

# Default anchor points near Rutgers campuses for congestion probes.
DEFAULT_CAMPUS_POINTS: dict[str, tuple[float, float]] = {
    "busch": (40.5235, -74.4598),
    "livingston": (40.5230, -74.4375),
    "college ave": (40.5001, -74.4475),
    "cook": (40.4828, -74.4358),
    "douglass": (40.4846, -74.4307),
    "camden": (39.9436, -75.1196),
    "newark": (40.7424, -74.1744),
    "default": (40.5001, -74.4475),
}


@dataclass(frozen=True)
class TrafficSignal:
    multiplier: float
    source: str
    fetched_at_epoch_ms: int


class TrafficProvider(ABC):
    @abstractmethod
    def get_multiplier(self, latitude: float, longitude: float) -> Optional[float]:
        """Return occupancy multiplier derived from traffic conditions."""


class NullTrafficProvider(TrafficProvider):
    def get_multiplier(self, latitude: float, longitude: float) -> Optional[float]:
        _ = (latitude, longitude)
        return 1.0


class TomTomTrafficProvider(TrafficProvider):
    def __init__(self, api_key: str, timeout_seconds: float = 2.5):
        self._api_key = api_key.strip()
        self._timeout_seconds = timeout_seconds

    def get_multiplier(self, latitude: float, longitude: float) -> Optional[float]:
        if not self._api_key:
            return None
        url = (
            "https://api.tomtom.com/traffic/services/4/flowSegmentData/"
            "relative0/10/json"
        )
        params = {
            "point": f"{latitude},{longitude}",
            "unit": "KMPH",
            "openLr": "false",
            "key": self._api_key,
        }
        try:
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.get(url, params=params)
                response.raise_for_status()
                payload = response.json()
            segment = payload.get("flowSegmentData") or {}
            current_speed = float(segment.get("currentSpeed") or 0.0)
            free_flow_speed = float(segment.get("freeFlowSpeed") or 0.0)
            if free_flow_speed <= 0:
                return None

            # Congestion ratio -> occupancy multiplier:
            # slower than free-flow implies more incoming demand pressure.
            congestion_ratio = 1.0 - max(0.0, min(1.0, current_speed / free_flow_speed))
            multiplier = 1.0 + congestion_ratio * 0.3
            return max(0.85, min(1.25, multiplier))
        except Exception as exc:
            log.debug("TomTom traffic lookup failed: %s", exc)
            return None


class TrafficSignalService:
    def __init__(
        self,
        provider: Optional[TrafficProvider] = None,
        ttl_seconds: Optional[int] = None,
    ):
        self._provider = provider or _build_provider()
        self._ttl_seconds = max(15, ttl_seconds or settings.TRAFFIC_CACHE_TTL_SECONDS)
        self._cache: Dict[str, Tuple[float, float]] = {}
        self._source_name = settings.TRAFFIC_PROVIDER.lower().strip() or "none"

    def get_signal_for_campus(self, campus: str | None) -> TrafficSignal:
        key = (campus or "default").strip().lower()
        now = time.time()
        cached = self._cache.get(key)
        if cached and (now - cached[1]) <= self._ttl_seconds:
            return TrafficSignal(
                multiplier=cached[0],
                source=self._source_name if self._source_name != "none" else "neutral",
                fetched_at_epoch_ms=int(cached[1] * 1000),
            )

        latitude, longitude = DEFAULT_CAMPUS_POINTS.get(
            key, DEFAULT_CAMPUS_POINTS["default"]
        )
        multiplier = self._provider.get_multiplier(latitude, longitude)
        if multiplier is None:
            multiplier = 1.0
            source = "neutral"
        else:
            source = self._source_name if self._source_name != "none" else "neutral"

        self._cache[key] = (multiplier, now)
        return TrafficSignal(
            multiplier=multiplier,
            source=source,
            fetched_at_epoch_ms=int(now * 1000),
        )


def _build_provider() -> TrafficProvider:
    provider_name = (settings.TRAFFIC_PROVIDER or "none").lower().strip()
    if provider_name == "tomtom":
        return TomTomTrafficProvider(api_key=settings.TOMTOM_API_KEY)
    return NullTrafficProvider()
