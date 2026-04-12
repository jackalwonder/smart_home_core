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
        unavailableCount: summaryCounts.unavailableCount,
        ...createAbortMetadata(abortSignal),
      },
    }

    normalizedHooks.onComplete?.(result)
    logDebug(normalizedLogger, '[settings-draft-composite-real] complete', result.summary)
    return result
  },
}
