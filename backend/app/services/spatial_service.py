from __future__ import annotations

"""空间仲裁服务，尝试把语音来源映射到当前所在房间。"""

from typing import Any

from loguru import logger
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import run_in_threadpool_session
from app.models import Device, Room
from app.services.home_assistant_api import HomeAssistantRestClient

STATIC_DEVICE_ROOM_MAP: dict[str, str] = {
    "主卧的 HomePod": "主卧",
    "客厅的 HomePod": "客厅",
    "书房的 iPhone": "书房",
}

RADAR_DEVICE_CLASSES = {"motion", "presence", "occupancy"}
AMBIGUOUS_ROOM = "AMBIGUOUS"


async def get_contextual_room(source_device: str) -> str:
    source_device_name = source_device.strip()
    logger.info("Resolving contextual room for source device: {}", source_device_name)

    mapped_room = STATIC_DEVICE_ROOM_MAP.get(source_device_name)
    if mapped_room is not None:
        logger.info("Matched source device {} to static room {}.", source_device_name, mapped_room)
        return mapped_room

    # 静态来源映射命中失败后，再退回到雷达占用状态做实时推断。
    states = await HomeAssistantRestClient.from_env().get_states()
    active_radar_entity_ids = [
        entity_id
        for state in states
        if (entity_id := _active_radar_entity_id(state)) is not None
    ]

    logger.info("Found {} active radar sensors for contextual arbitration.", len(active_radar_entity_ids))

    # 只有“恰好一个房间有人”时，才认为空间上下文足够明确。
    if len(active_radar_entity_ids) != 1:
        logger.warning(
            "Unable to determine room from radar sensors. Active radars: {}",
            active_radar_entity_ids,
        )
        return AMBIGUOUS_ROOM

    target_entity_id = active_radar_entity_ids[0]

    def _lookup_room_name(db: Session) -> str | None:
        stmt = (
            select(Room.name)
            .join(Device, Device.room_id == Room.id)
            .where(Device.ha_entity_id == target_entity_id)
            .limit(1)
        )
        return db.scalar(stmt)

    room_name = await run_in_threadpool_session(_lookup_room_name)
    if room_name is None:
        logger.warning(
            "Active radar entity {} is not mapped to any room in the database.",
            target_entity_id,
        )
        return AMBIGUOUS_ROOM

    logger.info(
        "Resolved contextual room {} from active radar entity {}.",
        room_name,
        target_entity_id,
    )
    return room_name


def _active_radar_entity_id(state: dict[str, Any]) -> str | None:
    entity_id = state.get("entity_id")
    if not isinstance(entity_id, str) or not entity_id.startswith("binary_sensor."):
        return None

    if str(state.get("state", "")).strip().lower() != "on":
        return None

    attributes = state.get("attributes")
    if not isinstance(attributes, dict):
        return None

    device_class = str(attributes.get("device_class", "")).strip().lower()
    if device_class not in RADAR_DEVICE_CLASSES:
        return None

    return entity_id
