<script setup>
import { computed, ref } from 'vue'

import DeviceAnimationLayer from './DeviceAnimationLayer.vue'
import { useDevicePressFeedback } from '../composables/useDevicePressFeedback'
import { useSmartHomeStore } from '../stores/smartHome'
import { useDeviceAnimationState } from '../composables/useDeviceAnimationState'
import { getControlFeedbackPresentation } from '../utils/controlFeedback'
import { formatDeviceState, getDevicePrimaryMetric, getQuickAction } from '../utils/floorMap'

const props = defineProps({
  room: {
    type: Object,
    required: true,
  },
  device: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  priority: {
    type: Object,
    default: () => ({
      tier: 'background',
      roomMode: 'calm',
      motionEmphasis: 1,
      feedbackEmphasis: 1,
      hotspotEmphasis: 1,
      suppressMotion: false,
    }),
  },
  transition: {
    type: Object,
    default: () => ({
      phase: 'idle',
      motionDelay: 0,
      motionDuration: 200,
      feedbackDelay: 0,
      feedbackDuration: 180,
    }),
  },
})

const emit = defineEmits(['quick-action', 'open-device'])

const smartHomeStore = useSmartHomeStore()
const isHovered = ref(false)

const isPending = computed(() => smartHomeStore.isDevicePending(props.device.id))
const {
  feedbackState,
  interactive,
  hotspotOpacity,
  accentStroke,
  accentOpacity,
  showRotor,
  showWindLines,
  windOpacity,
  rotorClass,
  feedbackClass,
  rotationDuration,
  slowdownDuration,
} = useDeviceAnimationState(
  computed(() => props.device),
  computed(() => smartHomeStore.actionFeedback),
  isPending,
  computed(() => props.priority),
)

const feedbackPresentation = computed(() =>
  getControlFeedbackPresentation({
    feedbackState: feedbackState.value,
    offline: props.device.offline,
    active: props.device.active,
  }),
)

  const {
    pressState,
    pressScale,
    pressOpacity,
    pressOffsetY,
    holdRingOpacity,
  holdRingScale,
  holdReady,
  startPress: beginPressGesture,
  movePress: movePressGesture,
  endPress: completePressGesture,
  cancelPress,
} = useDevicePressFeedback(
  interactive,
  computed(() => ({ holdDelay: 420, moveTolerance: 12 })),
)

const animationState = computed(() => ({
  feedbackState: feedbackState.value,
  interactive: interactive.value,
  hotspotOpacity: hotspotOpacity.value,
  accentStroke: accentStroke.value,
  accentOpacity: accentOpacity.value,
  showRotor: showRotor.value,
  showWindLines: showWindLines.value,
  windOpacity: windOpacity.value,
  rotorClass: rotorClass.value,
  feedbackClass: feedbackClass.value,
  rotationDuration: rotationDuration.value,
  slowdownDuration: slowdownDuration.value,
  motionEmphasis: props.priority.motionEmphasis,
  feedbackEmphasis: props.priority.feedbackEmphasis,
  motionDelay: props.transition.motionDelay,
  motionDuration: props.transition.motionDuration,
  feedbackDelay: props.transition.feedbackDelay,
  feedbackDuration: props.transition.feedbackDuration,
  selected: props.selected,
  pressed: pressState.pressed,
}))

const baseStroke = computed(() => {
  if (props.selected) {
    return feedbackPresentation.value.accentColor
  }

  if (accentStroke.value && feedbackState.value !== 'idle') {
    return accentStroke.value
  }

  if (props.device.offline) return '#94a3b8'
  if (props.device.active) return props.room.tone.edge
  return 'rgba(71,85,105,0.18)'
})

const shellFill = computed(() => {
  if (props.device.offline) return 'rgba(229,233,240,0.92)'
  if (props.device.entity_domain === 'light' && props.device.active) return 'rgba(255,243,221,0.96)'
  if (props.device.entity_domain === 'climate' && props.device.active) return 'rgba(232,243,255,0.94)'
  if (props.device.entity_domain === 'fan' && props.device.active) return 'rgba(236,245,250,0.94)'
  if (props.selected) return 'rgba(255,255,255,0.98)'
  return 'rgba(255,255,255,0.88)'
})

