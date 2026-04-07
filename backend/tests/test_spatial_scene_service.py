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
