from __future__ import annotations

"""户型图、空间布局与设备点位服务。"""

from math import ceil
from pathlib import Path
import re
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import FLOOR_PLAN_DIR, run_in_threadpool_session
from app.models import Device, DeviceType, Room, Zone
from app.schemas import DeviceCreate, DevicePlacementUpdate, RoomLayoutUpdate, SpatialManualDeviceCreate
from app.services import catalog_service
from app.services.errors import NotFoundError

DEFAULT_PLAN_WIDTH = 1600
DEFAULT_PLAN_HEIGHT = 960
ACTIVE_STATES = {"on", "online", "playing", "heat", "cool", "heat_cool", "dry", "fan_only", "auto"}

ROOM_TYPE_PRIORITY = {
    "living": 0,
    "master": 1,
    "bedroom": 2,
    "dining": 3,
    "kitchen": 4,
    "study": 5,
    "bath": 6,
    "balcony": 7,
    "entry": 8,
    "storage": 9,
    "generic": 10,
}

ROOM_TEMPLATES: dict[str, list[tuple[float, float, float, float]]] = {
    "living": [(0.07, 0.36, 0.46, 0.42)],
    "master": [(0.07, 0.08, 0.28, 0.22)],
    "bedroom": [(0.38, 0.08, 0.24, 0.22), (0.64, 0.08, 0.22, 0.22)],
    "dining": [(0.55, 0.33, 0.18, 0.17)],
    "kitchen": [(0.74, 0.28, 0.2, 0.22)],
    "study": [(0.72, 0.56, 0.2, 0.18)],
    "bath": [(0.53, 0.54, 0.14, 0.14), (0.68, 0.54, 0.14, 0.14)],
    "balcony": [(0.08, 0.81, 0.8, 0.11)],
    "entry": [(0.55, 0.72, 0.18, 0.11)],
    "storage": [(0.75, 0.72, 0.12, 0.11)],
}

FALLBACK_SLOTS = [
    (0.08, 0.1, 0.24, 0.18),
    (0.36, 0.1, 0.24, 0.18),
    (0.64, 0.1, 0.24, 0.18),
    (0.08, 0.34, 0.24, 0.18),
    (0.36, 0.34, 0.24, 0.18),
    (0.64, 0.34, 0.24, 0.18),
    (0.08, 0.58, 0.24, 0.18),
    (0.36, 0.58, 0.24, 0.18),
    (0.64, 0.58, 0.24, 0.18),
]


async def get_spatial_scene(zone_id: int | None = None) -> dict[str, object]:
    rooms = await catalog_service.list_room_snapshots_for_spatial_scene(None)
    normalized_rooms = list(rooms)

    if zone_id is None and normalized_rooms:
        zone_id = int(normalized_rooms[0]["zone_id"])

    if zone_id is not None:
        normalized_rooms = [room for room in normalized_rooms if room["zone_id"] == zone_id]

    zone_payload = normalized_rooms[0]["zone"] if normalized_rooms else await run_in_threadpool_session(
        _serialize_first_zone,
        zone_id,
    )

    if zone_payload is None:
        return {"zone": None, "rooms": []}

    plan_width = zone_payload.get("floor_plan_image_width") or DEFAULT_PLAN_WIDTH
    plan_height = zone_payload.get("floor_plan_image_height") or DEFAULT_PLAN_HEIGHT

    derived_layouts = _derive_room_layouts(normalized_rooms, plan_width, plan_height)
    scene_rooms = []
    for room in normalized_rooms:
        derived_layout = derived_layouts.get(int(room["id"]))
        room_payload = {
            **room,
            "plan_x": room.get("plan_x") if room.get("plan_x") is not None else derived_layout["plan_x"],
            "plan_y": room.get("plan_y") if room.get("plan_y") is not None else derived_layout["plan_y"],
            "plan_width": room.get("plan_width") if room.get("plan_width") is not None else derived_layout["plan_width"],
            "plan_height": room.get("plan_height") if room.get("plan_height") is not None else derived_layout["plan_height"],
            "plan_rotation": room.get("plan_rotation") if room.get("plan_rotation") is not None else derived_layout["plan_rotation"],
        }
        room_payload["devices"] = _with_device_fallback_positions(room_payload)
        scene_rooms.append(room_payload)

    return {"zone": zone_payload, "rooms": scene_rooms}


