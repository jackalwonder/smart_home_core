from __future__ import annotations

"""LLM 意图分析服务，把口语命令收敛成可执行的 Home Assistant 动作。"""

import json
import os
from typing import Any

import openai
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import run_in_threadpool_session
from app.models import Device, Room
from app.services.home_assistant_api import HomeAssistantRestClient

AMBIGUOUS_LOCATION = "AMBIGUOUS"
DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
FALLBACK_REPLY = "抱歉，我暂时没能理解这条家居指令，请换一种说法再试一次。"
AMBIGUOUS_REPLY = "我还不能确定你指的是哪个房间。请告诉我是哪个房间。"
TOGGLE_DOMAINS = {"fan", "light", "switch", "cover", "lock", "media_player", "climate"}


class LlmAction(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    ha_entity_id: str = Field(min_length=3)
    action: str
    value: str | float | int | None = None


class LlmIntentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    actions: list[LlmAction] = Field(default_factory=list)
    reply: str = Field(min_length=1)


async def analyze_smart_home_intent(user_command: str, location: str) -> dict[str, Any]:
    logger.info("Analyzing smart home intent. location='{}' command='{}'", location, user_command)

    device_context = await _build_device_context()
    system_prompt = _build_system_prompt(device_context=device_context, location=location)

    # 房间一旦不明确，就直接走澄清分支，避免把动作误发到错误空间。
    if location == AMBIGUOUS_LOCATION:
        logger.info("Location is ambiguous. Returning clarification response without LLM action execution intent.")
        return LlmIntentResponse(actions=[], reply=AMBIGUOUS_REPLY).model_dump()

    try:
        client = _build_async_client()
        response = await client.chat.completions.create(
            model=os.getenv("DEEPSEEK_MODEL", DEFAULT_DEEPSEEK_MODEL),
            temperature=0,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_command.strip()},
            ],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content if response.choices else ""
        logger.info("Received LLM response payload: {}", content)
        return _parse_llm_response(content)
    except ValidationError as exc:
        logger.warning("LLM response validation failed: {}", exc)
        return LlmIntentResponse(actions=[], reply=FALLBACK_REPLY).model_dump()
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("LLM response parsing failed: {}", exc)
        return LlmIntentResponse(actions=[], reply=FALLBACK_REPLY).model_dump()
    except Exception as exc:
        logger.exception("LLM intent analysis failed: {}", exc)
        return LlmIntentResponse(actions=[], reply=FALLBACK_REPLY).model_dump()


async def _build_device_context() -> str:
    client = HomeAssistantRestClient.from_env()
    states = await client.get_states()
    state_map = {
        item["entity_id"]: item
        for item in states
        if isinstance(item, dict) and isinstance(item.get("entity_id"), str)
    }

    def _load_devices_and_rooms(db: Session) -> tuple[list[Device], dict[int, str]]:
        devices = list(
            db.scalars(
                select(Device)
                .join(Room, Device.room_id == Room.id)
                .order_by(Room.name, Device.name)
            ).all()
        )
        room_names = {
            room.id: room.name
            for room in db.scalars(select(Room)).all()
        }
        return devices, room_names

    devices, room_names = await run_in_threadpool_session(_load_devices_and_rooms)

    context_lines: list[str] = []
    for device in devices:
        room_name = room_names.get(device.room_id, "未分配房间")
        state = state_map.get(device.ha_entity_id, {})
        attributes = state.get("attributes") if isinstance(state.get("attributes"), dict) else {}
        raw_state = state.get("state")
        normalized_state = str(raw_state).strip() if raw_state is not None else device.current_status.value
        capability_description = _describe_capability(device.ha_entity_id, normalized_state, attributes)
        context_lines.append(
            f"{room_name} | {device.name} | entity={device.ha_entity_id} | state={normalized_state} | {capability_description}"
        )

    if not context_lines:
        return "No tracked devices are currently available."

    return "\n".join(context_lines)


