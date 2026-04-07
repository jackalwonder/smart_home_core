from __future__ import annotations

"""Home Assistant 导入服务，把实体注册表与状态快照同步到本地目录。"""

import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from websockets.asyncio.client import connect

from app.database import run_in_threadpool_session
from app.models import Device, DeviceStatus, DeviceType, Room, Zone
from app.schemas import HomeAssistantImportResponse
from app.services.errors import ConfigurationError, ExternalServiceError
from app.services.home_assistant_state_mapper import map_home_assistant_state
from app.services.home_assistant_api import HomeAssistantRestClient

logger = logging.getLogger(__name__)

IMPORT_ZONE_NAME = "Home Assistant 导入"
IMPORT_ZONE_DESCRIPTION = "由系统从 Home Assistant 自动同步的真实实体分组。"
MAX_ROOM_NAME_LENGTH = 100
MAX_DEVICE_NAME_LENGTH = 100

SUPPORTED_DOMAINS = {
    "binary_sensor",
    "button",
    "camera",
    "climate",
    "conversation",
    "cover",
    "event",
    "fan",
    "light",
    "lock",
    "media_player",
    "notify",
    "number",
    "person",
    "scene",
    "select",
    "sensor",
    "sun",
    "switch",
    "text",
    "todo",
    "tts",
    "weather",
    "zone",
}

NOISE_ENTITY_PREFIXES = (
    "conversation.",
    "event.backup_",
    "sensor.backup_",
    "sensor.sun_",
    "sun.",
    "tts.",
)

ROOM_BY_DOMAIN = {
    "binary_sensor": "系统监测",
    "button": "快捷操作",
    "camera": "安防监控",
    "climate": "环境控制",
    "conversation": "语音与助手",
    "cover": "门窗与遮阳",
    "event": "事件与告警",
    "fan": "环境控制",
    "light": "照明设备",
    "lock": "门锁与安防",
    "media_player": "影音娱乐",
    "notify": "消息与动作",
    "number": "参数调节",
    "person": "人员与区域",
    "scene": "场景联动",
    "select": "模式选择",
    "sensor": "系统监测",
    "sun": "天气与天文",
    "switch": "设备开关",
    "text": "文本输入",
    "todo": "生活清单",
    "tts": "语音与播报",
    "weather": "天气与天文",
    "zone": "人员与区域",
}


@dataclass(slots=True)
class RegistryEntityInfo:
    entity_id: str
    area_name: str | None
    device_id: str | None
    device_name: str | None
    device_model: str | None
    manufacturer: str | None


@dataclass(slots=True)
class ImportEntity:
    entity_id: str
    friendly_name: str
    state: str
    domain: str
    area_name: str | None
    ha_device_id: str | None
    device_type: DeviceType
    device_status: DeviceStatus


async def import_home_assistant_entities() -> HomeAssistantImportResponse:
    client = HomeAssistantRestClient.from_env()
    states = await client.get_states()
    registry_snapshot = await fetch_entity_registry_snapshot(client.websocket_url, client.access_token)
    entities = _build_import_entities(states, registry_snapshot)

    # 网络侧先取齐快照，再在线程池里执行数据库写入，避免阻塞事件循环。
    summary = await run_in_threadpool_session(_sync_entities_to_database, entities)
    logger.info(
        "Imported %s Home Assistant entities into zone %s.",
        summary.imported_device_count,
        summary.zone_name,
    )
    return summary


async def fetch_entity_registry_snapshot_from_env() -> dict[str, RegistryEntityInfo]:
    client = HomeAssistantRestClient.from_env()
    return await fetch_entity_registry_snapshot(client.websocket_url, client.access_token)


async def fetch_entity_registry_snapshot(
    websocket_url: str,
    access_token: str,
) -> dict[str, RegistryEntityInfo]:
    if not websocket_url or not access_token:
        raise ConfigurationError("Home Assistant WebSocket 尚未配置，无法获取实体注册表。")

    try:
        async with connect(websocket_url, open_timeout=15, close_timeout=10, max_size=2_000_000) as websocket:
            greeting = await _receive_json(websocket)
            if greeting.get("type") != "auth_required":
                raise ExternalServiceError(
                    "Home Assistant",
                    f"Unexpected registry handshake payload: {greeting}",
                )

            await websocket.send(json.dumps({"type": "auth", "access_token": access_token}))
            auth_result = await _receive_json(websocket)
            if auth_result.get("type") != "auth_ok":
                raise ExternalServiceError(
                    "Home Assistant",
                    f"Registry authentication failed: {auth_result}",
                )

            await websocket.send(json.dumps({"id": 1, "type": "config/area_registry/list"}))
            await websocket.send(json.dumps({"id": 2, "type": "config/entity_registry/list"}))
            await websocket.send(json.dumps({"id": 3, "type": "config/device_registry/list"}))

            results: dict[int, dict[str, Any]] = {}
            for _ in range(3):
                payload = await _receive_json(websocket)
                payload_id = payload.get("id")
                if isinstance(payload_id, int):
                    results[payload_id] = payload
            return _build_registry_snapshot(results)
    except Exception:
        logger.exception("Failed to fetch Home Assistant registry metadata.")
        raise


