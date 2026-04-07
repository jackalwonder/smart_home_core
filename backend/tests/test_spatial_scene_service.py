from __future__ import annotations

import json

import pytest

from app.models import DeviceType
from app.services import catalog_service, spatial_scene_service


@pytest.mark.asyncio
async def test_get_spatial_scene_keeps_empty_rooms_and_derives_layout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_room_snapshots(_db):
        return [
            {
                "id": 11,
                "zone_id": 3,
                "name": "客厅",
                "description": None,
                "zone": {
                    "id": 3,
                    "name": "全屋",
                    "description": None,
                    "floor_plan_image_path": None,
                    "floor_plan_image_width": 1600,
                    "floor_plan_image_height": 960,
                    "floor_plan_analysis": "ok",
                },
                "plan_x": None,
                "plan_y": None,
                "plan_width": None,
                "plan_height": None,
                "plan_rotation": None,
                "ambient_temperature": None,
                "ambient_humidity": None,
                "occupancy_status": None,
                "active_device_count": 0,
                "devices": [],
            }
        ]

    monkeypatch.setattr(catalog_service, "list_room_snapshots_for_spatial_scene", _fake_room_snapshots)

    scene = await spatial_scene_service.get_spatial_scene(3)

    assert scene["zone"]["id"] == 3
    assert len(scene["rooms"]) == 1
    assert scene["rooms"][0]["devices"] == []
    assert scene["rooms"][0]["plan_width"] is not None
    assert scene["rooms"][0]["plan_height"] is not None


def test_build_virtual_entity_id_uses_device_domain_hint() -> None:
    entity_id = spatial_scene_service._build_virtual_entity_id(DeviceType.MIJIA_LIGHT, "Island Lamp")

    assert entity_id.startswith("light.manual_island_lamp_")


def test_should_refresh_floor_plan_analysis_when_new_structural_layers_are_missing() -> None:
    assert spatial_scene_service._should_refresh_floor_plan_analysis(
        {
            "floor_plan_image_path": "/media/floorplans/demo.png",
            "floor_plan_analysis": '{"summary":"ok","source":"local-structure","room_candidates":[]}',
        }
    ) is True
    assert spatial_scene_service._should_refresh_floor_plan_analysis(
        {
            "floor_plan_image_path": "/media/floorplans/demo.png",
            "floor_plan_analysis": json.dumps(
                {
                    "summary": "ok",
                    "source": "local-structure",
                    "wall_segments": [],
                    "openings": [],
                    "furniture_candidates": [],
                    "semantic_zones": [{"type": "living", "label": "客厅"}],
                    "semantic_openings": [{"kind": "doorway", "zone_label": "主卧"}],
                    "window_edges": [],
                    "corridor_path": [],
                },
                ensure_ascii=False,
            ),
        }
    ) is True


def test_derive_device_positions_prefers_semantic_kitchen_anchor_for_fridge() -> None:
    points = spatial_scene_service._derive_device_positions(
        [
            {
                "id": 27,
                "entity_domain": "number",
                "device_class": "",
                "appliance_type": "fridge",
            }
        ],
        {
            "plan_x": 320.0,
            "plan_y": 480.0,
            "plan_width": 720.0,
            "plan_height": 380.0,
            "plan_rotation": 0.0,
        },
        semantic_zones=[
            {"type": "kitchen", "label": "厨房", "x": 120.0, "y": 90.0, "width": 160.0, "height": 140.0},
            {"type": "living", "label": "客厅", "x": 280.0, "y": 300.0, "width": 420.0, "height": 280.0},
        ],
        room_name="客厅",
    )

    assert points[27]["plan_x"] == 148.8
    assert points[27]["plan_y"] == 168.4
    assert points[27]["plan_z"] == 0.55
    assert points[27]["semantic_locked"] is True


def test_derive_device_positions_semantically_places_tv_light_and_camera() -> None:
    points = spatial_scene_service._derive_device_positions(
        [
            {
                "id": 1,
                "name": "客厅电视",
                "entity_domain": "media_player",
                "device_class": "",
                "appliance_type": "tv",
            },
            {
                "id": 2,
                "name": "主卧顶灯",
                "entity_domain": "light",
                "device_class": "",
                "appliance_type": "",
            },
            {
                "id": 3,
                "name": "入户摄像头",
                "entity_domain": "camera",
                "device_class": "",
                "appliance_type": "camera",
            },
        ],
        {
            "plan_x": 0.0,
            "plan_y": 0.0,
            "plan_width": 800.0,
            "plan_height": 600.0,
            "plan_rotation": 0.0,
        },
        semantic_zones=[
            {"type": "living", "label": "客厅", "x": 300.0, "y": 240.0, "width": 420.0, "height": 260.0},
            {"type": "master", "label": "主卧", "x": 760.0, "y": 420.0, "width": 220.0, "height": 180.0},
            {"type": "entry", "label": "玄关", "x": 80.0, "y": 260.0, "width": 120.0, "height": 120.0},
        ],
        room_name="主卧",
    )

    assert points[1]["plan_x"] == 619.2
    assert points[1]["plan_y"] == 432.4
    assert points[1]["plan_rotation"] == 180.0
    assert points[2]["plan_x"] == 870.0
    assert points[2]["plan_y"] == 510.0
    assert points[2]["plan_z"] == 0.94
    assert points[3]["plan_x"] == 99.2
    assert points[3]["plan_y"] == 284.0
    assert points[3]["plan_z"] == 0.88


@pytest.mark.asyncio
async def test_get_spatial_scene_upgrades_legacy_floor_plan_analysis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_room_snapshots(_db):
        return [
            {
                "id": 11,
                "zone_id": 3,
                "name": "客厅",
                "description": None,
                "zone": {
                    "id": 3,
                    "name": "全屋",
                    "description": None,
                    "floor_plan_image_path": "/media/floorplans/demo.png",
                    "floor_plan_image_width": 1600,
                    "floor_plan_image_height": 960,
                    "floor_plan_analysis": "旧版分析文本",
                },
                "plan_x": None,
                "plan_y": None,
                "plan_width": None,
                "plan_height": None,
                "plan_rotation": None,
                "ambient_temperature": None,
                "ambient_humidity": None,
                "occupancy_status": None,
                "active_device_count": 0,
                "devices": [],
            }
        ]

    async def _fake_run_in_threadpool_session(func, *args, **kwargs):
        if func is spatial_scene_service._refresh_zone_analysis_payload:
            return {
                "id": 3,
                "name": "全屋",
                "description": None,
                "floor_plan_image_path": "/media/floorplans/demo.png",
                "floor_plan_image_width": 1600,
                "floor_plan_image_height": 960,
                "floor_plan_analysis": json.dumps(
                    {
                        "summary": "已识别出 1 个候选空间。",
                        "source": "local-structure",
                        "room_candidates": [
                            {"x": 64.0, "y": 96.0, "width": 520.0, "height": 320.0, "rotation": 0.0}
                        ],
                    },
                    ensure_ascii=False,
                ),
            }
        raise AssertionError(f"unexpected threadpool call: {func}")

    monkeypatch.setattr(catalog_service, "list_room_snapshots_for_spatial_scene", _fake_room_snapshots)
    monkeypatch.setattr(spatial_scene_service, "run_in_threadpool_session", _fake_run_in_threadpool_session)

    scene = await spatial_scene_service.get_spatial_scene(3)

    assert scene["analysis"]["source"] == "local-structure"
    assert scene["rooms"][0]["plan_x"] == 64.0
    assert scene["rooms"][0]["plan_width"] == 520.0
