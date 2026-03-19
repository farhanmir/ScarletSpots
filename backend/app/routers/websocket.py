import asyncio
import json
from urllib.parse import parse_qs

from app.core.logger import get_logger
from app.core.security import decode_supabase_jwt_token
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

AUTH_MESSAGE_TIMEOUT_SECONDS = 8
MAX_AUTH_MESSAGE_BYTES = 8192
MAX_LOT_IDS_PER_SOCKET = 300
MAX_LOT_ID_LENGTH = 64


def _parse_lot_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [lot_id.strip() for lot_id in value.split(",") if lot_id.strip()]


def _validate_lot_ids(lot_ids: list[str]) -> list[str]:
    if len(lot_ids) > MAX_LOT_IDS_PER_SOCKET:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

    normalized: list[str] = []
    seen: set[str] = set()
    for lot_id in lot_ids:
        clean = str(lot_id).strip()
        if not clean or len(clean) > MAX_LOT_ID_LENGTH:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
        if clean in seen:
            continue
        seen.add(clean)
        normalized.append(clean)
    return normalized


async def _extract_user_id(auth_data: dict) -> str:
    token = str(auth_data.get("token") or "")
    if not token:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

    try:
        payload = await decode_supabase_jwt_token(token)
    except JWTError as exc:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc
    except Exception as exc:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

    if not isinstance(payload, dict):
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

    user_id = str(payload.get("sub") or "")
    if not user_id:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    return user_id


async def _receive_auth_message(websocket: WebSocket) -> dict:
    try:
        raw = await asyncio.wait_for(
            websocket.receive_text(), timeout=AUTH_MESSAGE_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError as exc:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc
    except Exception as exc:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

    if len(raw.encode("utf-8")) > MAX_AUTH_MESSAGE_BYTES:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

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
        try:
            user_id = await _extract_user_id(auth_data)
        except Exception as exc:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

        message_lot_ids = auth_data.get("lot_ids") or []
        if isinstance(message_lot_ids, list):
            initial_lot_ids.extend([str(lot_id) for lot_id in message_lot_ids])
        elif message_lot_ids:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

        initial_lot_ids = _validate_lot_ids(initial_lot_ids)

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
                raw_lot_ids = message.get("lot_ids") or []
                if not isinstance(raw_lot_ids, list):
                    raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
                lot_ids = _validate_lot_ids([str(lot_id) for lot_id in raw_lot_ids])
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
        try:
            user_id = await _extract_user_id(auth_data)
        except Exception as exc:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

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