const coreFill = computed(() => {
  if (props.device.offline) return 'rgba(203,213,225,0.5)'
  if (props.device.entity_domain === 'light' && props.device.active) return 'rgba(255,219,166,0.92)'
  if (props.device.entity_domain === 'climate' && props.device.active) return 'rgba(187,221,255,0.9)'
  if (props.device.entity_domain === 'fan' && props.device.active) return 'rgba(198,228,241,0.88)'
  if (props.selected && !props.device.active) return 'rgba(223,232,241,0.92)'
  return 'rgba(226,232,240,0.72)'
})

const innerRingStroke = computed(() => {
  if (props.device.offline) return 'rgba(148,163,184,0.32)'
  if (props.device.entity_domain === 'light' && props.device.active) return 'rgba(226,161,74,0.5)'
  if (props.device.entity_domain === 'climate' && props.device.active) return 'rgba(90,154,219,0.42)'
  if (props.device.entity_domain === 'fan' && props.device.active) return 'rgba(101,153,180,0.38)'
  return 'rgba(148,163,184,0.18)'
})

const glyphFill = computed(() => {
  if (props.device.offline) return '#94a3b8'
  if (props.device.entity_domain === 'light' && props.device.active) return '#8e5c18'
  if (props.device.entity_domain === 'climate' && props.device.active) return '#29628d'
  if (props.device.entity_domain === 'fan' && props.device.active) return '#2f6170'
  if (props.device.active) return '#ffffff'
  return 'rgba(51,65,85,0.78)'
})

const glyphVisible = computed(() => !['climate', 'fan'].includes(props.device.entity_domain))
const holdCircumference = 2 * Math.PI * 23
const holdDashOffset = computed(() => holdCircumference * (1 - pressState.holdProgress))
const hoverLift = computed(() => (isHovered.value && interactive.value && !pressState.pressed ? -1.5 : 0))
const hoverScale = computed(() => (isHovered.value && interactive.value && !pressState.pressed ? 1.018 : 1))
const deviceLiftScale = computed(() => {
  const selectedScale = props.selected ? 1.05 : 1
  return Number((selectedScale * hoverScale.value * pressScale.value).toFixed(3))
})
const iconGroupStyle = computed(() => ({
  transform: `translate(${props.device.position.x}px, ${props.device.position.y + (props.selected ? -2 : 0) + hoverLift.value + pressOffsetY.value}px) scale(${deviceLiftScale.value})`,
  transformOrigin: `${props.device.position.x}px ${props.device.position.y}px`,
  transformBox: 'fill-box',
  transition: 'transform 260ms cubic-bezier(0.2, 0.86, 0.24, 1.06), opacity 220ms ease',
  transitionDelay: `${props.transition.motionDelay}ms`,
  transitionDuration: `${Math.max(props.transition.motionDuration, 220)}ms`,
  opacity: pressOpacity.value,
}))
const labelGroupStyle = computed(() => ({
  transform: `translateY(${props.selected ? -6 : isHovered.value ? -4 : -2}px)`,
  transformOrigin: `${props.device.position.x + 60}px ${props.device.position.y - 13}px`,
  transition: 'transform 220ms ease, opacity 220ms ease',
  transitionDelay: `${props.transition.motionDelay}ms`,
  transitionDuration: `${Math.max(props.transition.motionDuration, 220)}ms`,
}))
const rootGroupStyle = computed(() => ({
  transition: 'opacity 220ms ease, transform 240ms ease',
  transitionDelay: `${props.transition.motionDelay}ms`,
  transitionDuration: `${Math.max(props.transition.motionDuration, 220)}ms`,
}))
const statusDotColor = computed(() => feedbackPresentation.value.dotColor)
const labelSurfaceFill = computed(() => {
  if (props.selected) return 'rgba(255,255,255,0.96)'
  if (props.device.offline) return 'rgba(248,250,252,0.8)'
  return 'rgba(255,255,255,0.88)'
})
const labelSurfaceStroke = computed(() => {
  if (props.selected) return feedbackPresentation.value.accentColor
  if (feedbackState.value !== 'idle') return feedbackPresentation.value.accentColor
  return 'rgba(148,163,184,0.26)'
})
const pressAuraOpacity = computed(() => {
  if (!pressState.pressed && !props.selected) return 0
  return props.selected ? 0.68 : 0.52
})
const pedestalOpacity = computed(() => {
  if (props.device.offline) return 0.12
  if (props.device.active) return isHovered.value ? 0.3 : 0.24
  return isHovered.value ? 0.18 : 0.12
})
const pedestalFill = computed(() => {
  if (props.device.entity_domain === 'light' && props.device.active) return 'rgba(246,204,140,0.42)'
  if (props.device.entity_domain === 'climate' && props.device.active) return 'rgba(168,208,245,0.38)'
  if (props.device.entity_domain === 'fan' && props.device.active) return 'rgba(176,214,226,0.34)'
  return 'rgba(40,52,70,0.18)'
})
const shadowOpacity = computed(() => {
  if (pressState.pressed) return 0.16
  if (isHovered.value || props.selected) return 0.28
  return 0.22
})
const hitAreaBox = computed(() => ({
  x: props.device.position.x - 26,
  y: props.device.position.y - 44,
  width: 138,
  height: 76,
  rx: 22,
}))

