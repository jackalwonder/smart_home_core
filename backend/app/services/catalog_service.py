from __future__ import annotations

"""目录服务，负责把数据库实体整理成适合前端展示的房间与设备视图。"""

import asyncio
import logging
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import run_in_threadpool_session
from app.models import Device, Room, Zone
from app.schemas import DeviceCreate, RoomCreate, ZoneCreate
from app.services.errors import ConflictError, NotFoundError
from app.services.home_assistant_api import HomeAssistantRestClient
from app.services.home_assistant_import_service import RegistryEntityInfo, fetch_entity_registry_snapshot_from_env

logger = logging.getLogger(__name__)

NOISE_ENTITY_PREFIXES = (
    "conversation.",
    "event.backup_",
    "sensor.backup_",
    "sensor.sun_",
    "sun.",
    "tts.",
)

TOGGLE_DOMAINS = {"fan", "light", "switch", "climate", "media_player", "cover", "lock"}
HIDDEN_DASHBOARD_DOMAINS = {"event", "notify", "person", "zone", "weather", "conversation", "tts", "sun", "todo"}
VISIBLE_SENSOR_DEVICE_CLASSES = {"temperature", "humidity", "moisture"}
UNSAFE_BUTTON_KEYWORDS = ("恢复", "重置", "reset", "默认", "删除", "唤醒", "同步", "请求")
AGGREGATED_APPLIANCE_TYPES = {
    "fridge",
    "air_conditioner",
    "tv",
    "media",
    "purifier",
    "washer",
    "speaker",
    "router",
    "nas",
    "computer",
    "camera",
}


def create_zone(db: Session, payload: ZoneCreate) -> Zone:
    zone = Zone(name=payload.name, description=payload.description)
    db.add(zone)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("区域名称已存在。") from exc
    db.refresh(zone)
    return zone


def list_zones(db: Session) -> list[Zone]:
    return list(db.scalars(select(Zone).order_by(Zone.name)).all())


def create_room(db: Session, payload: RoomCreate) -> Room:
    zone = db.get(Zone, payload.zone_id)
    if zone is None:
        raise NotFoundError("未找到对应区域。")

    room = Room(
        name=payload.name,
        description=payload.description,
        zone_id=payload.zone_id,
        plan_x=payload.plan_x,
        plan_y=payload.plan_y,
        plan_width=payload.plan_width,
        plan_height=payload.plan_height,
        plan_rotation=payload.plan_rotation,
    )
    db.add(room)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("该区域下的房间名称已存在。") from exc
    db.refresh(room)
    return room


def list_rooms(db: Session) -> list[Room]:
    return list(db.scalars(select(Room).order_by(Room.zone_id, Room.name)).all())


def create_device(db: Session, payload: DeviceCreate) -> Device:
    room = db.get(Room, payload.room_id)
    if room is None:
        raise NotFoundError("未找到对应房间。")

    device = Device(
        name=payload.name,
        ha_entity_id=payload.ha_entity_id,
        ha_device_id=payload.ha_device_id,
        device_type=payload.device_type,
        current_status=payload.current_status,
        room_id=payload.room_id,
        plan_x=payload.plan_x,
        plan_y=payload.plan_y,
        plan_z=payload.plan_z,
        plan_rotation=payload.plan_rotation,
    )
    db.add(device)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("设备实体 ID 已存在。") from exc
    db.refresh(device)
    return device


def list_devices(db: Session) -> list[Device]:
    return list(db.scalars(select(Device).order_by(Device.room_id, Device.name)).all())


def get_device(db: Session, device_id: int) -> Device:
    device = db.get(Device, device_id)
    if device is None:
        raise NotFoundError("未找到对应设备。")
    return device


def list_devices_by_room(db: Session, room_id: int) -> list[Device]:
    room = db.get(Room, room_id)
    if room is None:
        raise NotFoundError("未找到对应房间。")

    stmt = select(Device).where(Device.room_id == room_id).order_by(Device.name)
    return list(db.scalars(stmt).all())


