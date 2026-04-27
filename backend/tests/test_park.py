from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.parking import IdempotencyRecord, LotOccupancy, ParkingSession
from app.models.user import Profile
from app.routers.park import _get_friend_user_ids


@pytest.mark.asyncio
async def test_parking_session_lifecycle(
    client: AsyncClient,
    override_current_user: None,
    noop_ws_publish: None,
    db_session: AsyncSession,
):
    _ = override_current_user, noop_ws_publish
    lot_id = "10001"

    start_resp = await client.post("/api/v1/park/session", json={"lotId": lot_id})
    assert start_resp.status_code == 200, start_resp.text
    body = start_resp.json()
    assert body["success"] is True
    assert body["session"]["lotId"] == lot_id
    assert body["session"]["circlingDurationSeconds"] is None

    active_resp = await client.get("/api/v1/park/session/active")
    assert active_resp.status_code == 200, active_resp.text
    active_json = active_resp.json()
    assert active_json["session"] is not None
    assert active_json["session"]["active"] is True

    end_resp = await client.post("/api/v1/park/session/end")
    assert end_resp.status_code == 200, end_resp.text
    assert end_resp.json()["success"] is True

    session_row = (
        await db_session.execute(
            select(ParkingSession).where(
                ParkingSession.user_id == "00000000-0000-0000-0000-000000000123"
            )
        )
    ).scalar_one()
    assert session_row.active is False

    occupancy_row = (
        await db_session.execute(select(LotOccupancy).where(LotOccupancy.lot_id == lot_id))
    ).scalar_one()
    assert occupancy_row.count == 0


@pytest.mark.asyncio
async def test_second_start_ends_previous_session(
    client: AsyncClient,
    override_current_user: None,
    noop_ws_publish: None,
    db_session: AsyncSession,
):
    _ = override_current_user, noop_ws_publish
    first_lot = "10001"
    second_lot = "10002"

    first = await client.post("/api/v1/park/session", json={"lotId": first_lot})
    assert first.status_code == 200, first.text

    second = await client.post("/api/v1/park/session", json={"lotId": second_lot})
    assert second.status_code == 200, second.text

    rows = (
        (
            await db_session.execute(
                select(ParkingSession).where(
                    ParkingSession.user_id == "00000000-0000-0000-0000-000000000123"
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 2
    active_rows = [row for row in rows if row.active]
    assert len(active_rows) == 1
    assert active_rows[0].lot_id == second_lot


@pytest.mark.asyncio
async def test_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/park/session/active")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_start_session_idempotent_replay_after_side_effect_failure(
    client: AsyncClient,
    override_current_user: None,
    noop_ws_publish: None,
    monkeypatch: pytest.MonkeyPatch,
    db_session: AsyncSession,
):
    _ = override_current_user, noop_ws_publish

    async def _boom(*_args, **_kwargs):
        raise RuntimeError("push fan-out failed")

    monkeypatch.setattr("app.routers.park.send_silent_push_to_all", _boom)

    key = "idem-start-after-commit"
    first = await client.post(
        "/api/v1/park/session",
        json={"lotId": "10001"},
        headers={"Idempotency-Key": key},
    )
    assert first.status_code == 500

    sessions = (
        (
            await db_session.execute(
                select(ParkingSession).where(
                    ParkingSession.user_id == "00000000-0000-0000-0000-000000000123",
                    ParkingSession.active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(sessions) == 1

    idempotency = (
        await db_session.execute(
            select(IdempotencyRecord).where(
                IdempotencyRecord.user_id == "00000000-0000-0000-0000-000000000123",
                IdempotencyRecord.endpoint == "/park/session",
                IdempotencyRecord.idempotency_key == key,
            )
        )
    ).scalar_one_or_none()
    assert idempotency is not None

    second = await client.post(
        "/api/v1/park/session",
        json={"lotId": "10001"},
        headers={"Idempotency-Key": key},
    )
    assert second.status_code == 200, second.text
    assert second.json().get("_idempotentReplay") is True

    sessions_after = (
        (
            await db_session.execute(
                select(ParkingSession).where(
                    ParkingSession.user_id == "00000000-0000-0000-0000-000000000123",
                    ParkingSession.active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(sessions_after) == 1


@pytest.mark.asyncio
async def test_friend_targets_respect_viewer_owned_sharing_flags(db_session: AsyncSession):
    me = UUID("00000000-0000-0000-0000-000000000123")
    friend_a = UUID("00000000-0000-0000-0000-000000000456")
    friend_b = UUID("00000000-0000-0000-0000-000000000789")
    db_session.add_all(
        [
            Profile(id=me, email="me@rutgers.edu"),
            Profile(id=friend_a, email="a@rutgers.edu"),
            Profile(id=friend_b, email="b@rutgers.edu"),
        ]
    )
    from app.models.friendship import Friendship

    db_session.add_all(
        [
            Friendship(
                user_id=me,
                friend_id=friend_a,
                status="accepted",
                initiator_sharing_enabled=True,
                recipient_sharing_enabled=False,
            ),
            Friendship(
                user_id=friend_b,
                friend_id=me,
                status="accepted",
                initiator_sharing_enabled=False,
                recipient_sharing_enabled=True,
            ),
        ]
    )
    await db_session.commit()

    targets = await _get_friend_user_ids(db_session, str(me))
    assert sorted(targets) == sorted([str(friend_a), str(friend_b)])


@pytest.mark.asyncio
async def test_feedback_accepts_quality_contract(
    client: AsyncClient,
    override_current_user: None,
):
    _ = override_current_user
    response = await client.post(
        "/api/v1/park/session/feedback",
        json={
            "session_id": None,
            "lot_id": "10001",
            "quality": "correct",
            "notes": "looks right",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["success"] is True


@pytest.mark.asyncio
async def test_start_session_persists_circling_metrics(
    client: AsyncClient,
    override_current_user: None,
    noop_ws_publish: None,
    db_session: AsyncSession,
):
    _ = override_current_user, noop_ws_publish
    response = await client.post(
        "/api/v1/park/session",
        json={
            "lotId": "10001",
            "circling_started_at": "2026-04-26T22:00:00Z",
            "circling_duration_seconds": 245,
        },
    )
    assert response.status_code == 200, response.text
    session = (
        (
            await db_session.execute(
                select(ParkingSession).where(
                    ParkingSession.user_id == "00000000-0000-0000-0000-000000000123",
                    ParkingSession.active.is_(True),
                )
            )
        )
        .scalars()
        .first()
    )
    assert session is not None
    assert session.circling_duration_seconds == 245
    assert session.circling_started_at is not None