function startPress(event) {
  beginPressGesture(event)
}

function handleClick(event) {
  if (!props.device?.isAggregate) {
    return
  }

  event?.stopPropagation?.()
  emit('open-device', props.device)
}

function movePress(event) {
  movePressGesture(event)
}

function endPress() {
  completePressGesture(
    () => {
      if (props.device?.isAggregate) {
        emit('open-device', props.device)
        return
      }

      const quickAction = getQuickAction(props.device)
      if (quickAction) {
        emit('quick-action', props.device)
      } else {
        emit('open-device', props.device)
      }
    },
    () => {
      emit('open-device', props.device)
    },
  )
}

function deviceGlyph(device) {
  if (device?.isAggregate) {
    const applianceType = `${device.applianceType ?? ''}`.toLowerCase()
    if (applianceType.includes('fridge')) return '冰'
    if (applianceType.includes('air_conditioner')) return '空'
    if (applianceType.includes('tv') || applianceType.includes('media')) return '视'
    if (applianceType.includes('purifier')) return '净'
    if (applianceType.includes('washer')) return '洗'
    if (applianceType.includes('speaker')) return '音'
  }

  const type = `${device.entity_domain ?? device.type ?? ''}`.toLowerCase()
  if (type.includes('light')) return '灯'
  if (type.includes('cover')) return '帘'
  if (type.includes('sensor')) return '感'
  if (type.includes('scene')) return '景'
  if (type.includes('media')) return '影'
  return '控'
}

function handlePointerEnter() {
  if (!interactive.value) {
    return
  }

  isHovered.value = true
}

function handlePointerLeave() {
  isHovered.value = false
  cancelPress()
}
</script>