async def save_floor_plan(
    zone_id: int,
    *,
    original_filename: str,
    image_width: int,
    image_height: int,
    payload: bytes,
    preserve_existing: bool,
) -> dict[str, object]:
    image_path = _write_floor_plan_asset(original_filename, payload)
    result = await run_in_threadpool_session(
        _save_floor_plan_and_apply_layout,
        zone_id,
        image_path,
        image_width,
        image_height,
        preserve_existing,
    )
    return {
        "zone": _serialize_zone(result["zone"]),
        "updated_room_count": result["updated_room_count"],
        "image_url": image_path,
    }


async def auto_layout_zone(zone_id: int, preserve_existing: bool) -> dict[str, object]:
    result = await run_in_threadpool_session(_auto_layout_zone, zone_id, preserve_existing)
    return {
        "zone": _serialize_zone(result["zone"]),
        "updated_room_count": result["updated_room_count"],
    }


async def update_room_layout(room_id: int, payload: RoomLayoutUpdate) -> dict[str, object]:
    room = await run_in_threadpool_session(
        catalog_service.update_room_layout,
        room_id,
        plan_x=payload.plan_x,
        plan_y=payload.plan_y,
        plan_width=payload.plan_width,
        plan_height=payload.plan_height,
        plan_rotation=payload.plan_rotation,
    )
    return _serialize_room(room)


async def update_device_placement(device_id: int, payload: DevicePlacementUpdate) -> dict[str, object]:
    device = await run_in_threadpool_session(
        catalog_service.update_device_placement,
        device_id,
        plan_x=payload.plan_x,
        plan_y=payload.plan_y,
        plan_z=payload.plan_z,
        plan_rotation=payload.plan_rotation,
    )
    return _serialize_device_admin(device)


async def create_manual_device(payload: SpatialManualDeviceCreate) -> dict[str, object]:
    create_payload = DeviceCreate(
        room_id=payload.room_id,
        name=payload.name,
        ha_entity_id=payload.ha_entity_id or _build_virtual_entity_id(payload.device_type, payload.name),
        ha_device_id=payload.ha_device_id,
        device_type=payload.device_type,
        current_status=payload.current_status,
        plan_x=payload.plan_x,
        plan_y=payload.plan_y,
        plan_z=payload.plan_z,
        plan_rotation=payload.plan_rotation,
    )
    device = await run_in_threadpool_session(catalog_service.create_device, create_payload)
    await run_in_threadpool_session(_ensure_room_device_positions, payload.room_id)
    refreshed_device = await run_in_threadpool_session(catalog_service.get_device, device.id)
    return _serialize_device_admin(refreshed_device)


def _serialize_first_zone(db: Session, zone_id: int | None) -> dict[str, object] | None:
    stmt = select(Zone).order_by(Zone.id)
    if zone_id is not None:
        stmt = stmt.where(Zone.id == zone_id)
    zone = db.scalar(stmt.limit(1))
    if zone is None:
        return None
    return _serialize_zone(zone)


def _serialize_zone(zone: Zone | dict[str, object]) -> dict[str, object]:
    if isinstance(zone, dict):
        return {
            "id": zone.get("id"),
            "name": zone.get("name"),
            "description": zone.get("description"),
            "floor_plan_image_path": zone.get("floor_plan_image_path"),
            "floor_plan_image_width": zone.get("floor_plan_image_width"),
            "floor_plan_image_height": zone.get("floor_plan_image_height"),
            "floor_plan_analysis": zone.get("floor_plan_analysis"),
        }

    return {
        "id": zone.id,
        "name": zone.name,
        "description": zone.description,
        "floor_plan_image_path": zone.floor_plan_image_path,
        "floor_plan_image_width": zone.floor_plan_image_width,
        "floor_plan_image_height": zone.floor_plan_image_height,
        "floor_plan_analysis": zone.floor_plan_analysis,
    }


def _serialize_room(room: Room) -> dict[str, object]:
    return {
        "id": room.id,
        "zone_id": room.zone_id,
        "name": room.name,
        "description": room.description,
        "plan_x": room.plan_x,
        "plan_y": room.plan_y,
        "plan_width": room.plan_width,
        "plan_height": room.plan_height,
        "plan_rotation": room.plan_rotation,
    }


