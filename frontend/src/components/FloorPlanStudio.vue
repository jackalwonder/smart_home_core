<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

import { useSmartHomeStore } from '../stores/smartHome'

const ImmersiveFloorPlan3D = defineAsyncComponent(() => import('./ImmersiveFloorPlan3D.vue'))

const props = defineProps({
  scene: {
    type: Object,
    default: () => ({ zone: null, analysis: null, rooms: [] }),
  },
  selectedRoomId: {
    type: Number,
    default: null,
  },
  spatialLoading: {
    type: Boolean,
    default: false,
  },
  spatialBusy: {
    type: Boolean,
    default: false,
  },
  spatialError: {
    type: String,
    default: '',
  },
  actionError: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select-room'])

const smartHomeStore = useSmartHomeStore()
const viewportRef = ref(null)
const clockNow = ref(Date.now())
const selectedDeviceId = ref(null)
const showHeatLayer = ref(true)
const showDevices = ref(true)
const preserveExistingLayout = ref(true)
const activeStudioMode = ref('orbit')
const pendingFloorPlanFile = ref(null)
const pendingFloorPlanMeta = ref(null)
const pendingSceneModelFile = ref(null)
const pendingSceneModelScale = ref(1)
const uploadMessage = ref('')
const dragState = ref(null)
const roomOverrides = ref({})
const deviceOverrides = ref({})
const numericDrafts = ref({})
const selectDrafts = ref({})

const roomDraft = reactive({
  plan_x: 0,
  plan_y: 0,
  plan_width: 0,
  plan_height: 0,
  plan_rotation: 0,
})

const deviceDraft = reactive({
  plan_x: 0,
  plan_y: 0,
  plan_z: 0,
  plan_rotation: 0,
})

const manualDeviceForm = reactive({
  room_id: null,
  name: '',
  ha_entity_id: '',
  device_type: 'switch',
})

const DEVICE_TYPE_OPTIONS = [
  { value: 'switch', label: '通用开关' },
  { value: 'mijia_light', label: '灯光设备' },
  { value: 'climate', label: '空调环境' },
  { value: 'sensor', label: '传感设备' },
  { value: 'camera', label: '摄像头' },
  { value: 'windows_pc', label: '电脑/主机' },
  { value: 'nas', label: 'NAS/网络存储' },
]

const ACTIVE_STATES = new Set(['on', 'online', 'playing', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'auto'])

const sceneZone = computed(() => props.scene?.zone ?? null)
const sceneAnalysis = computed(() => props.scene?.analysis ?? null)
const sceneRooms = computed(() => props.scene?.rooms ?? [])
const planWidth = computed(() => sceneZone.value?.floor_plan_image_width ?? 1600)
const planHeight = computed(() => sceneZone.value?.floor_plan_image_height ?? 960)
const planImageUrl = computed(() => smartHomeStore.resolveAssetUrl(sceneZone.value?.floor_plan_image_path || ''))
const sceneModelUrl = computed(() => smartHomeStore.resolveAssetUrl(sceneZone.value?.three_d_model_path || ''))
const cameraMode = computed(() => (activeStudioMode.value === 'walk' ? 'walk' : 'orbit'))

const selectedRoom = computed(() => sceneRooms.value.find((room) => room.id === props.selectedRoomId) ?? sceneRooms.value[0] ?? null)
const selectedRoomWithDraft = computed(() => (selectedRoom.value ? getRoomView(selectedRoom.value) : null))

const positionedDevices = computed(() =>
  sceneRooms.value.flatMap((room) => {
    const roomView = getRoomView(room)
    return room.devices.map((device) => ({
      ...getDeviceView(device),
      room: roomView,
    }))
  }),
)

const selectedDevice = computed(() => positionedDevices.value.find((device) => device.id === selectedDeviceId.value) ?? null)

const placedRoomCount = computed(() =>
  sceneRooms.value.filter((room) => room.plan_x !== null && room.plan_y !== null && room.plan_width !== null && room.plan_height !== null).length,
)

const placedDeviceCount = computed(() =>
  positionedDevices.value.filter((device) => device.plan_x !== null && device.plan_y !== null).length,
)

const controllableDeviceCount = computed(() => positionedDevices.value.filter((device) => device.can_control).length)
const analysisInsights = computed(() => ({
  rooms: sceneAnalysis.value?.room_candidates?.length ?? 0,
  walls: sceneAnalysis.value?.wall_segments?.length ?? 0,
  openings: sceneAnalysis.value?.openings?.length ?? 0,
  furniture: sceneAnalysis.value?.furniture_candidates?.length ?? 0,
}))

const analysisText = computed(() =>
  extractAnalysisSummary(sceneAnalysis.value ?? sceneZone.value?.floor_plan_analysis)
    || '上传户型图后，系统会先按房间名称和画布比例生成初始布局，然后允许继续拖拽和精修。',
)
const connectionLabel = computed(() => {
  const labels = {
    idle: '待连接',
    connecting: '连接中',
    connected: '实时在线',
    reconnecting: '重连中',
    disconnected: '已断开',
    error: '连接异常',
  }

  return labels[smartHomeStore.connectionStatus] ?? '未知状态'
})
const connectionToneClass = computed(() => {
  const map = {
    idle: 'bg-slate-500/20 text-slate-200',
    connecting: 'bg-amber-400/18 text-amber-100',
    connected: 'bg-emerald-400/18 text-emerald-100',
    reconnecting: 'bg-sky-400/18 text-sky-100',
    disconnected: 'bg-rose-400/18 text-rose-100',
    error: 'bg-rose-400/18 text-rose-100',
  }
  return map[smartHomeStore.connectionStatus] ?? map.idle
})
const stageModeLabel = computed(() => {
  if (activeStudioMode.value === 'layout') {
    return '2D 中控'
  }
  if (activeStudioMode.value === 'walk') {
    return '第一人称漫游'
  }
  return '3D 轨道'
})
const currentClockTime = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(clockNow.value),
)
const currentClockDate = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(clockNow.value),
)
const lastSyncText = computed(() => {
  if (!smartHomeStore.lastMessageAt) {
    return '等待首条实时同步'
  }

  return `最近同步 ${new Date(smartHomeStore.lastMessageAt).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`
})
const selectedRoomDevices = computed(() =>
  selectedRoomWithDraft.value
    ? positionedDevices.value.filter((device) => device.room.id === selectedRoomWithDraft.value.id)
    : [],
)
const selectedRoomActiveCount = computed(() =>
  selectedRoomDevices.value.filter((device) => isActive(device)).length,
)
const selectedRoomPrimaryClimate = computed(() =>
  selectedRoomDevices.value.find((device) => device.entity_domain === 'climate') ?? null,
)
const sceneStatusSummary = computed(() => ([
  { label: '已布房间', value: placedRoomCount.value },
  { label: '设备节点', value: placedDeviceCount.value },
  { label: '可控设备', value: controllableDeviceCount.value },
]))