def list_room_snapshots(db: Session) -> list[Room]:
    stmt = (
        select(Room)
        .options(joinedload(Room.zone), joinedload(Room.devices))
        .order_by(Room.zone_id, Room.name)
    )
    return list(db.scalars(stmt).unique().all())


async def list_room_snapshots_for_ui(db: Session) -> list[dict[str, Any]]:
    rooms = await run_in_threadpool_session(lambda session: list_room_snapshots(session))
    state_map, registry_map = await _load_home_assistant_context()
    return _build_room_snapshots_for_frontend(
        rooms,
        state_map,
        registry_map,
        include_empty_rooms=False,
        device_filter=_should_include_in_dashboard,
    )


async def list_room_snapshots_for_spatial_scene(db: Session) -> list[dict[str, Any]]:
    rooms = await run_in_threadpool_session(lambda session: list_room_snapshots(session))
    state_map, registry_map = await _load_home_assistant_context()
    return _build_room_snapshots_for_frontend(
        rooms,
        state_map,
        registry_map,
        include_empty_rooms=True,
        device_filter=_should_include_in_spatial_scene,
    )


async def list_devices_by_room_for_ui(db: Session, room_id: int) -> list[dict[str, Any]]:
    devices = await run_in_threadpool_session(list_devices_by_room, room_id)
    state_map, registry_map = await _load_home_assistant_context()
    return sorted(
        [
            device_view
            for device in devices
            if not _is_noise_entity(device.ha_entity_id)
            for device_view in [_serialize_device(device, state_map.get(device.ha_entity_id), registry_map.get(device.ha_entity_id))]
            if _should_include_in_dashboard(device_view)
        ],
        key=lambda item: item["name"],
    )


async def _load_home_assistant_context() -> tuple[dict[str, dict[str, Any]], dict[str, RegistryEntityInfo]]:
    # 状态流和实体注册表互不依赖，适合并发拉取以缩短首屏等待。
    state_task = asyncio.create_task(_load_state_map())
    registry_task = asyncio.create_task(_load_registry_map())
    return await asyncio.gather(state_task, registry_task)


def _build_room_snapshots_for_frontend(
    rooms: list[Room],
    state_map: dict[str, dict[str, Any]],
    registry_map: dict[str, RegistryEntityInfo],
    *,
    include_empty_rooms: bool,
    device_filter: Callable[[dict[str, Any]], bool],
) -> list[dict[str, Any]]:
    snapshots: list[dict[str, Any]] = []
    for room in rooms:
        devices = [
            device_view
            for device in room.devices
            if not _is_noise_entity(device.ha_entity_id)
            for device_view in [_serialize_device(device, state_map.get(device.ha_entity_id), registry_map.get(device.ha_entity_id))]
            if device_filter(device_view)
        ]

        if not include_empty_rooms and not devices:
            continue

        environment = _room_environment_summary(room.devices, state_map)
        snapshots.append(
            {
                "id": room.id,
                "zone_id": room.zone_id,
                "name": room.name,
                "description": room.description,
                "zone": {
                    "id": room.zone.id,
                    "name": room.zone.name,
                    "description": room.zone.description,
                    "floor_plan_image_path": room.zone.floor_plan_image_path,
                    "floor_plan_image_width": room.zone.floor_plan_image_width,
                    "floor_plan_image_height": room.zone.floor_plan_image_height,
                    "floor_plan_analysis": room.zone.floor_plan_analysis,
                },
                "plan_x": room.plan_x,
                "plan_y": room.plan_y,
                "plan_width": room.plan_width,
                "plan_height": room.plan_height,
                "plan_rotation": room.plan_rotation,
                "ambient_temperature": environment["ambient_temperature"],
                "ambient_humidity": environment["ambient_humidity"],
                "occupancy_status": environment["occupancy_status"],
                "active_device_count": environment["active_device_count"],
                "devices": sorted(devices, key=lambda item: item["name"]),
            }
        )

    return snapshots


