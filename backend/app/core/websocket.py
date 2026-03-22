import asyncio
import contextlib
import inspect
import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket
from redis import asyncio as aioredis

from app.core.config import settings
from app.core.logger import get_logger

log = get_logger(__name__)

_OCCUPANCY_CHANNEL = "scarletspots:ws:occupancy"
_NOTIFICATIONS_CHANNEL = "scarletspots:ws:notifications"


class ConnectionManager:
    def __init__(self) -> None:
        self._occupancy_clients: dict[str, set[WebSocket]] = defaultdict(set)
        self._notification_clients: dict[str, set[WebSocket]] = defaultdict(set)
        self._socket_lot_map: dict[WebSocket, set[str]] = defaultdict(set)
        self._socket_user_map: dict[WebSocket, str] = {}

        self._lock = asyncio.Lock()
        self._redis: aioredis.Redis | None = None
        self._pubsub: aioredis.client.PubSub | None = None
        self._listener_task: asyncio.Task[None] | None = None

    async def startup(self) -> None:
        if self._listener_task is not None:
            return

        try:
            self._redis = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            await self._redis.ping()

            self._pubsub = self._redis.pubsub()
            await self._pubsub.subscribe(_OCCUPANCY_CHANNEL, _NOTIFICATIONS_CHANNEL)
            self._listener_task = asyncio.create_task(self._redis_listener())
            log.info("WebSocket manager started with Redis pub/sub")
        except Exception as exc:
            self._redis = None
            self._pubsub = None
            self._listener_task = None
            log.warning(
                "WebSocket Redis unavailable; using single-worker local broadcast: %s",
                exc,
            )

    async def shutdown(self) -> None:
        if self._listener_task is not None:
            self._listener_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._listener_task
            self._listener_task = None

        if self._pubsub is not None:
            await self._close_async_resource(self._pubsub)
            self._pubsub = None

        if self._redis is not None:
            await self._close_async_resource(self._redis)
            self._redis = None

    async def _close_async_resource(self, resource: Any) -> None:
        """Close redis resources across redis-py versions (aclose vs close)."""
        close_method = getattr(resource, "aclose", None) or getattr(resource, "close", None)
        if close_method is None:
            return

        result = close_method()
        if inspect.isawaitable(result):
            await result

    async def register_occupancy(self, websocket: WebSocket, lot_ids: list[str]) -> None:
        async with self._lock:
            self._clear_occupancy_locked(websocket)
            clean_lot_ids = {lot_id.strip() for lot_id in lot_ids if lot_id and lot_id.strip()}
            self._socket_lot_map[websocket] = clean_lot_ids
            for lot_id in clean_lot_ids:
                self._occupancy_clients[lot_id].add(websocket)

    async def register_notifications(self, websocket: WebSocket, user_id: str) -> None:
        async with self._lock:
            self._socket_user_map[websocket] = user_id
            self._notification_clients[user_id].add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clear_occupancy_locked(websocket)

            user_id = self._socket_user_map.pop(websocket, None)
            if user_id:
                sockets = self._notification_clients.get(user_id)
                if sockets is not None:
                    sockets.discard(websocket)
                    if not sockets:
                        self._notification_clients.pop(user_id, None)

    async def publish_occupancy_update(
        self,
        lot_id: str,
        count: int,
        updated_at: datetime | None = None,
    ) -> None:
        payload = {
            "type": "occupancy_update",
            "lot_id": lot_id,
            "count": count,
            "updated_at": (updated_at or datetime.now(timezone.utc)).isoformat(),
        }
        log.info("WS publish occupancy: lot_id=%s count=%s", lot_id, count)
        await self._publish(_OCCUPANCY_CHANNEL, payload)

    async def publish_notification(self, user_id: str, payload: dict[str, Any]) -> None:
        message = {"type": "notification", "user_id": user_id, "payload": payload}
        log.info(
            "WS publish notification: user_id=%s event=%s",
            user_id,
            payload.get("event"),
        )
        await self._publish(_NOTIFICATIONS_CHANNEL, message)

    async def _publish(self, channel: str, payload: dict[str, Any]) -> None:
        if self._redis is None:
            if channel == _OCCUPANCY_CHANNEL:
                await self._broadcast_occupancy(payload)
            elif channel == _NOTIFICATIONS_CHANNEL:
                await self._broadcast_notification(payload)
            return
        await self._redis.publish(channel, json.dumps(payload))

    async def _redis_listener(self) -> None:
        if self._pubsub is None:
            return

        while True:
            message = await self._pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if not message:
                await asyncio.sleep(0.05)
                continue

            data = message.get("data")
            if not isinstance(data, str):
                continue

            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                continue

            channel = message.get("channel")
            if channel == _OCCUPANCY_CHANNEL:
                await self._broadcast_occupancy(payload)
            elif channel == _NOTIFICATIONS_CHANNEL:
                await self._broadcast_notification(payload)

    async def _broadcast_occupancy(self, payload: dict[str, Any]) -> None:
        lot_id = str(payload.get("lot_id", ""))
        if not lot_id:
            return

        async with self._lock:
            sockets = list(self._occupancy_clients.get(lot_id, set()))

        log.info("WS broadcast occupancy: lot_id=%s sockets=%d", lot_id, len(sockets))

        await self._send_to_sockets(sockets, payload)

    async def _broadcast_notification(self, payload: dict[str, Any]) -> None:
        user_id = str(payload.get("user_id", ""))
        if not user_id:
            return

        async with self._lock:
            sockets = list(self._notification_clients.get(user_id, set()))

        log.info("WS broadcast notification: user_id=%s sockets=%d", user_id, len(sockets))

        await self._send_to_sockets(sockets, payload)

    async def _send_to_sockets(self, sockets: list[WebSocket], payload: dict[str, Any]) -> None:
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                await self.disconnect(ws)

    def _clear_occupancy_locked(self, websocket: WebSocket) -> None:
        lots = self._socket_lot_map.pop(websocket, set())
        for lot_id in lots:
            sockets = self._occupancy_clients.get(lot_id)
            if sockets is not None:
                sockets.discard(websocket)
                if not sockets:
                    self._occupancy_clients.pop(lot_id, None)


manager = ConnectionManager()