def _sync_entities_to_database(db: Session, entities: list[ImportEntity]) -> HomeAssistantImportResponse:
    zone = db.scalar(
        select(Zone)
        .where(Zone.name == IMPORT_ZONE_NAME)
        .options(selectinload(Zone.rooms).selectinload(Room.devices))
    )

    if zone is None:
        zone = Zone(name=IMPORT_ZONE_NAME, description=IMPORT_ZONE_DESCRIPTION)
        db.add(zone)
        db.flush()
        zone.rooms = []
    else:
        zone.description = IMPORT_ZONE_DESCRIPTION

    existing_rooms_by_name = {room.name: room for room in zone.rooms}
    existing_devices_by_entity_id = {
        device.ha_entity_id: device
        for room in zone.rooms
        for device in room.devices
    }

    imported_room_names = {entity.area_name or _fallback_room_name(entity.domain) for entity in entities}
    imported_entity_ids = {entity.entity_id for entity in entities}

    created_room_count = 0
    created_device_count = 0
    updated_device_count = 0

    for entity in entities:
        room_name = _truncate_text(entity.area_name or _fallback_room_name(entity.domain), MAX_ROOM_NAME_LENGTH)
        room = existing_rooms_by_name.get(room_name)
        if room is None:
            room = Room(
                name=room_name,
                description=_room_description(room_name, entity.area_name is not None),
                zone_id=zone.id,
            )
            db.add(room)
            db.flush()
            existing_rooms_by_name[room_name] = room
            created_room_count += 1
        elif room.description is None:
            room.description = _room_description(room_name, entity.area_name is not None)

        device = existing_devices_by_entity_id.get(entity.entity_id)
        if device is None:
            device = Device(
                name=_truncate_text(entity.friendly_name, MAX_DEVICE_NAME_LENGTH),
                ha_entity_id=entity.entity_id,
                ha_device_id=entity.ha_device_id,
                device_type=entity.device_type,
                current_status=entity.device_status,
                room_id=room.id,
            )
            db.add(device)
            existing_devices_by_entity_id[entity.entity_id] = device
            created_device_count += 1
            continue

        name_changed = device.name != entity.friendly_name
        type_changed = device.device_type != entity.device_type
        status_changed = device.current_status != entity.device_status
        room_changed = device.room_id != room.id
        device_link_changed = device.ha_device_id != entity.ha_device_id

        device.name = _truncate_text(entity.friendly_name, MAX_DEVICE_NAME_LENGTH)
        device.ha_device_id = entity.ha_device_id
        device.device_type = entity.device_type
        device.current_status = entity.device_status
        device.room_id = room.id

        if name_changed or type_changed or status_changed or room_changed or device_link_changed:
            updated_device_count += 1

    stale_devices = [
        device
        for entity_id, device in existing_devices_by_entity_id.items()
        if entity_id not in imported_entity_ids
    ]
    for device in stale_devices:
        db.delete(device)

    db.flush()

    removable_rooms = [
        room
        for room_name, room in existing_rooms_by_name.items()
        if room_name not in imported_room_names and not room.devices
    ]
    for room in removable_rooms:
        db.delete(room)

    db.commit()

    active_zone = db.scalar(
        select(Zone)
        .where(Zone.id == zone.id)
        .options(selectinload(Zone.rooms).selectinload(Room.devices))
    )
    active_rooms = active_zone.rooms if active_zone is not None else []

    return HomeAssistantImportResponse(
        zone_name=zone.name,
        imported_room_count=len(active_rooms),
        imported_device_count=len(imported_entity_ids),
        created_room_count=created_room_count,
        created_device_count=created_device_count,
        updated_device_count=updated_device_count,
        removed_device_count=len(stale_devices),
    )


