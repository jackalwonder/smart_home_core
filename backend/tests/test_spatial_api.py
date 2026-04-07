from __future__ import annotations

import io

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.spatial import router as spatial_router
from app.services import spatial_scene_service


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(spatial_router)
    return app


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("APP_READ_API_KEY", "read-token")
    monkeypatch.setenv("APP_CONTROL_API_KEY", "control-token")
    monkeypatch.delenv("APP_ADMIN_API_KEY", raising=False)
    monkeypatch.delenv("APP_API_KEY", raising=False)
    return TestClient(_build_test_app())


def test_spatial_scene_route_accepts_control_key(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_scene(zone_id: int | None = None):
        assert zone_id == 2
        return {
            "zone": {
                "id": 2,
                "name": "全屋",
                "description": None,
                "floor_plan_image_path": "/media/floorplans/demo.png",
                "floor_plan_image_width": 1600,
                "floor_plan_image_height": 960,
                "floor_plan_analysis": "ok",
            },
            "rooms": [],
        }

    monkeypatch.setattr(spatial_scene_service, "get_spatial_scene", _fake_scene)

    response = client.get("/api/spatial/scene?zone_id=2", headers={"X-API-Key": "control-token"})

    assert response.status_code == 200
    assert response.json()["zone"]["id"] == 2


def test_floorplan_upload_route_forwards_metadata_and_bytes(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_upload(
        zone_id: int,
        *,
        original_filename: str,
        image_width: int,
        image_height: int,
        payload: bytes,
        preserve_existing: bool,
    ):
        assert zone_id == 1
        assert original_filename == "layout.png"
        assert image_width == 1920
        assert image_height == 1080
        assert payload == b"floorplan-bytes"
        assert preserve_existing is True
        return {
            "zone": {
                "id": 1,
                "name": "全屋",
                "description": None,
                "floor_plan_image_path": "/media/floorplans/layout.png",
                "floor_plan_image_width": 1920,
                "floor_plan_image_height": 1080,
                "floor_plan_analysis": "ok",
            },
            "updated_room_count": 3,
            "image_url": "/media/floorplans/layout.png",
        }

    monkeypatch.setattr(spatial_scene_service, "save_floor_plan", _fake_upload)

    response = client.post(
        "/api/spatial/floorplan",
        headers={"X-API-Key": "control-token"},
        data={
            "zone_id": "1",
            "image_width": "1920",
            "image_height": "1080",
            "preserve_existing": "true",
        },
        files={"file": ("layout.png", io.BytesIO(b"floorplan-bytes"), "image/png")},
    )

    assert response.status_code == 200
    assert response.json()["updated_room_count"] == 3


def test_scene_model_upload_route_forwards_scale_and_bytes(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_upload(
        zone_id: int,
        *,
        original_filename: str,
        payload: bytes,
        model_scale: float,
    ):
        assert zone_id == 1
        assert original_filename == "house.glb"
        assert payload == b"model-bytes"
        assert model_scale == 1.25
        return {
            "zone": {
                "id": 1,
                "name": "全屋",
                "description": None,
                "floor_plan_image_path": "/media/floorplans/layout.png",
                "floor_plan_image_width": 1920,
                "floor_plan_image_height": 1080,
                "floor_plan_analysis": "ok",
                "three_d_model_path": "/media/scene-models/house.glb",
                "three_d_model_format": "glb",
                "three_d_model_scale": 1.25,
            },
            "model_url": "/media/scene-models/house.glb",
        }

    monkeypatch.setattr(spatial_scene_service, "save_scene_model", _fake_upload)

    response = client.post(
        "/api/spatial/model",
        headers={"X-API-Key": "control-token"},
        data={
            "zone_id": "1",
            "model_scale": "1.25",
        },
        files={"file": ("house.glb", io.BytesIO(b"model-bytes"), "model/gltf-binary")},
    )

    assert response.status_code == 200
    assert response.json()["model_url"] == "/media/scene-models/house.glb"
