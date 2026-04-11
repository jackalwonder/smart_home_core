from __future__ import annotations

"""户型图、空间布局与设备点位服务。"""

import json
from math import ceil
from pathlib import Path
import re
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import FLOOR_PLAN_DIR, SCENE_MODEL_DIR, run_in_threadpool_session
from app.models import Device, DeviceType, Room, Zone
from app.schemas import DeviceCreate, DevicePlacementUpdate, RoomLayoutUpdate, SpatialManualDeviceCreate
from app.services import catalog_service, floor_plan_analysis_service
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
ROOM_LAYOUT_FIELDS = ("plan_x", "plan_y", "plan_width", "plan_height", "plan_rotation")
DEVICE_LAYOUT_FIELDS = ("plan_x", "plan_y", "plan_z", "plan_rotation")


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
        return {"zone": None, "rooms": [], "analysis": None}

    plan_width = zone_payload.get("floor_plan_image_width") or DEFAULT_PLAN_WIDTH
    plan_height = zone_payload.get("floor_plan_image_height") or DEFAULT_PLAN_HEIGHT
    analysis = _parse_floor_plan_analysis(zone_payload.get("floor_plan_analysis"))

    derived_layouts = _derive_room_layouts(normalized_rooms, plan_width, plan_height, analysis)
    scene_rooms = []
    for room in normalized_rooms:
        derived_layout = derived_layouts.get(int(room["id"])) or _empty_layout(ROOM_LAYOUT_FIELDS)
        room_layout_layers = _build_layout_layers(
            _extract_layout(room, ROOM_LAYOUT_FIELDS),
            derived_layout,
            ROOM_LAYOUT_FIELDS,
        )
        room_payload = {
            **room,
            "zone": zone_payload,
            **_compat_layout_fields(room_layout_layers["effective_layout"], ROOM_LAYOUT_FIELDS),
            "layout_persisted": room_layout_layers["persisted"],
            "layout_derived": room_layout_layers["derived"],
            "effective_layout": room_layout_layers["effective_layout"],
        }
        room_payload["devices"] = _with_device_layout_layers(room_payload, analysis)
        scene_rooms.append(room_payload)

    return {"zone": zone_payload, "rooms": scene_rooms, "analysis": analysis}


async def save_floor_plan(
    zone_id: int,
    *,
    original_filename: str,
    image_width: int,
    image_height: int,
    payload: bytes,
    preserve_existing: bool,
) -> dict[str, object]:
    zone_media = await run_in_threadpool_session(_get_zone_media_paths, zone_id)
    analysis = floor_plan_analysis_service.analyze_floor_plan_image(payload, await _room_names_for_zone(zone_id))
    image_path = _write_floor_plan_asset(original_filename, payload)
    try:
        result = await run_in_threadpool_session(
            _save_floor_plan_and_apply_layout,
            zone_id,
            image_path,
            int(analysis.get("image_width") or image_width),
            int(analysis.get("image_height") or image_height),
            _stringify_floor_plan_analysis(analysis),
            preserve_existing,
        )
    except Exception:
        _delete_asset_if_managed(image_path, FLOOR_PLAN_DIR)
        raise

    previous_image_path = zone_media["floor_plan_image_path"]
    if previous_image_path and previous_image_path != image_path:
        _delete_asset_if_managed(previous_image_path, FLOOR_PLAN_DIR)
    return {
        "zone": _serialize_zone(result["zone"]),
        "updated_room_count": result["updated_room_count"],
        "image_url": image_path,
    }


