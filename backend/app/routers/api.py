from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.dependencies import DbSession
from app.schemas import (
    AutomationWebhookRequest,
    AutomationWebhookResponse,
    DeviceControlRequest,
    DeviceControlResponse,
    DeviceRead,
    RoomStateRead,
)
from app.services import automation_service, catalog_service
from app.services.errors import ConfigurationError, ExternalServiceError, NotFoundError

router = APIRouter(prefix="/api", tags=["api"])


@router.get("/rooms", response_model=list[RoomStateRead])
def get_rooms(db: DbSession) -> list:
    return catalog_service.list_room_snapshots(db)


@router.get("/devices/{room_id}", response_model=list[DeviceRead])
def get_devices_for_room(room_id: int, db: DbSession) -> list:
    try:
        return catalog_service.list_devices_by_room(db, room_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/device/control", response_model=DeviceControlResponse)
async def control_device(payload: DeviceControlRequest, db: DbSession) -> DeviceControlResponse:
    try:
        return await automation_service.control_device(db, payload)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ExternalServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/webhook/automation", response_model=AutomationWebhookResponse)
async def trigger_automation(payload: AutomationWebhookRequest) -> AutomationWebhookResponse:
    try:
        return await automation_service.execute_automation(payload)
    except ConfigurationError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    except ExternalServiceError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
