"""
Parking lots router.

Lot metadata (names, polygons, capacity) lives in the mobile app's bundled
rutgers_parking_data.json — no database table required.

This router only handles:
  1. Forecasting  — GET /lots/{lot_id}/forecast
  2. Occupancy    — GET /lots/occupancy  (aggregate for all lots)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_cache.decorator import cache as fastapi_cache
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logger import get_logger
from app.models.parking import LotOccupancy
from app.services.forecast_provider import ForecastProvider
from app.services.ml_forecast_provider import MLForecastProvider

log = get_logger(__name__)

router = APIRouter(prefix="/lots", tags=["lots"])

# Singleton — model files are cached in memory once loaded
_ml_provider = MLForecastProvider()


def _get_forecast_provider() -> ForecastProvider:
    return _ml_provider


@router.get("/occupancy")
@fastapi_cache(expire=30)
async def get_all_occupancy(db: AsyncSession = Depends(get_db)):
    """Return current occupancy counts for all lots from the lot_occupancy table."""
    try:
        rows = (await db.execute(select(LotOccupancy))).scalars().all()
        return {
            "occupancy": [
                {
                    "lot_id": row.lot_id,
                    "count": row.count,
                    "updated_at": row.updated_at,
                }
                for row in rows
            ]
        }
    except Exception as exc:
        log.error("Failed to fetch occupancy: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch occupancy")


@router.get("/{lot_id}/forecast")
def get_lot_forecast(
    lot_id: str,
    capacity: int = Query(default=100, ge=0, description="Total lot capacity (from bundled JSON)"),
    current_occupancy: int = Query(default=0, ge=0, description="Current occupied count"),
    provider: ForecastProvider = Depends(_get_forecast_provider),
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
        forecast = provider.get_lot_forecast(lot_id, current_occupancy, capacity)
        return forecast
    except Exception as exc:
        log.error("Forecast failed for lot %s: %s", lot_id, exc)
        raise HTTPException(status_code=500, detail="Failed to generate forecast")
@router.post("/{lot_id}/vulture")
async def report_vulture_event(
    lot_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Report a 'vulture' event (searching/circling behavior detected natively).
    This serves as a high-fidelity observation channel for the occupancy inference engine.
    """
    try:
        # For now, we'll log this as a metric. 
        # Future: Store in a 'parking_observations' table for the inference model.
        log.info("Vulture event detected for lot %s", lot_id)
        return {"status": "ok", "message": "Observation recorded"}
    except Exception as exc:
        log.error("Failed to record vulture event for lot %s: %s", lot_id, exc)
        raise HTTPException(status_code=500, detail="Failed to record observation")
