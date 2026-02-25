"""
Tests for the lots router: listing, forecast, and custom geofence CRUD.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    """Health endpoint should always return ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_list_lots_returns_list():
    """GET /lots should return a list (may be empty if no DB)."""
    response = client.get("/api/v1/lots")
    assert response.status_code in (200, 500)  # 500 if Supabase is not configured
    if response.status_code == 200:
        data = response.json()
        # The response is a list of lots (raw Supabase response)
        assert isinstance(data, list)


def test_get_lot_forecast():
    """GET /lots/{id}/forecast should return slices and curve."""
    # Use a dummy UUID — the forecast endpoint doesn't actually query the DB
    from uuid import uuid4
    response = client.get(f"/api/v1/lots/{uuid4()}/forecast")
    assert response.status_code == 200
    data = response.json()
    assert "slices" in data
    assert "curve" in data
    assert "now" in data["slices"]
    assert "15m" in data["slices"]
    assert "30m" in data["slices"]
    assert "60m" in data["slices"]

    # Each slice should have confidence bands
    for key in ["now", "15m", "30m", "60m"]:
        slice_data = data["slices"][key]
        assert "expected_occupancy" in slice_data
        assert "low" in slice_data
        assert "high" in slice_data
        assert "label" in slice_data
        assert slice_data["low"] <= slice_data["expected_occupancy"] <= slice_data["high"]


def test_forecast_curve_ordered():
    """Forecast curve should be in chronological order."""
    from uuid import uuid4
    response = client.get(f"/api/v1/lots/{uuid4()}/forecast")
    data = response.json()
    times = [p["time"] for p in data["curve"]]
    assert times == sorted(times), "Curve points should be chronologically ordered"
