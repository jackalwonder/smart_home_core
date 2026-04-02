from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.dependencies import DbSession
from app.schemas import DeviceCreate, DeviceRead, RoomCreate, RoomRead, ZoneCreate, ZoneRead
from app.services import catalog_service
from app.services.errors import ConflictError, NotFoundError

router = APIRouter(tags=["management"])


@router.post("/zones", response_model=ZoneRead, status_code=status.HTTP_201_CREATED)
def create_zone(payload: ZoneCreate, db: DbSession):
    try:
        return catalog_service.create_zone(db, payload)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/zones", response_model=list[ZoneRead])
def list_zones(db: DbSession):
    return catalog_service.list_zones(db)


@router.post("/rooms", response_model=RoomRead, status_code=status.HTTP_201_CREATED)
def create_room(payload: RoomCreate, db: DbSession):
    try:
        return catalog_service.create_room(db, payload)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/rooms", response_model=list[RoomRead])
def list_rooms(db: DbSession):
    return catalog_service.list_rooms(db)


@router.post("/devices", response_model=DeviceRead, status_code=status.HTTP_201_CREATED)
def create_device(payload: DeviceCreate, db: DbSession):
    try:
        return catalog_service.create_device(db, payload)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/devices", response_model=list[DeviceRead])
def list_devices(db: DbSession):
    return catalog_service.list_devices(db)
