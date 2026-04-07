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


def test_service_call_for_light_brightness_uses_turn_on_brightness_pct() -> None:
    payload = DeviceControlRequest(
        device_id=1,
        control_kind=DeviceControlKind.BRIGHTNESS,
        value=68,
    )

    service_name, service_data = automation_service._service_call_for_payload(
        "light.island_lamp",
        payload,
    )

    assert service_name == "light.turn_on"
    assert service_data == {"brightness_pct": 68.0}


def test_service_call_for_light_color_temperature_uses_kelvin() -> None:
    payload = DeviceControlRequest(
        device_id=1,
        control_kind=DeviceControlKind.COLOR_TEMPERATURE,
        value=4200,
    )

    service_name, service_data = automation_service._service_call_for_payload(
        "light.bedside_lamp",
        payload,
    )

    assert service_name == "light.turn_on"
    assert service_data == {"color_temp_kelvin": 4200}
