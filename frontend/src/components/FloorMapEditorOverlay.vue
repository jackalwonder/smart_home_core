<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

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
  selectedOpeningIndex: {
    type: Number,
    default: null,
  },
  layoutTransform: {
    type: Object,
    default: () => ({
      scale: 1,
      translateX: 0,
      translateY: 0,
    }),
  },
})

const emit = defineEmits([
  'select-room',
  'select-device',
  'select-opening',
  'update-room-frame',
  'update-device-position',
  'update-opening',
])

const overlayRef = ref(null)
const dragState = ref(null)

const selectedRoom = computed(() =>
  props.rooms.find((room) => room.id === props.selectedRoomId) ?? props.rooms[0] ?? null,
)

const selectedDevice = computed(() =>
  selectedRoom.value?.devices.find((device) => device.id === props.selectedDeviceId) ?? null,
)

const openingGeometries = computed(() =>
  (selectedRoom.value?.visualConfig?.openings ?? []).map((opening, index) => {
    const frame = selectedRoom.value.frame
    const start = Math.min(opening.start ?? 0, opening.end ?? 1)
    const end = Math.max(opening.start ?? 0, opening.end ?? 1)

    if (opening.edge === 'left' || opening.edge === 'right') {
      const x = opening.edge === 'left' ? frame.x : frame.x + frame.width
      return {
        index,
        axis: 'y',
        startPoint: { x, y: frame.y + frame.height * start },
        endPoint: { x, y: frame.y + frame.height * end },
      }
    }

    const y = opening.edge === 'top' ? frame.y : frame.y + frame.height
    return {
      index,
      axis: 'x',
      startPoint: { x: frame.x + frame.width * start, y },
      endPoint: { x: frame.x + frame.width * end, y },
    }
  }),
)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clientToSvg(event) {
  const svg = overlayRef.value?.ownerSVGElement
  if (!svg) {
    return { x: 0, y: 0 }
  }

  const point = svg.createSVGPoint()
  point.x = event.clientX
  point.y = event.clientY

  const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse())
  const scale = Number(props.layoutTransform?.scale ?? 1) || 1
  const translateX = Number(props.layoutTransform?.translateX ?? 0)
  const translateY = Number(props.layoutTransform?.translateY ?? 0)

  return {
    x: (transformed.x - translateX) / scale,
    y: (transformed.y - translateY) / scale,
  }
}

