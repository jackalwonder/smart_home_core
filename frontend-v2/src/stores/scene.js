import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { getSpatialScene, controlDevice } from '../shared/api/endpoints/scene'
import { DeviceRealtimeClient } from '../shared/ws/deviceRealtimeClient'
import {
  buildCapabilityControlPayload,
  buildDirectControlPayload,
  buildOptimisticCapabilityPatch,
  buildOptimisticDevicePatch,
  buildStageModel,
  mapSceneDtoToDomain,
  patchKnownDeviceStateFields,
} from '../domain/scene/sceneAdapters'

const LEGACY_STORAGE_KEY = 'shadow-dashboard-v2:settings'
const LEGACY_BUSINESS_FIELDS = ['floors', 'floorplanAssets', 'roomLayers', 'roomAnchors', 'selectedFloorId']
const LEGACY_EXTRA_KEYS = [
  'shadow-dashboard-v2:floors',
  'shadow-dashboard-v2:floorplanAssets',
  'shadow-dashboard-v2:roomLayers',
  'shadow-dashboard-v2:roomAnchors',
  'shadow-dashboard-v2:defaultHotspots',
]

function cleanupLegacyBusinessStorage() {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        let changed = false
        LEGACY_BUSINESS_FIELDS.forEach((field) => {
          if (field in parsed) {
            delete parsed[field]
            changed = true
          }
        })
        if (changed) {
          window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(parsed))
        }
      }
    }
  } catch {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  }

  LEGACY_EXTRA_KEYS.forEach((key) => window.localStorage.removeItem(key))
}

export const useSceneStore = defineStore('scene', () => {
  const rawScene = ref(null)
  const zone = ref(null)
  const roomsById = ref({})
  const roomOrder = ref([])
  const devicesById = ref({})
  const deviceIdsByRoomId = ref({})

  const loading = ref(false)
  const error = ref('')
  const isOffline = ref(false)
  const isStale = ref(false)
  const lastLoadedAt = ref(0)
  const lastPatchedAt = ref(0)
  const pendingDeviceIds = ref({})

  let realtimeClient = null

  const stageModel = computed(() =>
    buildStageModel(zone.value, roomsById.value, roomOrder.value, devicesById.value, deviceIdsByRoomId.value),
  )

  function applyScenePayload(payload) {
    const normalized = mapSceneDtoToDomain(payload)
    rawScene.value = normalized.rawScene
    zone.value = normalized.zone
    roomsById.value = normalized.roomsById
    roomOrder.value = normalized.roomOrder
    devicesById.value = normalized.devicesById
    deviceIdsByRoomId.value = normalized.deviceIdsByRoomId
    isOffline.value = false
    isStale.value = false
    error.value = ''
    lastLoadedAt.value = Date.now()
  }

  async function loadScene(options = {}) {
    const silent = Boolean(options.silent)

    if (!silent) {
      loading.value = true
    }

    cleanupLegacyBusinessStorage()

    try {
      const payload = await getSpatialScene()
      applyScenePayload(payload)
      return payload
    } catch (nextError) {
      error.value = nextError.message || '空间场景加载失败。'
      isOffline.value = true
      throw nextError
    } finally {
      loading.value = false
    }
  }

  function applyLocalDevicePatch(deviceId, patch) {
    if (!patch || !devicesById.value[deviceId]) {
      return
    }

    devicesById.value = {
      ...devicesById.value,
      [deviceId]: {
        ...devicesById.value[deviceId],
        ...patch,
      },
    }
  }

  function patchDeviceState(devicePatch) {
    const deviceId = Number(devicePatch?.id)
    if (!Number.isFinite(deviceId) || !devicesById.value[deviceId]) {
      return
    }

    devicesById.value = {
      ...devicesById.value,
      [deviceId]: patchKnownDeviceStateFields(devicesById.value[deviceId], devicePatch),
    }

    lastPatchedAt.value = Date.now()
    pendingDeviceIds.value = {
      ...pendingDeviceIds.value,
      [deviceId]: false,
    }
  }

  function handleRealtimeMessage(message) {
    if (!message || typeof message !== 'object') {
      return
    }

    if (message.type === 'device_state_updated' && message.device) {
      patchDeviceState(message.device)
      return
    }

    if (message.type === 'catalog_updated') {
      isStale.value = true
      loadScene({ silent: true }).catch(() => {
        isOffline.value = true
      })
    }
  }

  function connectRealtime() {
    if (realtimeClient) {
      realtimeClient.connect()
      return
    }

    realtimeClient = new DeviceRealtimeClient({
      onMessage: handleRealtimeMessage,
      onClose: () => {
        isOffline.value = true
      },
      onReconnect: () => {
        isStale.value = true
        loadScene({ silent: true }).catch(() => {
          isOffline.value = true
        })
      },
    })

    realtimeClient.connect()
  }

  function disconnectRealtime() {
    if (realtimeClient) {
      realtimeClient.disconnect()
    }
  }

  async function controlDirectDevice(deviceId) {
    const normalizedId = Number(deviceId)
    const device = devicesById.value[normalizedId]
    const payload = buildDirectControlPayload(device)

    if (!device || !payload) {
      return false
    }

    const optimisticPatch = buildOptimisticDevicePatch(device)
    const previous = device

    pendingDeviceIds.value = {
      ...pendingDeviceIds.value,
      [normalizedId]: true,
    }

    if (optimisticPatch) {
      patchDeviceState({ id: normalizedId, ...optimisticPatch })
    }

    try {
      await controlDevice(payload)
      pendingDeviceIds.value = {
        ...pendingDeviceIds.value,
        [normalizedId]: false,
      }
      return true
    } catch (nextError) {
      devicesById.value = {
        ...devicesById.value,
        [normalizedId]: previous,
      }
      pendingDeviceIds.value = {
        ...pendingDeviceIds.value,
        [normalizedId]: false,
      }
      throw nextError
    }
  }

  async function controlDeviceByIntent(deviceId, intent) {
    const normalizedId = Number(deviceId)
    const device = devicesById.value[normalizedId]
    const payload = buildCapabilityControlPayload(device, intent)

    if (!device || !payload) {
      return false
    }

    const previous = device
    const optimisticPatch = buildOptimisticCapabilityPatch(device, intent)

    pendingDeviceIds.value = {
      ...pendingDeviceIds.value,
      [normalizedId]: true,
    }

    if (optimisticPatch) {
      applyLocalDevicePatch(normalizedId, optimisticPatch)
    }

    try {
      await controlDevice(payload)
      pendingDeviceIds.value = {
        ...pendingDeviceIds.value,
        [normalizedId]: false,
      }
      return true
    } catch (nextError) {
      devicesById.value = {
        ...devicesById.value,
        [normalizedId]: previous,
      }
      pendingDeviceIds.value = {
        ...pendingDeviceIds.value,
        [normalizedId]: false,
      }
      throw nextError
    }
  }

  function getDevice(deviceId) {
    return devicesById.value[Number(deviceId)] ?? null
  }

  function getRoom(roomId) {
    return roomsById.value[Number(roomId)] ?? null
  }

  return {
    rawScene,
    zone,
    roomsById,
    roomOrder,
    devicesById,
    deviceIdsByRoomId,
    stageModel,
    loading,
    error,
    isOffline,
    isStale,
    lastLoadedAt,
    lastPatchedAt,
    pendingDeviceIds,
    loadScene,
    connectRealtime,
    disconnectRealtime,
    controlDirectDevice,
    controlDeviceByIntent,
    getDevice,
    getRoom,
  }
})
