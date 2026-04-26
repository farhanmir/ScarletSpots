"""
Parking lots router.

Lot metadata (names, polygons, capacity) lives in the mobile app's bundled
rutgers_parking_data.json — no database table required.

This router only handles:
  1. Forecasting  — GET /lots/{lot_id}/forecast
  2. Occupancy    — GET /lots/occupancy  (aggregate for all lots)
"""

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi_cache.decorator import cache as fastapi_cache
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.limiter import limiter
from app.core.logger import get_logger
from app.core.attestation import require_high_value_access
from app.core.security import get_current_user
from app.models.parking import LotOccupancy
from app.services.forecast_provider import ForecastProvider
from app.services.forecasting import HeuristicForecastProvider
from app.services.ml_forecast_provider import MLForecastProvider

log = get_logger(__name__)

router = APIRouter(prefix="/lots", tags=["lots"])


def _load_lot_capacities() -> dict[str, int]:
    lot_data_path = Path(__file__).parent.parent / "services" / "rutgers_parking_data.json"
    try:
        with lot_data_path.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except Exception:
        return {}
    capacities: dict[str, int] = {}
    if not isinstance(payload, list):
        return capacities
    for lot in payload:
        if not isinstance(lot, dict):
            continue
        lot_id = str(lot.get("mapId") or "").strip()
        if not lot_id:
            continue
        try:
            capacity = int(lot.get("totalSpaces") or 0)
        except Exception:
            capacity = 0
        if capacity > 0:
            capacities[lot_id] = capacity
    return capacities


# Singleton — model files are cached in memory once loaded
_ml_provider = MLForecastProvider()
_heuristic_provider = HeuristicForecastProvider()
_lot_capacities = _load_lot_capacities()


def _get_forecast_provider() -> ForecastProvider:
    return _ml_provider


@router.get("/occupancy")
@limiter.limit("60/minute")
@fastapi_cache(expire=30)
async def get_all_occupancy(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
    __=Depends(require_high_value_access),
):
    """Return current occupancy counts for all lots from the lot_occupancy table."""
    try:
        rows = (await db.execute(select(LotOccupancy))).scalars().all()
        by_lot = {row.lot_id: row for row in rows}
        occupancy_payload = []

        for lot_id, capacity in _lot_capacities.items():
            row = by_lot.get(lot_id)
            observed_count = int(row.count) if row else 0
            should_seed = settings.ENABLE_HEURISTIC_SEEDED_OCCUPANCY and observed_count <= 0
            bootstrap = _heuristic_provider.bootstrap_current_snapshot(
                lot_id=lot_id,
                current_occupancy=observed_count,
                capacity=capacity,
                should_seed=should_seed,
                prefer_heuristic_for_sparse_realtime=settings.PREFER_HEURISTIC_FOR_SPARSE_REALTIME,
                sparse_realtime_max_ratio=settings.SPARSE_REALTIME_MAX_RATIO,
            )
            current = bootstrap["current"]
            occupancy_payload.append(
                {
                    "lot_id": lot_id,
                    "count": current["count"],
                    "occupancy_rate": current["occupancy_rate"],
                    "observed_count": current["observed_count"],
                    "observed_occupancy_rate": current["observed_occupancy_rate"],
                    "typical_count": current["typical_count"],
                    "typical_occupancy_rate": current["typical_occupancy_rate"],
                    "source": current["source"],
                    "confidence": current["confidence"],
                    "signal_strength": current["signal_strength"],
                    "display_mode": current["display_mode"],
                    "confidence_interval": current["confidence_interval"],
                    "updated_at": row.updated_at if row else None,
                }
            )

        # Preserve lots that exist in DB but are missing from bundled metadata.
        known_lot_ids = set(_lot_capacities.keys())
        for row in rows:
            if row.lot_id in known_lot_ids:
                continue
            occupancy_payload.append(
                {
                    "lot_id": row.lot_id,
                    "count": row.count,
                    "occupancy_rate": None,
                    "observed_count": row.count,
                    "observed_occupancy_rate": None,
                    "typical_count": None,
                    "typical_occupancy_rate": None,
                    "source": "observed",
                    "confidence": "high",
                    "signal_strength": "strong",
                    "display_mode": "live",
                    "confidence_interval": 0.05,
                    "updated_at": row.updated_at,
                }
            )

        return {"occupancy": occupancy_payload}
    except Exception as exc:
        log.error("Failed to fetch occupancy: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch occupancy")


@router.get("/{lot_id}/forecast")
@limiter.limit("45/minute")
def get_lot_forecast(
    request: Request,
    lot_id: str,
    capacity: int = Query(default=100, ge=0, description="Total lot capacity (from bundled JSON)"),
    current_occupancy: int = Query(default=0, ge=0, description="Current occupied count"),
    provider: ForecastProvider = Depends(_get_forecast_provider),
    _=Depends(get_current_user),
    __=Depends(require_high_value_access),
):
    """
    Predictive occupancy forecast for a parking lot.

    The lot's capacity and current occupancy are passed as query params
    (sourced from the mobile app's bundled JSON + live lot_occupancy table)
    so the backend does not need to query a parking_lots table.

    Returns time slices (now, +15m, +30m, +60m) and a 3-hour extended curve.
    """
    if capacity == 0:
        # Lot has no capacity data — return a neutral empty forecast rather
        # than a 422 that shows up as a console error on the client.
        return {"slices": [], "curve": []}
    try:
        current_state = _heuristic_provider.describe_current_state(
            lot_id=lot_id,
            current_occupancy=current_occupancy,
            capacity=capacity,
        )
        forecast = provider.get_lot_forecast(lot_id, current_occupancy, capacity)
        return {
            "current": {
                "count": current_state["count"],
                "occupancy_rate": current_state["occupancy_rate"],
                "observed_count": current_state["observed_count"],
                "observed_occupancy_rate": current_state["observed_occupancy_rate"],
                "typical_count": current_state["typical_count"],
                "typical_occupancy_rate": current_state["typical_occupancy_rate"],
                "source": current_state["source"],
                "confidence": current_state["confidence"],
                "signal_strength": current_state["signal_strength"],
                "display_mode": current_state["display_mode"],
            },
            "forecast": forecast,
            **forecast,
        }
    except Exception as exc:
        log.error("Forecast failed for lot %s: %s", lot_id, exc)
        raise HTTPException(status_code=500, detail="Failed to generate forecast")


@router.post("/{lot_id}/vulture")
async def report_vulture_event(
    lot_id: str,
    _: str = Depends(get_current_user),
):
    """
    Report a 'vulture' event (searching/circling behavior detected natively).
    Requires authentication to prevent log-noise spam.
    Future: Store in a 'parking_observations' table for the inference model.
    """
    try:
        log.info("Vulture event detected for lot %s", lot_id)
        return {"status": "ok", "message": "Observation recorded"}
    except Exception as exc:
        log.error("Failed to record vulture event for lot %s: %s", lot_id, exc)
        raise HTTPException(status_code=500, detail="Failed to record observation")
