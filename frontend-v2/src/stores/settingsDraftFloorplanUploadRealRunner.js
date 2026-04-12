import { uploadFloorplan } from '../shared/api/endpoints/spatial'
import {
  buildFloorplanUploadExecutionAdapterBundle,
  normalizeFloorplanUploadError,
  normalizeFloorplanUploadResponse,
} from './settingsDraftFloorplanUploadExecutorAdapter'

export const SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY = 'settings-draft-floorplan-upload-real'

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

function buildPassiveStepOutcome(stepResult = {}) {
  if (stepResult.executionState === 'skipped') {
    return {
      executionState: 'skipped',
      outcome: 'skipped',
      message: stepResult.message ?? '当前步骤无需执行。',
      error: null,
    }
  }

  if (stepResult.executionState === 'unavailable') {
    return {
      executionState: 'unavailable',
      outcome: 'unavailable',
      message: stepResult.message ?? '当前步骤暂不可用。',
      error: null,
    }
  }

  if (stepResult.executionState === 'blocked') {
    return {
      executionState: 'blocked',
      outcome: 'blocked',
      message: stepResult.message ?? '当前步骤被阻塞。',
      error: null,
    }
  }

  return {
    executionState: 'skipped',
    outcome: 'skipped',
    message: stepResult.message ?? '当前步骤暂由非目标 runner 保持原状。',
    error: null,
  }
}

