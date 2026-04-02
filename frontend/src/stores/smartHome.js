import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const EXPLICIT_WS_URL = import.meta.env.VITE_WS_URL?.trim() || ''

function resolveApiUrl(path) {
  if (!API_BASE_URL) {
    return path
  }
  return new URL(path, API_BASE_URL).toString()
}

function resolveWebSocketUrl(path = '/ws/devices') {
  if (EXPLICIT_WS_URL) {
    return EXPLICIT_WS_URL
  }

  if (API_BASE_URL) {
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
  return [...rooms].sort((left, right) => left.name.localeCompare(right.name))
}

function normalizeRoom(room) {
  return {
    ...room,
    devices: [...(room.devices ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
  }
}

export const useSmartHomeStore = defineStore('smartHome', () => {
  const rooms = ref([])
  const isLoading = ref(false)
  const error = ref('')
  const actionError = ref('')
  const connectionStatus = ref('idle')
  const lastMessageAt = ref('')
  const socket = ref(null)
  const reconnectTimer = ref(null)
  const reconnectAttempt = ref(0)
  const manualDisconnect = ref(false)
  const selectedRoomId = ref(null)
  const pendingDeviceIds = ref([])

  const roomCount = computed(() => rooms.value.length)
  const deviceCount = computed(() =>
    rooms.value.reduce((total, room) => total + (room.devices?.length ?? 0), 0),
  )
  const selectedRoom = computed(() =>
    rooms.value.find((room) => room.id === selectedRoomId.value) ?? rooms.value[0] ?? null,
  )

  async function fetchInitialState() {
    isLoading.value = true
    error.value = ''

    try {
      const response = await fetch(resolveApiUrl('/api/rooms'))
      if (!response.ok) {
        throw new Error(`Failed to fetch rooms: ${response.status}`)
      }

      const payload = await response.json()
      rooms.value = sortRooms(payload.map(normalizeRoom))
      if (!selectedRoomId.value && rooms.value.length > 0) {
        selectedRoomId.value = rooms.value[0].id
      }
    } catch (fetchError) {
      error.value = fetchError instanceof Error ? fetchError.message : 'Failed to fetch smart home data.'
      throw fetchError
    } finally {
      isLoading.value = false
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
        console.error('Failed to parse smart home WebSocket message.', parseError)
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

    if (socket.value) {
      socket.value.close()
      socket.value = null
    }
  }

  function handleRealtimeMessage(message) {
    if (message.type === 'connection_established' || message.type === 'pong') {
      return
    }

    if (message.type === 'device_state_updated' && message.device) {
      upsertDevice(message.device)
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
        devices: nextDevices.sort((left, right) => left.name.localeCompare(right.name)),
      }
    })

    if (!matchedRoom) {
      fetchInitialState().catch(() => {})
    }
  }

  function setSelectedRoom(roomId) {
    selectedRoomId.value = roomId
  }

  async function fetchRoomDevices(roomId) {
    try {
      const response = await fetch(resolveApiUrl(`/api/devices/${roomId}`))
      if (!response.ok) {
        throw new Error(`Failed to fetch room devices: ${response.status}`)
      }

      const devices = await response.json()
      rooms.value = rooms.value.map((room) => {
        if (room.id !== roomId) {
          return room
        }

        return {
          ...room,
          devices: [...devices].sort((left, right) => left.name.localeCompare(right.name)),
        }
      })
    } catch (fetchError) {
      actionError.value =
        fetchError instanceof Error ? fetchError.message : 'Failed to refresh room devices.'
      throw fetchError
    }
  }

  function isDevicePending(deviceId) {
    return pendingDeviceIds.value.includes(deviceId)
  }

  async function toggleDevice(deviceId) {
    if (isDevicePending(deviceId)) {
      return
    }

    const device = rooms.value.flatMap((room) => room.devices).find((entry) => entry.id === deviceId)
    if (!device) {
      throw new Error(`Device ${deviceId} not found.`)
    }

    actionError.value = ''
    pendingDeviceIds.value = [...pendingDeviceIds.value, deviceId]

    try {
      const response = await fetch(resolveApiUrl('/api/device/control'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_id: deviceId,
          action: 'toggle',
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to control device: ${response.status}`)
      }

      applyDeviceActionLocally(deviceId, 'toggle')
    } catch (toggleError) {
      actionError.value =
        toggleError instanceof Error ? toggleError.message : 'Failed to send device command.'
      throw toggleError
    } finally {
      pendingDeviceIds.value = pendingDeviceIds.value.filter((pendingId) => pendingId !== deviceId)
    }
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
        }
      }),
    }))
  }

  async function initialize() {
    await fetchInitialState()
    connectRealtime()
  }

  return {
    rooms,
    isLoading,
    error,
    actionError,
    connectionStatus,
    lastMessageAt,
    selectedRoomId,
    pendingDeviceIds,
    roomCount,
    deviceCount,
    selectedRoom,
    fetchInitialState,
    fetchRoomDevices,
    connectRealtime,
    disconnectRealtime,
    setSelectedRoom,
    isDevicePending,
    toggleDevice,
    initialize,
  }
})
