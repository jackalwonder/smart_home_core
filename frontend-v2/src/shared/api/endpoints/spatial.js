import { apiClient } from '../client'

export function uploadFloorplan(formData, options = {}) {
  return apiClient.post('/api/spatial/floorplan', formData, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  })
}

export function updateDevicePlacement(deviceId, payload, options = {}) {
  return apiClient.put(`/api/spatial/devices/${deviceId}/placement`, payload, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  })
}
