import datetime as dt

from app.services.soc_ingestion import (
    SOCClassEvent,
    build_campus_building_to_lot_weights,
    build_lot_pressure_buckets,
    parse_rutgers_soc_courses_payload,
)


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


def test_parse_rutgers_soc_payload_builds_events():
    payload = [
        {
            "sections": [
                {
                    "meetingTimes": [
                        {
                            "campusAbbrev": "CAC",
                            "buildingCode": "SC",
                            "meetingDay": "M",
                            "startTimeMilitary": "1930",
                            "endTimeMilitary": "2050",
                            "meetingModeDesc": "LEC",
                        }
                    ]
                }
            ]
        }
    ]
    events = parse_rutgers_soc_courses_payload(payload)
    assert len(events) == 1
    assert events[0].building_name == "CAC:SC"
    assert events[0].expected_attendance > 0
    assert events[0].ends_at > events[0].starts_at


def test_build_campus_mapping_weights_sum_to_one():
    mapping = build_campus_building_to_lot_weights(
        building_keys=["CAC:SC"],
        lot_campus_by_id={"10001": "College Avenue Campus", "10002": "College Avenue"},
        lot_capacity_by_id={"10001": 600, "10002": 400},
    )
    assert "CAC:SC" in mapping
    weights = mapping["CAC:SC"]
    assert set(weights.keys()) == {"10001", "10002"}
    assert round(sum(weights.values()), 4) == 1.0
