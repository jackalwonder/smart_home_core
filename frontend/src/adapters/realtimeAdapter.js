import { normalizeDevicePatch } from './deviceAdapter'

export function normalizeRealtimeMessage(raw = {}) {
  if (raw?.type === 'connection_established' || raw?.type === 'pong') {
    return { type: raw.type }
  }

  if (raw?.type === 'catalog_updated') {
    return {
      type: 'catalog_updated',
      reason: raw.reason ?? 'unknown',
    }
  }

  if (raw?.type === 'device_state_updated' && raw.device) {
    return {
      type: 'device_state_updated',
      devicePatch: normalizeDevicePatch(raw.device),
    }
  }

  return {
    type: 'unknown',
    raw,
  }
}
