import { computed, onBeforeUnmount, reactive, unref } from 'vue'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function useDevicePressFeedback(interactiveRef, optionsRef = null) {
  const pressState = reactive({
    timer: 0,
    frame: 0,
    releaseTimer: 0,
    pressed: false,
    longPressed: false,
    releasing: false,
    holdProgress: 0,
    startX: 0,
    startY: 0,
    startedAt: 0,
  })

  const holdDelay = computed(() => Number(unref(optionsRef)?.holdDelay ?? 420))
  const moveTolerance = computed(() => Number(unref(optionsRef)?.moveTolerance ?? 12))
  const releaseDuration = computed(() => Number(unref(optionsRef)?.releaseDuration ?? 170))

  function clearTimer() {
    if (pressState.timer) {
      window.clearTimeout(pressState.timer)
      pressState.timer = 0
    }
  }

  function clearFrame() {
    if (pressState.frame) {
      window.cancelAnimationFrame(pressState.frame)
      pressState.frame = 0
    }
  }

  function clearReleaseTimer() {
    if (pressState.releaseTimer) {
      window.clearTimeout(pressState.releaseTimer)
      pressState.releaseTimer = 0
    }
  }

  function resetState() {
    pressState.pressed = false
    pressState.longPressed = false
    pressState.releasing = false
    pressState.holdProgress = 0
    pressState.startedAt = 0
  }

  function triggerReleaseFeedback() {
    clearReleaseTimer()
    pressState.releasing = true
    pressState.releaseTimer = window.setTimeout(() => {
      pressState.releasing = false
      pressState.releaseTimer = 0
    }, releaseDuration.value)
  }

  function tickHoldProgress() {
    if (!pressState.pressed || pressState.longPressed) {
      clearFrame()
      return
    }

    const elapsed = performance.now() - pressState.startedAt
    pressState.holdProgress = clamp(elapsed / holdDelay.value, 0, 1)
    pressState.frame = window.requestAnimationFrame(tickHoldProgress)
  }

  function cancelPress() {
    clearTimer()
    clearFrame()
    clearReleaseTimer()
    resetState()
  }

  function startPress(event) {
    if (!unref(interactiveRef)) {
      return
    }

    cancelPress()
    pressState.pressed = true
    pressState.releasing = false
    pressState.startX = event.clientX ?? 0
    pressState.startY = event.clientY ?? 0
    pressState.startedAt = performance.now()
    pressState.frame = window.requestAnimationFrame(tickHoldProgress)
    pressState.timer = window.setTimeout(() => {
      pressState.longPressed = true
      pressState.holdProgress = 1
    }, holdDelay.value)
  }

  function movePress(event) {
    if (!unref(interactiveRef) || !pressState.pressed) {
      return
    }

    const deltaX = Math.abs((event.clientX ?? 0) - pressState.startX)
    const deltaY = Math.abs((event.clientY ?? 0) - pressState.startY)
    if (deltaX > moveTolerance.value || deltaY > moveTolerance.value) {
      cancelPress()
    }
  }

  function endPress(onTap, onLongPressEnd) {
    if (!unref(interactiveRef)) {
      return
    }

    const shouldTap = pressState.pressed && !pressState.longPressed
    const shouldOpenDetail = pressState.pressed && pressState.longPressed
    clearTimer()
    clearFrame()
    if (shouldTap || shouldOpenDetail) {
      triggerReleaseFeedback()
    }
    if (shouldTap) {
      onTap?.()
    }
    if (shouldOpenDetail) {
      onLongPressEnd?.()
    }
    pressState.pressed = false
    pressState.longPressed = false
    pressState.holdProgress = 0
    pressState.startedAt = 0
  }

  onBeforeUnmount(() => {
    clearTimer()
    clearFrame()
    clearReleaseTimer()
  })

  const pressScale = computed(() => {
    if (pressState.pressed) return 0.96
    if (pressState.releasing) return 1.018
    return 1
  })
  const pressOpacity = computed(() => {
    if (pressState.pressed) return 0.92
    if (pressState.releasing) return 0.97
    return 1
  })
  const pressOffsetY = computed(() => {
    if (pressState.pressed) return 2.5
    if (pressState.releasing) return -0.8
    return 0
  })
  const holdRingOpacity = computed(() => clamp(0.12 + pressState.holdProgress * 0.68, 0, 0.8))
  const holdRingScale = computed(() => 0.92 + pressState.holdProgress * 0.16)
  const holdReady = computed(() => pressState.longPressed)

  return {
    pressState,
    pressScale,
    pressOpacity,
    pressOffsetY,
    holdRingOpacity,
    holdRingScale,
    holdReady,
    startPress,
    movePress,
    endPress,
    cancelPress,
  }
}
