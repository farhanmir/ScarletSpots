import json
from urllib.parse import parse_qs

from app.core.logger import get_logger
from app.core.security import decode_keycloak_jwt_token
from app.core.websocket import manager
from fastapi import (
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
    status,
)
from jose.exceptions import JWTError

router = APIRouter(tags=["websocket"])
log = get_logger(__name__)


def _parse_lot_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [lot_id.strip() for lot_id in value.split(",") if lot_id.strip()]


def _extract_user_id(auth_data: dict) -> str:
    token = str(auth_data.get("token") or "")
    if not token:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

    try:
        payload = decode_keycloak_jwt_token(token)
    except JWTError as exc:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

    user_id = str(payload.get("sub") or "")
    if not user_id:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    return user_id


async def _receive_auth_message(websocket: WebSocket) -> dict:
    try:
        raw = await websocket.receive_text()
    except Exception as exc:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

    if not isinstance(data, dict) or data.get("type") != "auth":
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    return data


@router.websocket("/ws/occupancy")
async def occupancy_socket(websocket: WebSocket) -> None:
    client = (
        f"{websocket.client.host}:{websocket.client.port}"
        if websocket.client
        else "unknown"
    )
    await websocket.accept()
    log.info("WS occupancy connected: client=%s", client)

    try:
        query = parse_qs(websocket.url.query)
        initial_lot_ids = _parse_lot_ids((query.get("lot_ids") or [None])[0])

        auth_data = await _receive_auth_message(websocket)
        user_id = _extract_user_id(auth_data)

        message_lot_ids = auth_data.get("lot_ids") or []
        if isinstance(message_lot_ids, list):
            initial_lot_ids.extend([str(lot_id) for lot_id in message_lot_ids])

        await manager.register_occupancy(websocket, initial_lot_ids)
        log.info(
            "WS occupancy auth ok: client=%s user_id=%s lot_ids=%s",
            client,
            user_id,
            initial_lot_ids,
        )
        await websocket.send_json(
            {"type": "ack", "channel": "occupancy", "lot_ids": initial_lot_ids}
        )

        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")
            if msg_type == "subscribe":
                lot_ids = [str(lot_id) for lot_id in message.get("lot_ids") or []]
                await manager.register_occupancy(websocket, lot_ids)
                log.info(
                    "WS occupancy subscribe: client=%s user_id=%s lot_ids=%s",
                    client,
                    user_id,
                    lot_ids,
                )
                await websocket.send_json(
                    {"type": "ack", "channel": "occupancy", "lot_ids": lot_ids}
                )
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketException as exc:
        log.warning(
            "WS occupancy policy violation: client=%s code=%s",
            client,
            exc.code,
        )
        await websocket.close(code=exc.code)
    except WebSocketDisconnect:
        log.info("WS occupancy disconnected: client=%s", client)
    finally:
        await manager.disconnect(websocket)


@router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket) -> None:
    client = (
        f"{websocket.client.host}:{websocket.client.port}"
        if websocket.client
        else "unknown"
    )
    await websocket.accept()
    log.info("WS notifications connected: client=%s", client)

    try:
        auth_data = await _receive_auth_message(websocket)
        user_id = _extract_user_id(auth_data)

        await manager.register_notifications(websocket, user_id)
        log.info("WS notifications auth ok: client=%s user_id=%s", client, user_id)
        await websocket.send_json({"type": "ack", "channel": "notifications"})

        while True:
            message = await websocket.receive_json()
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketException as exc:
        log.warning(
            "WS notifications policy violation: client=%s code=%s",
            client,
            exc.code,
        )
        await websocket.close(code=exc.code)
    except WebSocketDisconnect:
        log.info("WS notifications disconnected: client=%s", client)
    finally:
        await manager.disconnect(websocket)
