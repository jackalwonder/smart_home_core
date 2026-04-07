from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services import spatial_service


def _radar_state(entity_id: str, state: str) -> dict[str, object]:
    return {
        "entity_id": entity_id,
        "state": state,
        "attributes": {
            "device_class": "presence",
        },
    }


class _FakeHomeAssistantClient:
    def __init__(self, states: list[dict[str, object]]) -> None:
        self._states = states

    async def get_states(self) -> list[dict[str, object]]:
        return self._states


@pytest.mark.asyncio
async def test_get_contextual_room_returns_room_when_exactly_one_radar_is_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        spatial_service.HomeAssistantRestClient,
        "from_env",
        lambda: _FakeHomeAssistantClient(
            [
                _radar_state("binary_sensor.master_bedroom_presence", "on"),
                _radar_state("binary_sensor.living_room_presence", "off"),
            ]
        ),
    )

    db = MagicMock()
    db.scalar.return_value = "主卧"

    async def _run_with_db(func, *args, **kwargs):
        return func(db, *args, **kwargs)

    monkeypatch.setattr(spatial_service, "run_in_threadpool_session", _run_with_db)

    result = await spatial_service.get_contextual_room("unknown device")

    assert result == "主卧"
    db.scalar.assert_called_once()


@pytest.mark.asyncio
async def test_get_contextual_room_returns_ambiguous_when_two_radars_are_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        spatial_service.HomeAssistantRestClient,
        "from_env",
        lambda: _FakeHomeAssistantClient(
            [
                _radar_state("binary_sensor.master_bedroom_presence", "on"),
                _radar_state("binary_sensor.living_room_presence", "on"),
            ]
        ),
    )

    db = MagicMock()

    async def _run_with_db(func, *args, **kwargs):
        return func(db, *args, **kwargs)

    monkeypatch.setattr(spatial_service, "run_in_threadpool_session", _run_with_db)

    result = await spatial_service.get_contextual_room("unknown device")

    assert result == spatial_service.AMBIGUOUS_ROOM
    db.scalar.assert_not_called()


@pytest.mark.asyncio
async def test_get_contextual_room_returns_ambiguous_when_zero_radars_are_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        spatial_service.HomeAssistantRestClient,
        "from_env",
        lambda: _FakeHomeAssistantClient(
            [
                _radar_state("binary_sensor.master_bedroom_presence", "off"),
                _radar_state("binary_sensor.living_room_presence", "off"),
            ]
        ),
    )

    db = MagicMock()

    async def _run_with_db(func, *args, **kwargs):
        return func(db, *args, **kwargs)

    monkeypatch.setattr(spatial_service, "run_in_threadpool_session", _run_with_db)

    result = await spatial_service.get_contextual_room("unknown device")

    assert result == spatial_service.AMBIGUOUS_ROOM
    db.scalar.assert_not_called()
