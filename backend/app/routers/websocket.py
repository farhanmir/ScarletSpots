import json
from urllib.parse import parse_qs

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


def _parse_lot_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [lot_id.strip() for lot_id in value.split(",") if lot_id.strip()]


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
    await websocket.accept()

    try:
        query = parse_qs(websocket.url.query)
        initial_lot_ids = _parse_lot_ids((query.get("lot_ids") or [None])[0])

        auth_data = await _receive_auth_message(websocket)
        token = str(auth_data.get("token") or "")
        if not token:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

        try:
            payload = decode_supabase_jwt_token(token)
        except JWTError as exc:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

        user_id = str(payload.get("sub") or "")
        if not user_id:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

        message_lot_ids = auth_data.get("lot_ids") or []
        if isinstance(message_lot_ids, list):
            initial_lot_ids.extend([str(lot_id) for lot_id in message_lot_ids])

        await manager.register_occupancy(websocket, initial_lot_ids)
        await websocket.send_json(
            {"type": "ack", "channel": "occupancy", "lot_ids": initial_lot_ids}
        )

        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type")
            if msg_type == "subscribe":
                lot_ids = [str(lot_id) for lot_id in message.get("lot_ids") or []]
                await manager.register_occupancy(websocket, lot_ids)
                await websocket.send_json(
                    {"type": "ack", "channel": "occupancy", "lot_ids": lot_ids}
                )
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketException as exc:
        await websocket.close(code=exc.code)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


@router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        auth_data = await _receive_auth_message(websocket)
        token = str(auth_data.get("token") or "")
        if not token:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

        try:
            payload = decode_supabase_jwt_token(token)
        except JWTError as exc:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION) from exc

        user_id = str(payload.get("sub") or "")
        if not user_id:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)

        await manager.register_notifications(websocket, user_id)
        await websocket.send_json({"type": "ack", "channel": "notifications"})

        while True:
            message = await websocket.receive_json()
            if message.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketException as exc:
        await websocket.close(code=exc.code)
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)
