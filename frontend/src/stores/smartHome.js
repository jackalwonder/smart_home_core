import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { mergeDevicePatch, normalizeDeviceRead } from '../adapters/deviceAdapter'
import { normalizeRealtimeMessage } from '../adapters/realtimeAdapter'
import { normalizeRoomStateRead } from '../adapters/roomAdapter'
import { normalizeSpatialSceneRead } from '../adapters/spatialSceneAdapter'
import {
  countDisplayDevices,
  filterDisplayDevices,
  shouldDisplayDashboardRoom,
  shouldDisplaySpatialRoom,
} from '../utils/deviceGrouping'
import {
  DEV_SHOWCASE_ENABLED,
  applyDevShowcaseRooms,
  applyDevShowcaseScene,
  createDevShowcaseActivities,
  getDevShowcasePreferredRoomId,
  isDevShowcaseDeviceId,
  isDevShowcaseRoomId,
} from '../utils/devShowcase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const CACHE_KEYS = {
  rooms: 'smart-home-cache:rooms',
  spatialScene: 'smart-home-cache:spatial-scene',
  uiPreferences: 'smart-home-cache:ui-preferences',
}

function resolveApiUrl(path) {
  if (!API_BASE_URL) {
    return path
  }

  return new URL(path, API_BASE_URL).toString()
}

function resolveAssetUrl(path) {
  if (!path) {
    return ''
  }

  if (/^https?:\/\//.test(path)) {
    return path
  }

  if (!API_BASE_URL) {
    return path
  }

  return new URL(path, API_BASE_URL).toString()
}