def _serialize_device(
    device: Device,
    state: dict[str, Any] | None,
    registry_info: RegistryEntityInfo | None,
) -> dict[str, Any]:
    entity_domain = device.ha_entity_id.split(".", 1)[0]
    attributes = state.get("attributes", {}) if isinstance(state, dict) else {}
    raw_state = str(state.get("state")) if isinstance(state, dict) and state.get("state") is not None else None
    control_kind = _control_kind(entity_domain, attributes)
    device_class = _string_attribute(attributes, "device_class")
    appliance_name = _appliance_name(device.name, registry_info)
    appliance_type = _appliance_type(entity_domain, device.name, registry_info)

    return {
        "id": device.id,
        "room_id": device.room_id,
        "name": device.name,
        "ha_entity_id": device.ha_entity_id,
        "ha_device_id": device.ha_device_id or (registry_info.device_id if registry_info else None),
        "device_type": device.device_type,
        "current_status": device.current_status,
        "entity_domain": entity_domain,
        "raw_state": raw_state,
        "device_class": device_class,
        "can_control": control_kind is not None,
        "control_kind": control_kind,
        "control_options": _control_options(entity_domain, attributes),
        "number_value": _number_value(entity_domain, raw_state),
        "min_value": _float_attribute(attributes, "min"),
        "max_value": _float_attribute(attributes, "max"),
        "step": _float_attribute(attributes, "step"),
        "unit_of_measurement": _string_attribute(attributes, "unit_of_measurement"),
        "target_temperature": _climate_target_temperature(entity_domain, attributes),
        "current_temperature": _climate_current_temperature(entity_domain, attributes),
        "hvac_mode": raw_state if entity_domain == "climate" else None,
        "hvac_modes": _climate_hvac_modes(entity_domain, attributes),
        "media_volume_level": _media_volume_level(entity_domain, attributes),
        "media_source": _string_attribute(attributes, "source") if entity_domain == "media_player" else None,
        "media_source_options": _media_source_options(entity_domain, attributes),
        "appliance_name": appliance_name,
        "appliance_type": appliance_type,
        "plan_x": device.plan_x,
        "plan_y": device.plan_y,
        "plan_z": device.plan_z,
        "plan_rotation": device.plan_rotation,
    }


async def _load_state_map() -> dict[str, dict[str, Any]]:
    try:
        client = HomeAssistantRestClient.from_env()
        states = await client.get_states()
    except Exception:
        logger.exception("Failed to load Home Assistant states for catalog serialization.")
        return {}

    return {
        item["entity_id"]: item
        for item in states
        if isinstance(item, dict) and isinstance(item.get("entity_id"), str)
    }


async def _load_registry_map() -> dict[str, RegistryEntityInfo]:
    try:
        return await fetch_entity_registry_snapshot_from_env()
    except Exception:
        logger.exception("Failed to load Home Assistant registry metadata for catalog serialization.")
        return {}


def _control_kind(entity_domain: str, attributes: dict[str, Any]) -> str | None:
    if entity_domain in TOGGLE_DOMAINS:
        return "toggle"
    if entity_domain == "number" and _float_attribute(attributes, "min") is not None:
        return "number"
    if entity_domain == "select" and isinstance(attributes.get("options"), list):
        return "select"
    if entity_domain == "button":
        return "button"
    return None


def _control_options(entity_domain: str, attributes: dict[str, Any]) -> list[str]:
    if entity_domain != "select":
        return []
    options = attributes.get("options")
    if not isinstance(options, list):
        return []
    return [str(option) for option in options]


def _number_value(entity_domain: str, raw_state: str | None) -> float | None:
    if entity_domain != "number" or raw_state is None:
        return None
    try:
        return float(raw_state)
    except (TypeError, ValueError):
        return None