async def save_scene_model(
    zone_id: int,
    *,
    original_filename: str,
    payload: bytes,
    model_scale: float,
) -> dict[str, object]:
    zone_media = await run_in_threadpool_session(_get_zone_media_paths, zone_id)
    model_path = _write_scene_model_asset(original_filename, payload)
    try:
        zone = await run_in_threadpool_session(
            catalog_service.update_zone_three_d_model,
            zone_id,
            model_path,
            _safe_model_extension(original_filename).lstrip("."),
            model_scale,
        )
    except Exception:
        _delete_asset_if_managed(model_path, SCENE_MODEL_DIR)
        raise

    previous_model_path = zone_media["three_d_model_path"]
    if previous_model_path and previous_model_path != model_path:
        _delete_asset_if_managed(previous_model_path, SCENE_MODEL_DIR)
    return {
        "zone": _serialize_zone(zone),
        "model_url": model_path,
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


async def _room_names_for_zone(zone_id: int) -> list[str]:
    rooms = await run_in_threadpool_session(_list_room_names_for_zone, zone_id)
    return rooms


async def _upgrade_legacy_analysis_if_needed(
    zone_id: int | None,
    zone_payload: dict[str, object],
) -> dict[str, object]:
    if zone_id is None or not _should_refresh_floor_plan_analysis(zone_payload):
        return zone_payload
    return await run_in_threadpool_session(_refresh_zone_analysis_payload, zone_id)


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
            "three_d_model_path": zone.get("three_d_model_path"),
            "three_d_model_format": zone.get("three_d_model_format"),
            "three_d_model_scale": zone.get("three_d_model_scale"),
        }

    return {
        "id": zone.id,
        "name": zone.name,
        "description": zone.description,
        "floor_plan_image_path": zone.floor_plan_image_path,
        "floor_plan_image_width": zone.floor_plan_image_width,
        "floor_plan_image_height": zone.floor_plan_image_height,
        "floor_plan_analysis": zone.floor_plan_analysis,
        "three_d_model_path": zone.three_d_model_path,
        "three_d_model_format": zone.three_d_model_format,
        "three_d_model_scale": zone.three_d_model_scale,
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


def _get_zone_media_paths(db: Session, zone_id: int) -> dict[str, str | None]:
    zone = catalog_service.get_zone(db, zone_id)
    return {
        "floor_plan_image_path": zone.floor_plan_image_path,
        "three_d_model_path": zone.three_d_model_path,
    }


def _list_room_names_for_zone(db: Session, zone_id: int) -> list[str]:
    stmt = select(Room.name).where(Room.zone_id == zone_id).order_by(Room.name)
    return [str(name) for name in db.scalars(stmt).all() if isinstance(name, str)]


def _parse_floor_plan_analysis(value: object) -> dict[str, object] | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        payload = json.loads(value)
    except (TypeError, ValueError):
        return {"summary": value, "source": "legacy", "room_candidates": []}
    return payload if isinstance(payload, dict) else None


def _stringify_floor_plan_analysis(analysis: dict[str, object]) -> str:
    return json.dumps(analysis, ensure_ascii=False)


def _empty_layout(fields: tuple[str, ...]) -> dict[str, object]:
    return {field: None for field in fields}


def _extract_layout(source: dict[str, object], fields: tuple[str, ...]) -> dict[str, object]:
    return {
        field: source.get(field)
        for field in fields
    }


def _build_layout_layers(
    persisted_layout: dict[str, object],
    derived_layout: dict[str, object],
    fields: tuple[str, ...],
) -> dict[str, dict[str, object]]:
    effective_layout: dict[str, object] = {}
    field_sources: dict[str, str] = {}

    for field in fields:
        persisted_value = persisted_layout.get(field)
        derived_value = derived_layout.get(field)
        if persisted_value is not None:
            effective_layout[field] = persisted_value
            field_sources[field] = "persisted"
        else:
            effective_layout[field] = derived_value
            field_sources[field] = "derived"

    unique_sources = set(field_sources.values())
    effective_layout["source"] = unique_sources.pop() if len(unique_sources) == 1 else "mixed"
    effective_layout["field_sources"] = field_sources

    return {
        "persisted": persisted_layout,
        "derived": derived_layout,
        "effective_layout": effective_layout,
    }


def _compat_layout_fields(layout: dict[str, object], fields: tuple[str, ...]) -> dict[str, object]:
    return {
        field: layout.get(field)
        for field in fields
    }


def _should_refresh_floor_plan_analysis(zone_payload: dict[str, object]) -> bool:
    if not zone_payload.get("floor_plan_image_path"):
        return False
    analysis = _parse_floor_plan_analysis(zone_payload.get("floor_plan_analysis"))
    if analysis is None:
        return True
    if analysis.get("source") == "legacy":
        return True
    if any(
        not isinstance(analysis.get(key), list)
        for key in (
            "wall_segments",
            "openings",
            "furniture_candidates",
            "semantic_zones",
            "semantic_openings",
            "window_edges",
            "corridor_path",
        )
    ):
        return True

    semantic_openings = analysis.get("semantic_openings")
    if isinstance(semantic_openings, list) and semantic_openings and not any(
        isinstance(item, dict) and item.get("door_leaf")
        for item in semantic_openings
    ):
        return True

    return False


def _write_floor_plan_asset(original_filename: str, payload: bytes) -> str:
    FLOOR_PLAN_DIR.mkdir(parents=True, exist_ok=True)
    extension = _safe_extension(original_filename)
    filename = f"{uuid4().hex}{extension}"
    target_path = FLOOR_PLAN_DIR / filename
    target_path.write_bytes(payload)
    return f"/media/floorplans/{filename}"


def _write_scene_model_asset(original_filename: str, payload: bytes) -> str:
    SCENE_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    extension = _safe_model_extension(original_filename)
    filename = f"{uuid4().hex}{extension}"
    target_path = SCENE_MODEL_DIR / filename
    target_path.write_bytes(payload)
    return f"/media/scene-models/{filename}"


def _safe_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in {".png", ".jpg", ".jpeg", ".webp"} else ".png"


def _safe_model_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in {".glb", ".gltf"} else ".glb"


def _resolve_floor_plan_asset_path(image_path: str | None) -> Path | None:
    if not image_path:
        return None
    direct_path = Path(image_path)
    if direct_path.exists():
        return direct_path
    if direct_path.name:
        return FLOOR_PLAN_DIR / direct_path.name
    return None


def _resolve_managed_asset_path(asset_path: str | None, asset_dir: Path) -> Path | None:
    if not asset_path:
        return None

    direct_path = Path(asset_path)
    candidate = direct_path if direct_path.is_absolute() else asset_dir / direct_path.name
    try:
        resolved_candidate = candidate.resolve(strict=False)
        resolved_dir = asset_dir.resolve(strict=False)
    except OSError:
        return None

    if not resolved_candidate.is_relative_to(resolved_dir):
        return None
    return resolved_candidate


def _delete_asset_if_managed(asset_path: str | None, asset_dir: Path) -> None:
    resolved_path = _resolve_managed_asset_path(asset_path, asset_dir)
    if resolved_path is None or not resolved_path.exists():
        return
    resolved_path.unlink(missing_ok=True)


def _refresh_zone_analysis_payload(db: Session, zone_id: int) -> dict[str, object]:
    zone = db.scalar(select(Zone).options(joinedload(Zone.rooms)).where(Zone.id == zone_id).limit(1))
    if zone is None:
        raise NotFoundError("未找到对应空间分区。")

    _refresh_zone_analysis_if_needed(db, zone)
    db.refresh(zone)
    return _serialize_zone(zone)


def _refresh_zone_analysis_if_needed(db: Session, zone: Zone) -> None:
    if not _should_refresh_floor_plan_analysis(_serialize_zone(zone)):
        return

    floor_plan_path = _resolve_floor_plan_asset_path(zone.floor_plan_image_path)
    if floor_plan_path is None or not floor_plan_path.exists():
        return

    payload = floor_plan_path.read_bytes()
    room_names = [room.name for room in sorted(zone.rooms, key=lambda item: item.name)]
    analysis = floor_plan_analysis_service.analyze_floor_plan_image(payload, room_names)
    zone.floor_plan_analysis = _stringify_floor_plan_analysis(analysis)
    zone.floor_plan_image_width = int(analysis.get("image_width") or zone.floor_plan_image_width or DEFAULT_PLAN_WIDTH)
    zone.floor_plan_image_height = int(analysis.get("image_height") or zone.floor_plan_image_height or DEFAULT_PLAN_HEIGHT)
    db.commit()


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
    analysis: str,
    preserve_existing: bool,
) -> dict[str, object]:
    zone = catalog_service.get_zone(db, zone_id)
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
    _refresh_zone_analysis_if_needed(db, zone)
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
    analysis = _parse_floor_plan_analysis(zone.floor_plan_analysis)
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
        analysis,
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