<template>
  <g
    class="floor-device-layer cursor-pointer"
    :class="{ 'cursor-not-allowed': !interactive, 'floor-device-layer--selected': selected }"
    :opacity="hotspotOpacity"
    :style="rootGroupStyle"
    @pointerenter="handlePointerEnter"
    @pointerleave="handlePointerLeave"
    @pointerdown="startPress($event)"
    @pointerup="endPress"
    @pointercancel="cancelPress"
    @pointermove="movePress($event)"
    @click="handleClick"
  >
    <rect
      :x="hitAreaBox.x"
      :y="hitAreaBox.y"
      :width="hitAreaBox.width"
      :height="hitAreaBox.height"
      :rx="hitAreaBox.rx"
      fill="rgba(255,255,255,0)"
      class="floor-device-layer__hit-area"
      pointer-events="all"
      @click.stop="handleClick"
    />
    <ellipse
      :cx="device.position.x"
      :cy="device.position.y + 16"
      rx="25"
      ry="8.5"
      :fill="pedestalFill"
      :opacity="pedestalOpacity"
    />
    <circle
      :cx="device.position.x"
      :cy="device.position.y + 12"
      r="18"
      fill="rgba(24,32,44,0.14)"
      :opacity="shadowOpacity"
    />
    <circle
      :cx="device.position.x"
      :cy="device.position.y + 1"
      r="26"
      :fill="feedbackPresentation.subtleColor"
      :opacity="pressAuraOpacity"
    />
    <circle
      v-if="selected || pressState.pressed"
      :cx="device.position.x"
      :cy="device.position.y"
      r="23"
      fill="none"
      :stroke="feedbackPresentation.accentColor"
      stroke-width="1.6"
      :opacity="selected ? 0.38 : holdRingOpacity"
      :style="{ transform: `scale(${holdRingScale})`, transformOrigin: `${device.position.x}px ${device.position.y}px`, transformBox: 'fill-box', transition: 'transform 220ms ease, opacity 220ms ease' }"
    />
    <circle
      v-if="pressState.pressed"
      :cx="device.position.x"
      :cy="device.position.y"
      r="23"
      fill="none"
      :stroke="feedbackPresentation.accentColor"
      stroke-width="2.1"
      stroke-linecap="round"
      :stroke-dasharray="holdCircumference"
      :stroke-dashoffset="holdDashOffset"
      :opacity="holdRingOpacity"
      class="floor-device-layer__hold-progress"
    />
    <g class="floor-device-layer__icon-group" :style="iconGroupStyle">
      <circle
        cx="0"
        cy="0"
        r="23"
        :fill="feedbackPresentation.subtleColor"
        :opacity="props.device.active ? 0.18 : 0.08"
      />
      <circle
        cx="0"
        cy="0"
        r="20.5"
        :fill="shellFill"
        :stroke="baseStroke"
        :stroke-width="feedbackState === 'pending' ? 2.6 : 1.6"
      />
      <circle
        cx="0"
        cy="0"
        r="15"
        fill="rgba(255,255,255,0.62)"
        opacity="0.92"
      />
      <circle
        cx="0"
        cy="0"
        r="12.5"
        :fill="coreFill"
        :stroke="innerRingStroke"
        stroke-width="1"
      />

      <DeviceAnimationLayer
        :device="device"
        :state="animationState"
      />

      <text
        v-if="glyphVisible"
        x="0"
        y="4"
        text-anchor="middle"
        font-size="10"
        font-weight="700"
        :fill="glyphFill"
      >
        {{ deviceGlyph(device) }}
      </text>
    </g>

    <g class="floor-device-layer__label-group" :style="labelGroupStyle">
      <rect
        :x="device.position.x + 16"
        :y="device.position.y - 36"
        width="92"
        height="34"
        rx="17"
        :fill="labelSurfaceFill"
        :stroke="labelSurfaceStroke"
        :stroke-width="selected ? 1.6 : 1"
        :opacity="hotspotOpacity"
      />
      <text :x="device.position.x + 26" :y="device.position.y - 18" :fill="selected ? '#0f172a' : '#0f172a'" font-size="11" font-weight="600">
        {{ device.name }}
      </text>
      <text :x="device.position.x + 26" :y="device.position.y - 4" fill="rgba(71,85,105,0.84)" font-size="10">
        {{ holdReady ? '松手打开详情' : (device.displayMetric ?? getDevicePrimaryMetric(device)) }}
      </text>
      <circle
        :cx="device.position.x + 97"
        :cy="device.position.y - 19"
        r="4"
        :fill="statusDotColor"
      />
    </g>
    <title>{{ `${room.name} / ${device.name} / ${formatDeviceState(device)}` }}</title>
  </g>
</template>

<style scoped>
.floor-device-layer__hold-progress,
.floor-device-layer__icon-group,
.floor-device-layer__label-group {
  transition:
    transform 240ms ease,
    opacity 220ms ease,
    stroke 220ms ease,
    fill 220ms ease;
}

.floor-device-layer__hit-area {
  pointer-events: all;
}

.floor-device-layer__icon-group,
.floor-device-layer__label-group,
.floor-device-layer ellipse,
.floor-device-layer circle,
.floor-device-layer rect,
.floor-device-layer text,
.floor-device-layer title {
  pointer-events: none;
}
</style>
