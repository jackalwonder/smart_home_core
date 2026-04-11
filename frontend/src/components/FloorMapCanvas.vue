<script setup>
import { computed } from 'vue'

import { useAmbientState } from '../composables/useAmbientState'
import { useRoomTransitionOrchestration } from '../composables/useRoomTransitionOrchestration'
import { useVisualPriority } from '../composables/useVisualPriority'
import { useSmartHomeStore } from '../stores/smartHome'
import { groupDevices } from '../utils/deviceGrouping'
import FloorMapAmbientLayer from './FloorMapAmbientLayer.vue'
import FloorMapDeviceLayer from './FloorMapDeviceLayer.vue'
import FloorMapEditorOverlay from './FloorMapEditorOverlay.vue'
import FloorMapRoomLayer from './FloorMapRoomLayer.vue'
import {
  buildFloorMapModel,
  formatRoomAmbient,
  getDevicePrimaryMetric,
  isDeviceActive,
  isDeviceOffline,
} from '../utils/floorMap'

const props = defineProps({
  rooms: {
    type: Array,
    default: () => [],
  },
  selectedRoomId: {
    type: [Number, String],
    default: null,
  },
  selectedDeviceId: {
    type: [Number, String],
    default: null,
  },
  pendingDeviceIds: {
    type: Array,
    default: () => [],
  },
  showSensors: {
    type: Boolean,
    default: true,
  },
  editorEnabled: {
    type: Boolean,
    default: false,
  },
  editorDraft: {
    type: Object,
    default: () => ({
      roomDrafts: {},
      deviceDrafts: {},
    }),
  },
  editorSelectedRoomId: {
    type: [Number, String],
    default: null,
  },
  editorSelectedDeviceId: {
    type: [Number, String],
    default: null,
  },
  editorSelectedOpeningIndex: {
    type: Number,
    default: null,
  },
})

const emit = defineEmits([
  'select-room',
  'quick-action',
  'open-device',
  'editor-select-room',
  'editor-select-device',
  'editor-select-opening',
  'editor-update-room-frame',
  'editor-update-device-position',
  'editor-update-opening',
])

const smartHomeStore = useSmartHomeStore()
const VIEWBOX_WIDTH = 1000
const VIEWBOX_HEIGHT = 660
const LAYOUT_PADDING = 44

const roomModels = computed(() =>
  buildFloorMapModel(props.rooms, props.pendingDeviceIds, {
    roomDrafts: props.editorDraft?.roomDrafts ?? {},
    deviceDrafts: props.editorDraft?.deviceDrafts ?? {},
  }),
)

const { roomPriorityById, devicePriorityById } = useVisualPriority(
  roomModels,
  computed(() => smartHomeStore.visualActivity),
  computed(() => props.pendingDeviceIds),
  computed(() => props.selectedRoomId),
)

const { roomTransitionById, deviceTransitionById } = useRoomTransitionOrchestration(
  roomModels,
  roomPriorityById,
  devicePriorityById,
  computed(() => smartHomeStore.visualActivity),
)

const { ambientByRoomId } = useAmbientState(roomModels, roomPriorityById)

function resolveAggregateMetric(devices) {
  const temperatureDevice = devices.find((device) => device.device_class === 'temperature' && device.raw_state !== null && device.raw_state !== undefined)
  if (temperatureDevice) {
    return getDevicePrimaryMetric(temperatureDevice)
  }

  const climateDevice = devices.find((device) => device.entity_domain === 'climate')
  if (climateDevice) {
    return getDevicePrimaryMetric(climateDevice)
  }

  const primaryControl = devices.find((device) => device.can_control)
  if (primaryControl) {
    return getDevicePrimaryMetric(primaryControl)
  }

  return getDevicePrimaryMetric(devices[0] ?? null)
}

function buildStageDevices(room) {
  return groupDevices(room.devices).map((group) => {
    if (!group.isAggregate) {
      return group.devices
    }

    const primaryDevice = group.devices.find((device) => device.can_control) ?? group.devices[0] ?? null
    if (!primaryDevice) {
      return []
    }

    const count = group.devices.length
    const averageX = group.devices.reduce((sum, device) => sum + Number(device.position?.x ?? 0), 0) / count
    const averageY = group.devices.reduce((sum, device) => sum + Number(device.position?.y ?? 0), 0) / count

    return [{
      ...primaryDevice,
      name: group.title,
      position: { x: averageX, y: averageY },
      isAggregate: true,
      aggregateKey: group.key,
      applianceType: group.applianceType,
      primaryDeviceId: primaryDevice.id,
      devices: group.devices,
      active: group.devices.some(isDeviceActive),
      offline: group.devices.every(isDeviceOffline),
      pending: group.devices.some((device) => props.pendingDeviceIds.includes(device.id)),
      displayMetric: resolveAggregateMetric(group.devices),
    }]
  }).flat()
}

