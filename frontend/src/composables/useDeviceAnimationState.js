import { computed, onBeforeUnmount, ref, unref, watch } from 'vue'

import { getControlFeedbackPresentation } from '../utils/controlFeedback'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizedState(device) {
  return `${device?.raw_state ?? device?.state ?? device?.current_status ?? ''}`.trim().toLowerCase()
}

function normalizedFanSpeed(device) {
  const fanMode = `${device?.fan_mode ?? ''}`.trim().toLowerCase()
  const modeMap = {
    low: 0.38,
    quiet: 0.32,
    medium: 0.62,
    mid: 0.62,
    high: 0.88,
    turbo: 1,
    auto: 0.54,
  }

  if (fanMode && modeMap[fanMode] !== undefined) {
    return modeMap[fanMode]
  }

  const numericValue = Number(device?.number_value)
  if (!Number.isNaN(numericValue)) {
    return clamp(numericValue / 100, 0.2, 1)
  }

  return 0.55
}

function isAirflowDevice(device) {
  const domain = `${device?.entity_domain ?? device?.type ?? ''}`.toLowerCase()
  return domain === 'climate' || domain === 'fan'
}

function isAirflowActive(device) {
  if (!isAirflowDevice(device)) {
    return false
  }

  const state = normalizedState(device)
  return ['on', 'cool', 'heat', 'heat_cool', 'dry', 'fan_only', 'auto'].includes(state)
}

function resolveFeedbackState(device, actionFeedback, isPending) {
  if (isPending) {
    return 'pending'
  }

  if (actionFeedback?.deviceId === device?.id) {
    return actionFeedback.status
  }

  return 'idle'
}

export function useDeviceAnimationState(deviceRef, actionFeedbackRef, pendingRef, priorityRef = null) {
  const phase = ref('idle')
  const lastSpinDuration = ref(2200)
  const stopTimer = ref(0)

  const device = computed(() => unref(deviceRef))
  const isPending = computed(() => Boolean(unref(pendingRef)))
  const priority = computed(() => unref(priorityRef) ?? {
    motionEmphasis: 1,
    feedbackEmphasis: 1,
    hotspotEmphasis: 1,
    suppressMotion: false,
  })
  const feedbackState = computed(() => resolveFeedbackState(device.value, unref(actionFeedbackRef), isPending.value))
  const offline = computed(() => device.value?.offline === true)
  const airflowDevice = computed(() => isAirflowDevice(device.value))
  const airflowActive = computed(() => !offline.value && isAirflowActive(device.value))
  const airflowStrength = computed(() => normalizedFanSpeed(device.value))
  const rotationDuration = computed(() => {
    const strength = airflowStrength.value
    const base = device.value?.entity_domain === 'fan' ? 1600 : 2200
    const emphasis = clamp(priority.value.motionEmphasis ?? 1, 0.12, 1)
    return Math.round((base - strength * 900) / emphasis)
  })
  const slowdownDuration = computed(() => Math.round(lastSpinDuration.value * 0.45 + 260))

  watch(
    [airflowActive, rotationDuration],
    ([active, duration], [wasActive]) => {
      if (stopTimer.value) {
        window.clearTimeout(stopTimer.value)
        stopTimer.value = 0
      }

      if (active) {
        lastSpinDuration.value = duration
        phase.value = 'spinning'
        return
      }

      if (wasActive) {
        phase.value = 'slowing'
        stopTimer.value = window.setTimeout(() => {
          phase.value = 'idle'
          stopTimer.value = 0
        }, slowdownDuration.value)
        return
      }

      phase.value = 'idle'
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    if (stopTimer.value) {
      window.clearTimeout(stopTimer.value)
    }
  })

  const interactive = computed(() => !offline.value)
  const hotspotOpacity = computed(() => {
    if (offline.value) {
      return 0.42
    }
    if (feedbackState.value === 'pending') {
      return clamp(0.82 + (priority.value.hotspotEmphasis ?? 1) * 0.1, 0.82, 1)
    }
    return clamp(priority.value.hotspotEmphasis ?? 1, 0.64, 1)
  })
  const accentStroke = computed(() => {
    const presentation = getControlFeedbackPresentation({
      feedbackState: feedbackState.value,
      offline: offline.value,
      active: airflowActive.value || normalizedState(device.value) === 'on',
    })

    if (presentation.tone === 'idle' || presentation.tone === 'active') {
      return null
    }

    return presentation.accentColor
  })
  const accentOpacity = computed(() => {
    const emphasis = clamp(priority.value.feedbackEmphasis ?? 1, 0.24, 1)
    if (feedbackState.value === 'pending') return 1
    if (feedbackState.value === 'success' || feedbackState.value === 'error') return 0.94 * emphasis
    return 0
  })
  const windOpacity = computed(() => {
    if (phase.value === 'idle' || priority.value.suppressMotion) return 0
    return clamp((0.26 + airflowStrength.value * 0.34) * (priority.value.motionEmphasis ?? 1), 0.08, 0.64)
  })
  const showRotor = computed(() => airflowDevice.value && !priority.value.suppressMotion)
  const showWindLines = computed(() => airflowDevice.value && !priority.value.suppressMotion && (phase.value === 'spinning' || phase.value === 'slowing'))
  const rotorClass = computed(() => {
    if (phase.value === 'spinning') return 'device-animation-layer__rotor--spinning'
    if (phase.value === 'slowing') return 'device-animation-layer__rotor--slowing'
    return ''
  })
  const feedbackClass = computed(() => {
    if (feedbackState.value === 'pending') return 'device-animation-layer__feedback--pending'
    if (feedbackState.value === 'success') return 'device-animation-layer__feedback--success'
    if (feedbackState.value === 'error') return 'device-animation-layer__feedback--error'
    return ''
  })

  return {
    phase,
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
    priority,
  }
}
