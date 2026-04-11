from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from itertools import count
from threading import Lock
from typing import Any

from fastapi import WebSocket

from app.models import Device

logger = logging.getLogger(__name__)
PATCH_PROTOCOL_VERSION = 2
_event_sequence = count(1)
_event_sequence_lock = Lock()


def _next_event_sequence() -> int:
    with _event_sequence_lock:
        return next(_event_sequence)


def _derive_entity_domain(entity_id: str | None) -> str:
    if entity_id and "." in entity_id:
        return entity_id.split(".", 1)[0].strip().lower()
    return "generic"


def _coerce_enum_value(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    return getattr(value, "value", value)


def _serialize_online_status(current_status: str) -> bool:
    return current_status not in {"offline", "unavailable"}


def serialize_device(device: Device, raw_state: str | None = None) -> dict[str, Any]:
    current_status = _coerce_enum_value(device.current_status, "unknown")
    entity_id = device.ha_entity_id or ""
    return {
        "id": device.id,
        "room_id": device.room_id,
        "name": device.name,
        "ha_entity_id": entity_id,
        "ha_device_id": device.ha_device_id,
        "device_type": _coerce_enum_value(device.device_type, "generic"),
        "entity_domain": _derive_entity_domain(entity_id),
        "current_status": current_status,
        "raw_state": (raw_state or current_status).strip().lower(),
        "online": _serialize_online_status(current_status),
    }


def build_device_update_event(device: Device, raw_state: str | None = None) -> dict[str, Any]:
    return {
        "type": "device_state_updated",
        "protocol_version": PATCH_PROTOCOL_VERSION,
        "seq": _next_event_sequence(),
        "emitted_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "device": serialize_device(device, raw_state=raw_state),
    }


def build_catalog_refresh_event(reason: str) -> dict[str, Any]:
    return {
        "type": "catalog_updated",
        "reason": reason,
    }


class DeviceRealtimeHub:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)
        await websocket.send_json(
            {
                "type": "connection_established",
                "protocol_version": PATCH_PROTOCOL_VERSION,
            }
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        async with self._lock:
            connections = list(self._connections)

        stale_connections: list[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                logger.warning("Dropping stale frontend WebSocket connection.", exc_info=True)
                stale_connections.append(websocket)

        if not stale_connections:
            return

        async with self._lock:
            for websocket in stale_connections:
                self._connections.discard(websocket)

    def publish_threadsafe(self, message: dict[str, Any]) -> None:
        if self._loop is None:
            logger.debug("Skipping realtime publish because the event loop is not attached yet.")
            return

        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if current_loop is self._loop:
            asyncio.create_task(self.broadcast(message))
            return

        asyncio.run_coroutine_threadsafe(self.broadcast(message), self._loop)


device_realtime_hub = DeviceRealtimeHub()
