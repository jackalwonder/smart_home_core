from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from loguru import logger

from app.models import Device, Room
from app.services.home_assistant_api import HomeAssistantRestClient

STATIC_DEVICE_ROOM_MAP: dict[str, str] = {
    "主卧的 HomePod": "主卧",
    "客厅的 HomePod": "客厅",
    "书房的 iPhone": "书房",
}

RADAR_DEVICE_CLASSES = {"motion", "presence", "occupancy"}
AMBIGUOUS_ROOM = "AMBIGUOUS"


async def get_contextual_room(source_device: str, db: Session) -> str:
    source_device_name = source_device.strip()
    logger.info("Resolving contextual room for source device: {}", source_device_name)

    mapped_room = STATIC_DEVICE_ROOM_MAP.get(source_device_name)
    if mapped_room is not None:
        logger.info("Matched source device {} to static room {}.", source_device_name, mapped_room)
        return mapped_room

    states = await HomeAssistantRestClient.from_env().get_states()
    active_radar_entity_ids = [
        entity_id
        for state in states
        if (entity_id := _active_radar_entity_id(state)) is not None
    ]

    logger.info("Found {} active radar sensors for contextual arbitration.", len(active_radar_entity_ids))

    if len(active_radar_entity_ids) != 1:
        logger.warning(
            "Unable to determine room from radar sensors. Active radars: {}",
            active_radar_entity_ids,
        )
        return AMBIGUOUS_ROOM

    room_name = _room_name_for_entity_id(db, active_radar_entity_ids[0])
    if room_name is None:
        logger.warning(
            "Active radar entity {} is not mapped to any room in the database.",
            active_radar_entity_ids[0],
        )
        return AMBIGUOUS_ROOM

    logger.info(
        "Resolved contextual room {} from active radar entity {}.",
        room_name,
        active_radar_entity_ids[0],
    )
    return room_name


def _active_radar_entity_id(state: dict[str, object]) -> str | None:
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


def _room_name_for_entity_id(db: Session, entity_id: str) -> str | None:
    stmt = (
        select(Room.name)
        .join(Device, Device.room_id == Room.id)
        .where(Device.ha_entity_id == entity_id)
        .limit(1)
    )
    return db.scalar(stmt)
