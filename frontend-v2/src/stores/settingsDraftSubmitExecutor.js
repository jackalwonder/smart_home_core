function normalizeStepStatus(status) {
  const value = typeof status === 'string' ? status : ''
  if (value === 'ready' || value === 'noop' || value === 'blocked' || value === 'unavailable' || value === 'partial') {
    return value
  }
  return 'blocked'
}

function buildPreviewStep(step = {}, index = 0) {
  const status = normalizeStepStatus(step.status)
  const isFloorplanUpload = step.type === 'floorplan_upload'
  const isRoomLayout = step.type === 'room_layout_save'
  const isDevicePlacement = step.type === 'device_placement_save'

  let executionState = 'blocked'
  if (status === 'ready') {
    executionState = 'would_run'
  } else if (status === 'noop') {
    executionState = 'noop'
  } else if (status === 'unavailable') {
    executionState = 'unavailable'
  } else if (status === 'partial') {
    executionState = 'blocked'
  }

  return {
    index,
    type: step.type ?? 'unknown',
    label: isFloorplanUpload ? '底图上传' : isRoomLayout ? '房间布局保存' : isDevicePlacement ? '设备摆位保存' : step.type ?? '未知步骤',
    status,
    executionState,
    count: Number.isFinite(Number(step.count)) ? Number(step.count) : 0,
    target: step.target ?? null,
    reason: step.reason ?? null,
    endpoint: step.endpoint ?? null,
  }
}

export function buildSettingsDraftSubmitExecutionPreview(submitPlan) {
  const steps = Array.isArray(submitPlan?.steps) ? submitPlan.steps : []
  const blockers = Array.isArray(submitPlan?.blockers) ? submitPlan.blockers : []
  const ignored = Array.isArray(submitPlan?.ignored) ? submitPlan.ignored : []

  const previewSteps = steps.map(buildPreviewStep)
  const wouldRunSteps = previewSteps.filter((step) => step.executionState === 'would_run')
  const noopSteps = previewSteps.filter((step) => step.executionState === 'noop')
  const blockedSteps = previewSteps.filter((step) => step.executionState === 'blocked')
  const unavailableSteps = previewSteps.filter((step) => step.executionState === 'unavailable')

  const blockingReasons = [
    ...blockers.map((item) => item.message || item.reason || '步骤被阻塞'),
    ...blockedSteps
      .map((step) => step.reason || `步骤 ${step.label} 当前不可执行`)
      .filter(Boolean),
  ]

  const canExecute = wouldRunSteps.length > 0 && blockedSteps.length === 0 && unavailableSteps.length === 0

  return {
    canExecute,
    steps: previewSteps,
    blockingReasons,
    wouldRunCount: wouldRunSteps.length,
    noopCount: noopSteps.length,
    blockedCount: blockedSteps.length,
    unavailableCount: unavailableSteps.length,
    totalCount: previewSteps.length,
    blockerCount: blockers.length,
    ignoredCount: ignored.length,
    summary: {
      wouldRunCount: wouldRunSteps.length,
      noopCount: noopSteps.length,
      blockedCount: blockedSteps.length,
      unavailableCount: unavailableSteps.length,
    },
  }
}