def _derive_room_layouts(
    rooms: list[dict[str, object]],
    plan_width: int,
    plan_height: int,
    analysis: dict[str, object] | None = None,
) -> dict[int, dict[str, float]]:
    detected_layouts = _derive_layouts_from_analysis(rooms, analysis)
    if detected_layouts:
        return detected_layouts

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


def _derive_layouts_from_analysis(
    rooms: list[dict[str, object]],
    analysis: dict[str, object] | None,
) -> dict[int, dict[str, float]]:
    if not isinstance(analysis, dict):
        return {}

    semantic_layouts = _derive_layouts_from_semantic_zones(rooms, analysis)
    if semantic_layouts:
        return semantic_layouts

    candidates = analysis.get("room_candidates")
    if not isinstance(candidates, list):
        return {}

    available_candidates = [
        candidate
        for candidate in candidates
        if isinstance(candidate, dict)
        and all(key in candidate for key in ("x", "y", "width", "height"))
    ]
    if not available_candidates:
        return {}

    sorted_rooms = sorted(
        rooms,
        key=lambda room: (
            ROOM_TYPE_PRIORITY[_classify_room_type(str(room.get("name", "")), str(room.get("description", "") or ""))],
            str(room.get("name", "")),
        ),
    )

    layouts: dict[int, dict[str, float]] = {}
    remaining = available_candidates[:]
    for room in sorted_rooms:
        room_type = _classify_room_type(str(room.get("name", "")), str(room.get("description", "") or ""))
        best_candidate = max(remaining, key=lambda candidate: _candidate_score(candidate, room_type))
        remaining.remove(best_candidate)
        layouts[int(room["id"])] = {
            "plan_x": round(float(best_candidate["x"]), 2),
            "plan_y": round(float(best_candidate["y"]), 2),
            "plan_width": round(float(best_candidate["width"]), 2),
            "plan_height": round(float(best_candidate["height"]), 2),
            "plan_rotation": round(float(best_candidate.get("rotation") or 0.0), 2),
        }
        if not remaining:
            break

    return layouts


