from __future__ import annotations

from app.models import DeviceStatus


STATE_MAP = {
    "on": DeviceStatus.ON,
    "off": DeviceStatus.OFF,
    "home": DeviceStatus.ONLINE,
    "open": DeviceStatus.ON,
    "opening": DeviceStatus.ON,
    "closed": DeviceStatus.OFF,
    "closing": DeviceStatus.OFF,
    "locked": DeviceStatus.ON,
    "unlocked": DeviceStatus.OFF,
    "playing": DeviceStatus.ON,
    "paused": DeviceStatus.SLEEPING,
    "idle": DeviceStatus.SLEEPING,
    "standby": DeviceStatus.SLEEPING,
    "sleep": DeviceStatus.SLEEPING,
    "sleeping": DeviceStatus.SLEEPING,
    "online": DeviceStatus.ONLINE,
    "offline": DeviceStatus.OFFLINE,
    "unavailable": DeviceStatus.UNAVAILABLE,
    "below_horizon": DeviceStatus.OFF,
    "above_horizon": DeviceStatus.ON,
    "clear-night": DeviceStatus.ONLINE,
    "cloudy": DeviceStatus.ONLINE,
    "partlycloudy": DeviceStatus.ONLINE,
    "rainy": DeviceStatus.ONLINE,
    "sunny": DeviceStatus.ONLINE,
    "unknown": DeviceStatus.UNKNOWN,
}


def map_home_assistant_state(raw_state: str) -> DeviceStatus:
    normalized = raw_state.strip().lower()
    return STATE_MAP.get(normalized, DeviceStatus.UNKNOWN)
