import datetime as dt

from app.services.soc_ingestion import SOCClassEvent, build_lot_pressure_buckets


def test_build_lot_pressure_buckets_uses_text_lot_ids():
    events = [
        SOCClassEvent(
            building_name="Academic Building",
            starts_at=dt.datetime(2026, 4, 27, 14, 0, tzinfo=dt.timezone.utc),
            ends_at=dt.datetime(2026, 4, 27, 14, 40, tzinfo=dt.timezone.utc),
            expected_attendance=1200,
        )
    ]
    mapping = {"Academic Building": {"10001": 0.6, "10002": 0.4}}
    pressure = build_lot_pressure_buckets(events, mapping, bucket_minutes=5)
    assert "10001" in pressure
    assert "10002" in pressure
    assert all(isinstance(bucket, int) for bucket in pressure["10001"].keys())
