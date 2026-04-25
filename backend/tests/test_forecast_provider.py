from app.services.forecasting import HeuristicForecastProvider


def test_heuristic_forecast_provider():
    provider = HeuristicForecastProvider()
    lot_id = "10001"  # lot_id is now a TEXT string (JSON mapId), not a UUID

    # Test that the forecast is generated with correct structure
    forecast = provider.get_lot_forecast(lot_id, current_occupancy=50, capacity=100)

    # Check top level keys
    assert "slices" in forecast
    assert "curve" in forecast
    assert "metadata" in forecast

    # Check slices
    slices = forecast["slices"]
    assert "now" in slices
    assert "15m" in slices
    assert "30m" in slices
    assert "60m" in slices

    # Check structure of a point
    point = slices["now"]
    assert "time" in point
    assert "expected_occupancy" in point
    assert "low" in point
    assert "high" in point
    assert "label" in point

    # Check curve length
    curve = forecast["curve"]
    assert len(curve) > 0

    # Test label generation logic
    assert provider._get_label(90) == "full"
    assert provider._get_label(70) == "high"
    assert provider._get_label(40) == "medium"
    assert provider._get_label(10) == "low"


def test_bootstrap_snapshot_seeds_when_empty():
    provider = HeuristicForecastProvider()
    payload = provider.bootstrap_current_snapshot(
        lot_id="10001",
        current_occupancy=0,
        capacity=250,
        should_seed=True,
    )
    current = payload["current"]
    assert current["source"] == "seeded_heuristic"
    assert 0 <= current["count"] <= 250
    assert 0 <= current["occupancy_rate"] <= 100


def test_bootstrap_snapshot_keeps_realtime_count_when_present():
    provider = HeuristicForecastProvider()
    payload = provider.bootstrap_current_snapshot(
        lot_id="10001",
        current_occupancy=42,
        capacity=250,
        should_seed=True,
    )
    current = payload["current"]
    assert current["source"] == "realtime"
    assert current["count"] == 42
