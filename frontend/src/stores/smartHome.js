import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || ''

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

function normalizeRoom(room) {
  return {
    ...room,
    devices: [...(room.devices ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
  }
}

function normalizeSpatialRoom(room) {
  return {
    ...room,
    devices: [...(room.devices ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
  }
}

function normalizeSpatialScene(scene) {
  return {
    zone: scene?.zone ?? null,
    rooms: sortSceneRooms((scene?.rooms ?? []).map(normalizeSpatialRoom)),
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export const useSmartHomeStore = defineStore('smartHome', () => {
  const rooms = ref([])
  const spatialScene = ref({ zone: null, rooms: [] })
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

  const roomCount = computed(() => rooms.value.length)
  const deviceCount = computed(() => rooms.value.reduce((total, room) => total + (room.devices?.length ?? 0), 0))
  const selectedRoom = computed(() => rooms.value.find((room) => room.id === selectedRoomId.value) ?? rooms.value[0] ?? null)
  const selectedSceneRoom = computed(() => spatialScene.value.rooms.find((room) => room.id === selectedRoomId.value) ?? spatialScene.value.rooms[0] ?? null)
  const activeZoneId = computed(() => spatialScene.value.zone?.id ?? selectedRoom.value?.zone_id ?? selectedRoom.value?.zone?.id ?? null)

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
      rooms.value = sortRooms(payload.map(normalizeRoom))

      if (!selectedRoomId.value && rooms.value.length > 0) {
        selectedRoomId.value = rooms.value[0].id
      }
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
    try {
      const response = await fetch(resolveApiUrl(`/api/devices/${roomId}`), {
        headers: {},
      })
      if (!response.ok) {
        throw new Error(`获取房间设备失败：${response.status}`)
      }

      const devices = await response.json()
      rooms.value = rooms.value.map((room) => {
        if (room.id !== roomId) {
          return room
        }

        return {
          ...room,
          devices: [...devices].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
        }
      })
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

    const ws = new WebSocket(resolveWebSocketUrl())
    socket.value = ws

    ws.addEventListener('open', () => {
      connectionStatus.value = 'connected'
      reconnectAttempt.value = 0
    })

    ws.addEventListener('message', (event) => {
      lastMessageAt.value = new Date().toISOString()

      try {
        const payload = JSON.parse(event.data)
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

  function handleRealtimeMessage(message) {
    if (message.type === 'connection_established' || message.type === 'pong') {
      return
    }

    if (message.type === 'catalog_updated') {
      // 目录结构变化时同时刷新主面板与空间图，避免前端手动推导布局。
      fetchInitialState().catch(() => {})
      fetchSpatialScene(activeZoneId.value, { silent: true }).catch(() => {})
      return
    }

    if (message.type === 'device_state_updated' && message.device) {
      upsertDevice(message.device)
      upsertSpatialDevice(message.device)
      scheduleSpatialRefresh()
    }
  }

  function upsertDevice(updatedDevice) {
    let matchedRoom = false

    rooms.value = rooms.value.map((room) => {
      const deviceIndex = room.devices.findIndex((device) => device.id === updatedDevice.id)
      const belongsToRoom = room.id === updatedDevice.room_id

      if (deviceIndex === -1 && !belongsToRoom) {
        return room
      }

      matchedRoom = true
      const nextDevices = [...room.devices]

      if (deviceIndex >= 0 && belongsToRoom) {
        nextDevices.splice(deviceIndex, 1, { ...nextDevices[deviceIndex], ...updatedDevice })
      } else if (deviceIndex >= 0) {
        nextDevices.splice(deviceIndex, 1)
      } else {
        nextDevices.push(updatedDevice)
      }

      return {
        ...room,
        devices: nextDevices.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
      }
    })

    if (!matchedRoom) {
      fetchInitialState().catch(() => {})
    }
  }

  function upsertSpatialDevice(updatedDevice) {
    let matchedRoom = false

    spatialScene.value = {
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
          nextDevices.splice(deviceIndex, 1, { ...nextDevices[deviceIndex], ...updatedDevice })
        } else if (deviceIndex >= 0) {
          nextDevices.splice(deviceIndex, 1)
        } else {
          nextDevices.push(updatedDevice)
        }

        return {
          ...room,
          devices: nextDevices.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
        }
      }),
    }

    if (!matchedRoom) {
      scheduleSpatialRefresh(60)
    }
  }

  function setSelectedRoom(roomId) {
    selectedRoomId.value = roomId

    const nextRoom = rooms.value.find((room) => room.id === roomId)
    const zoneId = nextRoom?.zone_id ?? nextRoom?.zone?.id ?? null
    if (zoneId && zoneId !== spatialScene.value.zone?.id) {
      fetchSpatialScene(zoneId, { silent: true }).catch(() => {})
    }
  }

  function isDevicePending(deviceId) {
    return pendingDeviceIds.value.includes(deviceId)
  }

  function findDevice(deviceId) {
    return rooms.value.flatMap((room) => room.devices).find((device) => device.id === deviceId) ?? null
  }

  function snapshotDevice(deviceId) {
    const device = findDevice(deviceId)
    return device ? { ...device } : null
  }

  function restoreDeviceSnapshot(snapshot) {
    if (!snapshot) {
      return
    }

    rooms.value = rooms.value.map((room) => ({
      ...room,
      devices: room.devices.map((device) => (device.id === snapshot.id ? { ...device, ...snapshot } : device)),
    }))
  }

  function markPending(deviceId) {
    pendingDeviceIds.value = [...pendingDeviceIds.value, deviceId]
  }

  function unmarkPending(deviceId) {
    pendingDeviceIds.value = pendingDeviceIds.value.filter((pendingId) => pendingId !== deviceId)
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
    // 只在需要乐观更新时记录快照，失败后再回滚，避免无意义的数据复制。
    const previousSnapshot = typeof optimisticUpdate === 'function' ? snapshotDevice(deviceId) : null

    try {
      if (typeof optimisticUpdate === 'function') {
        optimisticUpdate(device)
      }

      const response = await fetch(resolveApiUrl('/api/device/control'), {
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
      return await response.json()
    } catch (controlError) {
      restoreDeviceSnapshot(previousSnapshot)
      actionError.value = controlError instanceof Error ? controlError.message : '发送设备控制指令失败。'
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

  function applyDeviceActionLocally(deviceId, action) {
    const nextStatusByCurrentStatus = {
      on: 'off',
      off: 'on',
      online: 'offline',
      offline: 'online',
    }

    rooms.value = rooms.value.map((room) => ({
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
    }))
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

      const response = await fetch(resolveApiUrl('/api/spatial/floorplan'), {
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
      const response = await fetch(resolveApiUrl('/api/spatial/auto-layout'), {
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

  async function updateRoomSpatialLayout(roomId, payload) {
    spatialBusy.value = true
    spatialError.value = ''

    try {
      const response = await fetch(resolveApiUrl(`/api/spatial/rooms/${roomId}/layout`), {
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
      const response = await fetch(resolveApiUrl(`/api/spatial/devices/${deviceId}/placement`), {
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
      const response = await fetch(resolveApiUrl('/api/spatial/devices/manual'), {
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
    await fetchInitialState()
    await fetchSpatialScene(selectedRoom.value?.zone_id ?? null, { silent: false }).catch(() => {})
    connectRealtime()
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
    roomCount,
    deviceCount,
    selectedRoom,
    selectedSceneRoom,
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
    uploadFloorPlan,
    autoLayoutSpatialScene,
    updateRoomSpatialLayout,
    updateDevicePlacement,
    createManualDevice,
    initialize,
  }
})
