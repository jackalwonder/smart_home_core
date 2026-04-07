from __future__ import annotations

from app.schemas import DeviceControlKind, DeviceControlRequest
from app.services import automation_service


def test_service_call_for_media_player_volume_normalizes_percentage() -> None:
    payload = DeviceControlRequest(
        device_id=1,
        control_kind=DeviceControlKind.NUMBER,
        value=35,
    )

    service_name, service_data = automation_service._service_call_for_payload(
        "media_player.living_room_tv",
        payload,
    )

    assert service_name == "media_player.volume_set"
    assert service_data == {"volume_level": 0.35}


def test_service_call_for_climate_select_uses_hvac_mode() -> None:
    payload = DeviceControlRequest(
        device_id=1,
        control_kind=DeviceControlKind.SELECT,
        option="cool",
    )

    service_name, service_data = automation_service._service_call_for_payload(
        "climate.master_bedroom_ac",
        payload,
    )

    assert service_name == "climate.set_hvac_mode"
    assert service_data == {"hvac_mode": "cool"}