let clockTimer = 0

watch(
  () => sceneRooms.value,
  (rooms) => {
    if (rooms.length > 0 && !props.selectedRoomId) {
      emit('select-room', rooms[0].id)
    }

    if (selectedDeviceId.value && !positionedDevices.value.some((device) => device.id === selectedDeviceId.value)) {
      selectedDeviceId.value = null
    }
  },
  { immediate: true, deep: true },
)

watch(
  () => selectedRoomWithDraft.value,
  (room) => {
    if (!room) {
      return
    }

    roomDraft.plan_x = roundNumber(room.plan_x ?? 0)
    roomDraft.plan_y = roundNumber(room.plan_y ?? 0)
    roomDraft.plan_width = roundNumber(room.plan_width ?? planWidth.value * 0.2)
    roomDraft.plan_height = roundNumber(room.plan_height ?? planHeight.value * 0.18)
    roomDraft.plan_rotation = roundNumber(room.plan_rotation ?? 0)

    if (!manualDeviceForm.room_id) {
      manualDeviceForm.room_id = room.id
    }
  },
  { immediate: true },
)

watch(
  () => selectedDevice.value,
  (device) => {
    if (!device) {
      return
    }

    deviceDraft.plan_x = roundNumber(device.plan_x ?? 0)
    deviceDraft.plan_y = roundNumber(device.plan_y ?? 0)
    deviceDraft.plan_z = roundNumber(device.plan_z ?? 0)
    deviceDraft.plan_rotation = roundNumber(device.plan_rotation ?? 0)
  },
  { immediate: true },
)

watch(
  () => positionedDevices.value,
  (devices) => {
    const nextNumericDrafts = {}
    const nextSelectDrafts = {}

    devices.forEach((device) => {
      if (device.supports_brightness) {
        nextNumericDrafts[advancedNumberKey('brightness', device.id)] = device.brightness_value ?? 50
      }

      if (device.supports_color_temperature) {
        const min = device.min_color_temperature ?? 2700
        const max = device.max_color_temperature ?? 6500
        nextNumericDrafts[advancedNumberKey('color', device.id)] = device.color_temperature ?? Math.round((min + max) / 2)
      }

      if (device.entity_domain === 'climate' && device.target_temperature !== null && device.target_temperature !== undefined) {
        nextNumericDrafts[device.id] = device.target_temperature
      } else if (device.entity_domain === 'media_player' && device.media_volume_level !== null && device.media_volume_level !== undefined) {
        nextNumericDrafts[device.id] = device.media_volume_level
      } else if (device.control_kind === 'number') {
        nextNumericDrafts[device.id] = device.number_value ?? device.min_value ?? 0
      }

      if (device.entity_domain === 'climate' && device.hvac_mode) {
        nextSelectDrafts[device.id] = device.hvac_mode
      } else if (device.entity_domain === 'media_player' && device.media_source) {
        nextSelectDrafts[device.id] = device.media_source
      } else if (device.control_kind === 'select') {
        nextSelectDrafts[device.id] = device.raw_state ?? ''
      }
    })

    numericDrafts.value = nextNumericDrafts
    selectDrafts.value = nextSelectDrafts
  },
  { immediate: true, deep: true },
)

function getRoomView(room) {
  return {
    ...room,
    ...(roomOverrides.value[room.id] ?? {}),
  }
}

