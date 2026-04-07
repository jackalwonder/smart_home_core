from __future__ import annotations

import json
from types import SimpleNamespace
import pytest
from pydantic import ValidationError

from app.services import llm_service


class _FakeCompletions:
    def __init__(self, content: str) -> None:
        self._content = content

    async def create(self, **kwargs):
        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=self._content)
                )
            ]
        )


class _FakeChat:
    def __init__(self, content: str) -> None:
        self.completions = _FakeCompletions(content)


class _FakeAsyncClient:
    def __init__(self, content: str) -> None:
        self.chat = _FakeChat(content)


async def _fake_build_device_context() -> str:
    return "客厅 | 客厅空调 | entity=climate.living_room_ac | state=off | actions=turn_on|turn_off|toggle"


def test_parse_llm_response_accepts_valid_json() -> None:
    payload = json.dumps(
        {
            "actions": [
                {
                    "ha_entity_id": "light.living_room",
                    "action": "turn_on",
                    "value": None,
                }
            ],
            "reply": "好的，已经打开客厅灯。",
        }
    )

    result = llm_service._parse_llm_response(payload)

    assert result == {
        "actions": [
            {
                "ha_entity_id": "light.living_room",
                "action": "turn_on",
                "value": None,
            }
        ],
        "reply": "好的，已经打开客厅灯。",
    }


def test_parse_llm_response_raises_validation_error_when_reply_is_missing() -> None:
    payload = json.dumps(
        {
            "actions": [
                {
                    "ha_entity_id": "light.living_room",
                    "action": "turn_on",
                    "value": None,
                }
            ]
        }
    )

    with pytest.raises(ValidationError):
        llm_service._parse_llm_response(payload)


def test_parse_llm_response_raises_json_error_for_plain_text() -> None:
    with pytest.raises(json.JSONDecodeError):
        llm_service._parse_llm_response("Sorry, I cannot do that")


@pytest.mark.asyncio
async def test_analyze_smart_home_intent_falls_back_when_required_field_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(llm_service, "_build_device_context", _fake_build_device_context)
    monkeypatch.setattr(
        llm_service,
        "_build_async_client",
        lambda: _FakeAsyncClient(
            '{"actions":[{"ha_entity_id":"light.living_room","action":"turn_on","value":null}]}'
        ),
    )

    result = await llm_service.analyze_smart_home_intent(
        user_command="打开客厅灯",
        location="客厅",
    )

    assert result == {
        "actions": [],
        "reply": llm_service.FALLBACK_REPLY,
    }


@pytest.mark.asyncio
async def test_analyze_smart_home_intent_falls_back_when_json_is_invalid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(llm_service, "_build_device_context", _fake_build_device_context)
    monkeypatch.setattr(
        llm_service,
        "_build_async_client",
        lambda: _FakeAsyncClient("Sorry, I cannot do that"),
    )

    result = await llm_service.analyze_smart_home_intent(
        user_command="打开客厅灯",
        location="客厅",
    )

    assert result == {
        "actions": [],
        "reply": llm_service.FALLBACK_REPLY,
    }
