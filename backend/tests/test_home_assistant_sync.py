from __future__ import annotations

import pytest

from app.models import DeviceStatus
from app.services import home_assistant_import_service
from app.services.home_assistant_state_mapper import map_home_assistant_state
from app.services.home_assistant_ws import HomeAssistantWebSocketListener
from app.services.exceptions import ExternalServiceUnavailableError


def test_shared_state_mapper_covers_weather_and_sun_states() -> None:
    assert map_home_assistant_state("sunny") == DeviceStatus.ONLINE
    assert map_home_assistant_state("below_horizon") == DeviceStatus.OFF
    assert home_assistant_import_service._map_device_status("partlycloudy") == DeviceStatus.ONLINE
    assert HomeAssistantWebSocketListener._map_home_assistant_state("above_horizon") == DeviceStatus.ON


def test_registry_snapshot_requires_successful_registry_lists() -> None:
    with pytest.raises(ExternalServiceUnavailableError):
        home_assistant_import_service._build_registry_snapshot(
            {
                1: {"success": True, "result": []},
                2: {"success": False, "result": []},
                3: {"success": True, "result": []},
            }
        )


@pytest.mark.asyncio
async def test_auto_import_queue_keeps_multiple_unknown_entities() -> None:
    listener = HomeAssistantWebSocketListener("ws://example/websocket", "token")
    worker_snapshots: list[dict[str, DeviceStatus]] = []

    def _capture_worker_start() -> None:
        worker_snapshots.append(dict(listener._pending_auto_imports))

    listener._ensure_auto_import_worker = _capture_worker_start  # type: ignore[method-assign]

    await listener._attempt_auto_import("sensor.a", DeviceStatus.ON)
    await listener._attempt_auto_import("sensor.b", DeviceStatus.OFF)

    assert listener._pending_auto_imports == {
        "sensor.a": DeviceStatus.ON,
        "sensor.b": DeviceStatus.OFF,
    }
    assert worker_snapshots[-1] == listener._pending_auto_imports