function getDeviceView(device) {
  return {
    ...device,
    ...(deviceOverrides.value[device.id] ?? {}),
  }
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function extractAnalysisSummary(rawValue) {
  if (!rawValue) {
    return ''
  }

  if (typeof rawValue === 'object' && typeof rawValue.summary === 'string') {
    return rawValue.summary
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (parsed && typeof parsed.summary === 'string') {
      return parsed.summary
    }
  } catch {
    return rawValue
  }

  return rawValue
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function advancedNumberKey(prefix, deviceId) {
  return `${prefix}:${deviceId}`
}

function roomToStyle(room) {
  const x = ((room.plan_x ?? 0) / planWidth.value) * 100
  const y = ((room.plan_y ?? 0) / planHeight.value) * 100
  const width = ((room.plan_width ?? 0) / planWidth.value) * 100
  const height = ((room.plan_height ?? 0) / planHeight.value) * 100
  const heat = roomHeatTokens(room)

  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${width}%`,
    height: `${height}%`,
    transform: `rotate(${room.plan_rotation ?? 0}deg)`,
    '--room-heat': heat.base,
    '--room-heat-glow': heat.glow,
    '--room-outline': heat.outline,
  }
}

function deviceToStyle(device) {
  const x = ((device.plan_x ?? 0) / planWidth.value) * 100
  const y = ((device.plan_y ?? 0) / planHeight.value) * 100
  const z = Number(device.plan_z ?? 0.3)
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, calc(-50% - ${roundNumber(z * 12)}px)) rotate(${device.plan_rotation ?? 0}deg)`,
    zIndex: `${20 + Math.round(z * 10)}`,
  }
}

function roomHeatTokens(room) {
  if (!showHeatLayer.value) {
    return {
      base: 'rgba(255,255,255,0.12)',
      glow: 'rgba(255,255,255,0.12)',
      outline: 'rgba(255,255,255,0.3)',
    }
  }

  const temperature = Number(room.ambient_temperature ?? 24)
  const humidity = Number(room.ambient_humidity ?? 50)
  const occupied = ['occupied', 'present', 'on', 'detected'].includes(`${room.occupancy_status ?? ''}`.toLowerCase())

  if (temperature >= 28) {
    return {
      base: occupied ? 'rgba(244, 114, 68, 0.28)' : 'rgba(249, 115, 22, 0.18)',
      glow: 'rgba(251, 146, 60, 0.28)',
      outline: 'rgba(251, 146, 60, 0.55)',
    }
  }

  if (temperature <= 19) {
    return {
      base: occupied ? 'rgba(59, 130, 246, 0.28)' : 'rgba(14, 165, 233, 0.18)',
      glow: 'rgba(56, 189, 248, 0.24)',
      outline: 'rgba(59, 130, 246, 0.48)',
    }
  }

  if (humidity >= 68) {
    return {
      base: 'rgba(20, 184, 166, 0.2)',
      glow: 'rgba(45, 212, 191, 0.24)',
      outline: 'rgba(20, 184, 166, 0.42)',
    }
  }

  if (occupied) {
    return {
      base: 'rgba(245, 158, 11, 0.2)',
      glow: 'rgba(250, 204, 21, 0.24)',
      outline: 'rgba(245, 158, 11, 0.46)',
    }
  }

  return {
    base: 'rgba(148, 163, 184, 0.18)',
    glow: 'rgba(148, 163, 184, 0.18)',
    outline: 'rgba(148, 163, 184, 0.36)',
  }
}

function roomOccupancyLabel(room) {
  const raw = `${room.occupancy_status ?? ''}`.toLowerCase()
  if (['occupied', 'present', 'on', 'detected'].includes(raw)) {
    return '有人'
  }
  if (raw) {
    return raw
  }
  return '未知'
}

function isActive(device) {
  return ACTIVE_STATES.has(`${device.raw_state ?? device.current_status ?? ''}`.trim().toLowerCase())
}

function isDevicePending(deviceId) {
  return smartHomeStore.isDevicePending(deviceId)
}

function displayState(device) {
  if (device.entity_domain === 'climate' && device.hvac_mode) {
    return device.hvac_mode
  }

  if (device.entity_domain === 'media_player' && device.media_source) {
    return device.media_source
  }

  if (device.raw_state) {
    return device.raw_state
  }

  return device.current_status ?? 'unknown'
}

function deviceGlyph(device) {
  if (device.entity_domain === 'light' || device.device_type === 'mijia_light') {
    return '灯'
  }
  if (device.entity_domain === 'climate') {
    return '空'
  }
  if (device.entity_domain === 'media_player') {
    return '媒'
  }
  if (device.entity_domain === 'camera') {
    return '摄'
  }
  if (device.entity_domain === 'sensor' || device.device_type === 'sensor') {
    return '感'
  }
  if (device.entity_domain === 'switch') {
    return '控'
  }
  return '设'
}

function selectRoom(roomId) {
  if (selectedDevice.value && selectedDevice.value.room.id !== roomId) {
    selectedDeviceId.value = null
  }
  emit('select-room', roomId)
}

function selectDevice(device) {
  selectedDeviceId.value = device.id
  emit('select-room', device.room.id)
}

function applyRoomOverride(roomId, payload) {
  roomOverrides.value = {
    ...roomOverrides.value,
    [roomId]: payload,
  }
}

function clearRoomOverride(roomId) {
  const nextOverrides = { ...roomOverrides.value }
  delete nextOverrides[roomId]
  roomOverrides.value = nextOverrides
}

function applyDeviceOverride(deviceId, payload) {
  deviceOverrides.value = {
    ...deviceOverrides.value,
    [deviceId]: payload,
  }
}

function clearDeviceOverride(deviceId) {
  const nextOverrides = { ...deviceOverrides.value }
  delete nextOverrides[deviceId]
  deviceOverrides.value = nextOverrides
}

function beginRoomDrag(room, event) {
  if (props.spatialBusy || !viewportRef.value) {
    return
  }

  event.preventDefault()
  selectRoom(room.id)

  dragState.value = {
    kind: 'room',
    id: room.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: room.plan_x ?? 0,
    startY: room.plan_y ?? 0,
    width: room.plan_width ?? 0,
    height: room.plan_height ?? 0,
    moved: false,
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

function beginDeviceDrag(device, event) {
  if (props.spatialBusy || !viewportRef.value) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  selectDevice(device)

  dragState.value = {
    kind: 'device',
    id: device.id,
    roomId: device.room.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: device.plan_x ?? 0,
    startY: device.plan_y ?? 0,
    moved: false,
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

function handlePointerMove(event) {
  const currentDrag = dragState.value
  const viewport = viewportRef.value
  if (!currentDrag || !viewport) {
    return
  }

  const rect = viewport.getBoundingClientRect()
  const deltaX = ((event.clientX - currentDrag.startClientX) / rect.width) * planWidth.value
  const deltaY = ((event.clientY - currentDrag.startClientY) / rect.height) * planHeight.value
  currentDrag.moved = currentDrag.moved || Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2

  if (currentDrag.kind === 'room') {
    const nextX = clamp(currentDrag.startX + deltaX, 0, Math.max(planWidth.value - currentDrag.width, 0))
    const nextY = clamp(currentDrag.startY + deltaY, 0, Math.max(planHeight.value - currentDrag.height, 0))
    applyRoomOverride(currentDrag.id, {
      plan_x: roundNumber(nextX),
      plan_y: roundNumber(nextY),
    })

    if (selectedRoom.value?.id === currentDrag.id) {
      roomDraft.plan_x = roundNumber(nextX)
      roomDraft.plan_y = roundNumber(nextY)
    }
    return
  }

  const draggedDevice = positionedDevices.value.find((device) => device.id === currentDrag.id)
  if (!draggedDevice) {
    return
  }

  const room = sceneRooms.value.find((item) => item.id === currentDrag.roomId)
  const roomView = room ? getRoomView(room) : null
  const minX = roomView ? (roomView.plan_x ?? 0) + 16 : 0
  const maxX = roomView ? (roomView.plan_x ?? 0) + (roomView.plan_width ?? planWidth.value) - 16 : planWidth.value
  const minY = roomView ? (roomView.plan_y ?? 0) + 16 : 0
  const maxY = roomView ? (roomView.plan_y ?? 0) + (roomView.plan_height ?? planHeight.value) - 16 : planHeight.value

  const nextX = clamp(currentDrag.startX + deltaX, minX, maxX)
  const nextY = clamp(currentDrag.startY + deltaY, minY, maxY)
  applyDeviceOverride(currentDrag.id, {
    plan_x: roundNumber(nextX),
    plan_y: roundNumber(nextY),
  })

  if (selectedDevice.value?.id === currentDrag.id) {
    deviceDraft.plan_x = roundNumber(nextX)
    deviceDraft.plan_y = roundNumber(nextY)
  }
}

async function handlePointerUp() {
  const currentDrag = dragState.value
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  dragState.value = null

  if (!currentDrag || !currentDrag.moved) {
    return
  }

  try {
    if (currentDrag.kind === 'room') {
      const room = sceneRooms.value.find((item) => item.id === currentDrag.id)
      if (!room) {
        return
      }

      const roomView = getRoomView(room)
      await smartHomeStore.updateRoomSpatialLayout(currentDrag.id, {
        plan_x: roomView.plan_x,
        plan_y: roomView.plan_y,
        plan_width: roomView.plan_width,
        plan_height: roomView.plan_height,
        plan_rotation: roomView.plan_rotation,
      })
      clearRoomOverride(currentDrag.id)
      return
    }

    const device = positionedDevices.value.find((item) => item.id === currentDrag.id)
    if (!device) {
      return
    }

    const deviceView = getDeviceView(device)
    await smartHomeStore.updateDevicePlacement(currentDrag.id, {
      plan_x: deviceView.plan_x,
      plan_y: deviceView.plan_y,
      plan_z: deviceView.plan_z,
      plan_rotation: deviceView.plan_rotation,
    })
    clearDeviceOverride(currentDrag.id)
  } catch (error) {
    clearRoomOverride(currentDrag.id)
    clearDeviceOverride(currentDrag.id)
    console.error('保存拖拽结果失败。', error)
  }
}

async function loadImageMeta(file) {
  const previewUrl = URL.createObjectURL(file)

  try {
    const metadata = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
        })
      }
      image.onerror = () => reject(new Error('无法读取户型图尺寸。'))
      image.src = previewUrl
    })

    return metadata
  } finally {
    URL.revokeObjectURL(previewUrl)
  }
}