def _build_import_entities(
    states: list[dict[str, Any]],
    registry_snapshot: dict[str, RegistryEntityInfo],
) -> list[ImportEntity]:
    entities: list[ImportEntity] = []

    for state in states:
        entity_id = state.get("entity_id")
        if not entity_id or "." not in entity_id:
            continue
        if _is_noise_entity(entity_id):
            continue

        domain = entity_id.split(".", 1)[0]
        if not _is_supported_domain(domain):
            continue

        attributes = state.get("attributes") or {}
        registry_info = registry_snapshot.get(entity_id)
        friendly_name = _truncate_text(str(attributes.get("friendly_name") or entity_id), MAX_DEVICE_NAME_LENGTH)
        raw_state = str(state.get("state", "unknown"))

        entities.append(
            ImportEntity(
                entity_id=entity_id,
                friendly_name=friendly_name,
                state=raw_state,
                domain=domain,
                area_name=registry_info.area_name if registry_info else None,
                ha_device_id=registry_info.device_id if registry_info else None,
                device_type=_map_device_type(domain, entity_id, friendly_name),
                device_status=_map_device_status(raw_state),
            )
        )

    entities.sort(
        key=lambda item: (
            item.area_name or _fallback_room_name(item.domain),
            item.ha_device_id or "",
            item.friendly_name,
            item.entity_id,
        )
    )
    return entities


def _build_registry_snapshot(results: dict[int, dict[str, Any]]) -> dict[str, RegistryEntityInfo]:
    area_payload = results.get(1, {})
    entity_payload = results.get(2, {})
    device_payload = results.get(3, {})

    if not area_payload.get("success") or not entity_payload.get("success") or not device_payload.get("success"):
        raise ExternalServiceError(
            "Home Assistant",
            "Registry list commands did not complete successfully.",
        )

    areas = {
        item["area_id"]: item["name"]
        for item in area_payload.get("result", [])
        if isinstance(item, dict) and item.get("area_id") and item.get("name")
    }

    devices = {
        item["id"]: item
        for item in device_payload.get("result", [])
        if isinstance(item, dict) and item.get("id")
    }

    snapshot: dict[str, RegistryEntityInfo] = {}
    for item in entity_payload.get("result", []):
        if not isinstance(item, dict):
            continue

        entity_id = item.get("entity_id")
        if not entity_id or item.get("disabled_by") or item.get("hidden_by"):
            continue

        device_id = item.get("device_id")
        device_entry = devices.get(device_id) if device_id else None
        area_id = item.get("area_id") or (device_entry or {}).get("area_id")
        area_name = areas.get(area_id) if area_id else None

        snapshot[entity_id] = RegistryEntityInfo(
            entity_id=entity_id,
            area_name=area_name,
            device_id=device_id,
            device_name=_first_non_empty(
                (device_entry or {}).get("name_by_user"),
                (device_entry or {}).get("name"),
                item.get("original_name"),
            ),
            device_model=_first_non_empty(
                (device_entry or {}).get("model"),
                (device_entry or {}).get("model_id"),
            ),
            manufacturer=_first_non_empty((device_entry or {}).get("manufacturer")),
        )

    return snapshot


def _first_non_empty(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _is_supported_domain(domain: str) -> bool:
    return domain in SUPPORTED_DOMAINS


def _is_noise_entity(entity_id: str) -> bool:
    return entity_id.startswith(NOISE_ENTITY_PREFIXES)


def _map_device_type(domain: str, entity_id: str, friendly_name: str) -> DeviceType:
    lowered_text = f"{entity_id} {friendly_name}".lower()
    if "nas" in lowered_text:
        return DeviceType.NAS
    if "pc" in lowered_text or "desktop" in lowered_text or "computer" in lowered_text:
        return DeviceType.WINDOWS_PC
    if domain == "light":
        return DeviceType.MIJIA_LIGHT
    if domain in {"switch", "lock", "cover", "scene", "fan"}:
        return DeviceType.SWITCH
    if domain == "camera":
        return DeviceType.CAMERA
    if domain in {"climate", "weather", "humidifier", "water_heater"}:
        return DeviceType.CLIMATE
    return DeviceType.SENSOR


def _map_device_status(raw_state: str) -> DeviceStatus:
    return map_home_assistant_state(raw_state)


def _fallback_room_name(domain: str) -> str:
    return ROOM_BY_DOMAIN.get(domain, "未分类实体")


def _room_description(room_name: str, is_area_room: bool) -> str:
    if is_area_room:
        return f"来自 Home Assistant 区域映射：{room_name}"
    return f"按 Home Assistant 域自动归类的实体分组：{room_name}"


def _truncate_text(value: str, max_length: int) -> str:
    normalized = value.strip()
    if len(normalized) <= max_length:
        return normalized
    if max_length <= 3:
        return normalized[:max_length]
    return f"{normalized[: max_length - 3].rstrip()}..."


async def _receive_json(websocket) -> dict[str, Any]:
    payload = json.loads(await websocket.recv())
    if isinstance(payload, dict):
        return payload
    raise ValueError(f"Unexpected Home Assistant WebSocket payload: {payload!r}")