def _derive_layouts_from_semantic_zones(
    rooms: list[dict[str, object]],
    analysis: dict[str, object],
) -> dict[int, dict[str, float]]:
    semantic_zones = analysis.get("semantic_zones")
    if not isinstance(semantic_zones, list):
        return {}

    available_zones = [
        zone
        for zone in semantic_zones
        if isinstance(zone, dict)
        and all(key in zone for key in ("type", "x", "y", "width", "height"))
    ]
    if not available_zones:
        return {}

    sorted_rooms = sorted(
        rooms,
        key=lambda room: (
            ROOM_TYPE_PRIORITY[_classify_room_type(str(room.get("name", "")), str(room.get("description", "") or ""))],
            str(room.get("name", "")),
        ),
    )
    layouts: dict[int, dict[str, float]] = {}
    remaining = available_zones[:]
    for room in sorted_rooms:
        room_type = _classify_room_type(str(room.get("name", "")), str(room.get("description", "") or ""))
        best_zone = max(remaining, key=lambda zone: _semantic_zone_score(zone, room_type, str(room.get("name", ""))))
        remaining.remove(best_zone)
        layouts[int(room["id"])] = {
            "plan_x": round(float(best_zone["x"]), 2),
            "plan_y": round(float(best_zone["y"]), 2),
            "plan_width": round(float(best_zone["width"]), 2),
            "plan_height": round(float(best_zone["height"]), 2),
            "plan_rotation": round(float(best_zone.get("rotation") or 0.0), 2),
        }
        if not remaining:
            break

    return layouts


def _semantic_zone_score(zone: dict[str, object], room_type: str, room_name: str) -> float:
    zone_type = str(zone.get("type") or "")
    label = str(zone.get("label") or "")
    width = float(zone.get("width") or 0)
    height = float(zone.get("height") or 0)
    area = width * height
    score = area

    if room_type == "living":
        score += 240000 if zone_type == "living" else 0
    elif room_type == "master":
        score += 220000 if zone_type == "master" else 0
        if "主" in room_name:
            score += 15000 if "主" in label else 0
    elif room_type == "bedroom":
        score += 160000 if zone_type == "bedroom" else 0
    elif room_type == "dining":
        score += 170000 if zone_type == "dining" else 0
    elif room_type == "kitchen":
        score += 170000 if zone_type == "kitchen" else 0
    elif room_type == "bath":
        score += 150000 if zone_type in {"bath", "master_bath"} else 0
    elif room_type == "entry":
        score += 120000 if zone_type == "entry" else 0
    elif room_type == "storage":
        score += 120000 if zone_type == "storage" else 0
    elif room_type == "generic":
        score += 90000 if zone_type in {"hall", "dining", "bedroom"} else 0

    if room_type == "bedroom" and "北" in label:
        score += 5000
    if room_type == "generic" and zone_type == "hall":
        score += 12000

    return score


