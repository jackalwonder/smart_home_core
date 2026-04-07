<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

import { useSmartHomeStore } from '../stores/smartHome'

const props = defineProps({
  scene: {
    type: Object,
    default: () => ({ zone: null, rooms: [] }),
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
const selectedDeviceId = ref(null)
const showHeatLayer = ref(true)
const showDevices = ref(true)
const preserveExistingLayout = ref(true)
const pendingFloorPlanFile = ref(null)
const pendingFloorPlanMeta = ref(null)
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
const sceneRooms = computed(() => props.scene?.rooms ?? [])
const planWidth = computed(() => sceneZone.value?.floor_plan_image_width ?? 1600)
const planHeight = computed(() => sceneZone.value?.floor_plan_image_height ?? 960)
const planImageUrl = computed(() => smartHomeStore.resolveAssetUrl(sceneZone.value?.floor_plan_image_path || ''))

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

const analysisText = computed(() =>
  sceneZone.value?.floor_plan_analysis
    || '上传户型图后，系统会先按房间名称和画布比例生成初始布局，然后允许继续拖拽和精修。',
)

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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
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
})
</script>

<template>
  <section class="px-4 pb-4 sm:px-5 sm:pb-5 xl:px-8 xl:pb-8">
    <div class="relative overflow-hidden rounded-[2.1rem] border border-white/70 bg-gradient-to-br from-white/94 via-white/88 to-stone-50/72 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute left-[-4rem] top-[-3rem] h-48 w-48 rounded-full bg-lagoon/10 blur-3xl" />
        <div class="absolute right-[-5rem] top-[20%] h-56 w-56 rounded-full bg-sky-200/24 blur-3xl" />
        <div class="absolute bottom-[-4rem] left-[32%] h-48 w-48 rounded-full bg-amber-200/18 blur-3xl" />
      </div>

      <div class="relative">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div class="max-w-3xl">
            <p class="text-xs font-semibold uppercase tracking-[0.34em] text-lagoon sm:text-sm">Floorplan Studio</p>
            <h2 class="font-display mt-3 text-[2.1rem] leading-[0.96] text-ink sm:text-[2.6rem]">真实户型空间工作台</h2>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
              这里把上传户型图、空间热力层、设备点位和直接控制合到一块。你可以先让系统给出初始布局，再继续拖拽、加设备、修正坐标。
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
            <div class="control-surface rounded-[1.4rem] px-4 py-4">
              <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">已布房间</p>
              <p class="mt-2 text-2xl font-semibold text-ink">{{ placedRoomCount }}</p>
            </div>
            <div class="control-surface rounded-[1.4rem] px-4 py-4">
              <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">设备点位</p>
              <p class="mt-2 text-2xl font-semibold text-ink">{{ placedDeviceCount }}</p>
            </div>
            <div class="control-surface rounded-[1.4rem] px-4 py-4">
              <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">可直接控制</p>
              <p class="mt-2 text-2xl font-semibold text-ink">{{ controllableDeviceCount }}</p>
            </div>
          </div>
        </div>

        <div
          v-if="spatialError || actionError"
          class="mt-5 rounded-[1.6rem] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm"
        >
          {{ spatialError || actionError }}
        </div>

        <div class="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <div class="space-y-4">
            <div class="glass-soft rounded-[1.8rem] p-4 sm:p-5">
              <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div class="max-w-3xl">
                  <p class="text-[11px] uppercase tracking-[0.28em] text-slate-500">分析结果</p>
                  <p class="mt-3 text-sm leading-6 text-slate-500">
                    {{ analysisText }}
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <label class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white/78 px-3 py-2 text-sm text-slate-600">
                    <input
                      v-model="showHeatLayer"
                      type="checkbox"
                      class="h-4 w-4 rounded border-slate-300 text-lagoon focus:ring-lagoon"
                    >
                    热力层
                  </label>
                  <label class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white/78 px-3 py-2 text-sm text-slate-600">
                    <input
                      v-model="showDevices"
                      type="checkbox"
                      class="h-4 w-4 rounded border-slate-300 text-lagoon focus:ring-lagoon"
                    >
                    设备点位
                  </label>
                  <label class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white/78 px-3 py-2 text-sm text-slate-600">
                    <input
                      v-model="preserveExistingLayout"
                      type="checkbox"
                      class="h-4 w-4 rounded border-slate-300 text-lagoon focus:ring-lagoon"
                    >
                    保留已有布局
                  </label>
                </div>
              </div>

              <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label class="flex min-h-[4.1rem] cursor-pointer items-center gap-3 rounded-[1.4rem] border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-600 hover:border-lagoon/40">
                  <span class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-lagoon/10 text-lagoon">图</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium text-ink">
                      {{ pendingFloorPlanFile?.name || (sceneZone?.floor_plan_image_path ? '替换当前户型图' : '上传你的户型图') }}
                    </span>
                    <span class="mt-1 block text-xs text-slate-500">
                      {{ pendingFloorPlanMeta ? `${pendingFloorPlanMeta.width} × ${pendingFloorPlanMeta.height}` : '支持 PNG / JPG / WEBP' }}
                    </span>
                  </span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="handleFloorPlanSelection">
                </label>

                <button
                  type="button"
                  class="rounded-[1.4rem] bg-lagoon px-5 py-3 text-sm font-semibold text-white transition hover:bg-lagoon/90 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="!pendingFloorPlanFile || !pendingFloorPlanMeta || spatialBusy"
                  @click="submitFloorPlan"
                >
                  上传并分析
                </button>

                <button
                  type="button"
                  class="rounded-[1.4rem] border border-slate-200 bg-white/84 px-5 py-3 text-sm font-semibold text-ink transition hover:border-lagoon/30 hover:text-lagoon disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="!sceneZone || spatialBusy"
                  @click="runAutoLayout"
                >
                  重新自动布局
                </button>
              </div>

              <p v-if="uploadMessage" class="mt-3 text-sm text-lagoon">
                {{ uploadMessage }}
              </p>
            </div>

            <div class="studio-surface overflow-hidden rounded-[2rem] border border-white/70 bg-[#f7f6f1] p-3 shadow-sm sm:p-4">
              <div
                ref="viewportRef"
                class="studio-viewport relative overflow-hidden rounded-[1.7rem] border border-white/70 bg-[#f1efe7]"
                :style="{ aspectRatio: `${planWidth} / ${planHeight}` }"
              >
                <img
                  v-if="planImageUrl"
                  :src="planImageUrl"
                  alt="上传后的户型图"
                  class="absolute inset-0 h-full w-full object-cover opacity-92"
                >

                <div class="studio-viewport__grid absolute inset-0" />
                <div class="studio-viewport__wash absolute inset-0" />

                <div
                  v-if="spatialLoading"
                  class="absolute inset-0 z-30 flex items-center justify-center bg-white/55 backdrop-blur-sm"
                >
                  <div class="rounded-full border border-white/80 bg-white/85 px-4 py-2 text-sm text-slate-600 shadow-sm">
                    正在同步空间场景…
                  </div>
                </div>

                <article
                  v-for="room in sceneRooms"
                  :key="`room-${room.id}`"
                  class="room-shell absolute cursor-grab overflow-hidden rounded-[1.65rem] border transition duration-300 active:cursor-grabbing"
                  :class="{ 'is-selected': room.id === selectedRoom?.id }"
                  :style="roomToStyle(getRoomView(room))"
                  @click="selectRoom(room.id)"
                  @pointerdown="beginRoomDrag(getRoomView(room), $event)"
                >
                  <div class="room-shell__depth" />
                  <div class="room-shell__body">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-ink sm:text-base">{{ room.name }}</p>
                        <p class="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">{{ room.zone.name }}</p>
                      </div>
                      <span class="rounded-full bg-white/82 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-slate-500">
                        {{ room.devices.length }} 设
                      </span>
                    </div>

                    <div class="mt-3 grid grid-cols-3 gap-2">
                      <div class="room-chip">
                        <p class="room-chip__label">温度</p>
                        <p class="room-chip__value">{{ room.ambient_temperature ?? '--' }}</p>
                      </div>
                      <div class="room-chip">
                        <p class="room-chip__label">湿度</p>
                        <p class="room-chip__value">{{ room.ambient_humidity ?? '--' }}</p>
                      </div>
                      <div class="room-chip">
                        <p class="room-chip__label">占用</p>
                        <p class="room-chip__value">{{ roomOccupancyLabel(room) }}</p>
                      </div>
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
              </div>
            </div>

            <div class="grid gap-4 md:grid-cols-3">
              <div class="glass-soft rounded-[1.7rem] px-4 py-4">
                <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">当前画布</p>
                <p class="mt-2 text-lg font-semibold text-ink">{{ planWidth }} × {{ planHeight }}</p>
                <p class="mt-2 text-sm text-slate-500">上传图片后会按真实画布比例渲染，坐标也跟着落地保存。</p>
              </div>
              <div class="glass-soft rounded-[1.7rem] px-4 py-4">
                <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">新增设备策略</p>
                <p class="mt-2 text-lg font-semibold text-ink">自动补位</p>
                <p class="mt-2 text-sm text-slate-500">后续从 Home Assistant 新同步来的设备，如果还没有坐标，会按房间自动补到空间图里。</p>
              </div>
              <div class="glass-soft rounded-[1.7rem] px-4 py-4">
                <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">拖拽方式</p>
                <p class="mt-2 text-lg font-semibold text-ink">房间与设备都可拖</p>
                <p class="mt-2 text-sm text-slate-500">房间支持整体移动，设备支持在房间内部重新定位，右侧还能精确输入坐标。</p>
              </div>
            </div>
          </div>

          <aside class="glass-soft flex max-h-[calc(100vh-10rem)] min-h-[32rem] flex-col overflow-hidden rounded-[2rem]">
            <div class="border-b border-slate-200/80 px-5 py-5">
              <p class="text-[11px] uppercase tracking-[0.28em] text-lagoon">Inspector</p>
              <h3 class="font-display mt-3 text-[2rem] leading-none text-ink">空间编辑器</h3>
              <p class="mt-3 text-sm leading-6 text-slate-500">
                先选房间，再选设备。这里可以精修坐标尺寸，也能直接从空间图发出控制。
              </p>
            </div>

            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <section v-if="selectedRoomWithDraft" class="rounded-[1.7rem] border border-slate-200 bg-white/74 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-ink">房间布局</p>
                    <p class="mt-1 text-sm text-slate-500">{{ selectedRoomWithDraft.name }} · {{ selectedRoomWithDraft.zone.name }}</p>
                  </div>
                  <span class="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    {{ selectedRoomWithDraft.devices.length }} 设备
                  </span>
                </div>

                <div class="mt-4 grid grid-cols-2 gap-3">
                  <label class="space-y-2 text-sm text-slate-500">
                    <span>X</span>
                    <input v-model.number="roomDraft.plan_x" type="number" class="inspector-input">
                  </label>
                  <label class="space-y-2 text-sm text-slate-500">
                    <span>Y</span>
                    <input v-model.number="roomDraft.plan_y" type="number" class="inspector-input">
                  </label>
                  <label class="space-y-2 text-sm text-slate-500">
                    <span>宽度</span>
                    <input v-model.number="roomDraft.plan_width" type="number" class="inspector-input">
                  </label>
                  <label class="space-y-2 text-sm text-slate-500">
                    <span>高度</span>
                    <input v-model.number="roomDraft.plan_height" type="number" class="inspector-input">
                  </label>
                </div>

                <label class="mt-3 block space-y-2 text-sm text-slate-500">
                  <span>旋转角度</span>
                  <input v-model.number="roomDraft.plan_rotation" type="number" class="inspector-input">
                </label>

                <button
                  type="button"
                  class="mt-4 w-full rounded-[1.2rem] bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink/92 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="spatialBusy"
                  @click="saveRoomInspector"
                >
                  保存房间坐标
                </button>
              </section>

              <section v-if="selectedDevice" class="rounded-[1.7rem] border border-slate-200 bg-white/74 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-semibold text-ink">设备点位与控制</p>
                    <p class="mt-1 text-sm text-slate-500">{{ selectedDevice.name }} · {{ selectedDevice.room.name }}</p>
                  </div>
                  <span
                    class="rounded-full px-3 py-1 text-xs font-semibold"
                    :class="isActive(selectedDevice) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                  >
                    {{ displayState(selectedDevice) }}
                  </span>
                </div>

                <div class="mt-4 grid grid-cols-2 gap-3">
                  <label class="space-y-2 text-sm text-slate-500">
                    <span>X</span>
                    <input v-model.number="deviceDraft.plan_x" type="number" class="inspector-input">
                  </label>
                  <label class="space-y-2 text-sm text-slate-500">
                    <span>Y</span>
                    <input v-model.number="deviceDraft.plan_y" type="number" class="inspector-input">
                  </label>
                  <label class="space-y-2 text-sm text-slate-500">
                    <span>Z</span>
                    <input v-model.number="deviceDraft.plan_z" type="number" class="inspector-input">
                  </label>
                  <label class="space-y-2 text-sm text-slate-500">
                    <span>旋转</span>
                    <input v-model.number="deviceDraft.plan_rotation" type="number" class="inspector-input">
                  </label>
                </div>

                <button
                  type="button"
                  class="mt-4 w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-ink transition hover:border-lagoon/30 hover:text-lagoon disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="spatialBusy"
                  @click="saveDeviceInspector"
                >
                  保存设备点位
                </button>

                <div class="mt-4 rounded-[1.4rem] border border-slate-200/80 bg-slate-50/80 p-4">
                  <p class="text-sm font-semibold text-ink">直接控制</p>
                  <div class="mt-3 space-y-3">
                    <button
                      v-if="selectedDevice.can_control && (selectedDevice.control_kind === 'toggle' || ['climate', 'media_player'].includes(selectedDevice.entity_domain))"
                      type="button"
                      class="w-full rounded-[1.1rem] bg-lagoon px-4 py-3 text-sm font-semibold text-white transition hover:bg-lagoon/90 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="isDevicePending(selectedDevice.id)"
                      @click="handleToggle(selectedDevice)"
                    >
                      {{ isActive(selectedDevice) ? '关闭设备' : '打开设备' }}
                    </button>

                    <div
                      v-if="(selectedDevice.entity_domain === 'climate' && selectedDevice.target_temperature !== null && selectedDevice.target_temperature !== undefined)
                        || (selectedDevice.entity_domain === 'media_player' && selectedDevice.media_volume_level !== null && selectedDevice.media_volume_level !== undefined)
                        || selectedDevice.control_kind === 'number'"
                      class="space-y-2"
                    >
                      <div class="flex items-center justify-between text-sm text-slate-500">
                        <span>{{ selectedDevice.entity_domain === 'media_player' ? '音量' : '数值控制' }}</span>
                        <span class="font-medium text-ink">
                          {{ numericDrafts[selectedDevice.id] }}
                          {{ sliderRange(selectedDevice).unit }}
                        </span>
                      </div>
                      <input
                        :value="numericDrafts[selectedDevice.id]"
                        type="range"
                        class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
                        :min="sliderRange(selectedDevice).min"
                        :max="sliderRange(selectedDevice).max"
                        :step="sliderRange(selectedDevice).step"
                        :disabled="isDevicePending(selectedDevice.id)"
                        @input="handleInspectorSliderInput(selectedDevice.id, $event.target.value)"
                        @change="handleNumberChange(selectedDevice, $event)"
                      >
                    </div>

                    <div v-if="selectOptions(selectedDevice).length" class="space-y-2">
                      <p class="text-sm text-slate-500">模式 / 来源</p>
                      <select
                        :value="selectDrafts[selectedDevice.id]"
                        class="inspector-input"
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

                    <button
                      v-if="selectedDevice.control_kind === 'button'"
                      type="button"
                      class="w-full rounded-[1.1rem] bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink/92 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="isDevicePending(selectedDevice.id)"
                      @click="handleButtonPress(selectedDevice)"
                    >
                      执行动作
                    </button>
                  </div>
                </div>
              </section>

              <section class="rounded-[1.7rem] border border-slate-200 bg-white/74 p-4">
                <p class="text-sm font-semibold text-ink">手动增加设备</p>
                <p class="mt-1 text-sm text-slate-500">
                  这里可以先把计划中的设备放进户型图。即便暂时还没接入 Home Assistant，也会先显示为点位。
                </p>

                <div class="mt-4 space-y-3">
                  <label class="block space-y-2 text-sm text-slate-500">
                    <span>所属房间</span>
                    <select v-model.number="manualDeviceForm.room_id" class="inspector-input">
                      <option
                        v-for="room in sceneRooms"
                        :key="room.id"
                        :value="room.id"
                      >
                        {{ room.name }}
                      </option>
                    </select>
                  </label>

                  <label class="block space-y-2 text-sm text-slate-500">
                    <span>设备名称</span>
                    <input v-model="manualDeviceForm.name" type="text" class="inspector-input" placeholder="例如：岛台吊灯、次卧空调">
                  </label>

                  <label class="block space-y-2 text-sm text-slate-500">
                    <span>设备类型</span>
                    <select v-model="manualDeviceForm.device_type" class="inspector-input">
                      <option
                        v-for="option in DEVICE_TYPE_OPTIONS"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>

                  <label class="block space-y-2 text-sm text-slate-500">
                    <span>实体 ID（可选）</span>
                    <input v-model="manualDeviceForm.ha_entity_id" type="text" class="inspector-input" placeholder="例如：light.island_lamp">
                  </label>
                </div>

                <button
                  type="button"
                  class="mt-4 w-full rounded-[1.2rem] bg-auric px-4 py-3 text-sm font-semibold text-white transition hover:bg-auric/90 disabled:cursor-not-allowed disabled:opacity-60"
                  :disabled="spatialBusy || !manualDeviceForm.name.trim() || !manualDeviceForm.room_id"
                  @click="createManualDevice"
                >
                  添加到空间图
                </button>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.studio-surface {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(244, 239, 229, 0.92));
}

