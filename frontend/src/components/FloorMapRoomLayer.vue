<script setup>
import { computed } from 'vue'

const props = defineProps({
  room: {
    type: Object,
    required: true,
  },
  ambient: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
})

function hexToRgb(value) {
  const normalized = `${value ?? ''}`.replace('#', '').trim()
  if (normalized.length !== 6) {
    return { r: 255, g: 255, b: 255 }
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return { r, g, b }
}

function mixColor(base, target, ratio) {
  const safeRatio = Math.min(1, Math.max(0, ratio))
  const left = hexToRgb(base)
  const right = hexToRgb(target)

  return `rgb(${Math.round(left.r + (right.r - left.r) * safeRatio)} ${Math.round(left.g + (right.g - left.g) * safeRatio)} ${Math.round(left.b + (right.b - left.b) * safeRatio)})`
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

const gradientIds = computed(() => ({
  floor: `room-floor-surface-${props.room.id}`,
  floorInset: `room-floor-inset-${props.room.id}`,
  wallEast: `room-wall-east-${props.room.id}`,
  wallSouthEast: `room-wall-south-east-${props.room.id}`,
  wallSouth: `room-wall-south-${props.room.id}`,
  wallCap: `room-wall-cap-${props.room.id}`,
  zonePrefix: `room-zone-${props.room.id}`,
}))

const palette = computed(() => {
  const visualConfig = props.room.visualConfig
  const baseFill = props.ambient.baseFill
  const surfaceTint = visualConfig.surfaceTint ?? '#fff8ef'
  const shadowColor = visualConfig.shadowColor ?? '#d5c6b4'
  const daylightColor = visualConfig.daylightColor ?? '#fff4de'

  return {
    floorCenter: mixColor(baseFill, surfaceTint, 0.34 + (props.ambient.priority?.floorContrast ?? 1) * 0.14),
    floorMid: mixColor(baseFill, daylightColor, 0.18 + (props.ambient.priority?.floorContrast ?? 1) * 0.08),
    floorEdge: mixColor(baseFill, shadowColor, 0.22 + (props.ambient.priority?.floorContrast ?? 1) * 0.18),
    floorInsetTop: withAlpha(daylightColor, 0.42),
    floorInsetMid: withAlpha(surfaceTint, 0.12),
    floorInsetShadow: withAlpha(shadowColor, 0.26),
    eastWallStart: mixColor(baseFill, surfaceTint, 0.24),
    eastWallEnd: mixColor(baseFill, shadowColor, 0.48),
    southEastWallStart: mixColor(baseFill, shadowColor, 0.28),
    southEastWallEnd: mixColor(baseFill, shadowColor, 0.56),
    southWallStart: mixColor(baseFill, shadowColor, 0.34),
    southWallEnd: mixColor(baseFill, shadowColor, 0.7),
    capStart: withAlpha(daylightColor, 0.34),
    capEnd: withAlpha(shadowColor, 0.16),
    edgeLine: withAlpha(props.ambient.edgeColor, props.selected ? 0.98 : 0.34),
    outlineShadow: withAlpha(shadowColor, props.selected ? 0.84 : 0.58),
    wallLine: withAlpha(shadowColor, 0.68),
    wallHighlight: withAlpha(daylightColor, Math.min(0.96, (visualConfig.wallHighlight ?? 0.72) * 0.62 * (props.ambient.priority?.outlineEmphasis ?? 1))),
  }
})

const roomLayerStyle = computed(() => ({
  transform: `translateY(${props.selected ? -3 : 0}px) scale(${props.ambient.priority?.scale ?? (props.selected ? 1.012 : 1)})`,
  transformOrigin: `${props.room.centerX}px ${props.room.centerY}px`,
  transformBox: 'fill-box',
  opacity: props.ambient.priority?.ambientVisibility ?? 1,
}))

function zoneFill(zoneRole) {
  if (zoneRole === 'window-lounge') {
    return withAlpha(props.room.visualConfig.daylightColor ?? '#fff5e4', 0.32)
  }

  if (zoneRole === 'rest') {
    return withAlpha(props.room.visualConfig.shadowColor ?? '#d9c9c4', 0.22)
  }

  if (zoneRole === 'quiet-edge') {
    return withAlpha(props.room.visualConfig.surfaceTint ?? '#f8efeb', 0.24)
  }

  if (zoneRole === 'service-core') {
    return withAlpha(props.room.visualConfig.surfaceTint ?? '#f5f8fa', 0.22)
  }

  if (zoneRole === 'circulation') {
    return withAlpha(props.room.visualConfig.shadowColor ?? '#d3d9de', 0.16)
  }

  return withAlpha(props.room.visualConfig.surfaceTint ?? '#fff8ef', 0.2)
}
</script>

<template>
  <g
    class="floor-room-layer"
    :class="{ 'floor-room-layer--selected': selected }"
    :style="roomLayerStyle"
    pointer-events="none"
  >
    <defs>
      <linearGradient
        :id="gradientIds.floor"
        gradientUnits="userSpaceOnUse"
        :x1="room.centerX"
        :y1="room.centerY - room.frame.height * 0.18"
        :x2="room.frame.x + room.frame.width"
        :y2="room.frame.y + room.frame.height"
      >
        <stop offset="0%" :stop-color="palette.floorCenter" />
        <stop offset="46%" :stop-color="palette.floorMid" />
        <stop offset="100%" :stop-color="palette.floorEdge" />
      </linearGradient>
      <linearGradient
        :id="gradientIds.floorInset"
        gradientUnits="userSpaceOnUse"
        :x1="room.frame.x + room.frame.width * 0.12"
        :y1="room.frame.y + room.frame.height * 0.12"
        :x2="room.frame.x + room.frame.width * 0.92"
        :y2="room.frame.y + room.frame.height * 0.92"
      >
        <stop offset="0%" :stop-color="palette.floorInsetTop" />
        <stop offset="62%" :stop-color="palette.floorInsetMid" />
        <stop offset="100%" :stop-color="palette.floorInsetShadow" />
      </linearGradient>
      <linearGradient
        :id="gradientIds.wallEast"
        gradientUnits="userSpaceOnUse"
        :x1="room.frame.x + room.frame.width"
        :y1="room.frame.y"
        :x2="room.frame.x + room.frame.width + room.visualConfig.elevationShiftX"
        :y2="room.frame.y + room.frame.height + room.visualConfig.elevationShiftY"
      >
        <stop offset="0%" :stop-color="palette.eastWallStart" />
        <stop offset="100%" :stop-color="palette.eastWallEnd" />
      </linearGradient>
      <linearGradient
        :id="gradientIds.wallSouthEast"
        gradientUnits="userSpaceOnUse"
        :x1="room.frame.x + room.frame.width * 0.72"
        :y1="room.frame.y + room.frame.height * 0.62"
        :x2="room.frame.x + room.frame.width + room.visualConfig.elevationShiftX"
        :y2="room.frame.y + room.frame.height + room.visualConfig.elevationShiftY"
      >
        <stop offset="0%" :stop-color="palette.southEastWallStart" />
        <stop offset="100%" :stop-color="palette.southEastWallEnd" />
      </linearGradient>
      <linearGradient
        :id="gradientIds.wallSouth"
        gradientUnits="userSpaceOnUse"
        :x1="room.frame.x"
        :y1="room.frame.y + room.frame.height"
        :x2="room.frame.x + room.frame.width + room.visualConfig.elevationShiftX"
        :y2="room.frame.y + room.frame.height + room.visualConfig.elevationShiftY"
      >
        <stop offset="0%" :stop-color="palette.southWallStart" />
        <stop offset="100%" :stop-color="palette.southWallEnd" />
      </linearGradient>
      <linearGradient
        :id="gradientIds.wallCap"
        gradientUnits="userSpaceOnUse"
        :x1="room.frame.x"
        :y1="room.frame.y + room.frame.height * 0.72"
        :x2="room.frame.x + room.frame.width"
        :y2="room.frame.y + room.frame.height"
      >
        <stop offset="0%" :stop-color="palette.capStart" />
        <stop offset="100%" :stop-color="palette.capEnd" />
      </linearGradient>
    </defs>

    <polygon
      class="floor-room-layer__shadow"
      :points="room.spatialSurfaces.basePolygon"
      :fill="room.tone.glow"
      opacity="0.34"
    />
    <polygon
      v-for="wall in room.spatialSurfaces.wallFaces"
      :key="wall.id"
      class="floor-room-layer__wall"
      :points="wall.polygon"
      :fill="wall.id === 'east' ? `url(#${gradientIds.wallEast})` : wall.id === 'south-east' ? `url(#${gradientIds.wallSouthEast})` : `url(#${gradientIds.wallSouth})`"
      :stroke="palette.wallLine"
      stroke-width="1.1"
    />
    <polygon
      class="floor-room-layer__surface"
      :points="room.spatialSurfaces.topPolygon"
      :fill="`url(#${gradientIds.floor})`"
      :stroke="selected ? ambient.edgeColor : 'rgba(73,84,99,0.12)'"
      :stroke-width="selected ? 3.6 : 1.8"
    />
    <polygon
      class="floor-room-layer__inset"
      :points="room.spatialSurfaces.innerPolygon"
      :fill="`url(#${gradientIds.floorInset})`"
      :opacity="0.96"
    />
    <polygon
      v-for="zone in room.spatialSurfaces.zones"
      :key="zone.role"
      class="floor-room-layer__zone"
      :points="zone.polygon"
      :fill="zoneFill(zone.role)"
    />
    <polygon
      class="floor-room-layer__wall-cap"
      :points="room.spatialSurfaces.wallCapPolygon"
      :fill="`url(#${gradientIds.wallCap})`"
      opacity="0.55"
    />
    <polygon
      class="floor-room-layer__shell"
      :points="room.spatialSurfaces.topPolygon"
      fill="rgba(255,255,255,0.22)"
      :opacity="ambient.shellHighlightOpacity"
      :transform="`translate(0 -4)`"
    />
    <path
      class="floor-room-layer__outline floor-room-layer__outline--structure"
      :d="room.spatialSurfaces.topOutlinePath"
      :stroke="palette.outlineShadow"
    />
    <path
      class="floor-room-layer__outline"
      :d="room.spatialSurfaces.topOutlinePath"
      :stroke="palette.wallHighlight"
    />
    <path
      class="floor-room-layer__outline floor-room-layer__outline--inner"
      :d="room.spatialSurfaces.innerOutlinePath"
      :stroke="palette.edgeLine"
    />
    <path
      class="floor-room-layer__outline floor-room-layer__outline--side"
      :d="room.spatialSurfaces.leftOutlinePath"
      :stroke="palette.wallLine"
    />
  </g>
</template>

<style scoped>
.floor-room-layer {
  transition: transform 260ms ease, opacity 220ms ease;
  transform-box: fill-box;
  transform-origin: center;
}

.floor-room-layer--selected {
  transform: translateY(-3px);
}

.floor-room-layer__shadow,
.floor-room-layer__wall,
.floor-room-layer__surface,
.floor-room-layer__inset,
.floor-room-layer__zone,
.floor-room-layer__wall-cap,
.floor-room-layer__shell,
.floor-room-layer__outline {
  transition:
    fill 300ms ease,
    opacity 300ms ease,
    stroke 300ms ease,
    stroke-width 280ms ease;
}

.floor-room-layer__shadow {
  transform-origin: center;
}

.floor-room-layer__zone {
  opacity: 0.94;
}

.floor-room-layer__outline {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  opacity: 0.86;
}

.floor-room-layer__outline--structure {
  stroke-width: 2.4;
  opacity: 0.52;
}

.floor-room-layer__outline--inner {
  stroke-width: 1.1;
  opacity: 0.72;
}

.floor-room-layer__outline--side {
  stroke-width: 1.2;
  opacity: 0.64;
}
</style>