def _describe_capability(entity_id: str, current_state: str, attributes: dict[str, Any]) -> str:
    domain = entity_id.split(".", 1)[0]

    if domain in TOGGLE_DOMAINS:
        parts = [f"actions=turn_on|turn_off|toggle", f"current={current_state}"]
        if domain == "climate":
            hvac_modes = _list_values(attributes.get("hvac_modes"))
            if hvac_modes:
                parts.append(f"hvac_modes={hvac_modes}")
            min_temp = _float_value(attributes.get("min_temp"))
            max_temp = _float_value(attributes.get("max_temp"))
            temp_step = _float_value(attributes.get("target_temp_step"))
            if min_temp is not None and max_temp is not None:
                parts.append(
                    f"temperature_action=set_temperature range=[{_format_number(min_temp)}, {_format_number(max_temp)}]"
                )
            if temp_step is not None:
                parts.append(f"temperature_step={_format_number(temp_step)}")
        if domain == "media_player":
            source_list = _list_values(attributes.get("source_list"))
            if source_list:
                parts.append(f"source_action=select_option options={source_list}")
        return " | ".join(parts)

    if domain == "number":
        min_value = _float_value(attributes.get("min"))
        max_value = _float_value(attributes.get("max"))
        step = _float_value(attributes.get("step"))
        unit = str(attributes.get("unit_of_measurement", "")).strip()
        parts = [f"actions=set_value", f"current={current_state}"]
        if min_value is not None and max_value is not None:
            parts.append(f"range=[{_format_number(min_value)}, {_format_number(max_value)}]")
        if step is not None:
            parts.append(f"step={_format_number(step)}")
        if unit:
            parts.append(f"unit={unit}")
        return " | ".join(parts)

    if domain == "select":
        options = _list_values(attributes.get("options"))
        return f"actions=select_option | current={current_state} | options={options}"

    if domain == "button":
        return "actions=press | stateless=true"

    return f"actions=none | current={current_state}"


def _build_system_prompt(device_context: str, location: str) -> str:
    # Prompt 里显式给出设备清单和动作约束，尽量把模型输出限定为可直接执行的 JSON。
    ambiguity_rule = (
        "If the provided location is 'AMBIGUOUS', you must return an empty actions list and a polite clarification "
        f"question in the reply field, for example '{AMBIGUOUS_REPLY}'."
    )

    return (
        "You are the intent planner for a smart home management system.\n"
        "You must decide which Home Assistant entities should be controlled based on the user's command.\n"
        "Always return strictly valid JSON with this exact schema:\n"
        '{"actions": [{"ha_entity_id": "string", "action": "turn_on|turn_off|toggle|set_value|select_option|press|set_temperature|set_hvac_mode", "value": "optional numeric or string"}], "reply": "string"}\n'
        "Rules:\n"
        f"- User location: {location}\n"
        f"- {ambiguity_rule}\n"
        "- Strongly prefer entities located in the user's current room unless the user explicitly names another room.\n"
        "- Only reference entities that appear in the device context.\n"
        "- For number entities, use action 'set_value' and put the target number in value.\n"
        "- For select entities, use action 'select_option' and put the exact option text in value.\n"
        "- For button entities, use action 'press'.\n"
        "- For climate entities, use 'turn_on'/'turn_off' for power, 'set_temperature' for target temperature, and 'set_hvac_mode' for modes.\n"
        "- For media_player entities, use 'turn_on'/'turn_off'/'toggle' for power and 'select_option' for source switching when source options are present.\n"
        "- Never invent entity ids, never invent options, and never output multiple conflicting actions for the same entity.\n"
        "- If you are unsure, return an empty actions list and explain what is missing in the reply.\n"
        "- The reply should be short, natural Chinese.\n"
        "- Do not output markdown, explanations, or text outside JSON.\n"
        "Current device context:\n"
        f"{device_context}"
    )


def _build_async_client():
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    base_url = os.getenv("DEEPSEEK_BASE_URL", "").strip()
    if not api_key or not base_url:
        raise ValueError("DEEPSEEK_API_KEY and DEEPSEEK_BASE_URL must be configured.")

    client_factory = getattr(openai, "AsyncClient", None) or getattr(openai, "AsyncOpenAI", None)
    if client_factory is None:
        raise RuntimeError("The installed openai package does not expose an async client.")

    return client_factory(api_key=api_key, base_url=base_url)


def _parse_llm_response(content: str | None) -> dict[str, Any]:
    if not content:
        raise ValueError("The LLM returned an empty response.")

    payload = json.loads(content)
    validated = LlmIntentResponse.model_validate(payload)
    return validated.model_dump()


def _list_values(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _float_value(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_number(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)
