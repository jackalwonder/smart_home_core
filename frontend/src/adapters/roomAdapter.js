import { normalizeDeviceEntity, normalizeDeviceRead } from './deviceAdapter'

function normalizeRoomBase(raw = {}) {
  return {
    ...raw,
    id: raw.id,
    zone_id: raw.zone_id ?? raw.zone?.id ?? null,
    name: `${raw.name ?? 'Unknown room'}`.trim() || 'Unknown room',
    description: raw.description ?? '',
    plan_x: raw.plan_x ?? null,
    plan_y: raw.plan_y ?? null,
    plan_width: raw.plan_width ?? null,
    plan_height: raw.plan_height ?? null,
    plan_rotation: raw.plan_rotation ?? null,
    zone: raw.zone ?? null,
    ambient_temperature: raw.ambient_temperature ?? null,
    ambient_humidity: raw.ambient_humidity ?? null,
    occupancy_status: raw.occupancy_status ?? null,
    active_device_count: raw.active_device_count ?? 0,
  }
}

export function normalizeRoomEntity(raw = {}) {
  return normalizeRoomBase(raw)
}

export function extractRoomSceneLayout(raw = {}) {
  return {
    plan_x: raw.plan_x ?? null,
    plan_y: raw.plan_y ?? null,
    plan_width: raw.plan_width ?? null,
    plan_height: raw.plan_height ?? null,
    plan_rotation: raw.plan_rotation ?? null,
  }
}

export function normalizeRoomStateRead(raw = {}) {
  const room = normalizeRoomBase(raw)
  return {
    ...room,
    devices: Array.isArray(raw.devices) ? raw.devices.map((device) => normalizeDeviceRead(device)) : [],
  }
}

export function normalizeRoomDevices(raw = {}) {
  return Array.isArray(raw.devices) ? raw.devices.map((device) => normalizeDeviceEntity(device)) : []
}