const deviceRenderRooms = computed(() =>
  roomModels.value.map((room) => ({
    ...room,
    devices: buildStageDevices({
      ...room,
      devices: props.showSensors ? room.devices : room.devices.filter((device) => device.can_control),
    }),
  })),
)

const aggregateStageDevices = computed(() =>
  deviceRenderRooms.value.flatMap((room) =>
    room.devices
      .filter((device) => device.isAggregate)
      .map((device) => ({ ...device, room })),
  ),
)

const layoutBounds = computed(() => {
  if (roomModels.value.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: VIEWBOX_WIDTH,
      maxY: VIEWBOX_HEIGHT,
      width: VIEWBOX_WIDTH,
      height: VIEWBOX_HEIGHT,
    }
  }

  const minX = Math.min(...roomModels.value.map((room) => room.frame.x))
  const minY = Math.min(...roomModels.value.map((room) => room.frame.y))
  const maxX = Math.max(...roomModels.value.map((room) => room.frame.x + room.frame.width))
  const maxY = Math.max(...roomModels.value.map((room) => room.frame.y + room.frame.height))

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }
})

const layoutTransform = computed(() => {
  const safeWidth = VIEWBOX_WIDTH - LAYOUT_PADDING * 2
  const safeHeight = VIEWBOX_HEIGHT - LAYOUT_PADDING * 2
  const scale = Math.min(
    safeWidth / layoutBounds.value.width,
    safeHeight / layoutBounds.value.height,
  )
  const translateX = LAYOUT_PADDING + (safeWidth - layoutBounds.value.width * scale) / 2 - layoutBounds.value.minX * scale
  const translateY = LAYOUT_PADDING + (safeHeight - layoutBounds.value.height * scale) / 2 - layoutBounds.value.minY * scale

  return {
    scale,
    translateX,
    translateY,
    transform: `translate(${translateX} ${translateY}) scale(${scale})`,
  }
})

function isSelectedRoom(roomId) {
  return roomId === (props.selectedRoomId ?? props.rooms[0]?.id ?? null)
}

function isSelectedDevice(deviceId) {
  return deviceId === (props.selectedDeviceId ?? null)
}

function aggregateOverlayStyle(device) {
  const scale = Number(layoutTransform.value.scale || 1)
  const hotspotX = layoutTransform.value.translateX + device.position.x * scale
  const hotspotY = layoutTransform.value.translateY + device.position.y * scale

  return {
    left: `${(hotspotX / VIEWBOX_WIDTH) * 100}%`,
    top: `${(hotspotY / VIEWBOX_HEIGHT) * 100}%`,
    width: `${Math.max(72, 138 * scale)}px`,
    height: `${Math.max(48, 76 * scale)}px`,
    transform: 'translate(-18.8%, -57.9%)',
  }
}

function toSvgPoint(svg, event) {
  if (!svg?.createSVGPoint) {
    return null
  }

  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) {
    return null
  }

  return point.matrixTransform(ctm.inverse())
}

function toLayoutPoint(point) {
  const scale = Number(layoutTransform.value.scale || 1)
  if (!scale) {
    return point
  }

  return {
    x: (point.x - layoutTransform.value.translateX) / scale,
    y: (point.y - layoutTransform.value.translateY) / scale,
  }
}

function isInsideAggregateHotspot(device, point) {
  return point.x >= device.position.x - 26
    && point.x <= device.position.x + 112
    && point.y >= device.position.y - 44
    && point.y <= device.position.y + 32
}

function handleCanvasClick(event) {
  if (props.editorEnabled) {
    return
  }

  const svgPoint = toSvgPoint(event.currentTarget, event)
  if (!svgPoint) {
    return
  }

  const layoutPoint = toLayoutPoint(svgPoint)
  const hitAggregate = aggregateStageDevices.value.find((device) => isInsideAggregateHotspot(device, layoutPoint))
  if (!hitAggregate) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  emit('open-device', hitAggregate)
}
</script>

