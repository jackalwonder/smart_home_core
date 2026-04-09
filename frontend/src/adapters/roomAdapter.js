import { normalizeDeviceRead } from './deviceAdapter'

export function normalizeRoomStateRead(raw = {}) {
  return {
    ...raw,
    id: raw.id,
    zone_id: raw.zone_id ?? raw.zone?.id ?? null,
    name: `${raw.name ?? '未命名房间'}`.trim() || '未命名房间',
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
    devices: Array.isArray(raw.devices) ? raw.devices.map((device) => normalizeDeviceRead(device)) : [],
  }
}
