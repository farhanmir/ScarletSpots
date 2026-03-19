import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.parking import LotOccupancy, ParkingSession


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
        await db_session.execute(
            select(LotOccupancy).where(LotOccupancy.lot_id == lot_id)
        )
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