<template>
  <div class="relative overflow-hidden rounded-[2rem] border border-[#d9d2c5] bg-[linear-gradient(180deg,rgba(255,252,248,0.98),rgba(242,235,226,0.98))] p-4 shadow-[0_28px_70px_rgba(35,30,24,0.1)] sm:p-5">
    <div class="pointer-events-none absolute inset-x-8 top-5 h-12 rounded-full bg-white/55 blur-2xl" />

    <div class="relative z-10">
      <svg
        viewBox="0 0 1000 660"
        class="relative h-full min-h-[420px] w-full"
        role="img"
        aria-label="家庭空间户型图"
        @click.capture="handleCanvasClick"
      >
        <defs>
          <pattern id="floor-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(51,65,85,0.06)" stroke-width="1" />
          </pattern>
          <linearGradient id="map-floor" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stop-color="#faf5ee" />
            <stop offset="100%" stop-color="#efe5d9" />
          </linearGradient>
          <filter id="device-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="rgba(17,24,39,0.18)" />
          </filter>
        </defs>

        <rect x="54" y="42" width="892" height="566" rx="42" fill="url(#map-floor)" pointer-events="none" />
        <rect x="54" y="42" width="892" height="566" rx="42" fill="url(#floor-grid)" opacity="0.85" pointer-events="none" />

        <g :transform="layoutTransform.transform">
          <g
            v-for="room in roomModels"
            :key="`room-${room.id}`"
          >
            <FloorMapRoomLayer
              :room="room"
              :ambient="ambientByRoomId[room.id]"
              :selected="isSelectedRoom(room.id)"
              @select-room="emit('select-room', $event)"
            />
            <FloorMapAmbientLayer
              :room="room"
              :ambient="ambientByRoomId[room.id]"
              :transition="roomTransitionById[room.id]"
            />
            <text :x="room.labelX" :y="room.labelY" :fill="ambientByRoomId[room.id].textColor" font-size="15" font-weight="700">
              {{ room.name }}
            </text>
            <text :x="room.labelX" :y="room.labelY + 24" :fill="room.tone.chip" font-size="11" letter-spacing="1.6">
              {{ formatRoomAmbient(room) }}
            </text>
            <text :x="room.labelX" :y="room.labelY + 46" :fill="ambientByRoomId[room.id].secondaryTextColor" font-size="11">
              {{ room.metrics.deviceCount }} 设备 / {{ room.metrics.controllableCount }} 可控
            </text>
          </g>

          <g
            v-for="room in deviceRenderRooms"
            :key="`device-layer-${room.id}`"
          >
            <FloorMapDeviceLayer
              v-for="device in room.devices"
              :key="device.id"
              :room="room"
              :device="device"
              :selected="isSelectedDevice(device.id)"
              :priority="devicePriorityById[device.id]"
              :transition="deviceTransitionById[device.id]"
              @quick-action="emit('quick-action', $event)"
              @open-device="emit('open-device', $event)"
            />
          </g>

          <FloorMapEditorOverlay
            v-if="editorEnabled"
            :rooms="roomModels"
            :selected-room-id="editorSelectedRoomId"
            :selected-device-id="editorSelectedDeviceId"
            :selected-opening-index="editorSelectedOpeningIndex"
            :layout-transform="layoutTransform"
            @select-room="emit('editor-select-room', $event)"
            @select-device="emit('editor-select-device', $event)"
            @select-opening="emit('editor-select-opening', $event)"
            @update-room-frame="emit('editor-update-room-frame', $event)"
            @update-device-position="(deviceId, position) => emit('editor-update-device-position', deviceId, position)"
            @update-opening="(index, patch) => emit('editor-update-opening', index, patch)"
          />
        </g>
      </svg>

      <div class="pointer-events-none absolute inset-0 z-20">
        <button
          v-for="device in aggregateStageDevices"
          :key="`aggregate-hotspot-${device.aggregateKey ?? device.id}`"
          type="button"
          class="aggregate-hotspot pointer-events-auto absolute cursor-pointer rounded-[1.35rem] border-0 bg-transparent p-0"
          :style="aggregateOverlayStyle(device)"
          :aria-label="`打开 ${device.name}`"
          @click.stop.prevent="emit('open-device', device)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
svg text {
  pointer-events: none;
  user-select: none;
}

.aggregate-hotspot {
  outline: none;
}
</style>
