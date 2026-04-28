from datetime import datetime, timezone

from app.core.config import settings
from app.services.permit_notifications import NO_PERMIT_COMMUTER, load_permit_rules


def test_permit_rules_detect_restricted_time_window_for_primary_permit():
    rules = load_permit_rules()

    result = rules.access_state(
        lot_id="10002",
        primary="Busch Commuter",
        secondary=None,
        now=datetime(2026, 4, 28, 9, 0),
    )

    assert result.state == "restricted_now"


def test_permit_rules_allow_same_lot_when_schedule_is_open():
    rules = load_permit_rules()

    result = rules.access_state(
        lot_id="10001",
        primary="Busch Commuter",
        secondary=None,
        now=datetime(2026, 4, 28, 9, 0),
    )

    assert result.state == "open_now"


def test_no_permit_commuter_rejects_non_commuter_lot():
    rules = load_permit_rules()

    result = rules.access_state(
        lot_id="999999",
        primary=NO_PERMIT_COMMUTER,
        secondary=None,
        now=datetime(2026, 4, 28, 9, 0),
    )

    assert result.state == "unavailable"


def test_permit_rules_convert_utc_to_rutgers_local_time(monkeypatch):
    monkeypatch.setattr(settings, "CAMPUS_TIMEZONE", "America/New_York", raising=False)
    rules = load_permit_rules()

    result = rules.access_state(
        lot_id="10002",
        primary="Busch Commuter",
        secondary=None,
        now=datetime(2026, 4, 28, 13, 0, tzinfo=timezone.utc),
    )

    assert result.state == "restricted_now"
