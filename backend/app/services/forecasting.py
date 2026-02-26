import datetime
import random
from typing import Dict, List, Any
from uuid import UUID
from app.services.forecast_provider import ForecastProvider

class HeuristicForecastProvider(ForecastProvider):
    def get_lot_forecast(self, lot_id: UUID, current_occupancy: int, capacity: int) -> Dict[str, Any]:
        """
        Computes a realistic heuristic forecast for a lot based on:
        - Time of day (Rush hour peaks)
        - Day of week (Weekend vs Weekday)
        - Current state (Momentum)
        """
        now = datetime.datetime.now()
        current_minute = now.replace(second=0, microsecond=0)
        
        # Deterministic seed for stability within the same hour
        random.seed(str(lot_id) + str(now.hour))
        
        is_weekend = now.weekday() >= 5
        base_rate = current_occupancy / max(1, capacity) * 100

        def get_profile_occupancy(target_time: datetime.datetime) -> float:
            hour = target_time.hour
            # Rutgers-style peak profile
            if is_weekend:
                if 10 <= hour <= 18: return 40.0
                return 15.0
            else:
                if 8 <= hour <= 10: return 85.0  # Morning rush
                if 11 <= hour <= 14: return 95.0 # Mid-day peak
                if 15 <= hour <= 17: return 70.0 # Afternoon
                if 18 <= hour <= 21: return 45.0 # Evening classes
                return 10.0 # Night
        
        def compute_point(target_time: datetime.datetime) -> Dict[str, Any]:
            # Blend current occupancy (momentum) with profile occupancy
            # Momentum fades the further out we go
            minutes_ahead = max(0, (target_time - now).total_seconds() / 60)
            momentum_weight = max(0, 1.0 - (minutes_ahead / 120.0)) # fades over 2 hours
            
            profile_val = get_profile_occupancy(target_time)
            
            # Weighted average
            expected = (base_rate * momentum_weight) + (profile_val * (1.0 - momentum_weight))
            
            # Add some "noise"
            variance = random.uniform(-5, 5)
            expected = max(2, min(99, expected + variance))
            
            # Confidence band: wider for further-out predictions
            band_width = 5 + (minutes_ahead * 0.15) # Grows by 9% per hour
            
            return {
                "time": target_time.isoformat(),
                "expected_occupancy": round(expected, 1),
                "low": round(max(0, expected - band_width), 1),
                "high": round(min(100, expected + band_width), 1),
                "label": HeuristicForecastProvider._get_label(expected)
            }

        # Key time slices
        slices = {
            "now": compute_point(current_minute),
            "15m": compute_point(current_minute + datetime.timedelta(minutes=15)),
            "30m": compute_point(current_minute + datetime.timedelta(minutes=30)),
            "60m": compute_point(current_minute + datetime.timedelta(minutes=60)),
        }

        # Extended curve (-1h to +3h)
        curve = []
        for offset_min in range(-60, 181, 30):
            t = current_minute + datetime.timedelta(minutes=offset_min)
            curve.append(compute_point(t))

        return {
            "slices": slices,
            "curve": curve,
            "metadata": {
                "is_weekend": is_weekend,
                "generated_at": now.isoformat()
            }
        }

    @staticmethod
    def _get_label(rate: float) -> str:
        if rate >= 85: return "full"
        if rate >= 60: return "high"
        if rate >= 25: return "medium"
        return "low"
