import { buildDevicePlacementExecutionAdapterBundle } from './settingsDraftDevicePlacementExecutorAdapter'
import { buildFloorplanUploadExecutionAdapterBundle } from './settingsDraftFloorplanUploadExecutorAdapter'

export const SETTINGS_DRAFT_STUB_EXECUTOR_KEY = 'settings-draft-stub'

function normalizeHooks(hooks = {}) {
  return {
    onStepStart: typeof hooks.onStepStart === 'function' ? hooks.onStepStart : null,
    onStepResult: typeof hooks.onStepResult === 'function' ? hooks.onStepResult : null,
    onStepError: typeof hooks.onStepError === 'function' ? hooks.onStepError : null,
    onComplete: typeof hooks.onComplete === 'function' ? hooks.onComplete : null,
  }
}

function normalizeLogger(logger) {
  if (logger && typeof logger === 'object') {
    return logger
  }
  return null
}

function logDebug(logger, message, payload) {
  if (typeof logger?.debug === 'function') {
    logger.debug(message, payload)
  }
}

function createAbortMetadata(abortSignal) {
  return {
    aborted: Boolean(abortSignal?.aborted),
  }
}

function cloneStepResult(stepResult = {}, patch = {}) {
  return {
    stepKey: stepResult.stepKey ?? 'unknown',
    status: stepResult.status ?? 'blocked',
    executionState: stepResult.executionState ?? 'blocked',
    outcome: stepResult.outcome ?? 'blocked',
    message: stepResult.message ?? null,
    error: stepResult.error ?? null,
    durationMs: stepResult.durationMs ?? null,
    target: stepResult.target ?? null,
    endpoint: stepResult.endpoint ?? null,
    count: Number.isFinite(Number(stepResult.count)) ? Number(stepResult.count) : 0,
    label: stepResult.label ?? stepResult.stepKey ?? 'unknown',
    ...patch,
  }
}

function buildStubStepOutcome(stepResult = {}) {
  if (stepResult.executionState === 'would_execute') {
    return {
      outcome: 'pending',
      message: stepResult.message ?? '当前使用 stub runner，步骤已标记为待执行。',
      error: null,
    }
  }

  if (stepResult.executionState === 'skipped') {
    return {
      outcome: 'skipped',
      message: stepResult.message ?? '当前步骤无需执行。',
      error: null,
    }
  }

  if (stepResult.executionState === 'unavailable') {
    return {
      outcome: 'unavailable',
      message: stepResult.message ?? '当前步骤暂不可用。',
      error: null,
    }
  }

  return {
    outcome: 'blocked',
    message: stepResult.message ?? '当前步骤被阻塞，stub runner 不会继续执行。',
    error: null,
  }
}

function summarizeResults(results = []) {
  return results.reduce(
    (acc, item) => {
      if (item.executionState === 'skipped') {
        acc.skippedCount += 1
      } else if (item.executionState === 'blocked') {
        acc.blockedCount += 1
      } else if (item.executionState === 'would_execute') {
        acc.wouldExecuteCount += 1
      } else if (item.executionState === 'unavailable') {
        acc.unavailableCount += 1
      }
      return acc
    },
    {
      successCount: 0,
      skippedCount: 0,
      blockedCount: 0,
      failedCount: 0,
      wouldExecuteCount: 0,
      unavailableCount: 0,
    },
  )
}

function normalizeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeTargetList(values = []) {
  const list = Array.isArray(values) ? values : [values]
  const normalized = list
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
  return Array.from(new Set(normalized))
}

function buildStubNetworkSummary({
  method = 'GET',
  endpoint = '',
  requestCount = 0,
  successCount = 0,
  failedCount = 0,
  durationMs = null,
  targets = [],
  status = 'skipped',
  hasFormData = false,
  zoneId = null,
} = {}) {
  return {
    mode: 'stub',
    method,
    endpoint,
    requestCount: Number.isFinite(Number(requestCount)) ? Number(requestCount) : 0,
    successCount: Number.isFinite(Number(successCount)) ? Number(successCount) : 0,
    failedCount: Number.isFinite(Number(failedCount)) ? Number(failedCount) : 0,
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    targets: normalizeTargetList(targets),
    status,
    hasFormData: Boolean(hasFormData),
    zoneId: normalizeNumber(zoneId),
  }
}

function buildFallbackStubNetworkSummary(stepResult = {}) {
  const count = Number.isFinite(Number(stepResult?.count)) ? Number(stepResult.count) : 0
  const status = stepResult?.outcome ?? stepResult?.executionState ?? 'skipped'
  const isDevicePlacement = stepResult?.stepKey === 'device_placement_save'
  const isFloorplanUpload = stepResult?.stepKey === 'floorplan_upload'
  const target = normalizeNumber(stepResult?.target)

  return buildStubNetworkSummary({
    method: isDevicePlacement ? 'PUT' : isFloorplanUpload ? 'POST' : 'GET',
    endpoint: stepResult?.endpoint ?? '',
    requestCount: count,
    successCount: 0,
    failedCount: 0,
    durationMs: stepResult?.durationMs ?? null,
    targets: target != null ? [target] : [],
    status,
    hasFormData: false,
    zoneId: isFloorplanUpload ? target : null,
  })
}

