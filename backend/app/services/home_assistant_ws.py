from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from itertools import count
from typing import Any

from sqlalchemy import select
from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, WebSocketException

from app.database import SessionLocal
from app.models import Device, DeviceStatus
from app.services import home_assistant_import_service
from app.services.realtime import build_device_update_event, device_realtime_hub

logger = logging.getLogger(__name__)


class HomeAssistantWebSocketListener:
    def __init__(
        self,
        websocket_url: str,
        access_token: str,
        reconnect_min_delay: float = 2.0,
        reconnect_max_delay: float = 30.0,
        auto_import_cooldown: float = 15.0,
    ) -> None:
        self.websocket_url = websocket_url
        self.access_token = access_token
        self.reconnect_min_delay = reconnect_min_delay
        self.reconnect_max_delay = reconnect_max_delay
        self.auto_import_cooldown = auto_import_cooldown
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self._auto_import_lock = asyncio.Lock()
        self._last_auto_import_at = 0.0

    @classmethod
    def from_env(cls) -> "HomeAssistantWebSocketListener | None":
        websocket_url = os.getenv("HOME_ASSISTANT_WS_URL", "").strip()
        access_token = os.getenv("HOME_ASSISTANT_ACCESS_TOKEN", "").strip()
        if not websocket_url or not access_token:
            logger.info(
                "Home Assistant WebSocket listener is disabled because HOME_ASSISTANT_WS_URL "
                "or HOME_ASSISTANT_ACCESS_TOKEN is not configured."
            )
            return None
        return cls(websocket_url=websocket_url, access_token=access_token)

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self.run_forever(), name="home-assistant-ws-listener")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            logger.info("Home Assistant listener task cancelled during shutdown.")
        finally:
            self._task = None

    async def run_forever(self) -> None:
        delay = self.reconnect_min_delay
        while not self._stop_event.is_set():
            try:
                await self._connect_and_stream()
                delay = self.reconnect_min_delay
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Home Assistant listener crashed; reconnect will be attempted.")
                if self._stop_event.is_set():
                    break
                await asyncio.sleep(delay)
                delay = min(delay * 2, self.reconnect_max_delay)

    async def _connect_and_stream(self) -> None:
        logger.info("Connecting to Home Assistant WebSocket API at %s", self.websocket_url)
        async with connect(
            self.websocket_url,
            open_timeout=15,
            close_timeout=10,
            ping_interval=20,
            ping_timeout=20,
            max_size=2_000_000,
        ) as websocket:
            await self._authenticate(websocket)
            await self._subscribe_to_state_changes(websocket)
            logger.info("Subscribed to Home Assistant state_changed events.")
            await self._event_loop(websocket)

    async def _authenticate(self, websocket: ClientConnection) -> None:
        greeting = await self._receive_json(websocket)
        if greeting.get("type") != "auth_required":
            raise RuntimeError(f"Unexpected Home Assistant handshake: {greeting}")

        await websocket.send(
            json.dumps(
                {
                    "type": "auth",
                    "access_token": self.access_token,
                }
            )
        )

        response = await self._receive_json(websocket)
        if response.get("type") != "auth_ok":
            raise RuntimeError(f"Home Assistant authentication failed: {response}")
        logger.info("Authenticated with Home Assistant WebSocket API.")

    async def _subscribe_to_state_changes(self, websocket: ClientConnection) -> None:
        request_id = 1
        await websocket.send(
            json.dumps(
                {
                    "id": request_id,
                    "type": "subscribe_events",
                    "event_type": "state_changed",
                }
            )
        )

        response = await self._receive_json(websocket)
        if response.get("id") != request_id or response.get("success") is not True:
            raise RuntimeError(f"Home Assistant state subscription failed: {response}")

    async def _event_loop(self, websocket: ClientConnection) -> None:
        for message_count in count(1):
            if self._stop_event.is_set():
                return
            try:
                payload = await self._receive_json(websocket)
            except (ConnectionClosed, WebSocketException):
                logger.warning("Home Assistant WebSocket connection dropped after %s messages.", message_count - 1)
                raise

            await self._handle_message(payload)

    async def _handle_message(self, payload: dict[str, Any]) -> None:
        message_type = payload.get("type")
        if message_type == "event":
            event = payload.get("event", {})
            if event.get("event_type") != "state_changed":
                return
            await self._handle_state_changed(event.get("data", {}))
            return

        if message_type == "pong":
            logger.debug("Received Home Assistant pong.")
            return

        if message_type == "result":
            logger.debug("Received Home Assistant command result: %s", payload)
            return

        logger.debug("Ignoring unsupported Home Assistant message: %s", payload)

    async def _handle_state_changed(self, data: dict[str, Any]) -> None:
        entity_id = data.get("entity_id")
        new_state = data.get("new_state") or {}
        raw_state = new_state.get("state")
        if not entity_id or raw_state is None:
            logger.debug("Skipping malformed state_changed payload: %s", data)
            return

        mapped_status = self._map_home_assistant_state(raw_state)
        updated = await asyncio.to_thread(self._update_device_state, entity_id, mapped_status)
        if updated:
            logger.info("Updated device %s to status %s.", entity_id, mapped_status.value)
            return

        logger.info("Discovered unknown Home Assistant entity %s; scheduling automatic import.", entity_id)
        await self._attempt_auto_import(entity_id, mapped_status)

    async def _attempt_auto_import(self, entity_id: str, status: DeviceStatus) -> None:
        if self._auto_import_lock.locked():
            logger.debug("Skipping automatic import for %s because another import is already running.", entity_id)
            return

        now = time.monotonic()
        if now - self._last_auto_import_at < self.auto_import_cooldown:
            logger.debug("Skipping automatic import for %s because cooldown is active.", entity_id)
            return

        async with self._auto_import_lock:
            self._last_auto_import_at = time.monotonic()
            imported = await asyncio.to_thread(self._import_and_publish_entity, entity_id, status)
            if imported:
                logger.info("Automatically imported newly discovered Home Assistant entity %s.", entity_id)
            else:
                logger.debug("Automatic import completed but entity %s is still not tracked.", entity_id)

    def _update_device_state(self, entity_id: str, status: DeviceStatus) -> bool:
        session = SessionLocal()
        try:
            device = session.scalar(select(Device).where(Device.ha_entity_id == entity_id))
            if device is None:
                return False
            device.current_status = status
            session.commit()
            session.refresh(device)
            device_realtime_hub.publish_threadsafe(build_device_update_event(device))
            return True
        except Exception:
            session.rollback()
            logger.exception("Failed to update device state for entity %s.", entity_id)
            return False
        finally:
            session.close()

    def _import_and_publish_entity(self, entity_id: str, status: DeviceStatus) -> bool:
        session = SessionLocal()
        try:
            asyncio.run(home_assistant_import_service.import_home_assistant_entities(session))
            device = session.scalar(select(Device).where(Device.ha_entity_id == entity_id))
            if device is None:
                return False

            if device.current_status != status:
                device.current_status = status
                session.commit()
                session.refresh(device)

            siblings = self._load_related_devices(session, device)
            for sibling in siblings:
                device_realtime_hub.publish_threadsafe(build_device_update_event(sibling))
            return True
        except Exception:
            session.rollback()
            logger.exception("Failed to auto-import newly discovered entity %s.", entity_id)
            return False
        finally:
            session.close()

    @staticmethod
    def _load_related_devices(session, device: Device) -> list[Device]:
        if device.ha_device_id:
            stmt = select(Device).where(Device.ha_device_id == device.ha_device_id).order_by(Device.name)
            return list(session.scalars(stmt).all())
        return [device]

    @staticmethod
    def _map_home_assistant_state(raw_state: str) -> DeviceStatus:
        normalized = raw_state.strip().lower()
        state_map = {
            "on": DeviceStatus.ON,
            "off": DeviceStatus.OFF,
            "home": DeviceStatus.ONLINE,
            "open": DeviceStatus.ON,
            "opening": DeviceStatus.ON,
            "closed": DeviceStatus.OFF,
            "closing": DeviceStatus.OFF,
            "locked": DeviceStatus.ON,
            "unlocked": DeviceStatus.OFF,
            "playing": DeviceStatus.ON,
            "paused": DeviceStatus.SLEEPING,
            "idle": DeviceStatus.SLEEPING,
            "standby": DeviceStatus.SLEEPING,
            "sleep": DeviceStatus.SLEEPING,
            "sleeping": DeviceStatus.SLEEPING,
            "online": DeviceStatus.ONLINE,
            "offline": DeviceStatus.OFFLINE,
            "unavailable": DeviceStatus.UNAVAILABLE,
            "unknown": DeviceStatus.UNKNOWN,
        }
        return state_map.get(normalized, DeviceStatus.UNKNOWN)

    @staticmethod
    async def _receive_json(websocket: ClientConnection) -> dict[str, Any]:
        message = await websocket.recv()
        if isinstance(message, bytes):
            message = message.decode("utf-8")
        try:
            payload = json.loads(message)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON received from Home Assistant: {message}") from exc
        if not isinstance(payload, dict):
            raise ValueError(f"Unexpected Home Assistant payload type: {payload!r}")
        return payload