def _float_attribute(attributes: dict[str, Any], key: str) -> float | None:
    value = attributes.get(key)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _string_attribute(attributes: dict[str, Any], key: str) -> str | None:
    value = attributes.get(key)
    if value is None:
        return None
    return str(value)


def _climate_target_temperature(entity_domain: str, attributes: dict[str, Any]) -> float | None:
    if entity_domain != "climate":
        return None
    return _float_attribute(attributes, "temperature")


def _climate_current_temperature(entity_domain: str, attributes: dict[str, Any]) -> float | None:
    if entity_domain != "climate":
        return None
    return _float_attribute(attributes, "current_temperature")


def _climate_hvac_modes(entity_domain: str, attributes: dict[str, Any]) -> list[str]:
    if entity_domain != "climate":
        return []
    values = attributes.get("hvac_modes")
    if not isinstance(values, list):
        return []
    return [str(value) for value in values if str(value).strip()]


def _media_volume_level(entity_domain: str, attributes: dict[str, Any]) -> float | None:
    if entity_domain != "media_player":
        return None
    value = _float_attribute(attributes, "volume_level")
    if value is None:
        return None
    return round(value * 100, 2)


def _media_source_options(entity_domain: str, attributes: dict[str, Any]) -> list[str]:
    if entity_domain != "media_player":
        return []
    values = attributes.get("source_list")
    if not isinstance(values, list):
        return []
    return [str(value) for value in values if str(value).strip()]


def _is_noise_entity(entity_id: str) -> bool:
    return entity_id.startswith(NOISE_ENTITY_PREFIXES)


def _should_include_in_dashboard(device_view: dict[str, Any]) -> bool:
    domain = device_view["entity_domain"]
    if domain in HIDDEN_DASHBOARD_DOMAINS:
        return False

    control_kind = device_view["control_kind"]
    if control_kind in {"toggle", "number", "select"}:
        return True

    if control_kind == "button":
        lowered_name = device_view["name"].lower()
        return not any(keyword in lowered_name for keyword in UNSAFE_BUTTON_KEYWORDS)

    if domain == "sensor":
        device_class = device_view.get("device_class")
        if device_class in VISIBLE_SENSOR_DEVICE_CLASSES:
            return True
        if device_view.get("unit_of_measurement") in {"°C", "%"}:
            return True
        return False

    if domain == "binary_sensor":
        return device_view.get("device_class") in {"door", "window", "moisture", "motion"}

    return False


def _should_include_in_spatial_scene(device_view: dict[str, Any]) -> bool:
    domain = device_view["entity_domain"]
    if domain in HIDDEN_DASHBOARD_DOMAINS:
        return False

    if _should_include_in_dashboard(device_view):
        return True

    if domain == "binary_sensor":
        return device_view.get("device_class") in {"motion", "presence", "occupancy"}

    return domain in {"camera", "climate", "cover", "fan", "light", "lock", "media_player", "sensor", "switch"}


def _appliance_name(device_name: str, registry_info: RegistryEntityInfo | None) -> str:
    if registry_info and registry_info.device_name:
        return registry_info.device_name

    base = device_name.split(" * ")[0].split("  ")[0].strip()
    return base or device_name


def _appliance_type(
    entity_domain: str,
    device_name: str,
    registry_info: RegistryEntityInfo | None,
) -> str:
    text = " ".join(
        part
        for part in [
            entity_domain,
            device_name,
            registry_info.device_name if registry_info else None,
            registry_info.device_model if registry_info else None,
            registry_info.manufacturer if registry_info else None,
        ]
        if part
    ).lower()

    if any(keyword in text for keyword in ("冰箱", "refrigerator", "fridge")):
        return "fridge"
    if any(keyword in text for keyword in ("空调", "air conditioner", "ac", "hvac")) or entity_domain == "climate":
        return "air_conditioner"
    if any(keyword in text for keyword in ("电视", "tv", "xiaomi tv", "bravia")):
        return "tv"
    if any(keyword in text for keyword in ("nas", "network attached storage", "synology", "qnap")):
        return "nas"
    if any(keyword in text for keyword in ("pc", "desktop", "computer", "windows pc")):
        return "computer"
    if entity_domain == "camera" or any(keyword in text for keyword in ("camera", "cam", "鎽勫儚")):
        return "camera"
    if entity_domain == "media_player":
        return "media"
    if any(keyword in text for keyword in ("净化", "purifier", "空气净化")):
        return "purifier"
    if any(keyword in text for keyword in ("洗衣", "washer", "laundry")):
        return "washer"
    if any(keyword in text for keyword in ("音箱", "speaker", "soundbar", "homepod")):
        return "speaker"
    if any(keyword in text for keyword in ("路由", "router", "mesh")):
        return "router"
    return "generic"


