function normalizeStepKey(step = {}, index = 0) {
  return typeof step.type === 'string' && step.type.trim() ? step.type.trim() : `step_${index}`
}

function normalizeExecutionState(status) {
  if (status === 'ready') return 'would_execute'
  if (status === 'noop') return 'skipped'
  if (status === 'blocked') return 'blocked'
  if (status === 'unavailable' || status === 'partial') return 'unavailable'
  return 'blocked'
}

function buildStepResult(step = {}, index = 0) {
  const stepKey = normalizeStepKey(step, index)
  const executionState = normalizeExecutionState(step.status)

  return {
    stepKey,
    status: typeof step.status === 'string' ? step.status : 'blocked',
    executionState,
    outcome:
      executionState === 'would_execute'
        ? 'pending'
        : executionState === 'skipped'
          ? 'skipped'
          : executionState === 'unavailable'
            ? 'unavailable'
            : 'blocked',
    message: step.reason ?? null,
    error: null,
    durationMs: null,
    target: step.target ?? null,
    endpoint: step.endpoint ?? null,
    count: Number.isFinite(Number(step.count)) ? Number(step.count) : 0,
    label: step.label ?? step.type ?? stepKey,
  }
}

function buildExecutionSummary(results = []) {
  return results.reduce(
    (acc, item) => {
      if (item.executionState === 'would_execute') {
        acc.successCount += 1
      } else if (item.executionState === 'skipped') {
        acc.skippedCount += 1
      } else if (item.executionState === 'blocked') {
        acc.blockedCount += 1
      } else if (item.executionState === 'unavailable') {
        acc.failedCount += 1
      }
      return acc
    },
    {
      successCount: 0,
      skippedCount: 0,
      blockedCount: 0,
      failedCount: 0,
    },
  )
}

export function buildSettingsDraftExecutorContract(submitPlan, executionPreview = {}) {
  const steps = Array.isArray(submitPlan?.steps) ? submitPlan.steps : []
  const previewSteps = Array.isArray(executionPreview?.steps) ? executionPreview.steps : []

  const results = steps.map((step, index) => {
    const previewStep = previewSteps[index] ?? step
    return buildStepResult(previewStep, index)
  })

  const summaryCounts = buildExecutionSummary(results)
  const totalCount = results.length

  return {
    input: {
      submitPlan: submitPlan ?? null,
      submitContext: null,
      logger: null,
      hooks: {
        onStepStart: null,
        onStepResult: null,
        onStepError: null,
        onComplete: null,
      },
      abortSignal: null,
    },
    results,
    summary: {
      totalCount,
      successCount: summaryCounts.successCount,
      skippedCount: summaryCounts.skippedCount,
      blockedCount: summaryCounts.blockedCount,
      failedCount: summaryCounts.failedCount,
      canExecute: executionPreview?.canExecute ?? false,
    },
    metadata: {
      wouldRunCount: executionPreview?.wouldRunCount ?? 0,
      noopCount: executionPreview?.noopCount ?? 0,
      blockedCount: executionPreview?.blockedCount ?? 0,
      unavailableCount: executionPreview?.unavailableCount ?? 0,
    },
  }
}
