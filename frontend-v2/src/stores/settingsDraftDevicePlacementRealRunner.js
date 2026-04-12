import { updateDevicePlacement } from '../shared/api/endpoints/spatial'
import {
  buildDevicePlacementExecutionAdapterBundle,
  normalizeDevicePlacementError,
  normalizeDevicePlacementResponse,
} from './settingsDraftDevicePlacementExecutorAdapter'

export const SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY = 'settings-draft-device-placement-real'

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

async function runDevicePlacementStep(stepResult, submitPlan, abortSignal) {
  const adapterBundle = buildDevicePlacementExecutionAdapterBundle(submitPlan, {
    stepKey: stepResult.stepKey,
  })

  if (!adapterBundle.requestReady || !adapterBundle.requestPreview) {
    const normalizedError = adapterBundle.normalizedError
      ?? normalizeDevicePlacementError(
        {
          code: 'device_placement_not_ready',
          message: 'device placement 请求尚未达到可执行条件。',
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
      response: [],
    }
  }

  const startedAt = Date.now()
  const normalizedResponses = []

  try {
    for (const request of adapterBundle.preview.requests.filter((item) => item.requestReady)) {
      const rawResponse = await updateDevicePlacement(
        request.pathParams.device_id,
        request.body,
        { signal: abortSignal },
      )

      normalizedResponses.push(
        normalizeDevicePlacementResponse(rawResponse, {
          stepKey: request.stepKey,
          request,
        }),
      )
    }

    return {
      executionState: 'completed',
      outcome: 'success',
      message: `device placement 已成功提交 ${normalizedResponses.length} 个请求。`,
      error: null,
      durationMs: Math.max(0, Date.now() - startedAt),
      endpoint: adapterBundle.endpoint,
      count: normalizedResponses.length,
      target: adapterBundle.requestPreview.payload.device_id,
      adapterBundle,
      response: normalizedResponses,
    }
  } catch (error) {
    const normalizedError = normalizeDevicePlacementError(error, {
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
      target: adapterBundle.requestPreview.payload.device_id,
      adapterBundle,
      response: [],
    }
  }
}

export const settingsDraftDevicePlacementRealRunner = {
  key: SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY,
  label: 'Settings Draft Device Placement Real Runner',
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

    logDebug(normalizedLogger, '[settings-draft-device-placement-real] start', {
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
      const outcome = baseResult.stepKey === 'device_placement_save'
        ? await runDevicePlacementStep(baseResult, submitPlan, abortSignal)
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

      logDebug(normalizedLogger, '[settings-draft-device-placement-real] step', {
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
        executorKey: SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY,
        executorKind: 'real',
        unavailableCount: summaryCounts.unavailableCount,
        devicePlacementAdapter:
          results.find((item) => item.stepKey === 'device_placement_save')?.adapterBundle ?? null,
        devicePlacementResponses:
          results.find((item) => item.stepKey === 'device_placement_save')?.response ?? [],
        ...createAbortMetadata(abortSignal),
      },
    }

    normalizedHooks.onComplete?.(result)
    logDebug(normalizedLogger, '[settings-draft-device-placement-real] complete', result.summary)
    return result
  },
}

