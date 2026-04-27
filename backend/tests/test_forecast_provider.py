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
    assert "soc_enabled" in forecast["metadata"]
    assert "soc_multiplier" in forecast["metadata"]

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
    assert forecast["metadata"]["mode"] in {"pattern_based", "observed_informed"}

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
    assert current["source"] == "typical_pattern"
    assert current["display_mode"] == "pattern"
    assert current["confidence"] == "low"
    assert 0 <= current["count"] <= 250
    assert 0 <= current["occupancy_rate"] <= 100


def test_bootstrap_snapshot_marks_sparse_signal_as_mixed():
    provider = HeuristicForecastProvider()
    payload = provider.bootstrap_current_snapshot(
        lot_id="10001",
        current_occupancy=2,
        capacity=250,
        should_seed=True,
    )
    current = payload["current"]
    assert current["source"] == "mixed"
    assert current["display_mode"] == "pattern"
    assert current["observed_count"] == 2


def test_bootstrap_snapshot_marks_strong_signal_as_observed():
    provider = HeuristicForecastProvider()
    payload = provider.bootstrap_current_snapshot(
        lot_id="10001",
        current_occupancy=42,
        capacity=250,
        should_seed=True,
    )
    current = payload["current"]
    assert current["source"] == "observed"
    assert current["display_mode"] == "live"
    assert current["count"] == 42


def test_forecast_is_stable_for_same_input():
    provider = HeuristicForecastProvider()
    first = provider.get_lot_forecast("10001", current_occupancy=0, capacity=250)
    second = provider.get_lot_forecast("10001", current_occupancy=0, capacity=250)
    assert first["slices"]["now"]["expected_occupancy"] == second["slices"]["now"]["expected_occupancy"]


def test_soc_multiplier_is_bounded():
    provider = HeuristicForecastProvider()
    forecast = provider.get_lot_forecast("10001", current_occupancy=10, capacity=250)
    multiplier = float(forecast["metadata"]["soc_multiplier"])
    assert 0.8 <= multiplier <= 1.25
