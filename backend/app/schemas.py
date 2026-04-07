from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import DeviceStatus, DeviceType


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ZoneCreate(StrictSchema):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)


class ZoneRead(StrictSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    name: str
    description: str | None
    floor_plan_image_path: str | None = None
    floor_plan_image_width: int | None = None
    floor_plan_image_height: int | None = None
    floor_plan_analysis: str | None = None
    three_d_model_path: str | None = None
    three_d_model_format: str | None = None
    three_d_model_scale: float | None = None


class RoomCreate(StrictSchema):
    zone_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=1000)
    plan_x: float | None = None
    plan_y: float | None = None
    plan_width: float | None = None
    plan_height: float | None = None
    plan_rotation: float | None = None


class RoomRead(StrictSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    zone_id: int
    name: str
    description: str | None
    plan_x: float | None = None
    plan_y: float | None = None
    plan_width: float | None = None
    plan_height: float | None = None
    plan_rotation: float | None = None


class DeviceCreate(StrictSchema):
    room_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    ha_entity_id: str = Field(min_length=3, max_length=255)
    ha_device_id: str | None = Field(default=None, max_length=255)
    device_type: DeviceType
    current_status: DeviceStatus = DeviceStatus.UNKNOWN
    plan_x: float | None = None
    plan_y: float | None = None
    plan_z: float | None = None
    plan_rotation: float | None = None


class DeviceAdminRead(StrictSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    room_id: int
    name: str
    ha_entity_id: str
    ha_device_id: str | None = None
    device_type: DeviceType
    current_status: DeviceStatus
    plan_x: float | None = None
    plan_y: float | None = None
    plan_z: float | None = None
    plan_rotation: float | None = None


class DeviceRead(StrictSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    room_id: int
    name: str
    ha_entity_id: str
    ha_device_id: str | None = None
    device_type: DeviceType
    current_status: DeviceStatus
    entity_domain: str
    raw_state: str | None = None
    device_class: str | None = None
    can_control: bool = False
    control_kind: str | None = None
    control_options: list[str] = Field(default_factory=list)
    number_value: float | None = None
    min_value: float | None = None
    max_value: float | None = None
    step: float | None = None
    unit_of_measurement: str | None = None
    target_temperature: float | None = None
    current_temperature: float | None = None
    hvac_mode: str | None = None
    hvac_modes: list[str] = Field(default_factory=list)
    media_volume_level: float | None = None
    media_source: str | None = None
    media_source_options: list[str] = Field(default_factory=list)
    appliance_name: str | None = None
    appliance_type: str | None = None
    brightness_value: float | None = None
    brightness_min: float | None = None
    brightness_max: float | None = None
    color_temperature: float | None = None
    min_color_temperature: float | None = None
    max_color_temperature: float | None = None
    supports_brightness: bool = False
    supports_color_temperature: bool = False
    plan_x: float | None = None
    plan_y: float | None = None
    plan_z: float | None = None
    plan_rotation: float | None = None


class RoomStateRead(StrictSchema):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    id: int
    zone_id: int
    name: str
    description: str | None
    plan_x: float | None = None
    plan_y: float | None = None
    plan_width: float | None = None
    plan_height: float | None = None
    plan_rotation: float | None = None
    zone: ZoneRead
    ambient_temperature: float | None = None
    ambient_humidity: float | None = None
    occupancy_status: str | None = None
    active_device_count: int = Field(default=0, ge=0)
    devices: list[DeviceRead] = Field(default_factory=list)


class RoomLayoutUpdate(StrictSchema):
    plan_x: float | None = None
    plan_y: float | None = None
    plan_width: float | None = None
    plan_height: float | None = None
    plan_rotation: float | None = None


class DevicePlacementUpdate(StrictSchema):
    plan_x: float | None = None
    plan_y: float | None = None
    plan_z: float | None = None
    plan_rotation: float | None = None


class SpatialAutoLayoutRequest(StrictSchema):
    zone_id: int = Field(gt=0)
    preserve_existing: bool = True


class SpatialManualDeviceCreate(StrictSchema):
    room_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=100)
    ha_entity_id: str | None = Field(default=None, max_length=255)
    ha_device_id: str | None = Field(default=None, max_length=255)
    device_type: DeviceType
    current_status: DeviceStatus = DeviceStatus.UNKNOWN
    plan_x: float | None = None
    plan_y: float | None = None
    plan_z: float | None = None
    plan_rotation: float | None = None


class SpatialSceneRead(StrictSchema):
    zone: ZoneRead | None = None
    rooms: list[RoomStateRead] = Field(default_factory=list)
    analysis: dict[str, Any] | None = None


class FloorPlanUploadResponse(StrictSchema):
    zone: ZoneRead
    updated_room_count: int = Field(ge=0)
    image_url: str


class SceneModelUploadResponse(StrictSchema):
    zone: ZoneRead
    model_url: str


class SpatialAutoLayoutResponse(StrictSchema):
    zone: ZoneRead
    updated_room_count: int = Field(ge=0)


class DeviceControlAction(str, Enum):
    ON = "on"
    OFF = "off"
    TOGGLE = "toggle"


class DeviceControlKind(str, Enum):
    TOGGLE = "toggle"
    NUMBER = "number"
    SELECT = "select"
    BUTTON = "button"
    BRIGHTNESS = "brightness"
    COLOR_TEMPERATURE = "color_temperature"


class DeviceControlRequest(StrictSchema):
    device_id: int = Field(gt=0)
    control_kind: DeviceControlKind
    action: DeviceControlAction | None = None
    value: float | None = None
    option: str | None = Field(default=None, min_length=1, max_length=255)

    @model_validator(mode="after")
    def validate_control_payload(self) -> "DeviceControlRequest":
        if self.control_kind == DeviceControlKind.TOGGLE:
            if self.action is None:
                self.action = DeviceControlAction.TOGGLE
            return self
        if self.control_kind == DeviceControlKind.NUMBER:
            if self.value is None:
                raise ValueError("value is required for number controls.")
            return self
        if self.control_kind in {DeviceControlKind.BRIGHTNESS, DeviceControlKind.COLOR_TEMPERATURE}:
            if self.value is None:
                raise ValueError("value is required for advanced light controls.")
            return self
        if self.control_kind == DeviceControlKind.SELECT:
            if self.option is None:
                raise ValueError("option is required for select controls.")
            return self
        if self.control_kind == DeviceControlKind.BUTTON:
            return self
        raise ValueError("Unsupported control payload.")


class DeviceControlResponse(StrictSchema):
    device_id: int
    ha_entity_id: str
    control_kind: DeviceControlKind
    action: DeviceControlAction | None = None
    value: float | None = None
    option: str | None = None
    forwarded_service: str
    accepted: bool
    result_count: int = Field(ge=0)


class AutomationServiceCall(StrictSchema):
    service: str = Field(min_length=3, max_length=120)
    entity_id: str | list[str] | None = None
    service_data: dict[str, Any] = Field(default_factory=dict)

    @field_validator("service")
    @classmethod
    def validate_service_name(cls, value: str) -> str:
        if "." not in value:
            raise ValueError("service must be in the form domain.service")
        return value


class AutomationWebhookRequest(StrictSchema):
    trigger_source: str = Field(min_length=1, max_length=100)
    workflow_name: str = Field(min_length=1, max_length=120)
    scene_entity_id: str | None = Field(default=None, min_length=3, max_length=255)
    actions: list[AutomationServiceCall] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def ensure_work_is_present(self) -> "AutomationWebhookRequest":
        if self.scene_entity_id is None and not self.actions:
            raise ValueError("At least one of scene_entity_id or actions must be provided.")
        return self


class AutomationExecutionResult(StrictSchema):
    service: str
    entity_id: str | list[str] | None = None
    result_count: int = Field(ge=0)


class AutomationWebhookResponse(StrictSchema):
    trigger_source: str
    workflow_name: str
    executed_calls: int = Field(ge=0)
    results: list[AutomationExecutionResult] = Field(default_factory=list)


class HomeAssistantImportResponse(StrictSchema):
    zone_name: str
    imported_room_count: int = Field(ge=0)
    imported_device_count: int = Field(ge=0)
    created_room_count: int = Field(ge=0)
    created_device_count: int = Field(ge=0)
    updated_device_count: int = Field(ge=0)
    removed_device_count: int = Field(ge=0)
