import { onBeforeUnmount, ref } from 'vue'

const DRAG_THRESHOLD_PX = 3

function clampPercent(value) {
  return Math.max(0, Math.min(100, value))
}

function toPercentPosition(canvasElement, clientX, clientY) {
  const bounds = canvasElement?.getBoundingClientRect?.()
  if (!bounds || !bounds.width || !bounds.height) {
    return null
  }

  const x = clampPercent(((clientX - bounds.left) / bounds.width) * 100)
  const y = clampPercent(((clientY - bounds.top) / bounds.height) * 100)
  return {
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1)),
  }
}

export function useStageEditorInteractions(options) {
  const {
    stageCanvasRef,
    onSelect,
    onMove,
    onCreate,
    onRotate,
  } = options

  const draggingHotspotId = ref('')
  const dragStart = ref(null)
  const hasDragged = ref(false)
  const suppressClickHotspotId = ref('')
  const createStart = ref(null)

  function handleGlobalPointerMove(event) {
    if (!draggingHotspotId.value || !stageCanvasRef.value) {
      return
    }

    const nextPosition = toPercentPosition(stageCanvasRef.value, event.clientX, event.clientY)
    if (!nextPosition) {
      return
    }

    const movedX = Math.abs(event.clientX - (dragStart.value?.x ?? event.clientX))
    const movedY = Math.abs(event.clientY - (dragStart.value?.y ?? event.clientY))
    if (!hasDragged.value && (movedX > DRAG_THRESHOLD_PX || movedY > DRAG_THRESHOLD_PX)) {
      hasDragged.value = true
      suppressClickHotspotId.value = draggingHotspotId.value
    }

    if (!hasDragged.value) {
      return
    }

    onMove?.(draggingHotspotId.value, nextPosition)
  }

  function stopDragSession() {
    window.removeEventListener('pointermove', handleGlobalPointerMove)
    window.removeEventListener('pointerup', stopDragSession)
    window.removeEventListener('pointercancel', stopDragSession)
    draggingHotspotId.value = ''
    dragStart.value = null
    hasDragged.value = false
  }

  function startDrag(event, hotspotId) {
    if (!stageCanvasRef.value || !hotspotId) {
      return
    }

    draggingHotspotId.value = hotspotId
    dragStart.value = { x: event.clientX, y: event.clientY }
    hasDragged.value = false

    window.addEventListener('pointermove', handleGlobalPointerMove)
    window.addEventListener('pointerup', stopDragSession)
    window.addEventListener('pointercancel', stopDragSession)
  }

  function handleHotspotClick(hotspotId) {
    if (!hotspotId) {
      return
    }
    if (suppressClickHotspotId.value === hotspotId) {
      suppressClickHotspotId.value = ''
      return
    }
    onSelect?.(hotspotId)
  }

  function handleCanvasPointerDown(event) {
    if (!stageCanvasRef.value || event.button !== 0) {
      return
    }

    if (event.target instanceof Element && event.target.closest('.stage-hotspot')) {
      return
    }

    const start = toPercentPosition(stageCanvasRef.value, event.clientX, event.clientY)
    if (!start) {
      return
    }
    createStart.value = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: start.x,
      y: start.y,
    }
  }

  function handleCanvasPointerUp(event) {
    if (!createStart.value || !stageCanvasRef.value || event.button !== 0) {
      createStart.value = null
      return
    }

    const movedX = Math.abs(event.clientX - createStart.value.clientX)
    const movedY = Math.abs(event.clientY - createStart.value.clientY)
    if (movedX <= DRAG_THRESHOLD_PX && movedY <= DRAG_THRESHOLD_PX) {
      onCreate?.({ x: createStart.value.x, y: createStart.value.y })
    }

    createStart.value = null
  }

  function handleRotate(hotspotId, delta) {
    if (!hotspotId || !delta) {
      return
    }
    onRotate?.(hotspotId, delta)
  }

  onBeforeUnmount(() => {
    stopDragSession()
  })

  return {
    startDrag,
    handleHotspotClick,
    handleCanvasPointerDown,
    handleCanvasPointerUp,
    handleRotate,
  }
}