function startDrag(kind, event, payload = {}) {
  event.preventDefault()
  event.stopPropagation()

  const pointer = clientToSvg(event)
  dragState.value = {
    kind,
    pointerStart: pointer,
    ...payload,
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
}

function stopDrag() {
  dragState.value = null
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
}

function roomRatioFromPointer(frame, edge, pointer) {
  if (edge === 'left' || edge === 'right') {
    return clamp((pointer.y - frame.y) / Math.max(frame.height, 1), 0, 1)
  }

  return clamp((pointer.x - frame.x) / Math.max(frame.width, 1), 0, 1)
}

function handlePointerMove(event) {
  if (!dragState.value || !selectedRoom.value) {
    return
  }

  const pointer = clientToSvg(event)
  const deltaX = pointer.x - dragState.value.pointerStart.x
  const deltaY = pointer.y - dragState.value.pointerStart.y

  if (dragState.value.kind === 'room-move') {
    emit('update-room-frame', {
      x: dragState.value.frameStart.x + deltaX,
      y: dragState.value.frameStart.y + deltaY,
    })
    return
  }

  if (dragState.value.kind === 'room-resize') {
    emit('update-room-frame', {
      width: dragState.value.frameStart.width + deltaX,
      height: dragState.value.frameStart.height + deltaY,
    })
    return
  }

  if (dragState.value.kind === 'device-move') {
    emit('update-device-position', dragState.value.deviceId, {
      x: pointer.x,
      y: pointer.y,
    })
    return
  }

  if (dragState.value.kind === 'opening-handle') {
    const opening = selectedRoom.value.visualConfig.openings?.[dragState.value.openingIndex]
    if (!opening) {
      return
    }

    const ratio = roomRatioFromPointer(selectedRoom.value.frame, opening.edge, pointer)
    if (dragState.value.handle === 'start') {
      emit('update-opening', dragState.value.openingIndex, {
        start: clamp(ratio, 0, Math.max((opening.end ?? 1) - 0.02, 0.02)),
      })
      return
    }

    emit('update-opening', dragState.value.openingIndex, {
      end: clamp(ratio, Math.min((opening.start ?? 0) + 0.02, 0.98), 1),
    })
  }
}

function handleRoomMoveStart(event) {
  if (!selectedRoom.value) {
    return
  }

  startDrag('room-move', event, {
    frameStart: { ...selectedRoom.value.frame },
  })
}

function handleRoomResizeStart(event) {
  if (!selectedRoom.value) {
    return
  }

  startDrag('room-resize', event, {
    frameStart: { ...selectedRoom.value.frame },
  })
}

function handleDeviceMoveStart(device, event) {
  emit('select-device', device.id)
  startDrag('device-move', event, {
    deviceId: device.id,
  })
}

function handleOpeningHandleStart(index, handle, event) {
  emit('select-opening', index)
  startDrag('opening-handle', event, {
    openingIndex: index,
    handle,
  })
}

onBeforeUnmount(stopDrag)
</script>

<template>
  <g ref="overlayRef" class="floor-map-editor-overlay" pointer-events="none">
    <g v-if="selectedRoom">
      <rect
        :x="selectedRoom.frame.x"
        :y="selectedRoom.frame.y"
        :width="selectedRoom.frame.width"
        :height="selectedRoom.frame.height"
        rx="18"
        fill="rgba(45,102,96,0.04)"
        stroke="rgba(45,102,96,0.72)"
        stroke-width="1.8"
        stroke-dasharray="6 6"
      />

      <circle
        :cx="selectedRoom.centerX"
        :cy="selectedRoom.frame.y - 16"
        r="8"
        fill="#2d6660"
        stroke="white"
        stroke-width="2"
        class="floor-map-editor-overlay__handle"
        pointer-events="all"
        @pointerdown="handleRoomMoveStart"
      />

      <rect
        :x="selectedRoom.frame.x + selectedRoom.frame.width - 8"
        :y="selectedRoom.frame.y + selectedRoom.frame.height - 8"
        width="16"
        height="16"
        rx="4"
        fill="#2d6660"
        stroke="white"
        stroke-width="2"
        class="floor-map-editor-overlay__handle"
        pointer-events="all"
        @pointerdown="handleRoomResizeStart"
      />

      <g
        v-for="device in selectedRoom.devices"
        :key="`editor-device-${device.id}`"
      >
        <line
          :x1="device.position.x"
          :y1="device.position.y - 12"
          :x2="device.position.x"
          :y2="device.position.y + 12"
          stroke="rgba(45,102,96,0.32)"
          stroke-width="1.2"
        />
        <line
          :x1="device.position.x - 12"
          :y1="device.position.y"
          :x2="device.position.x + 12"
          :y2="device.position.y"
          stroke="rgba(45,102,96,0.32)"
          stroke-width="1.2"
        />
        <circle
          :cx="device.position.x"
          :cy="device.position.y"
          r="9"
          :fill="device.id === selectedDeviceId ? '#2d6660' : 'rgba(255,255,255,0.92)'"
          :stroke="device.id === selectedDeviceId ? 'white' : 'rgba(45,102,96,0.84)'"
          stroke-width="2"
          class="floor-map-editor-overlay__handle"
          pointer-events="all"
          @click.stop="emit('select-device', device.id)"
          @pointerdown="handleDeviceMoveStart(device, $event)"
        />
      </g>

      <g
        v-for="opening in openingGeometries"
        :key="`editor-opening-${opening.index}`"
      >
        <line
          :x1="opening.startPoint.x"
          :y1="opening.startPoint.y"
          :x2="opening.endPoint.x"
          :y2="opening.endPoint.y"
          :stroke="opening.index === selectedOpeningIndex ? '#c99742' : 'rgba(201,151,66,0.62)'"
          :stroke-width="opening.index === selectedOpeningIndex ? 5 : 3.2"
          stroke-linecap="round"
        />
        <circle
          :cx="opening.startPoint.x"
          :cy="opening.startPoint.y"
          r="6"
          fill="#fff8ef"
          stroke="#c99742"
          stroke-width="2"
          class="floor-map-editor-overlay__handle"
          pointer-events="all"
          @click.stop="emit('select-opening', opening.index)"
          @pointerdown="handleOpeningHandleStart(opening.index, 'start', $event)"
        />
        <circle
          :cx="opening.endPoint.x"
          :cy="opening.endPoint.y"
          r="6"
          fill="#fff8ef"
          stroke="#c99742"
          stroke-width="2"
          class="floor-map-editor-overlay__handle"
          pointer-events="all"
          @click.stop="emit('select-opening', opening.index)"
          @pointerdown="handleOpeningHandleStart(opening.index, 'end', $event)"
        />
      </g>
    </g>
  </g>
</template>

<style scoped>
.floor-map-editor-overlay__handle {
  cursor: pointer;
}
</style>