async function handleFloorPlanSelection(event) {
  const file = event.target.files?.[0] ?? null
  pendingFloorPlanFile.value = file
  pendingFloorPlanMeta.value = null
  uploadMessage.value = ''

  if (!file) {
    return
  }

  try {
    pendingFloorPlanMeta.value = await loadImageMeta(file)
  } catch (error) {
    console.error('Failed to read floor plan metadata.', error)
  }
}

function handleSceneModelSelection(event) {
  pendingSceneModelFile.value = event.target.files?.[0] ?? null
  uploadMessage.value = ''
}

async function submitFloorPlan() {
  const zoneId = sceneZone.value?.id ?? selectedRoom.value?.zone_id ?? null
  if (!zoneId || !pendingFloorPlanFile.value || !pendingFloorPlanMeta.value) {
    return
  }

  const response = await smartHomeStore.uploadFloorPlan({
    zoneId,
    file: pendingFloorPlanFile.value,
    imageWidth: pendingFloorPlanMeta.value.width,
    imageHeight: pendingFloorPlanMeta.value.height,
    preserveExisting: preserveExistingLayout.value,
  })

  uploadMessage.value = `户型图已更新，自动布局了 ${response.updated_room_count} 个房间。`
  pendingFloorPlanFile.value = null
}

async function submitSceneModel() {
  const zoneId = sceneZone.value?.id ?? selectedRoom.value?.zone_id ?? null
  if (!zoneId || !pendingSceneModelFile.value) {
    return
  }

  const response = await smartHomeStore.uploadSceneModel({
    zoneId,
    file: pendingSceneModelFile.value,
    modelScale: pendingSceneModelScale.value,
  })

  uploadMessage.value = `3D 模型已接入，当前资源：${response.model_url}`
  pendingSceneModelFile.value = null
}

async function runAutoLayout() {
  const zoneId = sceneZone.value?.id ?? selectedRoom.value?.zone_id ?? null
  if (!zoneId) {
    return
  }

  const response = await smartHomeStore.autoLayoutSpatialScene(zoneId, preserveExistingLayout.value)
  uploadMessage.value = `已重新分析户型，更新 ${response.updated_room_count} 个房间位置。`
}

async function saveRoomInspector() {
  if (!selectedRoom.value) {
    return
  }

  await smartHomeStore.updateRoomSpatialLayout(selectedRoom.value.id, {
    plan_x: roomDraft.plan_x,
    plan_y: roomDraft.plan_y,
    plan_width: roomDraft.plan_width,
    plan_height: roomDraft.plan_height,
    plan_rotation: roomDraft.plan_rotation,
  })
  clearRoomOverride(selectedRoom.value.id)
}

async function saveDeviceInspector() {
  if (!selectedDevice.value) {
    return
  }

  await smartHomeStore.updateDevicePlacement(selectedDevice.value.id, {
    plan_x: deviceDraft.plan_x,
    plan_y: deviceDraft.plan_y,
    plan_z: deviceDraft.plan_z,
    plan_rotation: deviceDraft.plan_rotation,
  })
  clearDeviceOverride(selectedDevice.value.id)
}

async function createManualDevice() {
  if (!manualDeviceForm.room_id || !manualDeviceForm.name.trim()) {
    return
  }

  await smartHomeStore.createManualDevice({
    room_id: manualDeviceForm.room_id,
    name: manualDeviceForm.name.trim(),
    ha_entity_id: manualDeviceForm.ha_entity_id.trim() || null,
    device_type: manualDeviceForm.device_type,
  })

  uploadMessage.value = `已向 ${selectedRoom.value?.name ?? '当前房间'} 添加新设备，空间图会自动补位。`
  manualDeviceForm.name = ''
  manualDeviceForm.ha_entity_id = ''
}

async function handleToggle(device) {
  try {
    await smartHomeStore.toggleDevice(device.id)
  } catch (error) {
    console.error('Failed to toggle device from spatial studio.', error)
  }
}

async function handleNumberChange(device, event) {
  const nextValue = Number(event.target.value)
  numericDrafts.value = { ...numericDrafts.value, [device.id]: nextValue }

  try {
    await smartHomeStore.setDeviceNumber(device.id, nextValue)
  } catch (error) {
    console.error('Failed to change numeric control from spatial studio.', error)
  }
}

async function handleBrightnessChange(device, event) {
  const nextValue = Number(event.target.value)
  numericDrafts.value = {
    ...numericDrafts.value,
    [advancedNumberKey('brightness', device.id)]: nextValue,
  }

  try {
    await smartHomeStore.setDeviceBrightness(device.id, nextValue)
  } catch (error) {
    console.error('Failed to change brightness from spatial studio.', error)
  }
}

async function handleColorTemperatureChange(device, event) {
  const nextValue = Number(event.target.value)
  numericDrafts.value = {
    ...numericDrafts.value,
    [advancedNumberKey('color', device.id)]: nextValue,
  }

  try {
    await smartHomeStore.setDeviceColorTemperature(device.id, nextValue)
  } catch (error) {
    console.error('Failed to change color temperature from spatial studio.', error)
  }
}

async function handleSelectChange(device, event) {
  const nextOption = event.target.value
  selectDrafts.value = { ...selectDrafts.value, [device.id]: nextOption }

  try {
    await smartHomeStore.selectDeviceOption(device.id, nextOption)
  } catch (error) {
    console.error('Failed to change select control from spatial studio.', error)
  }
}

async function handleButtonPress(device) {
  try {
    await smartHomeStore.pressDeviceButton(device.id)
  } catch (error) {
    console.error('Failed to run button control from spatial studio.', error)
  }
}

