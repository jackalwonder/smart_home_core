from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import DeviceStatus
from app.schemas import (
    AutomationExecutionResult,
    AutomationWebhookRequest,
    AutomationWebhookResponse,
    DeviceControlAction,
    DeviceControlRequest,
    DeviceControlResponse,
)
from app.services import catalog_service
from app.services.home_assistant_api import HomeAssistantRestClient
from app.services.realtime import build_device_update_event, device_realtime_hub

logger = logging.getLogger(__name__)


async def control_device(db: Session, payload: DeviceControlRequest) -> DeviceControlResponse:
    device = catalog_service.get_device(db, payload.device_id)
    client = HomeAssistantRestClient.from_env()
    service_name = _service_name_for_action(payload.action)
    result = await client.call_service(service_name, entity_id=device.ha_entity_id)
    _optimistically_update_device_state(db, device.id, payload.action)
    logger.info("Forwarded device control action %s for %s.", payload.action.value, device.ha_entity_id)
    return DeviceControlResponse(
        device_id=device.id,
        ha_entity_id=device.ha_entity_id,
        action=payload.action,
        forwarded_service=service_name,
        accepted=True,
        result_count=len(result),
    )


async def execute_automation(payload: AutomationWebhookRequest) -> AutomationWebhookResponse:
    client = HomeAssistantRestClient.from_env()
    results: list[AutomationExecutionResult] = []

    if payload.scene_entity_id is not None:
        service_result = await client.call_service("scene.turn_on", entity_id=payload.scene_entity_id)
        results.append(
            AutomationExecutionResult(
                service="scene.turn_on",
                entity_id=payload.scene_entity_id,
                result_count=len(service_result),
            )
        )

    for action in payload.actions:
        service_result = await client.call_service(
            action.service,
            entity_id=action.entity_id,
            service_data=action.service_data,
        )
        results.append(
            AutomationExecutionResult(
                service=action.service,
                entity_id=action.entity_id,
                result_count=len(service_result),
            )
        )

    logger.info(
        "Executed automation workflow %s from source %s with %s service calls.",
        payload.workflow_name,
        payload.trigger_source,
        len(results),
    )
    return AutomationWebhookResponse(
        trigger_source=payload.trigger_source,
        workflow_name=payload.workflow_name,
        executed_calls=len(results),
        results=results,
    )


def _service_name_for_action(action: DeviceControlAction) -> str:
    action_map = {
        DeviceControlAction.ON: "homeassistant.turn_on",
        DeviceControlAction.OFF: "homeassistant.turn_off",
        DeviceControlAction.TOGGLE: "homeassistant.toggle",
    }
    return action_map[action]


def _optimistically_update_device_state(db: Session, device_id: int, action: DeviceControlAction) -> None:
    device = catalog_service.get_device(db, device_id)
    next_status = _status_for_action(action, device.current_status)
    if next_status is None:
        return
    try:
        device.current_status = next_status
        db.commit()
        db.refresh(device)
        device_realtime_hub.publish_threadsafe(build_device_update_event(device))
    except Exception:
        db.rollback()
        logger.exception("Failed to persist optimistic device state for device %s.", device_id)


def _status_for_action(action: DeviceControlAction, current_status: DeviceStatus) -> DeviceStatus | None:
    if action == DeviceControlAction.ON:
        return DeviceStatus.ON
    if action == DeviceControlAction.OFF:
        return DeviceStatus.OFF
    if action == DeviceControlAction.TOGGLE:
        if current_status == DeviceStatus.ON:
            return DeviceStatus.OFF
        if current_status == DeviceStatus.OFF:
            return DeviceStatus.ON
    return None
