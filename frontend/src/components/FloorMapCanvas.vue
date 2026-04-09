<script setup>
import { computed } from 'vue'

import { useAmbientState } from '../composables/useAmbientState'
import { useRoomTransitionOrchestration } from '../composables/useRoomTransitionOrchestration'
import { useVisualPriority } from '../composables/useVisualPriority'
import { useSmartHomeStore } from '../stores/smartHome'
import FloorMapAmbientLayer from './FloorMapAmbientLayer.vue'
import FloorMapDeviceLayer from './FloorMapDeviceLayer.vue'
import FloorMapEditorOverlay from './FloorMapEditorOverlay.vue'
import FloorMapRoomLayer from './FloorMapRoomLayer.vue'
import {
  buildFloorMapModel,
  formatRoomAmbient,
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

const deviceRenderRooms = computed(() =>
  roomModels.value.map((room) => ({
    ...room,
    devices: props.showSensors ? room.devices : room.devices.filter((device) => device.can_control),
  })),
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
</script>

<template>
  <div class="relative overflow-hidden rounded-[2rem] border border-[#d9d2c5] bg-[linear-gradient(180deg,rgba(255,252,248,0.98),rgba(242,235,226,0.98))] p-4 shadow-[0_28px_70px_rgba(35,30,24,0.1)] sm:p-5">
    <div class="pointer-events-none absolute inset-x-8 top-5 h-12 rounded-full bg-white/55 blur-2xl" />

    <svg
      viewBox="0 0 1000 660"
      class="relative z-10 h-full min-h-[420px] w-full"
      role="img"
      aria-label="家庭空间户型图"
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

      <rect x="54" y="42" width="892" height="566" rx="42" fill="url(#map-floor)" />
      <rect x="54" y="42" width="892" height="566" rx="42" fill="url(#floor-grid)" opacity="0.85" />

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
            {{ room.metrics.deviceCount }} 设备 · {{ room.metrics.controllableCount }} 可控
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
  </div>
</template>
