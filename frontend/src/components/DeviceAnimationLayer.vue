<script setup>
const props = defineProps({
  device: {
    type: Object,
    required: true,
  },
  state: {
    type: Object,
    required: true,
  },
})

const rotorPathByDomain = {
  climate: [
    'M0 -8 C3 -10 8 -8 8 -2 C4 -2 1 -1 0 3 Z',
    'M8 2 C10 5 8 10 2 10 C2 6 1 3 -3 2 Z',
    'M-2 10 C-6 10 -10 6 -8 0 C-4 1 -1 0 1 -4 Z',
  ],
  fan: [
    'M0 -10 C4 -11 8 -7 8 -1 C4 -1 1 -1 -1 4 Z',
    'M10 0 C11 4 7 8 1 8 C1 4 1 1 -4 -1 Z',
    'M0 10 C-4 11 -8 7 -8 1 C-4 1 -1 1 1 -4 Z',
    'M-10 0 C-11 -4 -7 -8 -1 -8 C-1 -4 -1 -1 4 1 Z',
  ],
}

function rotorPaths(device) {
  return rotorPathByDomain[device.entity_domain] ?? []
}

function rotorFill(device, state) {
  if (device.offline) {
    return `rgba(203,213,225,${0.22 + state.motionEmphasis * 0.2})`
  }

  if (device.entity_domain === 'climate' && device.active) {
    return `rgba(173,214,255,${0.28 + state.motionEmphasis * 0.48})`
  }

  if (device.entity_domain === 'fan' && device.active) {
    return `rgba(199,228,240,${0.26 + state.motionEmphasis * 0.44})`
  }

  if (device.entity_domain === 'light' && device.active) {
    return `rgba(255,221,170,${0.3 + state.motionEmphasis * 0.4})`
  }

  return `rgba(203,213,225,${0.2 + state.motionEmphasis * 0.32})`
}

function hubFill(device) {
  if (device.offline) return 'rgba(203,213,225,0.72)'
  if (device.entity_domain === 'climate' && device.active) return '#eef7ff'
  if (device.entity_domain === 'fan' && device.active) return '#eef6f9'
  if (device.entity_domain === 'light' && device.active) return '#fff7ea'
  return '#f8fafc'
}

function windStroke(device) {
  if (device.entity_domain === 'climate' && device.active) return 'rgba(173,214,255,0.78)'
  if (device.entity_domain === 'fan' && device.active) return 'rgba(214,233,240,0.76)'
  return 'rgba(255,255,255,0.68)'
}
</script>

<template>
  <g class="device-animation-layer" pointer-events="none">
    <circle
      v-if="state.accentOpacity > 0"
      class="device-animation-layer__feedback"
      :class="state.feedbackClass"
      cx="0"
      cy="0"
      r="22"
      fill="none"
      :stroke="state.accentStroke"
      :opacity="state.accentOpacity"
      stroke-width="2.4"
      :style="{
        animationDelay: `${state.feedbackDelay}ms`,
        transitionDelay: `${state.feedbackDelay}ms`,
        transitionDuration: `${state.feedbackDuration}ms`,
      }"
    />

    <g
      v-if="state.showRotor"
      class="device-animation-layer__rotor"
      :class="state.rotorClass"
      :style="{
        '--rotation-duration': `${state.rotationDuration}ms`,
        '--slowdown-duration': `${state.slowdownDuration}ms`,
        '--motion-delay': `${state.motionDelay}ms`,
      }"
    >
      <path
        v-for="pathValue in rotorPaths(props.device)"
        :key="pathValue"
        :d="pathValue"
        :fill="rotorFill(props.device, props.state)"
      />
      <circle cx="0" cy="0" r="2.4" :fill="hubFill(props.device)" :opacity="0.46 + state.motionEmphasis * 0.52" />
    </g>

    <g
      v-if="state.showWindLines"
      class="device-animation-layer__wind"
      :style="{ opacity: state.windOpacity, transitionDelay: `${state.motionDelay}ms`, transitionDuration: `${state.motionDuration}ms` }"
    >
      <path class="device-animation-layer__wind-line device-animation-layer__wind-line--a" :stroke="windStroke(props.device)" d="M 14 -5 C 20 -7.5 26 -7 32 -4.8" />
      <path class="device-animation-layer__wind-line device-animation-layer__wind-line--b" :stroke="windStroke(props.device)" d="M 13 0 C 20 -1.5 28 -1.2 35 0.8" />
      <path class="device-animation-layer__wind-line device-animation-layer__wind-line--c" :stroke="windStroke(props.device)" d="M 12 5 C 18 7.5 25 7.2 31 4.8" />
    </g>
  </g>
</template>

<style scoped>
.device-animation-layer__rotor {
  transform-origin: center;
}

.device-animation-layer__rotor--spinning {
  animation: device-rotation var(--rotation-duration) linear infinite;
  animation-delay: var(--motion-delay);
}

.device-animation-layer__rotor--slowing {
  animation: device-rotation-out var(--slowdown-duration) cubic-bezier(0.18, 0.72, 0.24, 1) forwards;
  animation-delay: var(--motion-delay);
}

.device-animation-layer__wind-line {
  fill: none;
  stroke-width: 1.2;
  stroke-linecap: round;
}

.device-animation-layer__wind-line--a {
  animation: device-airflow 1600ms ease-in-out infinite;
  animation-delay: var(--motion-delay);
}

.device-animation-layer__wind-line--b {
  animation: device-airflow 1400ms ease-in-out infinite;
  animation-delay: var(--motion-delay);
}

.device-animation-layer__wind-line--c {
  animation: device-airflow 1800ms ease-in-out infinite;
  animation-delay: var(--motion-delay);
}

.device-animation-layer__feedback--pending {
  animation: device-feedback-pulse 1200ms ease-in-out infinite;
}

.device-animation-layer__feedback--success {
  animation: device-feedback-once 520ms ease-out 1;
}

.device-animation-layer__feedback--error {
  animation: device-feedback-error 620ms ease-out 1;
}

@keyframes device-rotation {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes device-rotation-out {
  from { transform: rotate(0deg); }
  to { transform: rotate(180deg); }
}

@keyframes device-airflow {
  0% { transform: translateX(0); opacity: 0.15; }
  35% { transform: translateX(1.5px); opacity: 0.95; }
  100% { transform: translateX(4px); opacity: 0; }
}

@keyframes device-feedback-pulse {
  0%, 100% { transform: scale(0.96); opacity: 0.32; }
  50% { transform: scale(1.08); opacity: 1; }
}

@keyframes device-feedback-once {
  0% { transform: scale(0.92); opacity: 0.2; }
  60% { transform: scale(1.08); opacity: 0.88; }
  100% { transform: scale(1.16); opacity: 0; }
}

@keyframes device-feedback-error {
  0% { transform: scale(0.96); opacity: 0.18; }
  35% { transform: scale(1.04); opacity: 0.92; }
  100% { transform: scale(1.12); opacity: 0; }
}
</style>
