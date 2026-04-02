from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models import Device, Room, Zone
from app.schemas import DeviceCreate, RoomCreate, ZoneCreate
from app.services.errors import ConflictError, NotFoundError


def create_zone(db: Session, payload: ZoneCreate) -> Zone:
    zone = Zone(name=payload.name, description=payload.description)
    db.add(zone)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("Zone name already exists.") from exc
    db.refresh(zone)
    return zone


def list_zones(db: Session) -> list[Zone]:
    return list(db.scalars(select(Zone).order_by(Zone.name)).all())


def create_room(db: Session, payload: RoomCreate) -> Room:
    zone = db.get(Zone, payload.zone_id)
    if zone is None:
        raise NotFoundError("Zone not found.")

    room = Room(name=payload.name, description=payload.description, zone_id=payload.zone_id)
    db.add(room)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("Room name already exists in this zone.") from exc
    db.refresh(room)
    return room


def list_rooms(db: Session) -> list[Room]:
    return list(db.scalars(select(Room).order_by(Room.zone_id, Room.name)).all())


def create_device(db: Session, payload: DeviceCreate) -> Device:
    room = db.get(Room, payload.room_id)
    if room is None:
        raise NotFoundError("Room not found.")

    device = Device(
        name=payload.name,
        ha_entity_id=payload.ha_entity_id,
        device_type=payload.device_type,
        current_status=payload.current_status,
        room_id=payload.room_id,
    )
    db.add(device)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictError("Device entity ID already exists.") from exc
    db.refresh(device)
    return device


def list_devices(db: Session) -> list[Device]:
    return list(db.scalars(select(Device).order_by(Device.room_id, Device.name)).all())


def get_device(db: Session, device_id: int) -> Device:
    device = db.get(Device, device_id)
    if device is None:
        raise NotFoundError("Device not found.")
    return device


def list_devices_by_room(db: Session, room_id: int) -> list[Device]:
    room = db.get(Room, room_id)
    if room is None:
        raise NotFoundError("Room not found.")

    stmt = select(Device).where(Device.room_id == room_id).order_by(Device.name)
    return list(db.scalars(stmt).all())


def list_room_snapshots(db: Session) -> list[Room]:
    stmt = (
        select(Room)
        .options(joinedload(Room.zone), joinedload(Room.devices))
        .order_by(Room.zone_id, Room.name)
    )
    return list(db.scalars(stmt).unique().all())