function resolveWebSocketUrl(path = '/ws/devices') {
  if (API_BASE_URL) {
    // 跨域部署时允许显式指定 API 基地址，再推导出对应的 WebSocket 地址。
    const url = new URL(API_BASE_URL)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = path
    url.search = ''
    url.hash = ''
    return url.toString()
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

function sortRooms(rooms) {
  return [...rooms].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function sortSceneRooms(rooms) {
  return [...rooms].sort((left, right) => {
    const leftHasPlan = left.plan_x !== null && left.plan_x !== undefined && left.plan_y !== null && left.plan_y !== undefined
    const rightHasPlan = right.plan_x !== null && right.plan_x !== undefined && right.plan_y !== null && right.plan_y !== undefined

    if (leftHasPlan && rightHasPlan) {
      return (left.plan_y - right.plan_y) || (left.plan_x - right.plan_x) || left.name.localeCompare(right.name, 'zh-CN')
    }

    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

function sortDevices(devices) {
  return [...devices].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function hasValue(value) {
  return value !== null && value !== undefined
}

function decorateDeviceSource(device, { detail = false, scene = false } = {}) {
  const normalizedDevice = normalizeDeviceRead(device)
  const source = detail && scene
    ? 'merged'
    : detail
      ? 'detail'
      : 'scene'

  return {
    ...normalizedDevice,
    source,
    isDetailBacked: detail,
    isSceneBacked: scene,
  }
}

function normalizeRoom(room) {
  const normalizedRoom = normalizeRoomStateRead(room)
  return {
    ...normalizedRoom,
    devices: sortDevices(
      filterDisplayDevices(normalizedRoom.devices ?? [])
        .map((device) => decorateDeviceSource(device, { detail: true })),
    ),
  }
}

function normalizeSpatialRoom(room) {
  const normalizedRoom = normalizeRoomStateRead(room)
  return {
    ...normalizedRoom,
    devices: sortDevices(
      filterDisplayDevices(normalizedRoom.devices ?? [])
        .map((device) => decorateDeviceSource(device, { scene: true })),
    ),
  }
}

function normalizeDashboardRooms(rooms) {
  const sourceRooms = DEV_SHOWCASE_ENABLED ? applyDevShowcaseRooms(rooms ?? []) : (rooms ?? [])
  return sortRooms(sourceRooms.map(normalizeRoom).filter(shouldDisplayDashboardRoom))
}

function normalizeSpatialRooms(rooms) {
  const sourceRooms = DEV_SHOWCASE_ENABLED ? applyDevShowcaseRooms(rooms ?? []) : (rooms ?? [])
  return sortSceneRooms(sourceRooms.map(normalizeSpatialRoom).filter(shouldDisplaySpatialRoom))
}

function normalizeSpatialScene(scene) {
  const normalizedScene = normalizeSpatialSceneRead(scene ?? {})
  const sourceScene = DEV_SHOWCASE_ENABLED ? applyDevShowcaseScene(normalizedScene) : normalizedScene
  return {
    zone: sourceScene?.zone ?? null,
    analysis: sourceScene?.analysis ?? null,
    rooms: normalizeSpatialRooms(sourceScene?.rooms ?? []),
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function mergeRoomDevices(detailDevices = [], sceneDevices = []) {
  const sceneDevicesById = new Map(sceneDevices.map((device) => [device.id, device]))
  const detailDevicesById = new Map(detailDevices.map((device) => [device.id, device]))
  const mergedIds = new Set([...sceneDevicesById.keys(), ...detailDevicesById.keys()])

  return [...mergedIds].map((deviceId) => {
    const sceneDevice = sceneDevicesById.get(deviceId) ?? null
    const detailDevice = detailDevicesById.get(deviceId) ?? null

    if (!detailDevice) {
      return decorateDeviceSource(sceneDevice, { scene: true })
    }

    if (!sceneDevice) {
      return decorateDeviceSource(detailDevice, { detail: true })
    }

    const mergedDevice = {
      ...sceneDevice,
      ...detailDevice,
      plan_x: hasValue(sceneDevice.plan_x) ? sceneDevice.plan_x : detailDevice.plan_x,
      plan_y: hasValue(sceneDevice.plan_y) ? sceneDevice.plan_y : detailDevice.plan_y,
      plan_z: hasValue(sceneDevice.plan_z) ? sceneDevice.plan_z : detailDevice.plan_z,
      plan_rotation: hasValue(sceneDevice.plan_rotation) ? sceneDevice.plan_rotation : detailDevice.plan_rotation,
      position: sceneDevice.position ?? detailDevice.position ?? null,
      control_options: detailDevice.control_options ?? sceneDevice.control_options ?? [],
      hvac_modes: detailDevice.hvac_modes ?? sceneDevice.hvac_modes ?? [],
      media_source_options: detailDevice.media_source_options ?? sceneDevice.media_source_options ?? [],
    }

    return decorateDeviceSource(mergedDevice, { detail: true, scene: true })
  })
}

function mergeRoomContext(detailRoom, sceneRoom) {
  if (!detailRoom && !sceneRoom) {
    return null
  }

  if (!detailRoom) {
    return {
      ...sceneRoom,
      devices: sortDevices(sceneRoom.devices ?? []),
    }
  }

  if (!sceneRoom) {
    return {
      ...detailRoom,
      devices: sortDevices(detailRoom.devices ?? []),
    }
  }

  return {
    ...sceneRoom,
    ...detailRoom,
    id: detailRoom.id ?? sceneRoom.id,
    zone_id: detailRoom.zone_id ?? sceneRoom.zone_id ?? sceneRoom.zone?.id ?? detailRoom.zone?.id ?? null,
    name: detailRoom.name ?? sceneRoom.name,
    description: detailRoom.description ?? sceneRoom.description ?? '',
    zone: detailRoom.zone ?? sceneRoom.zone ?? null,
    ambient_temperature: hasValue(detailRoom.ambient_temperature) ? detailRoom.ambient_temperature : sceneRoom.ambient_temperature,
    ambient_humidity: hasValue(detailRoom.ambient_humidity) ? detailRoom.ambient_humidity : sceneRoom.ambient_humidity,
    occupancy_status: detailRoom.occupancy_status ?? sceneRoom.occupancy_status ?? null,
    active_device_count: detailRoom.active_device_count ?? sceneRoom.active_device_count ?? 0,
    plan_x: hasValue(sceneRoom.plan_x) ? sceneRoom.plan_x : detailRoom.plan_x,
    plan_y: hasValue(sceneRoom.plan_y) ? sceneRoom.plan_y : detailRoom.plan_y,
    plan_width: hasValue(sceneRoom.plan_width) ? sceneRoom.plan_width : detailRoom.plan_width,
    plan_height: hasValue(sceneRoom.plan_height) ? sceneRoom.plan_height : detailRoom.plan_height,
    plan_rotation: hasValue(sceneRoom.plan_rotation) ? sceneRoom.plan_rotation : detailRoom.plan_rotation,
    devices: sortDevices(mergeRoomDevices(detailRoom.devices ?? [], sceneRoom.devices ?? [])),
  }
}

function readCache(key, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch (error) {
    console.warn('读取本地缓存失败。', error)
    return fallback
  }
}

function writeCache(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn('写入本地缓存失败。', error)
  }
}

async function requestControlSession() {
  const apiKey = window.prompt('请输入控制口令后继续操作')
  if (!apiKey) {
    throw new Error('已取消控制解锁。')
  }

  const response = await fetch(resolveApiUrl('/api/auth/control-session'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ api_key: apiKey.trim() }),
  })

  if (!response.ok) {
    throw new Error('控制口令无效或已过期。')
  }

  return response.json()
}

async function fetchWithControlSession(path, options = {}) {
  let response = await fetch(resolveApiUrl(path), options)
  if (response.status !== 401 && response.status !== 403) {
    return response
  }

  await requestControlSession()
  response = await fetch(resolveApiUrl(path), options)
  return response
}

export const useSmartHomeStore = defineStore('smartHome', () => {
  const rooms = ref([])
  const spatialScene = ref({ zone: null, analysis: null, rooms: [] })
  const isLoading = ref(false)
  const spatialLoading = ref(false)
  const spatialBusy = ref(false)
  const error = ref('')
  const spatialError = ref('')
  const actionError = ref('')
  const connectionStatus = ref('idle')
  const lastMessageAt = ref('')
  const socket = ref(null)
  const reconnectTimer = ref(null)
  const reconnectAttempt = ref(0)
  const manualDisconnect = ref(false)
  const selectedRoomId = ref(null)
  const pendingDeviceIds = ref([])
  const spatialRefreshTimer = ref(null)
  const catalogRefreshTimer = ref(null)
  const catalogRefreshPromise = ref(null)
  const catalogRefreshQueued = ref(false)
  const actionFeedback = ref({ status: 'idle', message: '', deviceId: null, updatedAt: '' })
  const feedbackTimer = ref(null)
  const visualActivity = ref([])
  const devShowcaseSeeded = ref(false)
  const userSelectedRoom = ref(false)

  watch(rooms, (value) => {
    if (value.length > 0) {
      writeCache(CACHE_KEYS.rooms, value)
    }
  }, { deep: true })

  watch(spatialScene, (value) => {
    if (value?.rooms?.length > 0) {
      writeCache(CACHE_KEYS.spatialScene, value)
    }
  }, { deep: true })

  watch([selectedRoomId, userSelectedRoom], ([roomId, selectedByUser]) => {
    writeCache(CACHE_KEYS.uiPreferences, {
      selectedRoomId: roomId,
      userSelectedRoom: selectedByUser,
    })
  })

  const roomCount = computed(() => rooms.value.length)
  const deviceCount = computed(() => rooms.value.reduce((total, room) => total + countDisplayDevices(room.devices), 0))
  const selectedRoom = computed(() => {
    if (selectedRoomId.value === null || selectedRoomId.value === undefined) {
      return rooms.value[0] ?? null
    }

    return rooms.value.find((room) => room.id === selectedRoomId.value) ?? null
  })
  const selectedSceneRoom = computed(() => {
    if (selectedRoomId.value === null || selectedRoomId.value === undefined) {
      return spatialScene.value.rooms[0] ?? null
    }

    return spatialScene.value.rooms.find((room) => room.id === selectedRoomId.value) ?? null
  })
  const selectedMergedRoom = computed(() => {
    if (selectedRoomId.value === null || selectedRoomId.value === undefined) {
      return mergeRoomContext(rooms.value[0] ?? null, spatialScene.value.rooms[0] ?? null)
    }

    return findMergedRoomById(selectedRoomId.value)
  })
  const activeZoneId = computed(() => spatialScene.value.zone?.id ?? selectedRoom.value?.zone_id ?? selectedRoom.value?.zone?.id ?? null)

  function hasAvailableRoom(roomId) {
    return rooms.value.some((room) => room.id === roomId) || spatialScene.value.rooms.some((room) => room.id === roomId)
  }

  function findDetailRoomById(roomId) {
    if (roomId === null || roomId === undefined) {
      return null
    }

    return rooms.value.find((room) => room.id === roomId) ?? null
  }

  function findSceneRoomById(roomId) {
    if (roomId === null || roomId === undefined) {
      return null
    }

    return spatialScene.value.rooms.find((room) => room.id === roomId) ?? null
  }

  function findMergedRoomById(roomId) {
    if (roomId === null || roomId === undefined) {
      return null
    }

    return mergeRoomContext(findDetailRoomById(roomId), findSceneRoomById(roomId))
  }

  function ensureSelectedRoom() {
    const currentId = selectedRoomId.value
    if (currentId !== null && currentId !== undefined && hasAvailableRoom(currentId)) {
      return
    }

    const fallbackId = spatialScene.value.rooms[0]?.id ?? rooms.value[0]?.id ?? null
    if (fallbackId === currentId) {
      return
    }

    selectedRoomId.value = fallbackId
    userSelectedRoom.value = false
  }

  function setActionFeedback(status, message, deviceId = null) {
    actionFeedback.value = {
      status,
      message,
      deviceId,
      updatedAt: new Date().toISOString(),
    }

    if (feedbackTimer.value) {
      window.clearTimeout(feedbackTimer.value)
    }

    if (status !== 'pending') {
      feedbackTimer.value = window.setTimeout(() => {
        actionFeedback.value = { status: 'idle', message: '', deviceId: null, updatedAt: '' }
      }, 2400)
    }
  }

  function pruneVisualActivity() {
    const now = Date.now()
    visualActivity.value = visualActivity.value
      .filter((entry) => now - entry.timestamp < 6000)
      .slice(-48)
  }

  function recordVisualActivity(entry) {
    visualActivity.value = [
      ...visualActivity.value,
      {
        timestamp: Date.now(),
        ...entry,
      },
    ]
    pruneVisualActivity()
  }

  function seedDevShowcase(options = {}) {
    if (!DEV_SHOWCASE_ENABLED || devShowcaseSeeded.value) {
      return
    }

    if (selectedRoomId.value !== null && selectedRoomId.value !== undefined) {
      devShowcaseSeeded.value = true
      return
    }

    const preferredRoomId = getDevShowcasePreferredRoomId(spatialScene.value.rooms?.length ? spatialScene.value.rooms : rooms.value)
    if (preferredRoomId !== null && preferredRoomId !== undefined) {
      selectedRoomId.value = preferredRoomId
    }

    createDevShowcaseActivities(spatialScene.value.rooms?.length ? spatialScene.value.rooms : rooms.value)
      .forEach((entry) => {
        recordVisualActivity(entry)
      })

    if (options.fallbackConnection) {
      connectionStatus.value = 'connected'
      lastMessageAt.value = new Date().toISOString()
    }

    devShowcaseSeeded.value = true
  }

  function hydrateFromCache() {
    const cachedRooms = readCache(CACHE_KEYS.rooms, [])
    const cachedSpatialScene = readCache(CACHE_KEYS.spatialScene, null)
    const cachedUiPreferences = readCache(CACHE_KEYS.uiPreferences, {})

    if (Array.isArray(cachedRooms) && cachedRooms.length > 0) {
      rooms.value = normalizeDashboardRooms(cachedRooms)
    }

    if (cachedSpatialScene?.rooms?.length) {
      spatialScene.value = normalizeSpatialScene(cachedSpatialScene)
    }

    if (cachedUiPreferences?.selectedRoomId !== undefined && cachedUiPreferences?.selectedRoomId !== null) {
      selectedRoomId.value = cachedUiPreferences.selectedRoomId
      userSelectedRoom.value = Boolean(cachedUiPreferences.userSelectedRoom)
    }

    ensureSelectedRoom()
  }

  async function fetchInitialState() {
    isLoading.value = true
    error.value = ''

    try {
      const authenticatedResponse = await fetch(resolveApiUrl('/api/rooms'), {
        headers: {},
      })
      if (!authenticatedResponse.ok) {
        throw new Error(`获取房间列表失败：${authenticatedResponse.status}`)
      }

      const payload = await authenticatedResponse.json()
      rooms.value = normalizeDashboardRooms(payload)
      ensureSelectedRoom()
    } catch (fetchError) {
      error.value = fetchError instanceof Error ? fetchError.message : '获取智能家居数据失败。'
      throw fetchError
    } finally {
      isLoading.value = false
    }
  }

  async function fetchSpatialScene(zoneId = activeZoneId.value, options = {}) {
    const { silent = false } = options

    if (!silent) {
      spatialLoading.value = true
    }
    spatialError.value = ''

    try {
      const search = zoneId ? `?zone_id=${encodeURIComponent(zoneId)}` : ''
      const response = await fetch(resolveApiUrl(`/api/spatial/scene${search}`), {
        headers: {},
      })

      if (!response.ok) {
        throw new Error(`获取空间场景失败：${response.status}`)
      }

      spatialScene.value = normalizeSpatialScene(await response.json())
      ensureSelectedRoom()
      return spatialScene.value
    } catch (fetchError) {
      spatialError.value = fetchError instanceof Error ? fetchError.message : '获取空间场景失败。'
      throw fetchError
    } finally {
      if (!silent) {
        spatialLoading.value = false
      }
    }
  }

  async function fetchRoomDevices(roomId) {
    if (DEV_SHOWCASE_ENABLED && isDevShowcaseRoomId(roomId)) {
      return
    }

    try {
      const response = await fetch(resolveApiUrl(`/api/devices/${roomId}`), {
        headers: {},
      })
      if (!response.ok) {
        throw new Error(`获取房间设备失败：${response.status}`)
      }

      const devicesPayload = await response.json()
      const devices = Array.isArray(devicesPayload)
        ? devicesPayload.map((device) => normalizeDeviceRead(device))
        : []
      rooms.value = normalizeDashboardRooms(rooms.value.map((room) => {
        if (room.id !== roomId) {
          return room
        }

        return { ...room, devices }
      }))
      ensureSelectedRoom()
    } catch (fetchError) {
      actionError.value = fetchError instanceof Error ? fetchError.message : '刷新房间设备失败。'
      throw fetchError
    }
  }

  function connectRealtime() {
    if (socket.value && socket.value.readyState <= WebSocket.OPEN) {
      return
    }

    manualDisconnect.value = false
    connectionStatus.value = reconnectAttempt.value > 0 ? 'reconnecting' : 'connecting'
    const shouldRefreshAfterOpen = reconnectAttempt.value > 0

    const ws = new WebSocket(resolveWebSocketUrl())
    socket.value = ws

    ws.addEventListener('open', () => {
      reconnectTimer.value = null
      connectionStatus.value = 'connected'
      reconnectAttempt.value = 0

      // 仅在重连成功后补拉一次，弥补断线期间可能漏掉的 patch。
      if (shouldRefreshAfterOpen) {
        scheduleCatalogRefresh(60)
      }
    })

    ws.addEventListener('message', (event) => {
      lastMessageAt.value = new Date().toISOString()

      try {
        const payload = normalizeRealtimeMessage(JSON.parse(event.data))
        handleRealtimeMessage(payload)
      } catch (parseError) {
        console.error('解析实时消息失败。', parseError)
      }
    })

    ws.addEventListener('close', () => {
      socket.value = null
      if (manualDisconnect.value) {
        connectionStatus.value = 'idle'
        return
      }

      connectionStatus.value = 'disconnected'
      scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      connectionStatus.value = 'error'
    })
  }

  function scheduleReconnect() {
    if (reconnectTimer.value) {
      window.clearTimeout(reconnectTimer.value)
    }

    reconnectAttempt.value += 1
    const delay = Math.min(1000 * 2 ** reconnectAttempt.value, 15000)
    reconnectTimer.value = window.setTimeout(() => {
      connectRealtime()
    }, delay)
  }

  function disconnectRealtime() {
    manualDisconnect.value = true

    if (reconnectTimer.value) {
      window.clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
    }

    if (spatialRefreshTimer.value) {
      window.clearTimeout(spatialRefreshTimer.value)
      spatialRefreshTimer.value = null
    }

    if (catalogRefreshTimer.value) {
      window.clearTimeout(catalogRefreshTimer.value)
      catalogRefreshTimer.value = null
    }

    catalogRefreshQueued.value = false

    if (feedbackTimer.value) {
      window.clearTimeout(feedbackTimer.value)
      feedbackTimer.value = null
    }

    if (socket.value) {
      socket.value.close()
      socket.value = null
    }
  }

  function scheduleSpatialRefresh(delay = 240) {
    if (spatialRefreshTimer.value) {
      window.clearTimeout(spatialRefreshTimer.value)
    }

    spatialRefreshTimer.value = window.setTimeout(() => {
      fetchSpatialScene(activeZoneId.value, { silent: true }).catch(() => {})
    }, delay)
  }

  function runCatalogRefresh() {
    if (catalogRefreshPromise.value) {
      catalogRefreshQueued.value = true
      return catalogRefreshPromise.value
    }

    const refreshPromise = (async () => {
      await Promise.allSettled([fetchInitialState()])
      await Promise.allSettled([fetchSpatialScene(activeZoneId.value, { silent: true })])
    })()

    catalogRefreshPromise.value = refreshPromise.finally(() => {
      catalogRefreshPromise.value = null

      if (catalogRefreshQueued.value) {
        catalogRefreshQueued.value = false
        scheduleCatalogRefresh(180)
      }
    })

    return catalogRefreshPromise.value
  }

  function scheduleCatalogRefresh(delay = 180) {
    if (catalogRefreshPromise.value) {
      catalogRefreshQueued.value = true
      return catalogRefreshPromise.value
    }

    if (catalogRefreshTimer.value) {
      window.clearTimeout(catalogRefreshTimer.value)
    }

    catalogRefreshTimer.value = window.setTimeout(() => {
      catalogRefreshTimer.value = null
      runCatalogRefresh().catch(() => {})
    }, delay)

    return null
  }

  function findDeviceRoomsById(deviceId) {
    if (deviceId === null || deviceId === undefined) {
      return { detailRoom: null, sceneRoom: null }
    }

    return {
      detailRoom: rooms.value.find((room) => room.devices.some((device) => device.id === deviceId)) ?? null,
      sceneRoom: spatialScene.value.rooms.find((room) => room.devices.some((device) => device.id === deviceId)) ?? null,
    }
  }

  function prepareRealtimeDevicePatch(devicePatch) {
    const { detailRoom, sceneRoom } = findDeviceRoomsById(devicePatch.id)
    const previousRoomId = detailRoom?.id ?? sceneRoom?.id ?? null
    const resolvedDevicePatch = (!hasValue(devicePatch.room_id) && hasValue(previousRoomId))
      ? { ...devicePatch, room_id: previousRoomId }
      : devicePatch

    const movedToUnknownDetailRoom = (
      hasValue(resolvedDevicePatch.room_id)
      && hasValue(previousRoomId)
      && resolvedDevicePatch.room_id !== previousRoomId
      && !rooms.value.some((room) => room.id === resolvedDevicePatch.room_id)
    )

    return {
      devicePatch: resolvedDevicePatch,
      movedToUnknownDetailRoom,
    }
  }

  function handleRealtimeMessage(message) {
    if (message.type === 'connection_established' || message.type === 'pong') {
      return
    }

    if (message.type === 'catalog_updated') {
      // 目录结构变化时同时刷新主面板与空间图，避免前端手动推导布局。
      scheduleCatalogRefresh()
      return
    }

    if (message.type === 'device_state_updated' && message.devicePatch) {
      const realtimeUpdate = prepareRealtimeDevicePatch(message.devicePatch)
      const devicePatch = realtimeUpdate.devicePatch

      recordVisualActivity({
        deviceId: devicePatch.id,
        roomId: devicePatch.room_id,
        domain: devicePatch.entity_domain ?? devicePatch.type ?? 'generic',
        status: 'realtime',
        source: 'realtime',
      })
      upsertDevice(devicePatch)
      upsertSpatialDevice(devicePatch)

      if (realtimeUpdate.movedToUnknownDetailRoom) {
        scheduleCatalogRefresh(60)
      } else {
        scheduleSpatialRefresh()
      }
    }
  }

  function upsertDevice(updatedDevice) {
    let matchedRoom = false

    rooms.value = normalizeDashboardRooms(rooms.value.map((room) => {
      const deviceIndex = room.devices.findIndex((device) => device.id === updatedDevice.id)
      const belongsToRoom = room.id === updatedDevice.room_id

      if (deviceIndex === -1 && !belongsToRoom) {
        return room
      }

      matchedRoom = true
      const nextDevices = [...room.devices]

      if (deviceIndex >= 0 && belongsToRoom) {
        nextDevices.splice(deviceIndex, 1, mergeDevicePatch(nextDevices[deviceIndex], updatedDevice))
      } else if (deviceIndex >= 0) {
        nextDevices.splice(deviceIndex, 1)
      } else {
        nextDevices.push(normalizeDeviceRead(updatedDevice))
      }

      return { ...room, devices: nextDevices }
    }))
    ensureSelectedRoom()

    if (!matchedRoom) {
      fetchInitialState().catch(() => {})
    }
  }

  function upsertSpatialDevice(updatedDevice) {
    let matchedRoom = false

    spatialScene.value = normalizeSpatialScene({
      ...spatialScene.value,
      rooms: spatialScene.value.rooms.map((room) => {
        const deviceIndex = room.devices.findIndex((device) => device.id === updatedDevice.id)
        const belongsToRoom = room.id === updatedDevice.room_id

        if (deviceIndex === -1 && !belongsToRoom) {
          return room
        }

        matchedRoom = true
        const nextDevices = [...room.devices]

        if (deviceIndex >= 0 && belongsToRoom) {
          nextDevices.splice(deviceIndex, 1, mergeDevicePatch(nextDevices[deviceIndex], updatedDevice))
        } else if (deviceIndex >= 0) {
          nextDevices.splice(deviceIndex, 1)
        } else {
          nextDevices.push(normalizeDeviceRead(updatedDevice))
        }

        return { ...room, devices: nextDevices }
      }),
    })

    if (!matchedRoom) {
      scheduleSpatialRefresh(60)
    }
  }

  function setSelectedRoom(roomId, options = {}) {
    const source = options.source ?? 'user'
    selectedRoomId.value = roomId
    if (source === 'user') {
      userSelectedRoom.value = true
    }

    const nextRoom = rooms.value.find((room) => room.id === roomId)
      ?? spatialScene.value.rooms.find((room) => room.id === roomId)
      ?? null
    const zoneId = nextRoom?.zone_id ?? nextRoom?.zone?.id ?? null
    if (zoneId && zoneId !== spatialScene.value.zone?.id) {
      fetchSpatialScene(zoneId, { silent: true }).catch(() => {})
    }
  }

  function isDevicePending(deviceId) {
    return pendingDeviceIds.value.includes(deviceId)
  }

  function findMergedDeviceInRoom(roomId, deviceId) {
    if ((roomId === null || roomId === undefined) || (deviceId === null || deviceId === undefined)) {
      return null
    }

    const mergedRoom = findMergedRoomById(roomId)
    return mergedRoom?.devices.find((device) => device.id === deviceId) ?? null
  }

  function findMergedDeviceById(deviceId) {
    if (deviceId === null || deviceId === undefined) {
      return null
    }

    const detailRoom = rooms.value.find((room) => room.devices.some((device) => device.id === deviceId)) ?? null
    const sceneRoom = spatialScene.value.rooms.find((room) => room.devices.some((device) => device.id === deviceId)) ?? null
    const roomId = detailRoom?.id ?? sceneRoom?.id ?? null

    if (roomId !== null && roomId !== undefined) {
      return findMergedDeviceInRoom(roomId, deviceId)
    }

    return null
  }

  function findDevice(deviceId) {
    return findMergedDeviceById(deviceId)
  }

  function snapshotDevice(deviceId) {
    const device = findDevice(deviceId)
    return device ? { ...device } : null
  }

  function restoreDeviceSnapshot(snapshot) {
    if (!snapshot) {
      return
    }

    rooms.value = normalizeDashboardRooms(rooms.value.map((room) => ({
      ...room,
      devices: room.devices.map((device) => (device.id === snapshot.id ? { ...device, ...snapshot } : device)),
    })))
    ensureSelectedRoom()
  }

  function markPending(deviceId) {
    pendingDeviceIds.value = [...pendingDeviceIds.value, deviceId]
  }

  function unmarkPending(deviceId) {
    pendingDeviceIds.value = pendingDeviceIds.value.filter((pendingId) => pendingId !== deviceId)
  }

  function updateDeviceCollections(deviceId, updater) {
    let nextDevice = null

    rooms.value = normalizeDashboardRooms(rooms.value.map((room) => ({
      ...room,
      devices: room.devices.map((device) => {
        if (device.id !== deviceId) {
          return device
        }

        nextDevice = updater({ ...device })
        return nextDevice
      }),
    })))
    ensureSelectedRoom()

    spatialScene.value = normalizeSpatialScene({
      ...spatialScene.value,
      rooms: spatialScene.value.rooms.map((room) => ({
        ...room,
        devices: room.devices.map((device) => {
          if (device.id !== deviceId) {
            return device
          }

          return nextDevice ? { ...device, ...nextDevice } : device
        }),
      })),
    })

    return nextDevice
  }

  function applyMockDeviceControlLocally(deviceId, payload) {
    return updateDeviceCollections(deviceId, (device) => {
      const domain = `${device.entity_domain ?? device.type ?? ''}`.trim().toLowerCase()
      const currentState = `${device.raw_state ?? device.current_status ?? ''}`.trim().toLowerCase()
      const next = {
        ...device,
        online: true,
      }

      if (payload.control_kind === 'toggle') {
        if (domain === 'climate') {
          const nextState = currentState === 'off' ? 'cool' : 'off'
          next.current_status = nextState
          next.raw_state = nextState
          next.state = nextState
          next.hvac_mode = nextState
          next.fan_mode = nextState === 'off' ? 'low' : (next.fan_mode ?? 'medium')
          return next
        }

        if (domain === 'cover' || domain === 'curtain') {
          const isOpen = currentState === 'open' || currentState === 'opening' || Number(device.number_value) > 50
          const nextState = isOpen ? 'closed' : 'open'
          next.current_status = nextState
          next.raw_state = nextState
          next.state = nextState
          next.number_value = isOpen ? 12 : 78
          return next
        }

        const nextState = currentState === 'on' ? 'off' : 'on'
        next.current_status = nextState
        next.raw_state = nextState
        next.state = nextState

        if (domain === 'light') {
          next.brightness_value = nextState === 'on' ? Math.max(Number(next.brightness_value) || 0, 62) : 0
        }

        if (domain === 'fan') {
          next.fan_mode = nextState === 'on' ? (next.fan_mode ?? 'low') : next.fan_mode
        }

        return next
      }

      if (payload.control_kind === 'number') {
        if (domain === 'climate') {
          next.target_temperature = Number(payload.value)
        } else {
          next.number_value = Number(payload.value)
        }
        return next
      }

      if (payload.control_kind === 'select') {
        const nextOption = `${payload.option ?? ''}`.trim()
        if (domain === 'climate') {
          next.hvac_mode = nextOption
          next.current_status = nextOption
          next.raw_state = nextOption
          next.state = nextOption
        } else if (domain === 'fan') {
          next.fan_mode = nextOption
          next.current_status = 'on'
          next.raw_state = 'on'
          next.state = 'on'
        } else {
          next.raw_state = nextOption
          next.state = nextOption
        }
        return next
      }

      if (payload.control_kind === 'brightness') {
        const nextValue = Number(payload.value)
        next.brightness_value = nextValue
        next.current_status = nextValue > 0 ? 'on' : 'off'
        next.raw_state = next.current_status
        next.state = next.current_status
        return next
      }

      if (payload.control_kind === 'color_temperature') {
        next.color_temperature = Number(payload.value)
        return next
      }

      return next
    })
  }

  async function runDeviceControl(deviceId, payload, optimisticUpdate) {
    const device = findDevice(deviceId)
    if (!device) {
      throw new Error(`未找到设备 ${deviceId}。`)
    }

    if (isDevicePending(deviceId)) {
      return
    }

    actionError.value = ''
    markPending(deviceId)
    recordVisualActivity({
      deviceId,
      roomId: device.room_id,
      domain: device.entity_domain ?? device.type ?? 'generic',
      status: 'pending',
      source: 'control',
    })
    setActionFeedback('pending', '指令发送中…', deviceId)
    // 只在需要乐观更新时记录快照，失败后再回滚，避免无意义的数据复制。
    const previousSnapshot = typeof optimisticUpdate === 'function' ? snapshotDevice(deviceId) : null

    try {
      if (DEV_SHOWCASE_ENABLED && isDevShowcaseDeviceId(deviceId)) {
        await wait(240)
        applyMockDeviceControlLocally(deviceId, payload)
        recordVisualActivity({
          deviceId,
          roomId: device.room_id,
          domain: device.entity_domain ?? device.type ?? 'generic',
          status: 'success',
          source: 'dev-showcase',
        })
        setActionFeedback('success', `${device.name ?? '设备'} 已应用开发态默认场景`, deviceId)
        return { ok: true, mock: true }
      }

      if (typeof optimisticUpdate === 'function') {
        optimisticUpdate(device)
      }

      const response = await fetchWithControlSession('/api/device/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceId,
          ...payload,
        }),
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(`设备控制失败：${response.status}${responseText ? ` ${responseText}` : ''}`)
      }

      await wait(450)
      await Promise.all([
        fetchRoomDevices(device.room_id),
        fetchSpatialScene(activeZoneId.value, { silent: true }).catch(() => {}),
      ])
      recordVisualActivity({
        deviceId,
        roomId: device.room_id,
        domain: device.entity_domain ?? device.type ?? 'generic',
        status: 'success',
        source: 'control',
      })
      setActionFeedback('success', `${device.name ?? '设备'} 已同步`, deviceId)
      return await response.json()
    } catch (controlError) {
      restoreDeviceSnapshot(previousSnapshot)
      actionError.value = controlError instanceof Error ? controlError.message : '发送设备控制指令失败。'
      recordVisualActivity({
        deviceId,
        roomId: device.room_id,
        domain: device.entity_domain ?? device.type ?? 'generic',
        status: 'error',
        source: 'control',
      })
      setActionFeedback('error', actionError.value, deviceId)
      throw controlError
    } finally {
      unmarkPending(deviceId)
    }
  }

  async function toggleDevice(deviceId) {
    return runDeviceControl(
      deviceId,
      { control_kind: 'toggle', action: 'toggle' },
      () => {
        applyDeviceActionLocally(deviceId, 'toggle')
      },
    )
  }

  async function setDeviceNumber(deviceId, value) {
    return runDeviceControl(deviceId, { control_kind: 'number', value })
  }

  async function selectDeviceOption(deviceId, option) {
    return runDeviceControl(deviceId, { control_kind: 'select', option })
  }

  async function pressDeviceButton(deviceId) {
    return runDeviceControl(deviceId, { control_kind: 'button' })
  }

  async function setDeviceBrightness(deviceId, value) {
    return runDeviceControl(deviceId, { control_kind: 'brightness', value })
  }

  async function setDeviceColorTemperature(deviceId, value) {
    return runDeviceControl(deviceId, { control_kind: 'color_temperature', value })
  }

  function applyDeviceActionLocally(deviceId, action) {
    const nextStatusByCurrentStatus = {
      on: 'off',
      off: 'on',
      online: 'offline',
      offline: 'online',
    }

    rooms.value = normalizeDashboardRooms(rooms.value.map((room) => ({
      ...room,
      devices: room.devices.map((device) => {
        if (device.id !== deviceId) {
          return device
        }

        const nextStatus =
          action === 'toggle'
            ? nextStatusByCurrentStatus[device.current_status] ?? 'on'
            : action === 'on'
              ? 'on'
              : 'off'

        return {
          ...device,
          current_status: nextStatus,
          raw_state: nextStatus,
        }
      }),
    })))
    ensureSelectedRoom()
  }

  async function uploadFloorPlan({ zoneId, imageWidth, imageHeight, file, preserveExisting = true }) {
    spatialBusy.value = true
    spatialError.value = ''

    try {
      const formData = new FormData()
      formData.set('zone_id', String(zoneId))
      formData.set('image_width', String(imageWidth))
      formData.set('image_height', String(imageHeight))
      formData.set('preserve_existing', String(preserveExisting))
      formData.set('file', file)

      const response = await fetchWithControlSession('/api/spatial/floorplan', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(`上传户型图失败：${response.status}${responseText ? ` ${responseText}` : ''}`)
      }

      const payload = await response.json()
      await fetchSpatialScene(zoneId)
      return payload
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '上传户型图失败。'
      throw requestError
    } finally {
      spatialBusy.value = false
    }
  }

  async function autoLayoutSpatialScene(zoneId, preserveExisting = true) {
    spatialBusy.value = true
    spatialError.value = ''

    try {
      const response = await fetchWithControlSession('/api/spatial/auto-layout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zone_id: zoneId,
          preserve_existing: preserveExisting,
        }),
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(`自动布局失败：${response.status}${responseText ? ` ${responseText}` : ''}`)
      }

      const payload = await response.json()
      await fetchSpatialScene(zoneId)
      return payload
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '自动布局失败。'
      throw requestError
    } finally {
      spatialBusy.value = false
    }
  }

  async function uploadSceneModel({ zoneId, file, modelScale = 1 }) {
    spatialBusy.value = true
    spatialError.value = ''

    try {
      const formData = new FormData()
      formData.set('zone_id', String(zoneId))
      formData.set('model_scale', String(modelScale))
      formData.set('file', file)

      const response = await fetchWithControlSession('/api/spatial/model', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(`上传 3D 模型失败：${response.status}${responseText ? ` ${responseText}` : ''}`)
      }

      const payload = await response.json()
      await fetchSpatialScene(zoneId)
      return payload
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '上传 3D 模型失败。'
      throw requestError
    } finally {
      spatialBusy.value = false
    }
  }

  async function updateRoomSpatialLayout(roomId, payload) {
    spatialBusy.value = true
    spatialError.value = ''

    try {
      const response = await fetchWithControlSession(`/api/spatial/rooms/${roomId}/layout`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(`保存房间布局失败：${response.status}${responseText ? ` ${responseText}` : ''}`)
      }

      const updatedRoom = await response.json()
      spatialScene.value = normalizeSpatialScene({
        ...spatialScene.value,
        rooms: spatialScene.value.rooms.map((room) => (room.id === roomId ? { ...room, ...updatedRoom } : room)),
      })
      return updatedRoom
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '保存房间布局失败。'
      throw requestError
    } finally {
      spatialBusy.value = false
    }
  }

  async function updateDevicePlacement(deviceId, payload) {
    spatialBusy.value = true
    spatialError.value = ''

    try {
      const response = await fetchWithControlSession(`/api/spatial/devices/${deviceId}/placement`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(`保存设备点位失败：${response.status}${responseText ? ` ${responseText}` : ''}`)
      }

      const updatedDevice = await response.json()
      spatialScene.value = normalizeSpatialScene({
        ...spatialScene.value,
        rooms: spatialScene.value.rooms.map((room) => ({
          ...room,
          devices: room.devices.map((device) => (device.id === deviceId ? { ...device, ...updatedDevice } : device)),
        })),
      })
      return updatedDevice
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '保存设备点位失败。'
      throw requestError
    } finally {
      spatialBusy.value = false
    }
  }

  async function createManualDevice(payload) {
    spatialBusy.value = true
    spatialError.value = ''

    try {
      const response = await fetchWithControlSession('/api/spatial/devices/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(`新增设备失败：${response.status}${responseText ? ` ${responseText}` : ''}`)
      }

      const createdDevice = await response.json()
      await Promise.all([
        fetchInitialState(),
        fetchSpatialScene(activeZoneId.value, { silent: true }),
      ])
      return createdDevice
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '新增设备失败。'
      throw requestError
    } finally {
      spatialBusy.value = false
    }
  }

  async function initialize() {
    hydrateFromCache()
    let initialStateReady = false

    try {
      await fetchInitialState()
      initialStateReady = true
    } catch (fetchError) {
      if (!DEV_SHOWCASE_ENABLED) {
        throw fetchError
      }

      rooms.value = normalizeDashboardRooms([])
      error.value = ''
    }

    try {
      await fetchSpatialScene(selectedRoom.value?.zone_id ?? null, { silent: false })
    } catch (fetchError) {
      if (!DEV_SHOWCASE_ENABLED) {
        throw fetchError
      }

      spatialScene.value = normalizeSpatialScene({ zone: null, analysis: null, rooms: [] })
      spatialError.value = ''
    }

    if (DEV_SHOWCASE_ENABLED) {
      seedDevShowcase({ fallbackConnection: !initialStateReady })
    }

    if (initialStateReady) {
      connectRealtime()
    }
  }

  return {
    rooms,
    spatialScene,
    isLoading,
    spatialLoading,
    spatialBusy,
    error,
    spatialError,
    actionError,
    connectionStatus,
    lastMessageAt,
    selectedRoomId,
    pendingDeviceIds,
    actionFeedback,
    visualActivity,
    roomCount,
    deviceCount,
    selectedRoom,
    selectedSceneRoom,
    selectedMergedRoom,
    findMergedRoomById,
    findMergedDeviceInRoom,
    findMergedDeviceById,
    resolveAssetUrl,
    fetchInitialState,
    fetchSpatialScene,
    fetchRoomDevices,
    connectRealtime,
    disconnectRealtime,
    setSelectedRoom,
    isDevicePending,
    toggleDevice,
    setDeviceNumber,
    selectDeviceOption,
    pressDeviceButton,
    setDeviceBrightness,
    setDeviceColorTemperature,
    uploadFloorPlan,
    uploadSceneModel,
    autoLayoutSpatialScene,
    updateRoomSpatialLayout,
    updateDevicePlacement,
    createManualDevice,
    initialize,
  }
})
