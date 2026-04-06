from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from app.auth import CONTROL_SCOPE, require_scope
from app.database import SessionLocal
from app.services import intent_service, llm_service, spatial_service
from app.services.errors import ConfigurationError, ExternalServiceError
from app.services.home_assistant_api import HomeAssistantRestClient

PROCESSING_REPLY = "收到，正在为您安排..."
VOICE_FAILURE_REPLY = "抱歉，我这次没能成功执行，请稍后再试。"

router = APIRouter()


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    text: str = Field(min_length=1)
    source_device: str | None = None
    user_id: str = Field(min_length=1)


@router.post("/", dependencies=[Depends(require_scope(CONTROL_SCOPE))])
async def submit_chat(
    payload: ChatRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    background_tasks.add_task(
        process_voice_command,
        user_id=payload.user_id,
        text=payload.text,
        source_device=payload.source_device,
    )
    return {"status": "processing", "reply": PROCESSING_REPLY}


async def process_voice_command(user_id: str, text: str, source_device: str | None = None) -> None:
    db = SessionLocal()
    client: HomeAssistantRestClient | None = None
    reply = VOICE_FAILURE_REPLY

    try:
        logger.info(
            "Processing voice command for user_id='{}' source_device='{}' text='{}'.",
            user_id,
            source_device,
            text,
        )
        client = HomeAssistantRestClient.from_env()

        active_intent = await intent_service.get_and_clear_active_intent(db, user_id)
        combined_text = _combine_intent(active_intent, text)

        location = await spatial_service.get_contextual_room(source_device or "", db)
        llm_result = await llm_service.analyze_smart_home_intent(db, combined_text, location)

        reply = _extract_reply(llm_result)
        actions = _extract_actions(llm_result)

        if location == spatial_service.AMBIGUOUS_ROOM and not actions:
            await intent_service.save_pending_intent(db, user_id, combined_text)

        if actions:
            await _execute_actions(client, actions)

    except ConfigurationError as exc:
        reply = f"抱歉，当前语音控制尚未配置完成：{exc}"
        logger.exception("Voice command processing failed because of missing configuration: {}", exc)
    except ExternalServiceError as exc:
        reply = f"抱歉，家居服务暂时不可用：{exc}"
        logger.exception("Voice command processing failed because an external service is unavailable: {}", exc)
    except Exception as exc:
        logger.exception("Unexpected error while processing voice command: {}", exc)
    finally:
        try:
            if client is not None:
                await client.broadcast_tts(reply)
        except Exception as exc:
            logger.exception("Failed to broadcast voice reply via TTS: {}", exc)
        db.close()


def _combine_intent(active_intent: str | None, text: str) -> str:
    cleaned_text = text.strip()
    if not active_intent:
        return cleaned_text
    return f"用户之前说: {active_intent}，现在补充/确认: {cleaned_text}"


def _extract_reply(llm_result: dict[str, Any]) -> str:
    reply = llm_result.get("reply")
    if isinstance(reply, str) and reply.strip():
        return reply.strip()
    return VOICE_FAILURE_REPLY


def _extract_actions(llm_result: dict[str, Any]) -> list[dict[str, Any]]:
    actions = llm_result.get("actions")
    if not isinstance(actions, list):
        return []
    return [action for action in actions if isinstance(action, dict)]


async def _execute_actions(client: HomeAssistantRestClient, actions: list[dict[str, Any]]) -> None:
    for action in actions:
        ha_entity_id = action.get("ha_entity_id")
        action_name = action.get("action")
        value = action.get("value")

        if not isinstance(ha_entity_id, str) or not ha_entity_id.strip():
            logger.warning("Skipping voice action because ha_entity_id is missing: {}", action)
            continue

        service_name, service_data = _build_service_call(ha_entity_id, action_name, value)
        if service_name is None:
            logger.warning(
                "Skipping unsupported voice action '{}' for entity '{}' with value '{}': {}",
                action_name,
                ha_entity_id,
                value,
                action,
            )
            continue

        logger.info(
            "Executing voice action '{}' for entity '{}' via service '{}' with payload '{}'.",
            action_name,
            ha_entity_id,
            service_name,
            service_data,
        )
        await client.call_service(service_name, entity_id=ha_entity_id, service_data=service_data)


def _service_name_for_action(action_name: Any) -> str | None:
    if not isinstance(action_name, str):
        return None

    normalized_action = action_name.strip().lower()
    action_map = {
        "turn_on": "homeassistant.turn_on",
        "turn_off": "homeassistant.turn_off",
        "toggle": "homeassistant.toggle",
    }
    return action_map.get(normalized_action)


def _build_service_call(
    ha_entity_id: str,
    action_name: Any,
    value: Any,
) -> tuple[str | None, dict[str, Any] | None]:
    domain = ha_entity_id.split(".", 1)[0].lower() if "." in ha_entity_id else ""
    normalized_action = str(action_name).strip().lower() if isinstance(action_name, str) else ""

    if domain == "number":
        if normalized_action in {"set_value", "set_temperature", "turn_on"} and value is not None:
            numeric_value = _coerce_numeric_value(value)
            if numeric_value is None:
                return None, None
            return "number.set_value", {"value": numeric_value}
        return None, None

    if domain == "select":
        if normalized_action in {"select_option", "set_hvac_mode", "turn_on"} and isinstance(value, str) and value.strip():
            return "select.select_option", {"option": value.strip()}
        return None, None

    if domain == "button":
        if normalized_action in {"press", "turn_on", "toggle"}:
            return "button.press", None
        return None, None

    if domain == "climate":
        if normalized_action in {"set_temperature", "set_value"} and value is not None:
            numeric_value = _coerce_numeric_value(value)
            if numeric_value is None:
                return None, None
            return "climate.set_temperature", {"temperature": numeric_value}
        if normalized_action in {"set_hvac_mode", "select_option"} and isinstance(value, str) and value.strip():
            return "climate.set_hvac_mode", {"hvac_mode": value.strip()}
        generic_service = _service_name_for_action(normalized_action)
        return generic_service, None

    if domain == "media_player":
        if normalized_action in {"select_option"} and isinstance(value, str) and value.strip():
            return "media_player.select_source", {"source": value.strip()}
        if normalized_action in {"set_value"} and value is not None:
            numeric_value = _coerce_numeric_value(value)
            if numeric_value is None:
                return None, None
            volume_level = numeric_value / 100 if numeric_value > 1 else numeric_value
            return "media_player.volume_set", {"volume_level": max(0.0, min(volume_level, 1.0))}
        generic_service = _service_name_for_action(normalized_action)
        return generic_service, None

    generic_service = _service_name_for_action(normalized_action)
    if generic_service is None:
        return None, None
    return generic_service, None


def _coerce_numeric_value(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None
