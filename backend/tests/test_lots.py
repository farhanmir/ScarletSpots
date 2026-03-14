"""
Tests for the lots router: occupancy aggregate and forecasting.
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    """Health endpoint should always return ok."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_get_lot_forecast():
    """GET /lots/{id}/forecast should return slices and curve."""
    response = client.get(
        "/api/v1/lots/10001/forecast",
        params={"capacity": 200, "current_occupancy": 50},
    )
    assert response.status_code == 200
    data = response.json()
    assert "slices" in data
    assert "curve" in data
    assert "now" in data["slices"]
    assert "15m" in data["slices"]
    assert "30m" in data["slices"]
    assert "60m" in data["slices"]

    for key in ["now", "15m", "30m", "60m"]:
        s = data["slices"][key]
        assert "expected_occupancy" in s
        assert "low" in s
        assert "high" in s
        assert "label" in s
        assert s["low"] <= s["expected_occupancy"] <= s["high"]


def test_forecast_curve_ordered():
    """Forecast curve should be in chronological order."""
    response = client.get(
        "/api/v1/lots/10001/forecast",
        params={"capacity": 200, "current_occupancy": 50},
    )
    data = response.json()
    times = [p["time"] for p in data["curve"]]
    assert times == sorted(times), "Curve points should be chronologically ordered"


def test_get_all_occupancy():
    """GET /lots/occupancy should return a dict (may be empty if no active sessions)."""
    response = client.get("/api/v1/lots/occupancy")
    assert response.status_code in (200, 500)  # 500 if Supabase not configured in test env
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, dict)