def _serialize_device_admin(device: Device) -> dict[str, object]:
    return {
        "id": device.id,
        "room_id": device.room_id,
        "name": device.name,
        "ha_entity_id": device.ha_entity_id,
        "ha_device_id": device.ha_device_id,
        "device_type": device.device_type,
        "current_status": device.current_status,
        "plan_x": device.plan_x,
        "plan_y": device.plan_y,
        "plan_z": device.plan_z,
        "plan_rotation": device.plan_rotation,
    }


def _write_floor_plan_asset(original_filename: str, payload: bytes) -> str:
    FLOOR_PLAN_DIR.mkdir(parents=True, exist_ok=True)
    extension = _safe_extension(original_filename)
    filename = f"{uuid4().hex}{extension}"
    target_path = FLOOR_PLAN_DIR / filename
    target_path.write_bytes(payload)
    return f"/media/floorplans/{filename}"


def _safe_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in {".png", ".jpg", ".jpeg", ".webp"} else ".png"


def _build_virtual_entity_id(device_type: DeviceType, name: str) -> str:
    domain = {
        DeviceType.CLIMATE: "climate",
        DeviceType.MIJIA_LIGHT: "light",
        DeviceType.SENSOR: "sensor",
        DeviceType.CAMERA: "camera",
        DeviceType.NAS: "sensor",
        DeviceType.WINDOWS_PC: "switch",
        DeviceType.SWITCH: "switch",
    }.get(device_type, "sensor")
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    if not slug:
        slug = "device"
    return f"{domain}.manual_{slug}_{uuid4().hex[:8]}"


def _save_floor_plan_and_apply_layout(
    db: Session,
    zone_id: int,
    image_path: str,
    image_width: int,
    image_height: int,
    preserve_existing: bool,
) -> dict[str, object]:
    zone = catalog_service.get_zone(db, zone_id)
    analysis = (
        f"已根据户型图尺寸 {image_width}x{image_height} 和当前房间名称生成初始布局。"
        " 这个结果可直接编辑，后续新增设备会按房间自动补充到空间图中。"
    )
    zone = catalog_service.update_zone_floor_plan(
        db,
        zone_id,
        image_path,
        image_width,
        image_height,
        analysis,
    )
    updated_room_count = _apply_auto_layout(db, zone, preserve_existing)
    return {"zone": zone, "updated_room_count": updated_room_count}


def _auto_layout_zone(db: Session, zone_id: int, preserve_existing: bool) -> dict[str, object]:
    zone = catalog_service.get_zone(db, zone_id)
    if zone.floor_plan_image_width is None or zone.floor_plan_image_height is None:
        raise NotFoundError("请先上传户型图，再执行自动布局。")
    updated_room_count = _apply_auto_layout(db, zone, preserve_existing)
    db.refresh(zone)
    return {"zone": zone, "updated_room_count": updated_room_count}


def _apply_auto_layout(db: Session, zone: Zone, preserve_existing: bool) -> int:
    stmt = (
        select(Room)
        .options(joinedload(Room.devices))
        .where(Room.zone_id == zone.id)
        .order_by(Room.name)
    )
    rooms = list(db.scalars(stmt).unique().all())
    layout_map = _derive_room_layouts(
        [
            {
                "id": room.id,
                "name": room.name,
                "description": room.description,
                "devices": [{"id": device.id} for device in room.devices],
                "plan_x": room.plan_x,
                "plan_y": room.plan_y,
                "plan_width": room.plan_width,
                "plan_height": room.plan_height,
                "plan_rotation": room.plan_rotation,
            }
            for room in rooms
        ],
        zone.floor_plan_image_width or DEFAULT_PLAN_WIDTH,
        zone.floor_plan_image_height or DEFAULT_PLAN_HEIGHT,
    )

    updated_room_count = 0
    for room in rooms:
        has_existing_layout = None not in (room.plan_x, room.plan_y, room.plan_width, room.plan_height)
        if preserve_existing and has_existing_layout:
            continue

        layout = layout_map.get(room.id)
        if layout is None:
            continue

        room.plan_x = layout["plan_x"]
        room.plan_y = layout["plan_y"]
        room.plan_width = layout["plan_width"]
        room.plan_height = layout["plan_height"]
        room.plan_rotation = layout["plan_rotation"]
        updated_room_count += 1

        _assign_device_positions(room.devices, layout, force=not preserve_existing)

    db.commit()
    return updated_room_count