function buildDevicePlacementStubOutcome(stepResult = {}, submitPlan = null) {
  const adapterBundle = buildDevicePlacementExecutionAdapterBundle(submitPlan, {
    stepKey: stepResult.stepKey,
  })
  const targets = normalizeTargetList(
    adapterBundle?.preview?.requests?.map((item) => item?.pathParams?.device_id) ?? [],
  )

  if (stepResult.executionState === 'would_execute') {
    return {
      outcome: 'pending',
      message: adapterBundle.requestReady
        ? `device placement 已通过 adapter 准备 ${adapterBundle.count} 个请求，当前仍由 stub runner 标记为待执行。`
        : stepResult.message ?? 'device placement 当前处于待执行状态。',
      error: null,
      endpoint: adapterBundle.endpoint,
      count: adapterBundle.count,
      target: adapterBundle.requestPreview?.payload?.device_id ?? stepResult.target ?? null,
      adapterBundle,
      networkSummary: buildStubNetworkSummary({
        method: 'PUT',
        endpoint: adapterBundle.endpoint,
        requestCount: adapterBundle.count,
        successCount: 0,
        failedCount: 0,
        targets,
        status: 'pending',
      }),
    }
  }

  if (stepResult.executionState === 'blocked' || stepResult.executionState === 'unavailable') {
    return {
      outcome: stepResult.executionState === 'unavailable' ? 'unavailable' : 'blocked',
      message: adapterBundle.normalizedError?.message ?? stepResult.message ?? 'device placement 当前不可执行。',
      error: adapterBundle.normalizedError,
      endpoint: adapterBundle.endpoint,
      count: adapterBundle.count,
      target: stepResult.target ?? null,
      adapterBundle,
      networkSummary: buildStubNetworkSummary({
        method: 'PUT',
        endpoint: adapterBundle.endpoint,
        requestCount: adapterBundle.count,
        successCount: 0,
        failedCount: 0,
        targets,
        status: stepResult.executionState === 'unavailable' ? 'unavailable' : 'blocked',
      }),
    }
  }

  return {
    ...buildStubStepOutcome(stepResult),
    endpoint: adapterBundle.endpoint,
    count: adapterBundle.count,
    adapterBundle,
    networkSummary: buildStubNetworkSummary({
      method: 'PUT',
      endpoint: adapterBundle.endpoint,
      requestCount: adapterBundle.count,
      successCount: 0,
      failedCount: 0,
      targets,
      status: stepResult.executionState ?? 'skipped',
    }),
  }
}

function buildFloorplanUploadStubOutcome(stepResult = {}, submitPlan = null) {
  const adapterBundle = buildFloorplanUploadExecutionAdapterBundle(submitPlan, {
    stepKey: stepResult.stepKey,
  })
  const zoneId = normalizeNumber(adapterBundle?.requestPreview?.meta?.zoneId ?? stepResult?.target)

  if (stepResult.executionState === 'would_execute') {
    return {
      outcome: 'pending',
      message: adapterBundle.requestReady
        ? 'floorplan upload 已通过 adapter 构建请求，当前仍由 stub runner 标记为待执行。'
        : stepResult.message ?? 'floorplan upload 当前处于待执行状态。',
      error: null,
      endpoint: adapterBundle.endpoint,
      count: adapterBundle.count,
      target: adapterBundle.requestPreview?.meta?.zoneId ?? stepResult.target ?? null,
      adapterBundle,
      networkSummary: buildStubNetworkSummary({
        method: 'POST',
        endpoint: adapterBundle.endpoint,
        requestCount: adapterBundle.count,
        successCount: 0,
        failedCount: 0,
        targets: zoneId != null ? [zoneId] : [],
        status: 'pending',
        hasFormData: false,
        zoneId,
      }),
    }
  }

  if (stepResult.executionState === 'blocked' || stepResult.executionState === 'unavailable') {
    return {
      outcome: stepResult.executionState === 'unavailable' ? 'unavailable' : 'blocked',
      message: adapterBundle.normalizedError?.message ?? stepResult.message ?? 'floorplan upload 当前不可执行。',
      error: adapterBundle.normalizedError,
      endpoint: adapterBundle.endpoint,
      count: adapterBundle.count,
      target: stepResult.target ?? null,
      adapterBundle,
      networkSummary: buildStubNetworkSummary({
        method: 'POST',
        endpoint: adapterBundle.endpoint,
        requestCount: adapterBundle.count,
        successCount: 0,
        failedCount: 0,
        targets: zoneId != null ? [zoneId] : [],
        status: stepResult.executionState === 'unavailable' ? 'unavailable' : 'blocked',
        hasFormData: false,
        zoneId,
      }),
    }
  }

  return {
    ...buildStubStepOutcome(stepResult),
    endpoint: adapterBundle.endpoint,
    count: adapterBundle.count,
    adapterBundle,
    networkSummary: buildStubNetworkSummary({
      method: 'POST',
      endpoint: adapterBundle.endpoint,
      requestCount: adapterBundle.count,
      successCount: 0,
      failedCount: 0,
      targets: zoneId != null ? [zoneId] : [],
      status: stepResult.executionState ?? 'skipped',
      hasFormData: false,
      zoneId,
    }),
  }
}