function summarizeResults(results = []) {
  return results.reduce(
    (acc, item) => {
      if (item.executionState === 'completed') {
        acc.successCount += 1
      } else if (item.executionState === 'skipped') {
        acc.skippedCount += 1
      } else if (item.executionState === 'blocked') {
        acc.blockedCount += 1
      } else if (item.executionState === 'failed') {
        acc.failedCount += 1
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
      unavailableCount: 0,
    },
  )
}

function normalizeZoneId(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeTargets(values = []) {
  const list = Array.isArray(values) ? values : [values]
  const normalized = list
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
  return Array.from(new Set(normalized))
}

function isFormDataLike(value) {
  return Boolean(value && typeof value === 'object' && typeof value.append === 'function' && typeof value.get === 'function')
}

function buildFloorplanUploadNetworkSummary({
  mode = 'real',
  method = 'POST',
  endpoint = '/api/spatial/floorplan',
  hasFormData = false,
  zoneId = null,
  requestCount = 0,
  successCount = 0,
  failedCount = 0,
  durationMs = null,
  targets = [],
  status = 'skipped',
} = {}) {
  return {
    mode,
    method,
    endpoint,
    hasFormData: Boolean(hasFormData),
    zoneId: normalizeZoneId(zoneId),
    requestCount: Number.isFinite(Number(requestCount)) ? Number(requestCount) : 0,
    successCount: Number.isFinite(Number(successCount)) ? Number(successCount) : 0,
    failedCount: Number.isFinite(Number(failedCount)) ? Number(failedCount) : 0,
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    targets: normalizeTargets(targets),
    status,
  }
}

function buildFallbackFloorplanNetworkSummary(stepResult = {}) {
  const count = Number.isFinite(Number(stepResult?.count)) ? Number(stepResult.count) : 0
  const executionState = stepResult?.executionState ?? 'skipped'
  const isCompleted = executionState === 'completed'
  const isFailed = executionState === 'failed'
  const zoneId = normalizeZoneId(stepResult?.target)

  return buildFloorplanUploadNetworkSummary({
    endpoint: stepResult?.endpoint ?? '/api/spatial/floorplan',
    hasFormData: false,
    zoneId,
    requestCount: count,
    successCount: isCompleted ? count : 0,
    failedCount: isFailed ? Math.max(1, count) : 0,
    durationMs: stepResult?.durationMs ?? null,
    targets: zoneId != null ? [zoneId] : [],
    status: executionState,
  })
}

async function runFloorplanUploadStep(stepResult, submitPlan, abortSignal) {
  const adapterBundle = buildFloorplanUploadExecutionAdapterBundle(submitPlan, {
    stepKey: stepResult.stepKey,
  })
  const requestZoneId = normalizeZoneId(adapterBundle?.requestPreview?.meta?.zoneId ?? stepResult?.target)
  const hasFormData = isFormDataLike(adapterBundle?.requestPreview?.body)

  if (!adapterBundle.requestReady || !adapterBundle.requestPreview) {
    const normalizedError = adapterBundle.normalizedError
      ?? normalizeFloorplanUploadError(
        {
          code: 'floorplan_upload_not_ready',
          message: 'floorplan upload 请求尚未达到可执行条件。',
          raw: adapterBundle,
        },
        { stepKey: stepResult.stepKey },
      )

    const blockedState = stepResult.executionState === 'unavailable' ? 'unavailable' : 'blocked'

    return {
      executionState: blockedState,
      outcome: blockedState,
      message: normalizedError.message,
      error: normalizedError,
      endpoint: adapterBundle.endpoint,
      count: adapterBundle.count,
      target: stepResult.target ?? null,
      adapterBundle,
      response: null,
      transportMode: 'real',
      networkSummary: buildFloorplanUploadNetworkSummary({
        endpoint: adapterBundle.endpoint,
        hasFormData,
        zoneId: requestZoneId,
        requestCount: adapterBundle.count,
        successCount: 0,
        failedCount: 0,
        durationMs: 0,
        targets: requestZoneId != null ? [requestZoneId] : [],
        status: blockedState,
      }),
    }
  }

  const startedAt = Date.now()

  try {
    const rawResponse = await uploadFloorplan(adapterBundle.requestPreview.body, {
      signal: abortSignal,
    })

    const normalizedResponse = normalizeFloorplanUploadResponse(rawResponse, {
      stepKey: stepResult.stepKey,
      request: {
        meta: adapterBundle.requestPreview.meta,
        imagePath: submitPlan?.floorplanUpload?.imagePath ?? null,
      },
    })

    return {
      executionState: 'completed',
      outcome: 'success',
      message: 'floorplan upload 已成功上传到底图接口。',
      error: null,
      durationMs: Math.max(0, Date.now() - startedAt),
      endpoint: adapterBundle.endpoint,
      count: 1,
      target: adapterBundle.requestPreview.meta.zoneId,
      adapterBundle,
      response: normalizedResponse,
      transportMode: 'real',
      networkSummary: buildFloorplanUploadNetworkSummary({
        endpoint: adapterBundle.endpoint,
        hasFormData,
        zoneId: requestZoneId,
        requestCount: 1,
        successCount: 1,
        failedCount: 0,
        durationMs: Math.max(0, Date.now() - startedAt),
        targets: requestZoneId != null ? [requestZoneId] : [],
        status: 'completed',
      }),
    }
  } catch (error) {
    const normalizedError = normalizeFloorplanUploadError(error, {
      stepKey: stepResult.stepKey,
      raw: error,
    })

    return {
      executionState: 'failed',
      outcome: 'failed',
      message: normalizedError.message,
      error: normalizedError,
      durationMs: Math.max(0, Date.now() - startedAt),
      endpoint: adapterBundle.endpoint,
      count: adapterBundle.count,
      target: adapterBundle.requestPreview.meta.zoneId,
      adapterBundle,
      response: null,
      transportMode: 'real',
      networkSummary: buildFloorplanUploadNetworkSummary({
        endpoint: adapterBundle.endpoint,
        hasFormData,
        zoneId: requestZoneId,
        requestCount: adapterBundle.count || 1,
        successCount: 0,
        failedCount: 1,
        durationMs: Math.max(0, Date.now() - startedAt),
        targets: requestZoneId != null ? [requestZoneId] : [],
        status: 'failed',
      }),
    }
  }
}

export const settingsDraftFloorplanUploadRealRunner = {
  key: SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY,
  label: 'Settings Draft Floorplan Upload Real Runner',
  kind: 'real',
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

    logDebug(normalizedLogger, '[settings-draft-floorplan-upload-real] start', {
      stepCount: contractResults.length,
      aborted: Boolean(abortSignal?.aborted),
    })

    const results = []

    for (const [index, baseResult] of contractResults.entries()) {
      if (abortSignal?.aborted) {
        break
      }

      normalizedHooks.onStepStart?.(baseResult)
      const startedAt = Date.now()
      const outcome = baseResult.stepKey === 'floorplan_upload'
        ? await runFloorplanUploadStep(baseResult, submitPlan, abortSignal)
        : buildPassiveStepOutcome(baseResult)

      const finalResult = cloneStepResult(baseResult, {
        ...outcome,
        durationMs: outcome.durationMs ?? Math.max(0, Date.now() - startedAt),
      })
      finalResult.networkSummary = finalResult.networkSummary ?? buildFallbackFloorplanNetworkSummary(finalResult)

      results.push(finalResult)

      if (finalResult.executionState === 'failed') {
        normalizedHooks.onStepError?.(finalResult.error)
      }
      normalizedHooks.onStepResult?.(finalResult)

      logDebug(normalizedLogger, '[settings-draft-floorplan-upload-real] step', {
        index,
        stepKey: finalResult.stepKey,
        executionState: finalResult.executionState,
      })
    }

    const networkSummaries = results.map((item) => ({
      stepKey: item.stepKey,
      ...(item.networkSummary ?? buildFallbackFloorplanNetworkSummary(item)),
    }))
    const floorplanStepResult = results.find((item) => item.stepKey === 'floorplan_upload') ?? null

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
        unavailableCount: summaryCounts.unavailableCount,
        canExecute:
          summaryCounts.successCount > 0
          && summaryCounts.failedCount === 0
          && summaryCounts.blockedCount === 0,
      },
      input: {
        submitPlan,
        submitContext,
        logger: normalizedLogger,
        hooks: normalizedHooks,
        abortSignal,
      },
      metadata: {
        executorKey: SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY,
        executorKind: 'real',
        unavailableCount: summaryCounts.unavailableCount,
        networkSummary:
          floorplanStepResult?.networkSummary
          ?? (floorplanStepResult ? buildFallbackFloorplanNetworkSummary(floorplanStepResult) : null),
        networkSummaries,
        floorplanUploadAdapter:
          results.find((item) => item.stepKey === 'floorplan_upload')?.adapterBundle ?? null,
        floorplanUploadRequestMeta:
          results.find((item) => item.stepKey === 'floorplan_upload')?.adapterBundle?.requestPreview?.meta ?? null,
        floorplanUploadFileRefToken:
          results.find((item) => item.stepKey === 'floorplan_upload')?.adapterBundle?.requestPreview?.fileRefToken ?? null,
        floorplanUploadResponse:
          results.find((item) => item.stepKey === 'floorplan_upload')?.response ?? null,
        transportMode: 'real',
        ...createAbortMetadata(abortSignal),
      },
    }

    normalizedHooks.onComplete?.(result)
    logDebug(normalizedLogger, '[settings-draft-floorplan-upload-real] complete', result.summary)
    return result
  },
}