function selectOptions(device) {
  if (device.entity_domain === 'climate') {
    return device.hvac_modes ?? []
  }

  if (device.entity_domain === 'media_player') {
    return device.media_source_options ?? []
  }

  return device.control_options ?? []
}

function sliderRange(device) {
  if (device.entity_domain === 'climate') {
    return {
      min: device.min_value ?? 16,
      max: device.max_value ?? 30,
      step: device.step ?? 1,
      unit: device.unit_of_measurement ?? '°C',
    }
  }

  if (device.entity_domain === 'media_player') {
    return {
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
    }
  }

  return {
    min: device.min_value ?? 0,
    max: device.max_value ?? 100,
    step: device.step ?? 1,
    unit: device.unit_of_measurement ?? '',
  }
}

function handleInspectorSliderInput(deviceId, value) {
  numericDrafts.value = {
    ...numericDrafts.value,
    [deviceId]: Number(value),
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  if (clockTimer) {
    window.clearInterval(clockTimer)
  }
})

onMounted(() => {
  clockTimer = window.setInterval(() => {
    clockNow.value = Date.now()
  }, 1000)
})
</script>

<template>
  <section class="px-4 pb-4 sm:px-5 sm:pb-5 xl:px-8 xl:pb-8">
    <div class="console-shell">
      <div class="console-topbar">
        <div class="min-w-0">
          <p class="console-kicker">Spatial Console</p>
          <h2 class="console-title">真实户型中台控制</h2>
          <p class="console-subtitle">
            2D 先作为主控制台，房间、设备、热力和状态都基于户型图组织；3D 轨道与漫游则从这套 2D 布局继续展开。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="console-pill" :class="connectionToneClass">{{ connectionLabel }}</span>
          <span class="console-pill">画布 {{ planWidth }} × {{ planHeight }}</span>
          <button
            type="button"
            class="console-mode"
            :class="{ 'is-active': activeStudioMode === 'layout' }"
            @click="activeStudioMode = 'layout'"
          >
            2D 中控
          </button>
          <button
            type="button"
            class="console-mode"
            :class="{ 'is-active': activeStudioMode === 'orbit' }"
            @click="activeStudioMode = 'orbit'"
          >
            3D 轨道
          </button>
          <button
            type="button"
            class="console-mode"
            :class="{ 'is-active': activeStudioMode === 'walk' }"
            @click="activeStudioMode = 'walk'"
          >
            漫游
          </button>
        </div>
      </div>

      <div
        v-if="spatialError || actionError"
        class="console-alert mt-4"
      >
        {{ spatialError || actionError }}
      </div>

      <div class="console-grid mt-5">
        <div class="console-stage-panel">
          <div class="console-stage-header">
            <div>
              <p class="console-stage-header__eyebrow">{{ sceneZone?.name || '全屋空间' }} · {{ stageModeLabel }}</p>
              <p class="console-stage-header__title">
                {{ selectedRoomWithDraft ? `${selectedRoomWithDraft.name} · ${selectedRoomDevices.length} 个设备` : '等待房间数据' }}
              </p>
              <p class="console-stage-header__summary">{{ analysisText }}</p>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div
                v-for="item in sceneStatusSummary"
                :key="item.label"
                class="console-stat"
              >
                <span class="console-stat__label">{{ item.label }}</span>
                <span class="console-stat__value">{{ item.value }}</span>
              </div>
            </div>
          </div>

          <div
            v-if="activeStudioMode === 'layout'"
            class="console-map-shell"
          >
            <div
              ref="viewportRef"
              class="console-map relative"
              :style="{ aspectRatio: `${planWidth} / ${planHeight}` }"
            >
              <img
                v-if="planImageUrl"
                :src="planImageUrl"
                alt="上传后的户型图"
                class="absolute inset-0 h-full w-full object-cover opacity-[0.94]"
              >

              <div v-else class="console-map__placeholder absolute inset-0 flex items-center justify-center">
                <div class="rounded-[1.4rem] border border-white/10 bg-white/6 px-6 py-5 text-center text-slate-200">
                  <p class="text-base font-semibold">还没有户型图</p>
                  <p class="mt-2 text-sm text-slate-400">先在右侧上传户型图，2D 中控台会按真实比例生成。</p>
                </div>
              </div>

              <div class="console-map__glow absolute inset-0" />
              <div class="console-map__grid absolute inset-0" />

              <div class="pointer-events-none absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-3">
                <div class="rounded-[1.1rem] border border-white/10 bg-slate-950/34 px-4 py-3 text-slate-100 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                  <p class="text-[11px] uppercase tracking-[0.28em] text-slate-400">2D 中控主视图</p>
                  <p class="mt-2 text-lg font-semibold">{{ selectedRoomWithDraft?.name || sceneZone?.name || '全屋空间' }}</p>
                </div>

                <div class="rounded-[1rem] border border-white/10 bg-slate-950/34 px-3 py-2 text-right text-slate-100 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                  <p class="text-[10px] uppercase tracking-[0.22em] text-slate-400">Heat / Devices</p>
                  <p class="mt-1 text-sm font-medium">{{ showHeatLayer ? '热力已开' : '热力关闭' }} · {{ showDevices ? '设备已开' : '设备隐藏' }}</p>
                </div>
              </div>

              <div
                v-if="spatialLoading"
                class="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/28 backdrop-blur-sm"
              >
                <div class="rounded-full border border-white/10 bg-slate-900/82 px-4 py-2 text-sm text-slate-200 shadow-sm">
                  正在同步空间场景…
                </div>
              </div>

              <article
                v-for="room in sceneRooms"
                :key="`room-${room.id}`"
                class="room-shell absolute cursor-grab overflow-hidden rounded-[1.35rem] border transition duration-300 active:cursor-grabbing"
                :class="{ 'is-selected': room.id === selectedRoom?.id }"
                :style="roomToStyle(getRoomView(room))"
                @click="selectRoom(room.id)"
                @pointerdown="beginRoomDrag(getRoomView(room), $event)"
              >
                <div class="room-shell__depth" />
                <div class="room-shell__body">
                  <div class="room-shell__header">
                    <p class="room-shell__title">{{ room.name }}</p>
                    <span class="room-shell__badge">{{ room.devices.length }}</span>
                  </div>
                  <div class="room-shell__metrics">
                    <span>{{ room.ambient_temperature ?? '--' }}°</span>
                    <span>{{ room.ambient_humidity ?? '--' }}%</span>
                    <span>{{ roomOccupancyLabel(room) }}</span>
                  </div>
                </div>
              </article>

              <button
                v-for="device in positionedDevices"
                v-show="showDevices"
                :key="`device-${device.id}`"
                type="button"
                class="device-node absolute transition duration-300"
                :class="{
                  'is-selected': device.id === selectedDevice?.id,
                  'is-active': isActive(device),
                  'is-pending': isDevicePending(device.id),
                }"
                :style="deviceToStyle(device)"
                @click.stop="selectDevice(device)"
                @pointerdown.stop="beginDeviceDrag(device, $event)"
              >
                <span class="device-node__core">
                  {{ deviceGlyph(device) }}
                </span>
                <span class="device-node__label">
                  {{ device.name }}
                </span>
              </button>

              <div class="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex justify-between gap-3">
                <div class="console-bottom-strip">
                  <span>拖拽房间与设备可直接修正 2D 布局</span>
                  <span>{{ lastSyncText }}</span>
                </div>
                <div class="console-bottom-strip console-bottom-strip--compact">
                  <span>当前聚焦</span>
                  <strong>{{ selectedRoomWithDraft?.name || '全屋' }}</strong>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="console-immersive-shell">
            <ImmersiveFloorPlan3D
              :scene="scene"
              :selected-room-id="selectedRoomId"
              :show-heat-layer="showHeatLayer"
              :show-devices="showDevices"
              :spatial-loading="spatialLoading"
              :camera-mode="cameraMode"
              :embedded="true"
              @select-room="$emit('select-room', $event)"
            />
          </div>
        </div>

        <aside class="console-sidebar">
          <div class="console-card console-card--clock">
            <p class="console-card__kicker">系统时间</p>
            <p class="console-clock">{{ currentClockTime }}</p>
            <p class="console-card__meta">{{ currentClockDate }}</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <span class="console-pill" :class="connectionToneClass">{{ connectionLabel }}</span>
              <span class="console-pill">{{ lastSyncText }}</span>
            </div>
          </div>

          <div v-if="selectedRoomWithDraft" class="console-card">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="console-card__kicker">当前房间</p>
                <p class="console-card__title">{{ selectedRoomWithDraft.name }}</p>
              </div>
              <span class="console-card__tag">{{ selectedRoomDevices.length }} 设备</span>
            </div>

            <div class="console-room-grid mt-4">
              <div class="console-room-metric">
                <span class="console-room-metric__label">温度</span>
                <strong>{{ selectedRoomWithDraft.ambient_temperature ?? selectedRoomPrimaryClimate?.current_temperature ?? '--' }}{{ selectedRoomPrimaryClimate?.unit_of_measurement ?? '°C' }}</strong>
              </div>
              <div class="console-room-metric">
                <span class="console-room-metric__label">湿度</span>
                <strong>{{ selectedRoomWithDraft.ambient_humidity ?? '--' }}%</strong>
              </div>
              <div class="console-room-metric">
                <span class="console-room-metric__label">占用</span>
                <strong>{{ roomOccupancyLabel(selectedRoomWithDraft) }}</strong>
              </div>
              <div class="console-room-metric">
                <span class="console-room-metric__label">活跃设备</span>
                <strong>{{ selectedRoomActiveCount }}</strong>
              </div>
            </div>

            <div class="mt-4 grid grid-cols-2 gap-2">
              <label class="console-switch">
                <input
                  v-model="showHeatLayer"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-500 bg-slate-950/10 text-lagoon focus:ring-lagoon"
                >
                热力层
              </label>
              <label class="console-switch">
                <input
                  v-model="showDevices"
                  type="checkbox"
                  class="h-4 w-4 rounded border-slate-500 bg-slate-950/10 text-lagoon focus:ring-lagoon"
                >
                设备点位
              </label>
            </div>
          </div>

          <div class="console-card">
            <p class="console-card__kicker">房间导航</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-for="room in sceneRooms"
                :key="`room-list-${room.id}`"
                type="button"
                class="console-room-pill"
                :class="{ 'is-active': room.id === selectedRoomId }"
                @click="selectRoom(room.id)"
              >
                {{ room.name }}
              </button>
            </div>
          </div>

          <div class="console-card">
            <p class="console-card__kicker">布局与模型</p>
            <p class="console-card__meta mt-2">{{ analysisText }}</p>

            <div class="mt-4 space-y-3">
              <label class="console-upload">
                <span class="console-upload__icon">图</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-white">
                    {{ pendingFloorPlanFile?.name || (sceneZone?.floor_plan_image_path ? '替换当前户型图' : '上传户型图') }}
                  </span>
                  <span class="mt-1 block text-xs text-slate-400">
                    {{ pendingFloorPlanMeta ? `${pendingFloorPlanMeta.width} × ${pendingFloorPlanMeta.height}` : 'PNG / JPG / WEBP' }}
                  </span>
                </span>
                <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="handleFloorPlanSelection">
              </label>

              <div class="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="console-action console-action--primary"
                  :disabled="!pendingFloorPlanFile || !pendingFloorPlanMeta || spatialBusy"
                  @click="submitFloorPlan"
                >
                  上传并分析
                </button>
                <button
                  type="button"
                  class="console-action"
                  :disabled="!sceneZone || spatialBusy"
                  @click="runAutoLayout"
                >
                  重新布局
                </button>
              </div>

              <label class="console-upload">
                <span class="console-upload__icon">模</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-white">
                    {{ pendingSceneModelFile?.name || (sceneZone?.three_d_model_path ? '替换当前 3D 模型' : '导入 GLB / GLTF') }}
                  </span>
                  <span class="mt-1 block text-xs text-slate-400">
                    {{ sceneModelUrl ? `当前模型缩放 ${sceneZone?.three_d_model_scale ?? 1}` : '让 3D 视图直接贴着 2D 基础走' }}
                  </span>
                </span>
                <input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" class="hidden" @change="handleSceneModelSelection">
              </label>

              <div class="grid gap-2 sm:grid-cols-[104px_minmax(0,1fr)]">
                <input v-model.number="pendingSceneModelScale" type="number" min="0.1" step="0.1" class="console-input" placeholder="缩放">
                <button
                  type="button"
                  class="console-action console-action--primary"
                  :disabled="!pendingSceneModelFile || spatialBusy"
                  @click="submitSceneModel"
                >
                  接入 3D 模型
                </button>
              </div>
            </div>

            <label class="console-switch mt-4">
              <input
                v-model="preserveExistingLayout"
                type="checkbox"
                class="h-4 w-4 rounded border-slate-500 bg-slate-950/10 text-lagoon focus:ring-lagoon"
              >
              保留已有布局
            </label>

            <p v-if="uploadMessage" class="mt-3 text-sm text-emerald-300">
              {{ uploadMessage }}
            </p>
          </div>

          <div v-if="selectedDevice" class="console-card">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="console-card__kicker">设备控制</p>
                <p class="console-card__title">{{ selectedDevice.name }}</p>
              </div>
              <span class="console-card__tag">{{ displayState(selectedDevice) }}</span>
            </div>

            <div class="mt-4 grid grid-cols-2 gap-2">
              <input v-model.number="deviceDraft.plan_x" type="number" class="console-input" placeholder="X">
              <input v-model.number="deviceDraft.plan_y" type="number" class="console-input" placeholder="Y">
              <input v-model.number="deviceDraft.plan_z" type="number" class="console-input" placeholder="Z">
              <input v-model.number="deviceDraft.plan_rotation" type="number" class="console-input" placeholder="旋转">
            </div>

            <button
              type="button"
              class="console-action mt-3"
              :disabled="spatialBusy"
              @click="saveDeviceInspector"
            >
              保存设备点位
            </button>

            <button
              v-if="selectedDevice.can_control && (selectedDevice.control_kind === 'toggle' || ['climate', 'media_player'].includes(selectedDevice.entity_domain))"
              type="button"
              class="console-action console-action--primary mt-3"
              :disabled="isDevicePending(selectedDevice.id)"
              @click="handleToggle(selectedDevice)"
            >
              {{ isActive(selectedDevice) ? '关闭设备' : '打开设备' }}
            </button>

            <div
              v-if="(selectedDevice.entity_domain === 'climate' && selectedDevice.target_temperature !== null && selectedDevice.target_temperature !== undefined)
                || (selectedDevice.entity_domain === 'media_player' && selectedDevice.media_volume_level !== null && selectedDevice.media_volume_level !== undefined)
                || selectedDevice.control_kind === 'number'"
              class="mt-4"
            >
              <div class="mb-2 flex items-center justify-between text-sm text-slate-300">
                <span>{{ selectedDevice.entity_domain === 'media_player' ? '音量' : '数值控制' }}</span>
                <span>{{ numericDrafts[selectedDevice.id] }}{{ sliderRange(selectedDevice).unit }}</span>
              </div>
              <input
                :value="numericDrafts[selectedDevice.id]"
                type="range"
                class="console-range"
                :min="sliderRange(selectedDevice).min"
                :max="sliderRange(selectedDevice).max"
                :step="sliderRange(selectedDevice).step"
                :disabled="isDevicePending(selectedDevice.id)"
                @input="handleInspectorSliderInput(selectedDevice.id, $event.target.value)"
                @change="handleNumberChange(selectedDevice, $event)"
              >
            </div>

            <div v-if="selectOptions(selectedDevice).length" class="mt-4">
              <select
                :value="selectDrafts[selectedDevice.id]"
                class="console-input"
                :disabled="isDevicePending(selectedDevice.id)"
                @change="handleSelectChange(selectedDevice, $event)"
              >
                <option
                  v-for="option in selectOptions(selectedDevice)"
                  :key="option"
                  :value="option"
                >
                  {{ option }}
                </option>
              </select>
            </div>
          </div>

          <div class="console-card">
            <p class="console-card__kicker">手动增加设备</p>
            <div class="mt-4 space-y-3">
              <select v-model.number="manualDeviceForm.room_id" class="console-input">
                <option
                  v-for="room in sceneRooms"
                  :key="room.id"
                  :value="room.id"
                >
                  {{ room.name }}
                </option>
              </select>
              <input v-model="manualDeviceForm.name" type="text" class="console-input" placeholder="例如：岛台吊灯、次卧空调">
              <select v-model="manualDeviceForm.device_type" class="console-input">
                <option
                  v-for="option in DEVICE_TYPE_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <input v-model="manualDeviceForm.ha_entity_id" type="text" class="console-input" placeholder="例如：light.island_lamp">
            </div>

            <button
              type="button"
              class="console-action console-action--primary mt-4"
              :disabled="spatialBusy || !manualDeviceForm.name.trim() || !manualDeviceForm.room_id"
              @click="createManualDevice"
            >
              添加到空间图
            </button>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<style scoped>
