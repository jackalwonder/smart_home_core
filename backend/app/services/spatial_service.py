from __future__ import annotations

"""Contextual room arbitration backed by an in-memory presence snapshot."""

import asyncio
import time

from loguru import logger

STATIC_DEVICE_ROOM_MAP: dict[str, str] = {
    "主卧�?HomePod": "主卧",
    "客厅�?HomePod": "客厅",
    "书房�?iPhone": "书房",
}

AMBIGUOUS_ROOM = "AMBIGUOUS"
PRESENCE_TTL_SECONDS = 8.0

_presence_lock = asyncio.Lock()
_presence_snapshot: dict[str, tuple[str, float]] = {}


async def remember_presence(entity_id: str, room_name: str) -> None:
    normalized_entity_id = entity_id.strip()
    normalized_room_name = room_name.strip()
    if not normalized_entity_id or not normalized_room_name:
        return

    async with _presence_lock:
        _presence_snapshot[normalized_entity_id] = (normalized_room_name, time.monotonic())


async def get_contextual_room(source_device: str) -> str:
    source_device_name = source_device.strip()
    logger.info("Resolving contextual room for source device: {}", source_device_name)

    mapped_room = STATIC_DEVICE_ROOM_MAP.get(source_device_name)
    if mapped_room is not None:
        logger.info("Matched source device {} to static room {}.", source_device_name, mapped_room)
        return mapped_room

    now = time.monotonic()
    async with _presence_lock:
        active_rooms = [
            room_name
            for room_name, seen_at in _presence_snapshot.values()
            if now - seen_at <= PRESENCE_TTL_SECONDS
        ]

    distinct_rooms = sorted(set(active_rooms))
    logger.info("Found {} active presence rooms for contextual arbitration.", len(distinct_rooms))

    if len(distinct_rooms) != 1:
        logger.warning(
            "Unable to determine room from presence snapshot. Active rooms: {}",
            distinct_rooms,
        )
        return AMBIGUOUS_ROOM

    room_name = distinct_rooms[0]
    logger.info("Resolved contextual room {} from in-memory presence snapshot.", room_name)
    return room_name