def _candidate_score(candidate: dict[str, object], room_type: str) -> float:
    width = float(candidate.get("width") or 0)
    height = float(candidate.get("height") or 0)
    x = float(candidate.get("x") or 0)
    y = float(candidate.get("y") or 0)
    area = width * height
    aspect = width / max(height, 1.0)

    score = area
    if room_type == "living":
        score += area * 1.4
        score -= abs(aspect - 1.4) * 1200
    elif room_type in {"master", "bedroom", "study"}:
        score += area * 0.6
        score -= abs(aspect - 1.2) * 900
    elif room_type == "balcony":
        score += width * 220
        score -= abs(aspect - 3.0) * 1400
        score += y * 0.6
    elif room_type == "bath":
        score -= area * 0.45
        score -= abs(aspect - 1.0) * 900
    elif room_type == "entry":
        score -= area * 0.3
        score += y * 0.5
    elif room_type == "kitchen":
        score += area * 0.15
        score += x * 0.08
    elif room_type == "storage":
        score -= area * 0.4

    fill_ratio = float(candidate.get("fill_ratio") or 0)
    score += fill_ratio * 800
    return score


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


def _with_device_layout_layers(
    room: dict[str, object],
    analysis: dict[str, object] | None,
) -> list[dict[str, object]]:
    devices = [dict(device) for device in room.get("devices", [])]
    effective_room_layout = room.get("effective_layout") or {}
    layout = {
        "plan_x": float(effective_room_layout.get("plan_x") or room.get("plan_x") or 0),
        "plan_y": float(effective_room_layout.get("plan_y") or room.get("plan_y") or 0),
        "plan_width": float(effective_room_layout.get("plan_width") or room.get("plan_width") or 0),
        "plan_height": float(effective_room_layout.get("plan_height") or room.get("plan_height") or 0),
        "plan_rotation": float(effective_room_layout.get("plan_rotation") or room.get("plan_rotation") or 0),
    }
    points = _derive_device_positions(
        devices,
        layout,
        semantic_zones=analysis.get("semantic_zones") if isinstance(analysis, dict) else None,
        room_name=str(room.get("name") or ""),
    )
    next_devices = []
    for device in devices:
        point = points.get(int(device["id"]), {})
        derived_layout = {
            "plan_x": point.get("plan_x"),
            "plan_y": point.get("plan_y"),
            "plan_z": point.get("plan_z"),
            "plan_rotation": point.get("plan_rotation"),
        }
        device_layout_layers = _build_layout_layers(
            _extract_layout(device, DEVICE_LAYOUT_FIELDS),
            derived_layout,
            DEVICE_LAYOUT_FIELDS,
        )
        next_devices.append(
            {
                **device,
                **_compat_layout_fields(device_layout_layers["effective_layout"], DEVICE_LAYOUT_FIELDS),
                "layout_persisted": device_layout_layers["persisted"],
                "layout_derived": device_layout_layers["derived"],
                "effective_layout": device_layout_layers["effective_layout"],
            }
        )
    return next_devices