.studio-viewport__grid {
  background-image:
    linear-gradient(rgba(39, 53, 76, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(39, 53, 76, 0.08) 1px, transparent 1px);
  background-size: 54px 54px;
  mix-blend-mode: multiply;
}

.studio-viewport__wash {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.05)),
    radial-gradient(circle at 16% 18%, rgba(255, 255, 255, 0.54), transparent 22%),
    radial-gradient(circle at 84% 24%, rgba(255, 255, 255, 0.3), transparent 20%);
}

.room-shell {
  border-color: var(--room-outline);
  box-shadow: 0 22px 40px rgba(15, 23, 42, 0.14);
  transform-origin: center;
}

.room-shell__depth {
  position: absolute;
  inset: 0.55rem 0.4rem -0.55rem 0.6rem;
  border-radius: 1.35rem;
  background: linear-gradient(180deg, color-mix(in srgb, var(--room-heat-glow) 70%, rgba(22, 28, 45, 0.14)), rgba(21, 31, 47, 0.08));
  opacity: 0.78;
  transform: translateY(0.75rem) skewX(-6deg);
  filter: blur(12px);
}

.room-shell__body {
  position: relative;
  height: 100%;
  border-radius: 1.45rem;
  border: 1px solid rgba(255, 255, 255, 0.88);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--room-heat) 68%, rgba(255, 255, 255, 0.78)), rgba(255, 255, 255, 0.78) 72%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(250, 247, 240, 0.74));
  backdrop-filter: blur(16px);
  padding: 0.9rem;
}