.console-shell {
  position: relative;
  overflow: hidden;
  border-radius: 2rem;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    radial-gradient(circle at top, rgba(59, 130, 246, 0.12), transparent 30%),
    linear-gradient(180deg, rgba(14, 19, 36, 0.98), rgba(16, 22, 40, 0.94));
  padding: 1.25rem;
  box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
}

.console-topbar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.console-kicker {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: rgba(125, 211, 252, 0.82);
}

.console-title {
  margin-top: 0.65rem;
  font-size: clamp(1.9rem, 2vw + 1.35rem, 3rem);
  line-height: 0.95;
  color: rgba(248, 250, 252, 0.98);
}

.console-subtitle {
  margin-top: 0.85rem;
  max-width: 48rem;
  color: rgba(203, 213, 225, 0.78);
  line-height: 1.75;
  font-size: 0.96rem;
}

.console-pill,
.console-mode,
.console-card__tag,
.console-room-pill,
.console-action,
.console-input,
.console-switch,
.console-upload {
  backdrop-filter: blur(18px);
}

.console-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  padding: 0.5rem 0.85rem;
  color: rgba(226, 232, 240, 0.88);
  font-size: 0.78rem;
}

.console-mode {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.58rem 1rem;
  color: rgba(191, 219, 254, 0.9);
  font-size: 0.86rem;
  font-weight: 600;
  transition: all 180ms ease;
}

