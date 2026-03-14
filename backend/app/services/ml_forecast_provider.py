"""
ML Forecast Provider — Statistical occupancy forecasting.

Uses a per-lot gradient boosting model trained on historical parking_sessions
data grouped by lot × hour × day_of_week.

Lifecycle:
  1. Training: run `python -m app.services.train_forecast_model` from backend/
     This queries the Supabase DB, builds models, and serializes them to
     app/services/forecast_models/{lot_id}.joblib

  2. Serving: MLForecastProvider loads the model for a requested lot_id.
     Falls back to HeuristicForecastProvider if no model exists yet.

The provider is wired in lots.py via dependency injection. The switch from
heuristic → ML happens automatically once a model file exists for a lot.
"""

import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from app.core.logger import get_logger
from app.services.forecast_provider import ForecastProvider
from app.services.forecasting import HeuristicForecastProvider

log = get_logger(__name__)

MODELS_DIR = Path(__file__).parent / "forecast_models"
MIN_CONFIDENCE_SAMPLES = 50  # Minimum training samples before we trust the model


class MLForecastProvider(ForecastProvider):
    """
    Serves forecasts from pre-trained scikit-learn models.
    Falls back to HeuristicForecastProvider when no model is available.
    """

    def __init__(self):
        self._cache: Dict[str, Any] = {}
        self._fallback = HeuristicForecastProvider()

    def _load_model(self, lot_id: str) -> Optional[Any]:
        """Load a model from disk, caching it in memory."""
        if lot_id in self._cache:
            return self._cache[lot_id]

        model_path = MODELS_DIR / f"{lot_id}.joblib"
        if not model_path.exists():
            return None

        try:
            import joblib  # type: ignore

            model = joblib.load(model_path)
            self._cache[lot_id] = model
            log.info("Loaded ML forecast model for lot %s", lot_id)
            return model
        except Exception as exc:
            log.warning("Failed to load model for lot %s: %s", lot_id, exc)
            return None

    def get_lot_forecast(
        self, lot_id: str, current_occupancy: int, capacity: int
    ) -> Dict[str, Any]:
        model = self._load_model(lot_id)

        if model is None:
            # No model trained yet — fall back to heuristic
            return self._fallback.get_lot_forecast(lot_id, current_occupancy, capacity)

        now = datetime.datetime.now()
        current_minute = now.replace(second=0, microsecond=0)

        def predict_at(target: datetime.datetime) -> Dict[str, Any]:
            import numpy as np  # type: ignore

            features = np.array(
                [
                    [
                        target.hour,
                        target.weekday(),
                        target.month,
                        current_occupancy,
                        capacity,
                        max(0, (target - now).total_seconds() / 60),  # minutes_ahead
                    ]
                ]
            )
            try:
                pred_ratio = float(model.predict(features)[0])
                pred_pct = max(0.0, min(100.0, pred_ratio * 100))
            except Exception:
                pred_pct = (current_occupancy / max(1, capacity)) * 100

            minutes_ahead = max(0, (target - now).total_seconds() / 60)
            band = 5 + minutes_ahead * 0.12
            return {
                "time": target.isoformat(),
                "expected_occupancy": round(pred_pct, 1),
                "low": round(max(0.0, pred_pct - band), 1),
                "high": round(min(100.0, pred_pct + band), 1),
                "label": _label(pred_pct),
                "source": "ml",
            }

        slices = {
            "now": predict_at(current_minute),
            "15m": predict_at(current_minute + datetime.timedelta(minutes=15)),
            "30m": predict_at(current_minute + datetime.timedelta(minutes=30)),
            "60m": predict_at(current_minute + datetime.timedelta(minutes=60)),
        }

        curve = [
            predict_at(current_minute + datetime.timedelta(minutes=offset))
            for offset in range(-60, 181, 30)
        ]

        return {
            "slices": slices,
            "curve": curve,
            "metadata": {
                "is_weekend": now.weekday() >= 5,
                "generated_at": now.isoformat(),
                "source": "ml",
            },
        }


def _label(rate: float) -> str:
    if rate >= 85:
        return "full"
    if rate >= 60:
        return "high"
    if rate >= 25:
        return "medium"
    return "low"