.room-shell.is-selected {
  z-index: 18;
}

.room-shell.is-selected .room-shell__body {
  box-shadow:
    0 26px 48px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.96);
}

.room-chip {
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(255, 255, 255, 0.84);
  padding: 0.55rem 0.65rem;
}

.room-chip__label {
  color: rgb(100 116 139);
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.room-chip__value {
  color: rgb(15 23 42);
  font-size: 0.95rem;
  font-weight: 600;
  margin-top: 0.2rem;
}

.device-node {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 2.8rem;
}

.device-node__core {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.96);
  box-shadow: 0 16px 24px rgba(15, 23, 42, 0.18);
  color: rgb(15 23 42);
  font-size: 0.72rem;
  font-weight: 700;
}

.device-node__label {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.95);
  color: rgb(51 65 85);
  font-size: 0.72rem;
  line-height: 1;
  padding: 0.42rem 0.62rem;
  max-width: 11rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.device-node.is-active .device-node__core {
  background: linear-gradient(180deg, rgba(12, 110, 115, 0.96), rgba(17, 132, 139, 0.92));
  color: white;
}

.device-node.is-selected .device-node__label {
  border-color: rgba(12, 110, 115, 0.32);
  color: rgb(12 110 115);
}

.device-node.is-pending .device-node__core {
  animation: pulse 1.3s infinite;
}

.inspector-input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  background: rgba(255, 255, 255, 0.92);
  color: rgb(15 23 42);
  outline: none;
  padding: 0.78rem 0.95rem;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.inspector-input:focus {
  border-color: rgba(12, 110, 115, 0.42);
  box-shadow: 0 0 0 3px rgba(12, 110, 115, 0.1);
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.08);
  }
}

@media (max-width: 767px) {
  .device-node__label {
    display: none;
  }

  .room-shell__body {
    padding: 0.75rem;
  }

  .room-chip__value {
    font-size: 0.82rem;
  }
}
</style>
