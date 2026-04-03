from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from app.models import Device

logger = logging.getLogger(__name__)


def serialize_device(device: Device) -> dict[str, Any]:
    return {
        "id": device.id,
        "room_id": device.room_id,
        "name": device.name,
        "ha_entity_id": device.ha_entity_id,
        "ha_device_id": device.ha_device_id,
        "device_type": device.device_type.value,
        "current_status": device.current_status.value,
    }


def build_device_update_event(device: Device) -> dict[str, Any]:
    return {
        "type": "device_state_updated",
        "device": serialize_device(device),
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
        await websocket.send_json({"type": "connection_established"})

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