.console-mode.is-active {
  border-color: rgba(125, 211, 252, 0.36);
  background: linear-gradient(180deg, rgba(30, 64, 175, 0.62), rgba(12, 110, 115, 0.54));
  color: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 30px rgba(8, 47, 73, 0.28);
}

.console-alert {
  border-radius: 1.2rem;
  border: 1px solid rgba(251, 113, 133, 0.25);
  background: rgba(127, 29, 29, 0.24);
  padding: 0.9rem 1rem;
  color: rgba(254, 205, 211, 0.95);
}

.console-grid {
  display: grid;
  gap: 1rem;
}

.console-stage-panel,
.console-sidebar {
  min-width: 0;
}

.console-stage-panel {
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
}

.console-stage-header,
.console-card {
  border-radius: 1.55rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(18, 25, 46, 0.88), rgba(17, 24, 40, 0.8));
  padding: 1rem;
  box-shadow: 0 22px 54px rgba(3, 7, 18, 0.22);
}

.console-stage-header {
  display: grid;
  gap: 1rem;
}

.console-stage-header__eyebrow,
.console-card__kicker,
.console-stat__label,
.console-room-metric__label {
  font-size: 0.68rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.72);
}

.console-stage-header__title,
.console-card__title {
  margin-top: 0.45rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: rgba(248, 250, 252, 0.98);
}

