"""
Tests for the lots router: occupancy aggregate and forecasting.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.attestation import require_high_value_access
from app.core.security import get_current_user
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _override_auth():
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id="00000000-0000-0000-0000-000000000123"
    )
    app.dependency_overrides[require_high_value_access] = lambda: {
        "allowed": True,
        "reason": "test",
    }
    yield
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_high_value_access, None)


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
    assert data["current"]["source"] in {"typical_pattern", "mixed", "observed"}
    assert data["metadata"]["mode"] in {"pattern_based", "observed_informed"}


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
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    rows = data.get("occupancy") or []
    if rows:
        sample = rows[0]
        assert "lot_id" in sample
        assert "count" in sample
        assert "source" in sample
        assert "observed_count" in sample
        assert "confidence" in sample
        assert "signal_strength" in sample
        assert "display_mode" in sample
        assert "confidence_interval" in sample


def test_get_all_occupancy_returns_pattern_rows_when_no_realtime_data():
    response = client.get("/api/v1/lots/occupancy")
    assert response.status_code == 200
    rows = response.json().get("occupancy") or []
    assert any(
        row.get("source") == "typical_pattern" and row.get("display_mode") == "pattern"
        for row in rows
    )
