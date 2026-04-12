import {
  getExecutor,
  hasExecutor,
  registerExecutor,
} from './settingsDraftExecutorRegistry'
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
import {
  settingsDraftCompositeRealRunner,
  SETTINGS_DRAFT_COMPOSITE_REAL_EXECUTOR_KEY,
} from './settingsDraftCompositeRealRunner'

function ensureDefaultStubRunner() {
  if (!hasExecutor(SETTINGS_DRAFT_STUB_EXECUTOR_KEY)) {
    registerExecutor(SETTINGS_DRAFT_STUB_EXECUTOR_KEY, settingsDraftStubRunner)
  }
  return getExecutor(SETTINGS_DRAFT_STUB_EXECUTOR_KEY)
}

function ensureDevicePlacementRealRunner() {
  if (!hasExecutor(SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY)) {
    registerExecutor(SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY, settingsDraftDevicePlacementRealRunner)
  }
  return getExecutor(SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY)
}

function ensureFloorplanUploadRealRunner() {
  if (!hasExecutor(SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY)) {
    registerExecutor(SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY, settingsDraftFloorplanUploadRealRunner)
  }
  return getExecutor(SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY)
}

function ensureCompositeRealRunner() {
  if (!hasExecutor(SETTINGS_DRAFT_COMPOSITE_REAL_EXECUTOR_KEY)) {
    registerExecutor(SETTINGS_DRAFT_COMPOSITE_REAL_EXECUTOR_KEY, settingsDraftCompositeRealRunner)
  }
  return getExecutor(SETTINGS_DRAFT_COMPOSITE_REAL_EXECUTOR_KEY)
}

function hasDevicePlacementStep(submitPlan = null) {
  return Array.isArray(submitPlan?.steps)
    && submitPlan.steps.some((step) => step?.type === 'device_placement_save')
}

function hasFloorplanUploadStep(submitPlan = null) {
  return Array.isArray(submitPlan?.steps)
    && submitPlan.steps.some((step) => step?.type === 'floorplan_upload')
}

function resolvePreferredExecutorKey({ submitPlan = null, submitContext = {}, executorContract = {} } = {}) {
  if (typeof submitContext?.executorKey === 'string' && submitContext.executorKey.trim()) {
    return submitContext.executorKey.trim()
  }

  if (typeof executorContract?.metadata?.preferredExecutorKey === 'string' && executorContract.metadata.preferredExecutorKey.trim()) {
    return executorContract.metadata.preferredExecutorKey.trim()
  }

  if (hasFloorplanUploadStep(submitPlan) || hasDevicePlacementStep(submitPlan)) {
    return SETTINGS_DRAFT_COMPOSITE_REAL_EXECUTOR_KEY
  }

  return SETTINGS_DRAFT_STUB_EXECUTOR_KEY
}

export function resolveSettingsDraftExecutor(options = {}) {
  const preferredExecutorKey = resolvePreferredExecutorKey(options)
  const preferredExecutor = getExecutor(preferredExecutorKey)

  if (preferredExecutor) {
    return preferredExecutor
  }

  return ensureDefaultStubRunner()
}

ensureDefaultStubRunner()
ensureDevicePlacementRealRunner()
ensureFloorplanUploadRealRunner()
ensureCompositeRealRunner()