def _ensure_room_device_positions(db: Session, room_id: int) -> None:
    room = db.scalar(select(Room).options(joinedload(Room.devices)).where(Room.id == room_id).limit(1))
    if room is None:
        raise NotFoundError("未找到对应房间。")

    if None in (room.plan_x, room.plan_y, room.plan_width, room.plan_height):
        return

    layout = {
        "plan_x": room.plan_x,
        "plan_y": room.plan_y,
        "plan_width": room.plan_width,
        "plan_height": room.plan_height,
        "plan_rotation": room.plan_rotation or 0.0,
    }
    _assign_device_positions(room.devices, layout, force=False)
    db.commit()


def _derive_room_layouts(rooms: list[dict[str, object]], plan_width: int, plan_height: int) -> dict[int, dict[str, float]]:
    sorted_rooms = sorted(
        rooms,
        key=lambda room: (
            ROOM_TYPE_PRIORITY[_classify_room_type(str(room.get("name", "")), str(room.get("description", "") or ""))],
            str(room.get("name", "")),
        ),
    )
    used_template_index: dict[str, int] = {}
    fallback_index = 0
    layouts: dict[int, dict[str, float]] = {}

    for room in sorted_rooms:
        room_type = _classify_room_type(str(room.get("name", "")), str(room.get("description", "") or ""))
        template_slots = ROOM_TEMPLATES.get(room_type, [])
        slot_index = used_template_index.get(room_type, 0)

        if slot_index < len(template_slots):
            normalized = template_slots[slot_index]
            used_template_index[room_type] = slot_index + 1
        else:
            normalized = FALLBACK_SLOTS[fallback_index % len(FALLBACK_SLOTS)]
            fallback_index += 1

        layouts[int(room["id"])] = {
            "plan_x": round(normalized[0] * plan_width, 2),
            "plan_y": round(normalized[1] * plan_height, 2),
            "plan_width": round(normalized[2] * plan_width, 2),
            "plan_height": round(normalized[3] * plan_height, 2),
            "plan_rotation": 0.0,
        }

    return layouts


def _classify_room_type(name: str, description: str) -> str:
    text = f"{name} {description}".lower()
    if any(keyword in text for keyword in ("客厅", "living")):
        return "living"
    if any(keyword in text for keyword in ("主卧", "master")):
        return "master"
    if any(keyword in text for keyword in ("卧室", "bedroom", "次卧", "儿童房")):
        return "bedroom"
    if any(keyword in text for keyword in ("餐厅", "dining")):
        return "dining"
    if any(keyword in text for keyword in ("厨房", "kitchen")):
        return "kitchen"
    if any(keyword in text for keyword in ("书房", "study", "office")):
        return "study"
    if any(keyword in text for keyword in ("卫生间", "浴室", "洗手间", "bath")):
        return "bath"
    if any(keyword in text for keyword in ("阳台", "balcony")):
        return "balcony"
    if any(keyword in text for keyword in ("玄关", "入户", "entry")):
        return "entry"
    if any(keyword in text for keyword in ("储藏", "衣帽间", "杂物", "storage")):
        return "storage"
    return "generic"


def _with_device_fallback_positions(room: dict[str, object]) -> list[dict[str, object]]:
    devices = [dict(device) for device in room.get("devices", [])]
    layout = {
        "plan_x": float(room.get("plan_x") or 0),
        "plan_y": float(room.get("plan_y") or 0),
        "plan_width": float(room.get("plan_width") or 0),
        "plan_height": float(room.get("plan_height") or 0),
        "plan_rotation": float(room.get("plan_rotation") or 0),
    }
    points = _derive_device_positions(devices, layout)
    next_devices = []
    for device in devices:
        point = points.get(int(device["id"]), {})
        next_devices.append(
            {
                **device,
                "plan_x": device.get("plan_x") if device.get("plan_x") is not None else point.get("plan_x"),
                "plan_y": device.get("plan_y") if device.get("plan_y") is not None else point.get("plan_y"),
                "plan_z": device.get("plan_z") if device.get("plan_z") is not None else point.get("plan_z"),
                "plan_rotation": device.get("plan_rotation") if device.get("plan_rotation") is not None else point.get("plan_rotation"),
            }
        )
    return next_devices


