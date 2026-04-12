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

async function runFloorplanUploadStep(stepResult, submitPlan, abortSignal) {
  const adapterBundle = buildFloorplanUploadExecutionAdapterBundle(submitPlan, {
    stepKey: stepResult.stepKey,
  })

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
        floorplanUploadAdapter:
          results.find((item) => item.stepKey === 'floorplan_upload')?.adapterBundle ?? null,
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
