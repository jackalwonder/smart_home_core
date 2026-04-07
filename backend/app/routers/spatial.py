from __future__ import annotations

"""真实户型与空间工作台接口。"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.auth import CONTROL_SCOPE, READ_SCOPE, require_scope
from app.schemas import (
    DeviceAdminRead,
    DevicePlacementUpdate,
    FloorPlanUploadResponse,
    RoomRead,
    RoomLayoutUpdate,
    SpatialAutoLayoutRequest,
    SpatialAutoLayoutResponse,
    SpatialManualDeviceCreate,
    SpatialSceneRead,
)
from app.services import spatial_scene_service
from app.services.errors import ConflictError, NotFoundError

router = APIRouter(prefix="/api/spatial", tags=["空间场景"])


@router.get("/scene", response_model=SpatialSceneRead, dependencies=[Depends(require_scope(READ_SCOPE))])
async def get_spatial_scene(zone_id: int | None = None) -> SpatialSceneRead:
    return await spatial_scene_service.get_spatial_scene(zone_id)


@router.post("/floorplan", response_model=FloorPlanUploadResponse, dependencies=[Depends(require_scope(CONTROL_SCOPE))])
async def upload_floor_plan(
    zone_id: int = Form(..., gt=0),
    image_width: int = Form(..., gt=0),
    image_height: int = Form(..., gt=0),
    preserve_existing: bool = Form(True),
    file: UploadFile = File(...),
) -> FloorPlanUploadResponse:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请上传户型图文件。")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持图片格式的户型图。")

    try:
        payload = await file.read()
        if not payload:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="上传的户型图为空。")
        return await spatial_scene_service.save_floor_plan(
            zone_id,
            original_filename=file.filename,
            image_width=image_width,
            image_height=image_height,
            payload=payload,
            preserve_existing=preserve_existing,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/auto-layout", response_model=SpatialAutoLayoutResponse, dependencies=[Depends(require_scope(CONTROL_SCOPE))])
async def auto_layout_floor_plan(payload: SpatialAutoLayoutRequest) -> SpatialAutoLayoutResponse:
    try:
        return await spatial_scene_service.auto_layout_zone(payload.zone_id, payload.preserve_existing)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/rooms/{room_id}/layout", response_model=RoomRead, dependencies=[Depends(require_scope(CONTROL_SCOPE))])
async def update_room_layout(room_id: int, payload: RoomLayoutUpdate) -> RoomRead:
    try:
        return await spatial_scene_service.update_room_layout(room_id, payload)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/devices/{device_id}/placement", response_model=DeviceAdminRead, dependencies=[Depends(require_scope(CONTROL_SCOPE))])
async def update_device_placement(device_id: int, payload: DevicePlacementUpdate) -> DeviceAdminRead:
    try:
        return await spatial_scene_service.update_device_placement(device_id, payload)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/devices/manual", response_model=DeviceAdminRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_scope(CONTROL_SCOPE))])
async def create_manual_device(payload: SpatialManualDeviceCreate) -> DeviceAdminRead:
    try:
        return await spatial_scene_service.create_manual_device(payload)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