def is_aggregated_appliance_type(appliance_type: str | None) -> bool:
    return appliance_type in AGGREGATED_APPLIANCE_TYPES


def _room_environment_summary(
    devices: list[Device],
    state_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    temperature: float | None = None
    humidity: float | None = None
    occupancy_status: str | None = None
    active_device_count = 0

    for device in devices:
        state = state_map.get(device.ha_entity_id)
        attributes = state.get("attributes", {}) if isinstance(state, dict) else {}
        raw_state = str(state.get("state")) if isinstance(state, dict) and state.get("state") is not None else None
        entity_domain = device.ha_entity_id.split(".", 1)[0]
        device_class = _string_attribute(attributes, "device_class")

        if raw_state and raw_state.lower() in {"on", "online", "playing", "heat", "cool", "heat_cool", "dry", "fan_only", "auto"}:
            active_device_count += 1

        if temperature is None and device_class == "temperature":
            temperature = _coerce_optional_float(raw_state)

        if humidity is None and device_class == "humidity":
            humidity = _coerce_optional_float(raw_state)

        if occupancy_status is None and entity_domain == "binary_sensor" and device_class in {"motion", "presence", "occupancy"}:
            occupancy_status = "occupied" if (raw_state or "").lower() == "on" else "vacant"

    return {
        "ambient_temperature": temperature,
        "ambient_humidity": humidity,
        "occupancy_status": occupancy_status,
        "active_device_count": active_device_count,
    }


def _coerce_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def get_zone(db: Session, zone_id: int) -> Zone:
    zone = db.get(Zone, zone_id)
    if zone is None:
        raise NotFoundError("未找到对应区域。")
    return zone


def get_room(db: Session, room_id: int) -> Room:
    room = db.get(Room, room_id)
    if room is None:
        raise NotFoundError("未找到对应房间。")
    return room


def update_zone_floor_plan(
    db: Session,
    zone_id: int,
    image_path: str,
    image_width: int,
    image_height: int,
    analysis: str,
) -> Zone:
    zone = get_zone(db, zone_id)
    zone.floor_plan_image_path = image_path
    zone.floor_plan_image_width = image_width
    zone.floor_plan_image_height = image_height
    zone.floor_plan_analysis = analysis
    db.commit()
    db.refresh(zone)
    return zone


def update_room_layout(
    db: Session,
    room_id: int,
    *,
    plan_x: float | None,
    plan_y: float | None,
    plan_width: float | None,
    plan_height: float | None,
    plan_rotation: float | None,
) -> Room:
    room = get_room(db, room_id)
    room.plan_x = plan_x
    room.plan_y = plan_y
    room.plan_width = plan_width
    room.plan_height = plan_height
    room.plan_rotation = plan_rotation
    db.commit()
    db.refresh(room)
    return room


def update_device_placement(
    db: Session,
    device_id: int,
    *,
    plan_x: float | None,
    plan_y: float | None,
    plan_z: float | None,
    plan_rotation: float | None,
) -> Device:
    device = get_device(db, device_id)
    device.plan_x = plan_x
    device.plan_y = plan_y
    device.plan_z = plan_z
    device.plan_rotation = plan_rotation
    db.commit()
    db.refresh(device)
    return device