def _assign_device_positions(devices: list[Device], layout: dict[str, float], *, force: bool) -> None:
    device_payloads = [
        {
            "id": device.id,
            "entity_domain": device.ha_entity_id.split(".", 1)[0],
            "device_class": None,
            "appliance_type": None,
            "plan_x": device.plan_x,
            "plan_y": device.plan_y,
            "plan_z": device.plan_z,
            "plan_rotation": device.plan_rotation,
        }
        for device in devices
    ]
    points = _derive_device_positions(device_payloads, layout)

    for device in devices:
        point = points.get(device.id)
        if point is None:
            continue
        has_existing = None not in (device.plan_x, device.plan_y)
        if has_existing and not force:
            continue
        device.plan_x = point["plan_x"]
        device.plan_y = point["plan_y"]
        device.plan_z = point["plan_z"]
        device.plan_rotation = point["plan_rotation"]


def _derive_device_positions(devices: list[dict[str, object]], layout: dict[str, float]) -> dict[int, dict[str, float]]:
    if not devices:
        return {}

    room_x = layout["plan_x"]
    room_y = layout["plan_y"]
    room_width = max(layout["plan_width"], 120)
    room_height = max(layout["plan_height"], 80)
    points: dict[int, dict[str, float]] = {}

    top_wall = []
    bottom_wall = []
    sensor_cluster = []
    grid_cluster = []

    for device in devices:
        entity_domain = str(device.get("entity_domain", ""))
        appliance_type = str(device.get("appliance_type", ""))
        device_class = str(device.get("device_class", ""))

        if entity_domain == "climate":
            top_wall.append(device)
        elif entity_domain in {"light", "media_player"} or appliance_type in {"tv", "media", "speaker"}:
            bottom_wall.append(device)
        elif device_class in {"temperature", "humidity", "moisture"} or entity_domain == "sensor":
            sensor_cluster.append(device)
        else:
            grid_cluster.append(device)

    _place_linear(top_wall, points, room_x + room_width * 0.18, room_x + room_width * 0.82, room_y + room_height * 0.14, 0.7)
    _place_linear(bottom_wall, points, room_x + room_width * 0.18, room_x + room_width * 0.82, room_y + room_height * 0.82, 0.2)
    _place_vertical(sensor_cluster, points, room_x + room_width * 0.84, room_y + room_height * 0.22, room_y + room_height * 0.72, 0.9)
    _place_grid(grid_cluster, points, room_x + room_width * 0.22, room_y + room_height * 0.32, room_width * 0.48, room_height * 0.34)
    return points


def _place_linear(
    devices: list[dict[str, object]],
    points: dict[int, dict[str, float]],
    start_x: float,
    end_x: float,
    y: float,
    z: float,
) -> None:
    if not devices:
        return

    step = (end_x - start_x) / max(len(devices) - 1, 1)
    for index, device in enumerate(devices):
        points[int(device["id"])] = {
            "plan_x": round(start_x + step * index, 2),
            "plan_y": round(y, 2),
            "plan_z": z,
            "plan_rotation": 0.0,
        }


def _place_vertical(
    devices: list[dict[str, object]],
    points: dict[int, dict[str, float]],
    x: float,
    start_y: float,
    end_y: float,
    z: float,
) -> None:
    if not devices:
        return

    step = (end_y - start_y) / max(len(devices) - 1, 1)
    for index, device in enumerate(devices):
        points[int(device["id"])] = {
            "plan_x": round(x, 2),
            "plan_y": round(start_y + step * index, 2),
            "plan_z": z,
            "plan_rotation": 0.0,
        }


def _place_grid(
    devices: list[dict[str, object]],
    points: dict[int, dict[str, float]],
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    if not devices:
        return

    columns = min(3, max(1, ceil(len(devices) ** 0.5)))
    rows = ceil(len(devices) / columns)
    cell_width = width / max(columns, 1)
    cell_height = height / max(rows, 1)

    for index, device in enumerate(devices):
        row = index // columns
        column = index % columns
        points[int(device["id"])] = {
            "plan_x": round(x + cell_width * (column + 0.5), 2),
            "plan_y": round(y + cell_height * (row + 0.5), 2),
            "plan_z": round(max(0.15, 0.6 - row * 0.08), 2),
            "plan_rotation": 0.0,
        }
