import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import {
  extractSceneDeviceLayout,
  mergeDevicePatch,
  normalizeDeviceEntity,
  normalizeDevicePatchV2,
  normalizeDeviceRead,
} from '../adapters/deviceAdapter'
import { normalizeRealtimeMessage } from '../adapters/realtimeAdapter'
import {
  extractRoomSceneLayout,
  normalizeRoomEntity,
  normalizeRoomStateRead,
} from '../adapters/roomAdapter'
import { normalizeSceneMeta, normalizeSpatialSceneRead } from '../adapters/spatialSceneAdapter'
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
import { useNotificationStore } from './notification'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const CACHE_KEYS = {
  catalogEntities: 'smart-home-cache:catalog-entities',
  sceneEntities: 'smart-home-cache:scene-entities',
  uiPreferences: 'smart-home-cache:ui-preferences',
}
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30000

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
    // 跨域部署时允许显式指定 API 基地址，再推导对应的 WebSocket 地址。
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

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function setRecordValue(source, key, value) {
  return {
    ...source,
    [key]: value,
  }
}

function withCredentials(options = {}) {
  return {
    ...options,
    credentials: options.credentials ?? 'include',
  }
}

function hasRoomSceneLayout(layout = {}) {
  return ['plan_x', 'plan_y', 'plan_width', 'plan_height', 'plan_rotation'].some((field) => hasValue(layout?.[field]))
}

function hasDeviceSceneLayout(layout = {}) {
  return ['plan_x', 'plan_y', 'plan_z', 'plan_rotation'].some((field) => hasValue(layout?.[field]))
    || hasValue(layout?.position)
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
    console.warn('Failed to write local cache.', error)
  }
}

function removeCache(key) {
  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.warn('Failed to remove local cache.', error)
  }
}