.console-stage-header__summary,
.console-card__meta {
  color: rgba(191, 219, 254, 0.7);
  line-height: 1.7;
  font-size: 0.88rem;
}

.console-stat {
  border-radius: 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.75rem 0.85rem;
}

.console-stat__value {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.98);
}

.console-map-shell,
.console-immersive-shell {
  border-radius: 1.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(15, 22, 38, 0.92), rgba(20, 30, 49, 0.88));
  padding: 0.75rem;
}

.console-map {
  overflow: hidden;
  border-radius: 1.4rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(30, 41, 59, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.console-map__placeholder {
  background: radial-gradient(circle at 30% 20%, rgba(30, 41, 59, 0.86), rgba(15, 23, 42, 0.96));
}

.console-map__glow {
  background:
    radial-gradient(circle at 16% 24%, rgba(96, 165, 250, 0.14), transparent 24%),
    radial-gradient(circle at 78% 18%, rgba(56, 189, 248, 0.08), transparent 18%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.01));
}

.console-map__grid {
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
  background-size: 42px 42px;
  mix-blend-mode: screen;
}

.console-bottom-strip {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(2, 6, 23, 0.56);
  padding: 0.65rem 0.95rem;
  color: rgba(226, 232, 240, 0.82);
  font-size: 0.8rem;
}

.console-bottom-strip--compact {
  gap: 0.45rem;
}

.console-immersive-shell :deep(section) {
  background: transparent;
  border: 0;
  box-shadow: none;
  padding: 0;
}

.console-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
}

.console-card--clock {
  background:
    radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 40%),
    linear-gradient(180deg, rgba(17, 24, 39, 0.94), rgba(16, 24, 40, 0.84));
}

.console-clock {
  margin-top: 0.5rem;
  font-size: clamp(2rem, 2vw + 1rem, 3rem);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: rgba(248, 250, 252, 0.98);
}

.console-card__tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.18);
  background: rgba(14, 165, 233, 0.1);
  padding: 0.45rem 0.75rem;
  color: rgba(186, 230, 253, 0.96);
  font-size: 0.74rem;
}

.console-room-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.console-room-metric {
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.8rem 0.85rem;
  color: rgba(248, 250, 252, 0.95);
}

.console-room-metric strong {
  display: block;
  margin-top: 0.35rem;
  font-size: 1rem;
}

.console-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.75rem 0.9rem;
  color: rgba(226, 232, 240, 0.88);
  font-size: 0.86rem;
}

.console-room-pill {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.5rem 0.85rem;
  color: rgba(226, 232, 240, 0.88);
  font-size: 0.84rem;
  transition: all 180ms ease;
}

.console-room-pill.is-active {
  border-color: rgba(125, 211, 252, 0.3);
  background: rgba(14, 165, 233, 0.18);
  color: rgba(240, 249, 255, 0.98);
}

.console-upload {
  display: flex;
  min-height: 4rem;
  cursor: pointer;
  align-items: center;
  gap: 0.8rem;
  border-radius: 1.15rem;
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.03);
  padding: 0.85rem 0.95rem;
  color: rgba(226, 232, 240, 0.9);
}

.console-upload__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 0.95rem;
  background: rgba(125, 211, 252, 0.14);
  color: rgba(186, 230, 253, 0.96);
  font-weight: 700;
}

.console-action {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.85rem 1rem;
  color: rgba(226, 232, 240, 0.96);
  font-weight: 600;
  transition: all 180ms ease;
}

.console-action--primary {
  border-color: rgba(56, 189, 248, 0.24);
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.48), rgba(8, 47, 73, 0.9));
}

.console-action:disabled {
  opacity: 0.46;
  cursor: not-allowed;
}

.console-input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(248, 250, 252, 0.96);
  padding: 0.78rem 0.9rem;
  outline: none;
}

.console-range {
  width: 100%;
  height: 0.5rem;
  cursor: pointer;
  appearance: none;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.28);
}

.room-shell {
  transform-origin: center;
  border-color: var(--room-outline);
}

.room-shell__depth {
  position: absolute;
  inset: 0.3rem;
  border-radius: 1.1rem;
  background: color-mix(in srgb, var(--room-heat-glow) 64%, rgba(15, 23, 42, 0.08));
  opacity: 0.38;
  filter: blur(12px);
}

.room-shell__body {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 1.18rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--room-heat) 68%, rgba(15, 23, 42, 0.32)), rgba(15, 23, 42, 0.18)),
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
  padding: 0.75rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.room-shell.is-selected {
  z-index: 18;
}

.room-shell.is-selected .room-shell__body {
  border-color: rgba(255, 255, 255, 0.34);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 14px 36px rgba(15, 23, 42, 0.28);
}

.room-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.room-shell__title {
  font-size: 0.92rem;
  font-weight: 700;
  color: rgba(248, 250, 252, 0.95);
}

.room-shell__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  height: 1.6rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.72rem;
}

.room-shell__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.room-shell__metrics span {
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.34);
  padding: 0.28rem 0.48rem;
  color: rgba(226, 232, 240, 0.86);
  font-size: 0.68rem;
}

.device-node {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 2.4rem;
}

.device-node__core {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.26);
  color: rgb(15 23 42);
  font-size: 0.72rem;
  font-weight: 700;
}

.device-node__label {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(248, 250, 252, 0.9);
  font-size: 0.68rem;
  line-height: 1;
  padding: 0.35rem 0.55rem;
  max-width: 8.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transform: translateX(-0.2rem);
  transition: opacity 180ms ease, transform 180ms ease;
}

.device-node:hover .device-node__label,
.device-node.is-selected .device-node__label {
  opacity: 1;
  transform: translateX(0);
}

.device-node.is-active .device-node__core {
  background: linear-gradient(180deg, rgba(250, 204, 21, 0.98), rgba(234, 179, 8, 0.92));
  color: rgb(17 24 39);
}

.device-node.is-selected .device-node__core {
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.2), 0 14px 24px rgba(15, 23, 42, 0.3);
}

.device-node.is-pending .device-node__core {
  animation: pulse 1.3s infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.08);
  }
}

@media (min-width: 1100px) {
  .console-grid {
    grid-template-columns: minmax(0, 1.55fr) 22rem;
  }

  .console-stage-header {
    grid-template-columns: minmax(0, 1fr) 18rem;
    align-items: start;
  }
}

@media (max-width: 767px) {
  .console-shell {
    padding: 1rem;
  }

  .console-mode {
    flex: 1 1 calc(50% - 0.5rem);
    justify-content: center;
  }

  .device-node__label {
    display: none;
  }

  .console-room-grid {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