export const settingsDraftStubRunner = {
  key: SETTINGS_DRAFT_STUB_EXECUTOR_KEY,
  label: 'Settings Draft Stub Runner',
  kind: 'stub',
  async run(input = {}) {
    const {
      submitPlan = null,
      executorContract = null,
      submitContext = null,
      logger = null,
      hooks = {},
      abortSignal = null,
    } = input

    const normalizedHooks = normalizeHooks(hooks)
    const normalizedLogger = normalizeLogger(logger)
    const contractResults = Array.isArray(executorContract?.results) ? executorContract.results : []

    logDebug(normalizedLogger, '[settings-draft-stub] start', {
      stepCount: contractResults.length,
      aborted: Boolean(abortSignal?.aborted),
    })

    const results = []

    for (const [index, baseResult] of contractResults.entries()) {
      if (abortSignal?.aborted) {
        break
      }

      const startedAt = Date.now()
      normalizedHooks.onStepStart?.(baseResult)
      const outcome =
        baseResult.stepKey === 'device_placement_save'
          ? buildDevicePlacementStubOutcome(baseResult, submitPlan)
          : baseResult.stepKey === 'floorplan_upload'
            ? buildFloorplanUploadStubOutcome(baseResult, submitPlan)
            : buildStubStepOutcome(baseResult)
      const finalResult = cloneStepResult(baseResult, {
        ...outcome,
        durationMs: Math.max(0, Date.now() - startedAt),
      })
      finalResult.networkSummary = finalResult.networkSummary ?? buildFallbackStubNetworkSummary(finalResult)

      results.push(finalResult)
      normalizedHooks.onStepResult?.(finalResult)
      logDebug(normalizedLogger, '[settings-draft-stub] step', {
        index,
        stepKey: finalResult.stepKey,
        executionState: finalResult.executionState,
      })
    }

    const networkSummaries = results.map((item) => ({
      stepKey: item.stepKey,
      ...(item.networkSummary ?? buildFallbackStubNetworkSummary(item)),
    }))
    const primaryNetworkSummary =
      networkSummaries.find((item) => item.stepKey === 'device_placement_save')
      ?? networkSummaries.find((item) => item.stepKey === 'floorplan_upload')
      ?? networkSummaries[0]
      ?? null

    const summaryCounts = summarizeResults(results)
    const result = {
      successCount: summaryCounts.successCount,
      skippedCount: summaryCounts.skippedCount,
      blockedCount: summaryCounts.blockedCount,
      failedCount: summaryCounts.failedCount,
      results,
      summary: {
        totalCount: results.length,
        successCount: summaryCounts.successCount,
        skippedCount: summaryCounts.skippedCount,
        blockedCount: summaryCounts.blockedCount,
        failedCount: summaryCounts.failedCount,
        wouldExecuteCount: summaryCounts.wouldExecuteCount,
        unavailableCount: summaryCounts.unavailableCount,
        canExecute: summaryCounts.wouldExecuteCount > 0 && summaryCounts.blockedCount === 0 && summaryCounts.unavailableCount === 0,
      },
      input: {
        submitPlan,
        submitContext,
        logger: normalizedLogger,
        hooks: normalizedHooks,
        abortSignal,
      },
      metadata: {
        executorKey: SETTINGS_DRAFT_STUB_EXECUTOR_KEY,
        executorKind: 'stub',
        wouldExecuteCount: summaryCounts.wouldExecuteCount,
        unavailableCount: summaryCounts.unavailableCount,
        networkSummary: primaryNetworkSummary,
        networkSummaries,
        floorplanUploadAdapter:
          results.find((item) => item.stepKey === 'floorplan_upload')?.adapterBundle ?? null,
        devicePlacementAdapter:
          results.find((item) => item.stepKey === 'device_placement_save')?.adapterBundle ?? null,
        ...createAbortMetadata(abortSignal),
      },
    }

    normalizedHooks.onComplete?.(result)
    logDebug(normalizedLogger, '[settings-draft-stub] complete', result.summary)
    return result
  },
}