export const useSmartHomeStore = defineStore('smartHome', () => {
  const notificationStore = useNotificationStore()
  const roomsById = ref({})
  const devicesById = ref({})
  const roomDeviceIdsByRoomId = ref({})
  const sceneMeta = ref({ zone: null, analysis: null })
  const sceneLayoutByRoomId = ref({})
  const sceneDeviceLayoutByDeviceId = ref({})
  const isLoading = ref(false)
  const spatialLoading = ref(false)
  const spatialBusy = ref(false)
  const error = ref('')
  const spatialError = ref('')
  const actionError = ref('')
  const connectionStatus = ref('idle')
  const wsConnected = ref(false)
  const reconnectDelayMs = ref(0)
  const lastMessageAt = ref('')
  const socket = ref(null)
  const reconnectTimer = ref(null)
  const reconnectAttempt = ref(0)
  const manualDisconnect = ref(false)
  const selectedRoomId = ref(null)
  const pendingDeviceIds = ref([])
  const spatialRefreshTimer = ref(null)
  const detailRefreshTimer = ref(null)
  const detailRefreshPromise = ref(null)
  const detailRefreshQueued = ref(false)
  const catalogRefreshTimer = ref(null)
  const catalogRefreshPromise = ref(null)
  const catalogRefreshQueued = ref(false)
  const lastRealtimeSeq = ref(null)
  const actionFeedback = ref({ status: 'idle', message: '', deviceId: null, updatedAt: '' })
  const feedbackTimer = ref(null)
  const visualActivity = ref([])
  const devShowcaseSeeded = ref(false)
  const userSelectedRoom = ref(false)
  const isOffline = computed(() => ['disconnected', 'reconnecting', 'error'].includes(connectionStatus.value))
  const realtimePatchQueue = new Map()
  let realtimeFlushTimer = null

  function pushNotification(type, message, duration = 3200) {
    notificationStore.pushToast({
      type,
      message,
      duration,
    })
  }

  function buildRequestFailureMessage(actionLabel, error, fallbackStatus = null) {
    if (error instanceof TypeError) {
      return `${actionLabel}失败：网络不可用`
    }

    if (error instanceof Error && error.message) {
      return error.message
    }

    if (fallbackStatus !== null && fallbackStatus !== undefined) {
      if (fallbackStatus >= 500) {
        return `${actionLabel}失败：服务暂时不可用`
      }
      if (fallbackStatus === 404) {
        return `${actionLabel}失败：资源不存在`
      }
      if (fallbackStatus === 403) {
        return `${actionLabel}失败：权限不足`
      }
      if (fallbackStatus === 401) {
        return `${actionLabel}失败：需要重新认证`
      }
      return `${actionLabel}失败：请求被拒绝 (${fallbackStatus})`
    }

    return `${actionLabel}失败，请稍后重试`
  }
  function notifyRequestFailure(error, actionLabel, fallbackStatus = null) {
    pushNotification('error', buildRequestFailureMessage(actionLabel, error, fallbackStatus), 4200)
  }

  async function createHttpError(response, actionLabel) {
    let detail = ''

    try {
      detail = (await response.text()).trim()
    } catch {
      detail = ''
    }

    const baseMessage = buildRequestFailureMessage(actionLabel, null, response.status)
    return new Error(detail ? `${baseMessage} - ${detail}` : baseMessage)
  }

  async function requestControlSession() {
    const apiKey = window.prompt('请输入控制口令后继续操作')
    if (!apiKey) {
      throw new Error('已取消控制解锁。')
    }

    const response = await fetch(resolveApiUrl('/api/auth/control-session'), withCredentials({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ api_key: apiKey.trim() }),
    }))

    if (!response.ok) {
      throw await createHttpError(response, '鎺у埗浼氳瘽鏍￠獙')
    }

    return response.json()
  }

  async function fetchWithControlSession(path, options = {}, actionLabel = '璇锋眰') {
    let response = await fetch(resolveApiUrl(path), withCredentials(options))
    if (response.status !== 401 && response.status !== 403) {
      return response
    }

    await requestControlSession()
    response = await fetch(resolveApiUrl(path), withCredentials(options))

    if (!response.ok && response.status !== 401 && response.status !== 403) {
      throw await createHttpError(response, actionLabel)
    }

    return response
  }

  function buildCatalogEntityCache() {
    return {
      roomsById: roomsById.value,
      devicesById: devicesById.value,
      roomDeviceIdsByRoomId: roomDeviceIdsByRoomId.value,
    }
  }

  function buildSceneEntityCache() {
    return {
      sceneMeta: sceneMeta.value,
      sceneLayoutByRoomId: sceneLayoutByRoomId.value,
      sceneDeviceLayoutByDeviceId: sceneDeviceLayoutByDeviceId.value,
    }
  }

  function hasCatalogEntityCache(cache) {
    return Object.keys(cache?.roomsById ?? {}).length > 0 || Object.keys(cache?.devicesById ?? {}).length > 0
  }

  function hasSceneEntityCache(cache) {
    return Boolean(cache?.sceneMeta?.zone || cache?.sceneMeta?.analysis)
      || Object.keys(cache?.sceneLayoutByRoomId ?? {}).length > 0
      || Object.keys(cache?.sceneDeviceLayoutByDeviceId ?? {}).length > 0
  }

  function setRoomEntity(rawRoom) {
    if (!hasValue(rawRoom?.id)) {
      return null
    }

    const roomId = rawRoom.id
    const nextRoom = normalizeRoomEntity({
      ...(roomsById.value[roomId] ?? {}),
      ...rawRoom,
    })
    roomsById.value = setRecordValue(roomsById.value, roomId, nextRoom)
    return nextRoom
  }

  function setSceneRoomLayout(roomId, rawRoom) {
    if (!hasValue(roomId)) {
      return null
    }

    const nextLayout = extractRoomSceneLayout(rawRoom)
    sceneLayoutByRoomId.value = setRecordValue(sceneLayoutByRoomId.value, roomId, nextLayout)
    return nextLayout
  }

  function setSceneDeviceLayout(deviceId, rawDevice) {
    if (!hasValue(deviceId)) {
      return null
    }

    const nextLayout = extractSceneDeviceLayout(rawDevice)
    sceneDeviceLayoutByDeviceId.value = setRecordValue(sceneDeviceLayoutByDeviceId.value, deviceId, nextLayout)
    return nextLayout
  }

  function setRoomDeviceIds(roomId, rawDevices = []) {
    if (!hasValue(roomId)) {
      return []
    }

    const nextDeviceIds = rawDevices
      .map((device) => normalizeDeviceEntity(device))
      .map((device) => device.id)
      .filter(hasValue)
    const nextDeviceIdSet = new Set(nextDeviceIds.map((deviceId) => `${deviceId}`))
    const targetRoomKey = `${roomId}`
    const nextCollections = Object.entries(roomDeviceIdsByRoomId.value).reduce((result, [currentRoomId, deviceIds]) => ({
      ...result,
      [currentRoomId]: Array.isArray(deviceIds)
        ? deviceIds.filter((deviceId) => `${currentRoomId}` === targetRoomKey || !nextDeviceIdSet.has(`${deviceId}`))
        : [],
    }), {})

    nextCollections[roomId] = nextDeviceIds
    roomDeviceIdsByRoomId.value = nextCollections
    return nextDeviceIds
  }

  function upsertDeviceEntity(rawDevice, options = {}) {
    if (!hasValue(rawDevice?.id)) {
      return null
    }

    const { preferExisting = false } = options
    const previousDevice = devicesById.value[rawDevice.id] ?? null
    const nextDevice = previousDevice && preferExisting
      ? mergeDevicePatch(previousDevice, rawDevice)
      : previousDevice
        ? mergeDevicePatch(previousDevice, rawDevice)
        : normalizeDeviceEntity(rawDevice)

    return storeDeviceEntitySnapshot(nextDevice)
  }

  function ingestDashboardRooms(rawRooms = []) {
    const sourceRooms = DEV_SHOWCASE_ENABLED ? applyDevShowcaseRooms(rawRooms ?? []) : (rawRooms ?? [])

    sourceRooms.forEach((rawRoom) => {
      const room = setRoomEntity(rawRoom)
      if (!room) {
        return
      }

      setSceneRoomLayout(room.id, rawRoom)
      const devices = Array.isArray(rawRoom?.devices) ? rawRoom.devices : []
      devices.forEach((rawDevice) => {
        const nextDevice = {
          ...rawDevice,
          room_id: rawDevice?.room_id ?? room.id,
        }

        upsertDeviceEntity(nextDevice, { preferExisting: true })
        setSceneDeviceLayout(nextDevice.id, nextDevice)
      })
      setRoomDeviceIds(room.id, devices.map((device) => ({
        ...device,
        room_id: device?.room_id ?? room.id,
      })))
    })

    return dashboardRoomViews.value
  }

  function ingestSpatialScene(rawScene) {
    const normalizedScene = normalizeSpatialSceneRead(rawScene ?? {})
    const sourceScene = DEV_SHOWCASE_ENABLED ? applyDevShowcaseScene(normalizedScene) : normalizedScene

    sceneMeta.value = normalizeSceneMeta(sourceScene)
    ;(sourceScene?.rooms ?? []).forEach((rawRoom) => {
      const room = setRoomEntity(rawRoom)
      if (!room) {
        return
      }

      setSceneRoomLayout(room.id, rawRoom)
      const devices = Array.isArray(rawRoom?.devices) ? rawRoom.devices : []
      devices.forEach((rawDevice) => {
        const nextDevice = {
          ...rawDevice,
          room_id: rawDevice?.room_id ?? room.id,
        }

        upsertDeviceEntity(nextDevice, { preferExisting: true })
        setSceneDeviceLayout(nextDevice.id, nextDevice)
      })
      setRoomDeviceIds(room.id, devices.map((device) => ({
        ...device,
        room_id: device?.room_id ?? room.id,
      })))
    })

    return {
      zone: sceneMeta.value.zone,
      analysis: sceneMeta.value.analysis,
      rooms: spatialRoomViews.value,
    }
  }

  watch([roomsById, devicesById, roomDeviceIdsByRoomId], () => {
    const cache = buildCatalogEntityCache()
    if (hasCatalogEntityCache(cache)) {
      writeCache(CACHE_KEYS.catalogEntities, cache)
    } else {
      removeCache(CACHE_KEYS.catalogEntities)
    }
  }, { deep: true })

  watch([sceneMeta, sceneLayoutByRoomId, sceneDeviceLayoutByDeviceId], () => {
    const cache = buildSceneEntityCache()
    if (hasSceneEntityCache(cache)) {
      writeCache(CACHE_KEYS.sceneEntities, cache)
    } else {
      removeCache(CACHE_KEYS.sceneEntities)
    }
  }, { deep: true })

  watch([selectedRoomId, userSelectedRoom], ([roomId, selectedByUser]) => {
    writeCache(CACHE_KEYS.uiPreferences, {
      selectedRoomId: roomId,
      userSelectedRoom: selectedByUser,
    })
  })

  const allRoomViews = computed(() =>
    Object.values(roomsById.value)
      .map((room) => selectRoomViewById(room?.id))
      .filter(Boolean),
  )
  const dashboardRoomViews = computed(() =>
    sortRooms(allRoomViews.value.filter((room) => shouldDisplayDashboardRoom(room))),
  )
  const spatialRoomViews = computed(() =>
    sortSceneRooms(allRoomViews.value.filter((room) => shouldDisplaySpatialRoom(room))),
  )
  const roomCount = computed(() => dashboardRoomViews.value.length)
  const deviceCount = computed(() => dashboardRoomViews.value.reduce((total, room) => total + countDisplayDevices(room.devices), 0))

  function resolveRoomZone(roomEntity) {
    if (!roomEntity) {
      return null
    }

    if (roomEntity.zone) {
      return roomEntity.zone
    }

    const zone = sceneMeta.value.zone ?? null
    if (!zone) {
      return null
    }

    if (!hasValue(roomEntity.zone_id) || zone.id === roomEntity.zone_id) {
      return zone
    }

    return null
  }

  function resolveRoomIdForDevice(deviceId) {
    const entityDevice = devicesById.value[deviceId] ?? null
    if (hasValue(entityDevice?.room_id)) {
      return entityDevice.room_id
    }

    const matchedEntry = Object.entries(roomDeviceIdsByRoomId.value)
      .find(([, deviceIds]) => Array.isArray(deviceIds) && deviceIds.includes(deviceId))

    return matchedEntry ? matchedEntry[0] : null
  }

  function selectDeviceViewById(deviceId, preferredRoomId = null) {
    if (!hasValue(deviceId)) {
      return null
    }

    const entityDevice = devicesById.value[deviceId] ?? null
    if (!entityDevice) {
      return null
    }

    const sceneLayout = sceneDeviceLayoutByDeviceId.value[deviceId] ?? {}
    const roomId = hasValue(preferredRoomId) ? preferredRoomId : resolveRoomIdForDevice(deviceId)
    const isSceneBacked = hasDeviceSceneLayout(sceneLayout)

    return normalizeDeviceRead({
      ...entityDevice,
      ...sceneLayout,
      room_id: roomId ?? entityDevice.room_id ?? null,
      position: sceneLayout.position ?? entityDevice.position ?? null,
      source: isSceneBacked ? 'merged' : 'detail',
      isDetailBacked: true,
      isSceneBacked,
    })
  }

  function selectRoomViewById(roomId) {
    if (!hasValue(roomId)) {
      return null
    }

    const roomEntity = roomsById.value[roomId] ?? null
    if (!roomEntity) {
      return null
    }

    const sceneLayout = sceneLayoutByRoomId.value[roomId] ?? {}
    const deviceIds = roomDeviceIdsByRoomId.value[roomId] ?? []
    const isSceneBacked = hasRoomSceneLayout(sceneLayout)

    return normalizeRoomStateRead({
      ...roomEntity,
      ...sceneLayout,
      zone: resolveRoomZone(roomEntity),
      devices: sortDevices(
        filterDisplayDevices(
          deviceIds
            .map((deviceId) => selectDeviceViewById(deviceId, roomId))
            .filter(Boolean),
        ),
      ),
      source: isSceneBacked ? 'merged' : 'detail',
      isDetailBacked: true,
      isSceneBacked,
    })
  }

  function resolveFallbackRoomId() {
    return spatialRoomViews.value[0]?.id ?? dashboardRoomViews.value[0]?.id ?? null
  }

  const selectedRoom = computed(() => {
    if (!hasValue(selectedRoomId.value)) {
      return dashboardRoomViews.value[0] ?? spatialRoomViews.value[0] ?? null
    }

    return selectRoomViewById(selectedRoomId.value) ?? dashboardRoomViews.value[0] ?? spatialRoomViews.value[0] ?? null
  })
  const activeZoneId = computed(() => sceneMeta.value.zone?.id ?? selectedRoom.value?.zone_id ?? selectedRoom.value?.zone?.id ?? null)

  function hasAvailableRoom(roomId) {
    return Boolean(selectRoomViewById(roomId))
  }

  function ensureSelectedRoom() {
    const currentId = selectedRoomId.value
    if (hasValue(currentId) && hasAvailableRoom(currentId)) {
      return
    }

    const fallbackId = resolveFallbackRoomId()
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

    const sourceRooms = spatialRoomViews.value.length ? spatialRoomViews.value : dashboardRoomViews.value
    const preferredRoomId = getDevShowcasePreferredRoomId(sourceRooms)
    if (preferredRoomId !== null && preferredRoomId !== undefined) {
      selectedRoomId.value = preferredRoomId
    }

    createDevShowcaseActivities(sourceRooms)
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
    const cachedCatalogEntities = readCache(CACHE_KEYS.catalogEntities, null)
    const cachedSceneEntities = readCache(CACHE_KEYS.sceneEntities, null)
    const cachedUiPreferences = readCache(CACHE_KEYS.uiPreferences, {})

    if (cachedCatalogEntities && typeof cachedCatalogEntities === 'object') {
      roomsById.value = cachedCatalogEntities.roomsById ?? {}
      devicesById.value = cachedCatalogEntities.devicesById ?? {}
      roomDeviceIdsByRoomId.value = cachedCatalogEntities.roomDeviceIdsByRoomId ?? {}
    }

    if (cachedSceneEntities && typeof cachedSceneEntities === 'object') {
      sceneMeta.value = cachedSceneEntities.sceneMeta ?? { zone: null, analysis: null }
      sceneLayoutByRoomId.value = cachedSceneEntities.sceneLayoutByRoomId ?? {}
      sceneDeviceLayoutByDeviceId.value = cachedSceneEntities.sceneDeviceLayoutByDeviceId ?? {}
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
        throw await createHttpError(authenticatedResponse, '加载房间列表')
      }

      const payload = await authenticatedResponse.json()
      ingestDashboardRooms(payload)
      ensureSelectedRoom()
    } catch (fetchError) {
      error.value = fetchError instanceof Error ? fetchError.message : '获取智能家居数据失败。'
      notifyRequestFailure(fetchError, '加载房间列表')
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
        throw await createHttpError(response, '加载空间场景')
      }

      const scene = ingestSpatialScene(await response.json())
      ensureSelectedRoom()
      return scene
    } catch (fetchError) {
      spatialError.value = fetchError instanceof Error ? fetchError.message : '获取空间场景失败。'
      notifyRequestFailure(fetchError, '加载空间场景')
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
        throw await createHttpError(response, '加载房间设备')
      }

      const devicesPayload = await response.json()
      const devices = Array.isArray(devicesPayload)
        ? devicesPayload.map((device) => normalizeDeviceRead(device))
        : []
      devices.forEach((device) => {
        upsertDeviceEntity(device, { preferExisting: true })
        setSceneDeviceLayout(device.id, device)
      })
      setRoomDeviceIds(roomId, devices)
      ensureSelectedRoom()
    } catch (fetchError) {
      actionError.value = fetchError instanceof Error ? fetchError.message : '刷新房间设备失败。'
      notifyRequestFailure(fetchError, '加载房间设备')
      throw fetchError
    }
  }

  function connectRealtime() {
    if (socket.value && socket.value.readyState <= WebSocket.OPEN) {
      return
    }

    if (reconnectTimer.value) {
      window.clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
      reconnectDelayMs.value = 0
    }

    manualDisconnect.value = false
    connectionStatus.value = reconnectAttempt.value > 0 ? 'reconnecting' : 'connecting'
    wsConnected.value = false
    const shouldRefreshAfterOpen = reconnectAttempt.value > 0

    let ws
    try {
      ws = new WebSocket(resolveWebSocketUrl())
    } catch (error) {
      console.error('Failed to create realtime websocket connection.', error)
      connectionStatus.value = 'error'
      wsConnected.value = false
      scheduleReconnect()
      return
    }
    socket.value = ws

    ws.addEventListener('open', () => {
      if (socket.value !== ws) {
        ws.close()
        return
      }

      reconnectTimer.value = null
      reconnectDelayMs.value = 0
      connectionStatus.value = 'connected'
      wsConnected.value = true
      reconnectAttempt.value = 0

      // 仅在重连成功后补拉一次，弥补断线期间可能漏掉的 patch。
      if (shouldRefreshAfterOpen) {
        scheduleCompensationRefresh(60)
      }
    })

    ws.addEventListener('message', (event) => {
      lastMessageAt.value = new Date().toISOString()

      try {
        const rawPayload = JSON.parse(event.data)
        if (isDevicePatchV2Message(rawPayload)) {
          handleRealtimePatchV2(rawPayload)
          return
        }

        const payload = normalizeRealtimeMessage(rawPayload)
        handleRealtimeMessage(payload)
      } catch (parseError) {
        console.error('解析实时消息失败。', parseError)
      }
    })

    ws.addEventListener('close', () => {
      if (socket.value === ws) {
        socket.value = null
      }
      wsConnected.value = false
      if (manualDisconnect.value) {
        connectionStatus.value = 'idle'
        reconnectAttempt.value = 0
        reconnectDelayMs.value = 0
        return
      }

      connectionStatus.value = 'disconnected'
      scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      if (socket.value !== ws && socket.value !== null) {
        return
      }

      connectionStatus.value = 'error'
      wsConnected.value = false
    })
  }

  function scheduleReconnect() {
    if (manualDisconnect.value || reconnectTimer.value) {
      return
    }

    reconnectAttempt.value += 1
    reconnectDelayMs.value = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempt.value - 1),
      RECONNECT_MAX_DELAY_MS,
    )
    connectionStatus.value = 'reconnecting'
    reconnectTimer.value = window.setTimeout(() => {
      reconnectTimer.value = null
      reconnectDelayMs.value = 0
      connectRealtime()
    }, reconnectDelayMs.value)
  }

  function disconnectRealtime() {
    manualDisconnect.value = true

    if (reconnectTimer.value) {
      window.clearTimeout(reconnectTimer.value)
      reconnectTimer.value = null
    }
    reconnectAttempt.value = 0
    reconnectDelayMs.value = 0
    wsConnected.value = false

    if (spatialRefreshTimer.value) {
      window.clearTimeout(spatialRefreshTimer.value)
      spatialRefreshTimer.value = null
    }

    if (catalogRefreshTimer.value) {
      window.clearTimeout(catalogRefreshTimer.value)
      catalogRefreshTimer.value = null
    }

    if (detailRefreshTimer.value) {
      window.clearTimeout(detailRefreshTimer.value)
      detailRefreshTimer.value = null
    }

    detailRefreshQueued.value = false
    catalogRefreshQueued.value = false

    if (feedbackTimer.value) {
      window.clearTimeout(feedbackTimer.value)
      feedbackTimer.value = null
    }

    if (realtimeFlushTimer) {
      window.clearTimeout(realtimeFlushTimer)
      realtimeFlushTimer = null
      realtimePatchQueue.clear()
    }

    if (socket.value) {
      socket.value.close()
      socket.value = null
    }

    connectionStatus.value = 'idle'
  }

  function scheduleSpatialRefresh(delay = 240) {
    if (spatialRefreshTimer.value) {
      window.clearTimeout(spatialRefreshTimer.value)
    }

    spatialRefreshTimer.value = window.setTimeout(() => {
      fetchSpatialScene(activeZoneId.value, { silent: true }).catch(() => {})
    }, delay)
  }

  function runDetailRefresh(roomId = selectedRoomId.value) {
    if (roomId === null || roomId === undefined) {
      return Promise.resolve(null)
    }

    if (detailRefreshPromise.value) {
      detailRefreshQueued.value = true
      return detailRefreshPromise.value
    }

    const targetRoomId = roomId
    const refreshPromise = fetchRoomDevices(targetRoomId)
    detailRefreshPromise.value = refreshPromise.finally(() => {
      detailRefreshPromise.value = null

      if (detailRefreshQueued.value) {
        detailRefreshQueued.value = false
        scheduleDetailRefresh(180)
      }
    })

    return detailRefreshPromise.value
  }

  function scheduleDetailRefresh(delay = 180, roomId = selectedRoomId.value) {
    if (roomId === null || roomId === undefined) {
      return null
    }

    if (detailRefreshPromise.value) {
      detailRefreshQueued.value = true
      return detailRefreshPromise.value
    }

    if (detailRefreshTimer.value) {
      window.clearTimeout(detailRefreshTimer.value)
    }

    detailRefreshTimer.value = window.setTimeout(() => {
      detailRefreshTimer.value = null
      runDetailRefresh(roomId).catch(() => {})
    }, delay)

    return null
  }

  function scheduleCompensationRefresh(delay = 180) {
    scheduleCatalogRefresh(delay)
    scheduleDetailRefresh(delay, selectedRoomId.value)
    return null
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

  function prepareRealtimeDevicePatch(devicePatch) {
    const previousDevice = devicesById.value[devicePatch.id] ?? null
    const previousRoomId = previousDevice?.room_id ?? null
    const resolvedDevicePatch = (!hasValue(devicePatch.room_id) && hasValue(previousRoomId))
      ? { ...devicePatch, room_id: previousRoomId }
      : devicePatch

    const movedToUnknownDetailRoom = (
      hasValue(resolvedDevicePatch.room_id)
      && hasValue(previousRoomId)
      && resolvedDevicePatch.room_id !== previousRoomId
      && !hasValue(roomsById.value[resolvedDevicePatch.room_id])
    )

    return {
      devicePatch: resolvedDevicePatch,
      movedToUnknownDetailRoom,
    }
  }

  function storeDeviceEntitySnapshot(nextDevice) {
    if (!nextDevice || !hasValue(nextDevice.id)) {
      return null
    }

    const previousDevice = devicesById.value[nextDevice.id] ?? null
    devicesById.value = setRecordValue(devicesById.value, nextDevice.id, nextDevice)

    const previousRoomId = previousDevice?.room_id ?? null
    const nextRoomId = nextDevice.room_id ?? null
    if (previousRoomId !== null && previousRoomId !== nextRoomId) {
      roomDeviceIdsByRoomId.value = setRecordValue(
        roomDeviceIdsByRoomId.value,
        previousRoomId,
        (roomDeviceIdsByRoomId.value[previousRoomId] ?? []).filter((deviceId) => deviceId !== nextDevice.id),
      )
    }
    if (nextRoomId !== null) {
      const nextIds = roomDeviceIdsByRoomId.value[nextRoomId] ?? []
      if (!nextIds.includes(nextDevice.id)) {
        roomDeviceIdsByRoomId.value = setRecordValue(
          roomDeviceIdsByRoomId.value,
          nextRoomId,
          [...nextIds, nextDevice.id],
        )
      }
    }

    return nextDevice
  }

  function applyDeviceEntityPatch(rawPatch) {
    const patch = normalizeDevicePatchV2(rawPatch)
    if (!hasValue(patch.id)) {
      return null
    }

    const previousDevice = devicesById.value[patch.id] ?? null
    const nextDevice = previousDevice
      ? mergeDevicePatch(previousDevice, patch)
      : normalizeDeviceRead(patch)

    return storeDeviceEntitySnapshot(nextDevice)
  }

  function shouldCompensateForSeq(seq) {
    if (!Number.isInteger(seq) || seq <= 0) {
      return true
    }

    return lastRealtimeSeq.value !== null && seq !== (lastRealtimeSeq.value + 1)
  }

  function rememberRealtimeSeq(seq) {
    if (Number.isInteger(seq) && seq > 0) {
      lastRealtimeSeq.value = seq
    }
  }

  function isDevicePatchV2Message(message) {
    return message?.type === 'device_state_updated'
      && Number(message?.protocol_version) >= 2
      && Boolean(message?.device)
  }

  function resolveRealtimePatchIdentity(devicePatch) {
    if (hasValue(devicePatch?.id)) {
      return { key: `id:${devicePatch.id}`, patch: devicePatch }
    }

    const entityId = `${devicePatch?.ha_entity_id ?? devicePatch?.entity_id ?? ''}`.trim()
    if (!entityId) {
      return { key: null, patch: devicePatch }
    }

    const matchedDevice = Object.values(devicesById.value)
      .find((device) => `${device?.ha_entity_id ?? device?.entity_id ?? ''}`.trim() === entityId)

    return {
      key: `entity:${entityId}`,
      patch: hasValue(matchedDevice?.id)
        ? { ...devicePatch, id: matchedDevice.id }
        : devicePatch,
    }
  }

  function flushRealtimePatchQueue() {
    realtimeFlushTimer = null
    const batch = [...realtimePatchQueue.values()]
    realtimePatchQueue.clear()

    batch.forEach((queuedPatch) => {
      const realtimeUpdate = prepareRealtimeDevicePatch(queuedPatch)
      const nextDevice = applyDeviceEntityPatch(realtimeUpdate.devicePatch)
      if (!nextDevice) {
        scheduleCompensationRefresh(60)
        return
      }

      recordVisualActivity({
        deviceId: nextDevice.id,
        roomId: nextDevice.room_id,
        domain: nextDevice.entity_domain ?? nextDevice.type ?? 'generic',
        status: 'realtime',
        source: 'realtime',
      })

      if (realtimeUpdate.movedToUnknownDetailRoom || !hasValue(nextDevice.room_id) || !hasValue(roomsById.value[nextDevice.room_id])) {
        scheduleCompensationRefresh(60)
      }
    })
  }

  function enqueueRealtimePatch(devicePatch, options = {}) {
    const { seq = null } = options
    if (seq !== null && shouldCompensateForSeq(seq)) {
      scheduleCompensationRefresh(60)
    }
    if (seq !== null) {
      rememberRealtimeSeq(seq)
    }

    const normalizedPatch = normalizeDevicePatchV2(devicePatch)
    const { key, patch } = resolveRealtimePatchIdentity(normalizedPatch)
    if (!key) {
      scheduleCompensationRefresh(60)
      return
    }

    const previousQueuedPatch = realtimePatchQueue.get(key) ?? {}
    realtimePatchQueue.set(key, {
      ...previousQueuedPatch,
      ...patch,
      id: patch.id ?? previousQueuedPatch.id ?? null,
      ha_entity_id: patch.ha_entity_id ?? previousQueuedPatch.ha_entity_id,
      entity_id: patch.entity_id ?? previousQueuedPatch.entity_id,
    })

    if (realtimeFlushTimer !== null) {
      return
    }

    realtimeFlushTimer = window.setTimeout(() => {
      flushRealtimePatchQueue()
    }, 40)
  }

  function handleRealtimePatchV2(message) {
    enqueueRealtimePatch(message.device ?? {}, {
      seq: Number(message.seq),
    })
  }

  function handleRealtimeMessage(message) {
    if (message.type === 'connection_established' || message.type === 'pong') {
      return
    }

    if (message.type === 'catalog_updated') {
      // 目录结构变更时同步刷新主面板和空间视图，避免前端手动推导布局。
      scheduleCatalogRefresh()
      return
    }

    if (message.type === 'device_state_updated' && message.devicePatch) {
      enqueueRealtimePatch(message.devicePatch)
    }
  }

  function setSelectedRoom(roomId, options = {}) {
    const source = options.source ?? 'user'
    selectedRoomId.value = roomId
    if (source === 'user') {
      userSelectedRoom.value = true
    }

    const nextRoom = selectRoomViewById(roomId)
    const zoneId = nextRoom?.zone_id ?? nextRoom?.zone?.id ?? null
    if (zoneId && zoneId !== sceneMeta.value.zone?.id) {
      fetchSpatialScene(zoneId, { silent: true }).catch(() => {})
    }
  }

  function isDevicePending(deviceId) {
    return pendingDeviceIds.value.includes(deviceId)
  }

  function findDevice(deviceId) {
    return selectDeviceViewById(deviceId) ?? devicesById.value[deviceId] ?? null
  }

  function snapshotDevice(deviceId) {
    const device = findDevice(deviceId)
    return device ? { ...device } : null
  }

  function restoreDeviceSnapshot(snapshot) {
    if (!snapshot) {
      return
    }

    const normalizedSnapshot = normalizeDeviceRead(snapshot)
    storeDeviceEntitySnapshot(normalizedSnapshot)
  }

  function markPending(deviceId) {
    pendingDeviceIds.value = [...pendingDeviceIds.value, deviceId]
  }

  function unmarkPending(deviceId) {
    pendingDeviceIds.value = pendingDeviceIds.value.filter((pendingId) => pendingId !== deviceId)
  }

  function updateDeviceCollections(deviceId, updater) {
    const baseDevice = devicesById.value[deviceId] ?? selectDeviceViewById(deviceId)
    if (!baseDevice) {
      return null
    }

    const nextDevice = normalizeDeviceRead(updater({ ...baseDevice }))
    storeDeviceEntitySnapshot(nextDevice)
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
    setActionFeedback('pending', '指令下发中...', deviceId)
    const previousSnapshot = typeof optimisticUpdate === 'function' ? snapshotDevice(deviceId) : null
    const commandToastId = notificationStore.pushToast({
      type: 'loading',
      message: '指令下发中...',
      duration: 0,
    })

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
        notificationStore.updateToast(commandToastId, {
          type: 'success',
          message: '指令执行成功',
          duration: 3000,
        })
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
      }, '执行设备控制')

      if (!response.ok) {
        throw await createHttpError(response, '执行设备控制')
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
      notificationStore.updateToast(commandToastId, {
        type: 'success',
        message: '指令执行成功',
        duration: 3000,
      })
      return await response.json()
    } catch (controlError) {
      restoreDeviceSnapshot(previousSnapshot)
      actionError.value = controlError instanceof Error ? controlError.message : '发送设备控制指令失败。'
      notificationStore.updateToast(commandToastId, {
        type: 'error',
        message: buildRequestFailureMessage('执行设备控制', controlError),
        duration: 4200,
      })
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

    updateDeviceCollections(deviceId, (device) => {
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
        state: nextStatus,
        online: nextStatus !== 'offline',
      }
    })
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
      }, '上传户型图')

      if (!response.ok) {
        throw await createHttpError(response, '上传户型图')
      }

      const payload = await response.json()
      await fetchSpatialScene(zoneId)
      return payload
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '上传户型图失败。'
      notifyRequestFailure(requestError, '上传户型图')
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
      }, '自动布局')

      if (!response.ok) {
        throw await createHttpError(response, '自动布局')
      }

      const payload = await response.json()
      await fetchSpatialScene(zoneId)
      return payload
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '自动布局失败。'
      notifyRequestFailure(requestError, '自动布局')
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
      }, '上传 3D 模型')

      if (!response.ok) {
        throw await createHttpError(response, '上传 3D 模型')
      }

      const payload = await response.json()
      await fetchSpatialScene(zoneId)
      return payload
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '上传 3D 模型失败。'
      notifyRequestFailure(requestError, '上传 3D 模型')
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
      }, '保存房间布局')

      if (!response.ok) {
        throw await createHttpError(response, '保存房间布局')
      }

      const updatedRoom = await response.json()
      setRoomEntity(updatedRoom)
      setSceneRoomLayout(roomId, updatedRoom)
      ensureSelectedRoom()
      return updatedRoom
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '保存房间布局失败。'
      notifyRequestFailure(requestError, '保存房间布局')
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
      }, '保存设备点位')

      if (!response.ok) {
        throw await createHttpError(response, '保存设备点位')
      }

      const updatedDevice = await response.json()
      upsertDeviceEntity(updatedDevice, { preferExisting: true })
      setSceneDeviceLayout(deviceId, updatedDevice)
      return updatedDevice
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '保存设备点位失败。'
      notifyRequestFailure(requestError, '保存设备点位')
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
      }, '新增设备')

      if (!response.ok) {
        throw await createHttpError(response, '新增设备')
      }

      const createdDevice = await response.json()
      await Promise.all([
        fetchInitialState(),
        fetchSpatialScene(activeZoneId.value, { silent: true }),
      ])
      return createdDevice
    } catch (requestError) {
      spatialError.value = requestError instanceof Error ? requestError.message : '新增设备失败。'
      notifyRequestFailure(requestError, '新增设备')
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

      roomsById.value = {}
      devicesById.value = {}
      roomDeviceIdsByRoomId.value = {}
      error.value = ''
      ingestDashboardRooms([])
    }

    try {
      await fetchSpatialScene(selectedRoom.value?.zone_id ?? null, { silent: false })
    } catch (fetchError) {
      if (!DEV_SHOWCASE_ENABLED) {
        throw fetchError
      }

      sceneMeta.value = { zone: null, analysis: null }
      sceneLayoutByRoomId.value = {}
      sceneDeviceLayoutByDeviceId.value = {}
      spatialError.value = ''
      ingestSpatialScene({ zone: null, analysis: null, rooms: [] })
    }

    if (DEV_SHOWCASE_ENABLED) {
      seedDevShowcase({ fallbackConnection: !initialStateReady })
    }

    if (initialStateReady) {
      connectRealtime()
    }
  }

  return {
    roomsById,
    devicesById,
    roomDeviceIdsByRoomId,
    sceneMeta,
    sceneLayoutByRoomId,
    sceneDeviceLayoutByDeviceId,
    isLoading,
    spatialLoading,
    spatialBusy,
    error,
    spatialError,
    actionError,
    connectionStatus,
    wsConnected,
    isOffline,
    reconnectDelayMs,
    lastMessageAt,
    selectedRoomId,
    pendingDeviceIds,
    actionFeedback,
    visualActivity,
    roomCount,
    deviceCount,
    dashboardRoomViews,
    spatialRoomViews,
    selectedRoom,
    selectRoomViewById,
    selectDeviceViewById,
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