def _assign_device_positions(devices: list[Device], layout: dict[str, float], *, force: bool) -> None:
    device_payloads = [
        {
            "id": device.id,
            "name": device.name,
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


def _derive_device_positions(
    devices: list[dict[str, object]],
    layout: dict[str, float],
    *,
    semantic_zones: list[dict[str, object]] | None = None,
    room_name: str = "",
) -> dict[int, dict[str, float]]:
    if not devices:
        return {}

    semantic_layout = _semantic_layout_for_room(layout, semantic_zones, room_name)
    room_x = semantic_layout["plan_x"]
    room_y = semantic_layout["plan_y"]
    room_width = max(semantic_layout["plan_width"], 120)
    room_height = max(semantic_layout["plan_height"], 80)
    points: dict[int, dict[str, float]] = {}
    zone_index = _semantic_zone_index(semantic_zones)

    top_wall = []
    bottom_wall = []
    sensor_cluster = []
    grid_cluster = []
    anchored: list[tuple[dict[str, object], dict[str, float]]] = []

    for device in devices:
        entity_domain = str(device.get("entity_domain", ""))
        appliance_type = str(device.get("appliance_type", ""))
        device_class = str(device.get("device_class", ""))
        anchor = _semantic_anchor_for_device(device, room_name, zone_index)

        if anchor is not None:
            anchored.append((device, anchor))
            continue

        if entity_domain == "climate":
            top_wall.append(device)
        elif entity_domain in {"light", "media_player"} or appliance_type in {"tv", "media", "speaker"}:
            bottom_wall.append(device)
        elif (
            device_class in {"temperature", "humidity", "moisture", "motion", "presence", "occupancy", "door", "window"}
            or entity_domain in {"sensor", "binary_sensor"}
        ):
            sensor_cluster.append(device)
        else:
            grid_cluster.append(device)

    for index, (device, anchor) in enumerate(anchored):
        points[int(device["id"])] = {
            "plan_x": round(anchor["plan_x"], 2),
            "plan_y": round(anchor["plan_y"] + index * 0.0, 2),
            "plan_z": round(anchor["plan_z"], 2),
            "plan_rotation": round(anchor["plan_rotation"], 2),
            "semantic_locked": True,
        }

    _place_linear(top_wall, points, room_x + room_width * 0.18, room_x + room_width * 0.82, room_y + room_height * 0.14, 0.7)
    _place_linear(bottom_wall, points, room_x + room_width * 0.18, room_x + room_width * 0.82, room_y + room_height * 0.82, 0.2)
    _place_vertical(sensor_cluster, points, room_x + room_width * 0.84, room_y + room_height * 0.22, room_y + room_height * 0.72, 0.9)
    _place_grid(grid_cluster, points, room_x + room_width * 0.22, room_y + room_height * 0.32, room_width * 0.48, room_height * 0.34)
    return points


def _semantic_layout_for_room(
    layout: dict[str, float],
    semantic_zones: list[dict[str, object]] | None,
    room_name: str,
) -> dict[str, float]:
    zone_index = _semantic_zone_index(semantic_zones)
    room_type = _classify_room_type(room_name, "")
    zone = _pick_semantic_zone_for_room(room_type, room_name, zone_index)
    if zone is None:
        return layout

    return {
        "plan_x": float(zone["x"]),
        "plan_y": float(zone["y"]),
        "plan_width": float(zone["width"]),
        "plan_height": float(zone["height"]),
        "plan_rotation": float(zone.get("rotation") or 0.0),
    }


def _semantic_zone_index(semantic_zones: list[dict[str, object]] | None) -> dict[str, list[dict[str, object]]]:
    index: dict[str, list[dict[str, object]]] = {}
    for zone in semantic_zones or []:
        zone_type = str(zone.get("type") or "")
        if not zone_type:
            continue
        index.setdefault(zone_type, []).append(zone)
    return index


def _pick_semantic_zone_for_room(
    room_type: str,
    room_name: str,
    zone_index: dict[str, list[dict[str, object]]],
) -> dict[str, object] | None:
    if room_type == "living":
        return _first_zone(zone_index, "living")
    if room_type == "master":
        return _first_zone(zone_index, "master")
    if room_type == "kitchen":
        return _first_zone(zone_index, "kitchen")
    if room_type == "dining":
        return _first_zone(zone_index, "dining")
    if room_type == "bath":
        return _first_zone(zone_index, "master_bath") if "主" in room_name else _first_zone(zone_index, "bath")
    if room_type == "entry":
        return _first_zone(zone_index, "entry")
    if room_type == "storage":
        return _first_zone(zone_index, "storage")
    if room_type == "bedroom":
        bedrooms = zone_index.get("bedroom", [])
        if "西" in room_name or "左" in room_name:
            return bedrooms[1] if len(bedrooms) > 1 else (bedrooms[0] if bedrooms else None)
        if "北" in room_name:
            return bedrooms[0] if bedrooms else None
        return bedrooms[-1] if bedrooms else None
    return None


def _semantic_anchor_for_device(
    device: dict[str, object],
    room_name: str,
    zone_index: dict[str, list[dict[str, object]]],
) -> dict[str, float] | None:
    device_name = str(device.get("name") or "")
    appliance_type = str(device.get("appliance_type") or "")
    entity_domain = str(device.get("entity_domain") or "")
    device_class = str(device.get("device_class") or "")
    room_type = _classify_room_type(room_name, "")
    room_zone = _pick_semantic_zone_for_room(room_type, room_name, zone_index)
    text = f"{room_name} {device_name} {appliance_type} {entity_domain} {device_class}".lower()

    if appliance_type == "fridge":
        return _anchor_in_zone(_first_zone(zone_index, "kitchen"), 0.18, 0.56, 0.55, 90.0)

    if appliance_type == "air_conditioner" or entity_domain == "climate":
        return _anchor_in_zone(room_zone, 0.52, 0.12, 0.72, 180.0)

    if appliance_type == "tv":
        return _anchor_in_zone(_first_zone(zone_index, "living") or room_zone, 0.76, 0.74, 0.34, 180.0)

    if appliance_type in {"media", "speaker"} or entity_domain == "media_player":
        target_zone = _first_zone(zone_index, "dining") if "餐" in room_name else _first_zone(zone_index, "living")
        return _anchor_in_zone(target_zone or room_zone, 0.72, 0.66, 0.34, 165.0)

    if appliance_type == "camera" or entity_domain == "camera":
        target_zone = _first_zone(zone_index, "entry") or _first_zone(zone_index, "hall") or room_zone
        return _anchor_in_zone(target_zone, 0.16, 0.2, 0.88, 215.0)

    if entity_domain == "lock":
        return _anchor_in_zone(_first_zone(zone_index, "entry"), 0.08, 0.52, 0.52, 90.0)

    if entity_domain in {"switch", "button"} or appliance_type in {"switch", "scene_panel"}:
        return _anchor_in_zone(room_zone, 0.12, 0.5, 0.48, 90.0)

    if entity_domain == "light":
        return _anchor_in_zone(room_zone, 0.5, 0.5, 0.94, 0.0)

    if entity_domain == "cover":
        return _anchor_in_zone(room_zone, 0.5, 0.1, 0.74, 180.0)

    if entity_domain == "vacuum":
        target_zone = _first_zone(zone_index, "hall") or _first_zone(zone_index, "entry") or _first_zone(zone_index, "living")
        return _anchor_in_zone(target_zone, 0.3, 0.8, 0.22, -90.0)

    if device_class in {"motion", "presence", "occupancy"}:
        return _anchor_in_zone(room_zone, 0.84, 0.18, 0.88, -135.0)

    if device_class in {"door", "window"}:
        return _anchor_in_zone(room_zone, 0.12, 0.22, 0.74, 90.0)

    if entity_domain in {"sensor", "binary_sensor"} and any(keyword in text for keyword in ("温度", "湿度", "temperature", "humidity")):
        return _anchor_in_zone(room_zone, 0.84, 0.24, 0.82, -90.0)

    if "主卧" in room_name:
        return _anchor_in_zone(_first_zone(zone_index, "master"), 0.72, 0.62, 0.42, 180.0)

    return None


def _anchor_in_zone(
    zone: dict[str, object] | None,
    x_ratio: float,
    y_ratio: float,
    z: float,
    rotation: float = 0.0,
) -> dict[str, float] | None:
    if zone is None:
        return None
    return {
        "plan_x": float(zone["x"]) + float(zone["width"]) * x_ratio,
        "plan_y": float(zone["y"]) + float(zone["height"]) * y_ratio,
        "plan_z": z,
        "plan_rotation": rotation,
    }


def _first_zone(zone_index: dict[str, list[dict[str, object]]], zone_type: str) -> dict[str, object] | None:
    zones = zone_index.get(zone_type, [])
    return zones[0] if zones else None


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
