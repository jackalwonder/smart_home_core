import {
  settingsDraftStubRunner,
  SETTINGS_DRAFT_STUB_EXECUTOR_KEY,
} from './settingsDraftStubRunner'
import {
  settingsDraftDevicePlacementRealRunner,
  SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY,
} from './settingsDraftDevicePlacementRealRunner'
import {
  settingsDraftFloorplanUploadRealRunner,
  SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY,
} from './settingsDraftFloorplanUploadRealRunner'

export const SETTINGS_DRAFT_COMPOSITE_REAL_EXECUTOR_KEY = 'settings-draft-composite-real'

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
      } else if (item.executionState === 'would_execute') {
        acc.wouldExecuteCount += 1
      }
      return acc
    },
    {
      successCount: 0,
      skippedCount: 0,
      blockedCount: 0,
      failedCount: 0,
      unavailableCount: 0,
      wouldExecuteCount: 0,
    },
  )
}

function pickStepExecutor(stepKey) {
  if (stepKey === 'floorplan_upload') {
    return settingsDraftFloorplanUploadRealRunner
  }
  if (stepKey === 'device_placement_save') {
    return settingsDraftDevicePlacementRealRunner
  }
  return settingsDraftStubRunner
}

function createSingleStepContract(executorContract, baseResult) {
  return {
    ...executorContract,
    results: [baseResult],
  }
}

function buildFallbackCompositeNetworkSummary(stepResult = {}) {
  const count = Number.isFinite(Number(stepResult?.count)) ? Number(stepResult.count) : 0
  const executionState = stepResult?.executionState ?? 'skipped'
  const targetNumeric = Number(stepResult?.target)
  const targetList = Number.isFinite(targetNumeric) ? [targetNumeric] : []
  const method =
    stepResult?.stepKey === 'device_placement_save'
      ? 'PUT'
      : stepResult?.stepKey === 'floorplan_upload'
        ? 'POST'
        : 'GET'

  return {
    mode: 'composite',
    method,
    endpoint: stepResult?.endpoint ?? '',
    requestCount: count,
    successCount: executionState === 'completed' ? count : 0,
    failedCount: executionState === 'failed' ? Math.max(1, count) : 0,
    durationMs: Number.isFinite(Number(stepResult?.durationMs)) ? Number(stepResult.durationMs) : null,
    targets: targetList,
    status: executionState,
  }
}

function extractStepNetworkSummary(stepResultBundle = null, finalResult = {}, stepKey = '') {
  if (finalResult?.networkSummary && typeof finalResult.networkSummary === 'object') {
    return finalResult.networkSummary
  }

  const directSummary = stepResultBundle?.metadata?.networkSummary
  if (directSummary && typeof directSummary === 'object') {
    return directSummary
  }

  const summaries = Array.isArray(stepResultBundle?.metadata?.networkSummaries)
    ? stepResultBundle.metadata.networkSummaries
    : []
  const matched = summaries.find((item) => item?.stepKey === stepKey)
  if (matched && typeof matched === 'object') {
    const { stepKey: _ignoredStepKey, ...summary } = matched
    return summary
  }

  return buildFallbackCompositeNetworkSummary(finalResult)
}

export const settingsDraftCompositeRealRunner = {
  key: SETTINGS_DRAFT_COMPOSITE_REAL_EXECUTOR_KEY,
  label: 'Settings Draft Composite Real Runner',
  kind: 'composite',
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
    const results = []
    const stepExecutors = {}
    const floorplanUploadMetadata = []
    const devicePlacementMetadata = []
    const networkSummaries = []

    logDebug(normalizedLogger, '[settings-draft-composite-real] start', {
      stepCount: contractResults.length,
      aborted: Boolean(abortSignal?.aborted),
    })

    for (const [index, baseResult] of contractResults.entries()) {
      if (abortSignal?.aborted) {
        break
      }

      const executor = pickStepExecutor(baseResult.stepKey)
      stepExecutors[baseResult.stepKey] = executor.key
      normalizedHooks.onStepStart?.(baseResult)

      const stepResultBundle = await executor.run({
        submitPlan,
        executorContract: createSingleStepContract(executorContract, baseResult),
        submitContext,
        logger: normalizedLogger,
        hooks: {},
        abortSignal,
      })

      const finalResult = Array.isArray(stepResultBundle?.results)
        ? stepResultBundle.results[0] ?? baseResult
        : baseResult

      results.push(finalResult)
      networkSummaries.push({
        stepKey: finalResult.stepKey ?? baseResult.stepKey ?? 'unknown',
        ...extractStepNetworkSummary(stepResultBundle, finalResult, baseResult.stepKey),
      })

      if (baseResult.stepKey === 'floorplan_upload' && stepResultBundle?.metadata) {
        floorplanUploadMetadata.push(stepResultBundle.metadata)
      }
      if (baseResult.stepKey === 'device_placement_save' && stepResultBundle?.metadata) {
        devicePlacementMetadata.push(stepResultBundle.metadata)
      }

      if (finalResult.executionState === 'failed') {
        normalizedHooks.onStepError?.(finalResult.error)
      }
      normalizedHooks.onStepResult?.(finalResult)

      logDebug(normalizedLogger, '[settings-draft-composite-real] step', {
        index,
        stepKey: finalResult.stepKey,
        executorKey: executor.key,
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
        wouldExecuteCount: summaryCounts.wouldExecuteCount,
        unavailableCount: summaryCounts.unavailableCount,
        canExecute:
          (summaryCounts.successCount > 0 || summaryCounts.wouldExecuteCount > 0)
          && summaryCounts.failedCount === 0
          && summaryCounts.blockedCount === 0
          && summaryCounts.unavailableCount === 0,
      },
      input: {
        submitPlan,
        submitContext,
        logger: normalizedLogger,
        hooks: normalizedHooks,
        abortSignal,
      },
      metadata: {
        executorKey: SETTINGS_DRAFT_COMPOSITE_REAL_EXECUTOR_KEY,
        executorKind: 'composite',
        stepExecutors,
        floorplanUpload: floorplanUploadMetadata.at(-1) ?? null,
        devicePlacement: devicePlacementMetadata.at(-1) ?? null,
        floorplanUploadAdapter: floorplanUploadMetadata.at(-1)?.floorplanUploadAdapter ?? null,
        floorplanUploadResponse: floorplanUploadMetadata.at(-1)?.floorplanUploadResponse ?? null,
        devicePlacementAdapter: devicePlacementMetadata.at(-1)?.devicePlacementAdapter ?? null,
        devicePlacementResponses: devicePlacementMetadata.at(-1)?.devicePlacementResponses ?? [],
        networkSummary:
          networkSummaries.find((item) => item.stepKey === 'device_placement_save')
          ?? networkSummaries.find((item) => item.stepKey === 'floorplan_upload')
          ?? networkSummaries[0]
          ?? null,
        networkSummaries,
        unavailableCount: summaryCounts.unavailableCount,
        ...createAbortMetadata(abortSignal),
      },
    }

    normalizedHooks.onComplete?.(result)
    logDebug(normalizedLogger, '[settings-draft-composite-real] complete', result.summary)
    return result
  },
}
