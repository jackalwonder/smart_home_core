import { apiClient } from '../client'

export function getSpatialScene(query = {}) {
  return apiClient.get('/api/spatial/scene', { query })
}

export function controlDevice(payload) {
  return apiClient.post('/api/device/control', payload)
}
