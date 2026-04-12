import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import {
  clearLegacyDraftCache as clearLegacyDraftCachePersistence,
  loadDraft,
  resetDraft,
  saveDraft,
} from './settingsDraftPersistence'
import {
  createDefaultSettingsDraft,
  DEFAULT_FLOORPLAN_ASPECT_RATIO,
  settingsColorGroupOptions,
  settingsCommonDeviceGroupsSeed,
  settingsDraftEntityLibrarySeed,
  settingsDefaultDraftHotspots,
  settingsNotificationsSeed,
  settingsRoomOptions,
} from './settingsDraftSeeds'
import { buildSettingsDraftSubmitExecutionPreview } from './settingsDraftSubmitExecutor'
import { buildSettingsDraftExecutorContract } from './settingsDraftExecutorContract'
import { buildSettingsDraftSubmitPlan } from './settingsDraftSubmitAdapters'
import { resolveSettingsDraftExecutor } from './settingsDraftExecutorResolver'
import { buildDevicePlacementExecutorAdapterPreview } from './settingsDraftDevicePlacementExecutorAdapter'
import { buildFloorplanUploadExecutorAdapterPreview } from './settingsDraftFloorplanUploadExecutorAdapter'

function deriveAspectRatio(width, height, fallback = DEFAULT_FLOORPLAN_ASPECT_RATIO) {
  const normalizedWidth = Number(width)
  const normalizedHeight = Number(height)
  if (Number.isFinite(normalizedWidth) && Number.isFinite(normalizedHeight) && normalizedWidth > 0 && normalizedHeight > 0) {
    return `${normalizedWidth} / ${normalizedHeight}`
  }
  return fallback
}

function normalizeDraftHotspot(hotspot, index = 0) {
  const icon = hotspot.icon ?? 'light'
  return {
    id: hotspot.id ?? `hotspot-${Date.now()}-${index}`,
    x: Number(hotspot.x ?? 50),
    y: Number(hotspot.y ?? 50),
    icon,
    active: Boolean(hotspot.active),
    rotation: Number(hotspot.rotation ?? 0),
    label: hotspot.label ?? '未命名热点',
    category: hotspot.category ?? (icon === 'light' ? 'lights' : 'climate'),
    deviceId: hotspot.deviceId ?? '',
    roomKey: hotspot.roomKey ?? 'living',
    colorGroup: hotspot.colorGroup ?? 'blue',
  }
}

function normalizeDraftAsset(asset, index = 0) {
  return {
    id: asset.id ?? `asset-${Date.now()}-${index}`,
    name: asset.name ?? `未命名素材 ${index + 1}`,
    preview: asset.preview ?? '/floorplans/songyue-floorplan.jpg',
    sourceType: asset.sourceType ?? 'builtin',
    fileName: asset.fileName ?? null,
    mimeType: asset.mimeType ?? null,
    fileSize: Number.isFinite(Number(asset.fileSize)) ? Number(asset.fileSize) : null,
    imageWidth: Number.isFinite(Number(asset.imageWidth)) ? Number(asset.imageWidth) : null,
    imageHeight: Number.isFinite(Number(asset.imageHeight)) ? Number(asset.imageHeight) : null,
    fileRefToken: asset.fileRefToken ?? null,
    objectUrl: null,
  }
}

function normalizeDraftFloor(floor, index = 0) {
  return {
    id: floor.id ?? `floor-${Date.now()}-${index}`,
    code: floor.code ?? `or-${index + 1}`,
    name: floor.name ?? `楼层 ${index + 1}`,
    imagePath: floor.imagePath ?? '/floorplans/songyue-floorplan.jpg',
    floorplanAssetId: floor.floorplanAssetId ?? null,
    aspectRatio: !floor.aspectRatio || floor.aspectRatio === '1556 / 1313' ? DEFAULT_FLOORPLAN_ASPECT_RATIO : floor.aspectRatio,
    hotspots: Array.isArray(floor.hotspots)
      ? floor.hotspots.map((item, hotspotIndex) => normalizeDraftHotspot(item, hotspotIndex))
      : settingsDefaultDraftHotspots.map((item, hotspotIndex) => normalizeDraftHotspot(item, hotspotIndex)),
  }
}

function normalizeDraftPayload(payload) {
  const fallback = createDefaultSettingsDraft()
  return {
    settingsMenu: (Array.isArray(payload?.settingsMenu) ? payload.settingsMenu : fallback.settingsMenu).map((item) => ({ ...item })),
    draftAssets: (Array.isArray(payload?.draftAssets) ? payload.draftAssets : fallback.draftAssets).map((item, index) => normalizeDraftAsset(item, index)),
    draftFloors: (Array.isArray(payload?.draftFloors) ? payload.draftFloors : fallback.draftFloors).map((item, index) => normalizeDraftFloor(item, index)),
    activeDraftFloorId: payload?.activeDraftFloorId ?? fallback.activeDraftFloorId,
  }
}

function inferDraftHotspotMeta(deviceLibrary, deviceId) {
  return deviceLibrary.find((device) => device.id === deviceId) ?? null
}

function buildFloorplanSubmitPresentation(submitPlan) {
  const uploadStep = submitPlan?.floorplanUpload ?? { status: 'noop', reason: '当前没有底图提交动作。' }
  const blockers = (submitPlan?.blockers ?? []).filter((item) =>
    [
      'missing_active_floor',
      'missing_zone_mapping',
      'floorplan_asset_missing',
      'floorplan_requires_upload_asset',
      'floorplan_missing_upload_ref',
      'floorplan_upload_ref_unavailable',
      'floorplan_missing_dimensions',
    ].includes(item.type),
  )
  const isRefExpired = blockers.some((item) => item.type === 'floorplan_upload_ref_unavailable')

  const base = {
    status: uploadStep.status,
    isRefExpired,
  }

  if (uploadStep.status === 'ready') {
    return {
      ...base,
      tone: 'ready',
      title: '底图已具备提交条件',
      message: '当前上传素材保留了文件引用、尺寸信息和可提交元数据，后续可进入 floorplan upload 步骤。',
      detail: uploadStep.assetMeta?.fileName
        ? `${uploadStep.assetMeta.fileName} · ${uploadStep.assetMeta.imageWidth || '-'} x ${uploadStep.assetMeta.imageHeight || '-'}`
        : '当前会话中的上传引用仍可用。',
      tag: 'ready',
    }
  }

  if (uploadStep.status === 'noop') {
    return {
      ...base,
      tone: 'noop',
      title: '当前无需提交底图',
      message: uploadStep.reason || '当前激活楼层底图与已知后端底图一致，暂无新的上传动作。',
      detail: '如果重新选择上传型素材，提交状态会重新评估。',
      tag: 'noop',
    }
  }

  if (isRefExpired) {
    return {
      ...base,
      tone: 'blocked',
      title: '上传引用已失效',
      message: '当前草稿仍保留 fileRefToken，但刷新后原始文件桥接已失效，需要重新选择文件。',
      detail: uploadStep.assetMeta?.fileName || '请重新上传当前底图素材以恢复可提交状态。',
      tag: 'ref expired',
    }
  }

  return {
    ...base,
    tone: 'blocked',
    title: '底图暂不具备提交条件',
    message: uploadStep.reason || blockers[0]?.message || '当前底图草稿还缺少后续提交所需条件。',
    detail: blockers[0]?.message || '补齐上传素材类型、文件引用、尺寸或 zone 映射后即可继续。',
    tag: 'blocked',
  }
}

function applySuccessfulDevicePlacementCorrections(executionResult, draftFloorsRef) {
  const responses = Array.isArray(executionResult?.metadata?.devicePlacementResponses)
    ? executionResult.metadata.devicePlacementResponses
    : []

  if (!responses.length) {
    return false
  }

  let mutated = false

  draftFloorsRef.value = draftFloorsRef.value.map((floor) => {
    let floorChanged = false

    const nextHotspots = floor.hotspots.map((hotspot) => {
      const response = responses.find((item) => item?.hotspotId === hotspot.id)
      if (!response?.payload) {
        return hotspot
      }

      const nextX = Number(response.payload.plan_x)
      const nextY = Number(response.payload.plan_y)
      const nextRotation = Number(response.payload.plan_rotation ?? 0)
      const shouldPatch =
        Number.isFinite(nextX)
        && Number.isFinite(nextY)
        && (
          Number(hotspot.x) !== nextX
          || Number(hotspot.y) !== nextY
          || Number(hotspot.rotation ?? 0) !== nextRotation
        )

      if (!shouldPatch) {
        return hotspot
      }

      floorChanged = true
      mutated = true

      return {
        ...hotspot,
        x: nextX,
        y: nextY,
        rotation: nextRotation,
      }
    })

    if (!floorChanged) {
      return floor
    }

    return {
      ...floor,
      hotspots: nextHotspots,
    }
  })

  return mutated
}

function applySuccessfulFloorplanUploadCorrections(executionResult, draftFloorsRef, draftAssetsRef, activeDraftFloorIdRef) {
  const response = executionResult?.metadata?.floorplanUploadResponse
  const payload = response?.payload
  if (!payload?.image_url) {
    return false
  }

  const nextImageUrl = payload.image_url
  const nextWidth = Number(payload.image_width)
  const nextHeight = Number(payload.image_height)
  const nextAspectRatio =
    Number.isFinite(nextWidth) && nextWidth > 0 && Number.isFinite(nextHeight) && nextHeight > 0
      ? deriveAspectRatio(nextWidth, nextHeight)
      : null

  let floorMutated = false
  draftFloorsRef.value = draftFloorsRef.value.map((floor) => {
    if (floor.id !== activeDraftFloorIdRef.value) {
      return floor
    }

    const shouldPatchImage = floor.imagePath !== nextImageUrl
    const shouldPatchRatio = Boolean(nextAspectRatio && floor.aspectRatio !== nextAspectRatio)
    if (!shouldPatchImage && !shouldPatchRatio) {
      return floor
    }

    floorMutated = true
    return {
      ...floor,
      imagePath: shouldPatchImage ? nextImageUrl : floor.imagePath,
      aspectRatio: shouldPatchRatio ? nextAspectRatio : floor.aspectRatio,
    }
  })

  let assetMutated = false
  draftAssetsRef.value = draftAssetsRef.value.map((asset) => {
    if (asset.id !== executionResult?.input?.submitPlan?.floorplanUpload?.assetId) {
      return asset
    }

    const nextPreview = nextImageUrl
    const shouldPatch =
      asset.preview !== nextPreview
      || (Number.isFinite(nextWidth) && asset.imageWidth !== nextWidth)
      || (Number.isFinite(nextHeight) && asset.imageHeight !== nextHeight)
      || (payload.file_name && asset.fileName !== payload.file_name)

    if (!shouldPatch) {
      return asset
    }

    assetMutated = true
    return {
      ...asset,
      preview: nextPreview,
      fileName: payload.file_name || asset.fileName,
      imageWidth: Number.isFinite(nextWidth) ? nextWidth : asset.imageWidth,
      imageHeight: Number.isFinite(nextHeight) ? nextHeight : asset.imageHeight,
    }
  })

  return floorMutated || assetMutated
}

export const useSettingsEditorStore = defineStore('settings-editor', () => {
  const loadedDraft = loadDraft(createDefaultSettingsDraft())
  const normalizedDraft = normalizeDraftPayload(loadedDraft.draft)

  const settingsMenu = ref(normalizedDraft.settingsMenu)
  const draftAssets = ref(normalizedDraft.draftAssets)
  const draftFloors = ref(normalizedDraft.draftFloors)
  const activeDraftFloorId = ref(normalizedDraft.activeDraftFloorId)
  const selectedDraftHotspotId = ref('')
  const draftEntityLibrary = ref(settingsDraftEntityLibrarySeed.map((item) => ({ ...item })))

  const activeDraftFloor = computed(() =>
    draftFloors.value.find((floor) => floor.id === activeDraftFloorId.value) ?? draftFloors.value[0] ?? null,
  )

  const activeDraftHotspots = computed(() => activeDraftFloor.value?.hotspots ?? [])
  const commonDeviceGroups = computed(() => settingsCommonDeviceGroupsSeed)
  const draftSubmitPlan = computed(() =>
    buildSettingsDraftSubmitPlan({
      draftAssets: draftAssets.value,
      draftFloors: draftFloors.value,
      activeDraftFloorId: activeDraftFloorId.value,
      activeDraftHotspots: activeDraftHotspots.value,
      draftEntityLibrary: draftEntityLibrary.value,
    }),
  )
  const floorplanSubmitPresentation = computed(() => buildFloorplanSubmitPresentation(draftSubmitPlan.value))
  const draftSubmitExecutionPreview = computed(() =>
    buildSettingsDraftSubmitExecutionPreview(draftSubmitPlan.value),
  )
  const draftSubmitExecutorContract = computed(() =>
    buildSettingsDraftExecutorContract(draftSubmitPlan.value, draftSubmitExecutionPreview.value),
  )
  const draftDevicePlacementExecutorAdapterPreview = computed(() =>
    buildDevicePlacementExecutorAdapterPreview(draftSubmitPlan.value),
  )
  const draftFloorplanUploadExecutorAdapterPreview = computed(() =>
    buildFloorplanUploadExecutorAdapterPreview(draftSubmitPlan.value),
  )
  const resolvedDraftSubmitExecutor = computed(() =>
    resolveSettingsDraftExecutor({
      submitPlan: draftSubmitPlan.value,
      executorContract: draftSubmitExecutorContract.value,
    }),
  )

  function buildPersistedDraftPayload() {
    return {
      settingsMenu: settingsMenu.value,
      draftAssets: draftAssets.value,
      draftFloors: draftFloors.value,
      activeDraftFloorId: activeDraftFloorId.value,
    }
  }

  watch(
    [settingsMenu, draftAssets, draftFloors, activeDraftFloorId],
    () => {
      saveDraft(buildPersistedDraftPayload())
    },
    { deep: true },
  )

  function persistDraftNow() {
    saveDraft(buildPersistedDraftPayload())
  }

  function buildDraftSubmitPlan(submitContext = {}) {
    return buildSettingsDraftSubmitPlan(
      {
        draftAssets: draftAssets.value,
        draftFloors: draftFloors.value,
        activeDraftFloorId: activeDraftFloorId.value,
        activeDraftHotspots: activeDraftHotspots.value,
        draftEntityLibrary: draftEntityLibrary.value,
      },
      submitContext,
    )
  }

  async function runDraftSubmitExecution(options = {}) {
    const executor = resolveSettingsDraftExecutor({
      submitPlan: draftSubmitPlan.value,
      executorContract: draftSubmitExecutorContract.value,
      submitContext: options.submitContext ?? null,
    })

    const result = await executor.run({
      submitPlan: draftSubmitPlan.value,
      executorContract: draftSubmitExecutorContract.value,
      submitContext: options.submitContext ?? null,
      logger: options.logger ?? null,
      hooks: options.hooks ?? {},
      abortSignal: options.abortSignal ?? null,
    })

    const corrected = applySuccessfulDevicePlacementCorrections(result, draftFloors)
    const floorplanCorrected = applySuccessfulFloorplanUploadCorrections(
      result,
      draftFloors,
      draftAssets,
      activeDraftFloorId,
    )
    if (corrected || floorplanCorrected) {
      saveDraft(buildPersistedDraftPayload())
    }

    return result
  }

  async function runDraftSubmitExecutionDebug(options = {}) {
    const hookCounts = {
      onStepStart: 0,
      onStepResult: 0,
      onStepError: 0,
      onComplete: 0,
    }

    const stepKeysStarted = []
    const stepKeysResolved = []

    const result = await runDraftSubmitExecution({
      ...options,
      hooks: {
        ...(options.hooks ?? {}),
        onStepStart(step) {
          hookCounts.onStepStart += 1
          stepKeysStarted.push(step?.stepKey ?? 'unknown')
          options.hooks?.onStepStart?.(step)
        },
        onStepResult(stepResult) {
          hookCounts.onStepResult += 1
          stepKeysResolved.push(stepResult?.stepKey ?? 'unknown')
          options.hooks?.onStepResult?.(stepResult)
        },
        onStepError(stepError) {
          hookCounts.onStepError += 1
          options.hooks?.onStepError?.(stepError)
        },
        onComplete(finalResult) {
          hookCounts.onComplete += 1
          options.hooks?.onComplete?.(finalResult)
        },
      },
    })

    const results = Array.isArray(result?.results) ? result.results : []
    const summary = result?.summary ?? {}
    const counted = results.reduce(
      (acc, item) => {
        if (item.executionState === 'would_execute') acc.wouldExecute += 1
        else if (item.executionState === 'completed') acc.completed += 1
        else if (item.executionState === 'skipped') acc.skipped += 1
        else if (item.executionState === 'blocked') acc.blocked += 1
        else if (item.executionState === 'failed') acc.failed += 1
        else if (item.executionState === 'unavailable') acc.unavailable += 1
        return acc
      },
      {
        wouldExecute: 0,
        completed: 0,
        skipped: 0,
        blocked: 0,
        failed: 0,
        unavailable: 0,
      },
    )

    const checks = {
      hasResultsArray: Array.isArray(result?.results),
      hasSummaryObject: typeof summary === 'object' && summary !== null,
      stepShapeValid: results.every((item) =>
        item
        && typeof item.stepKey === 'string'
        && typeof item.status === 'string'
        && typeof item.executionState === 'string'
        && Object.prototype.hasOwnProperty.call(item, 'outcome')
        && Object.prototype.hasOwnProperty.call(item, 'message')
        && Object.prototype.hasOwnProperty.call(item, 'error')
        && Object.prototype.hasOwnProperty.call(item, 'durationMs'),
      ),
      countsMatch:
        Number(summary.successCount ?? -1) === counted.completed
        && Number(summary.skippedCount ?? -1) === counted.skipped
        && Number(summary.blockedCount ?? -1) === counted.blocked
        && Number(summary.failedCount ?? -1) === counted.failed
        && Number(summary.wouldExecuteCount ?? counted.wouldExecute) === counted.wouldExecute
        && Number(summary.unavailableCount ?? -1) === counted.unavailable,
      hookCountsMatch:
        hookCounts.onStepStart === results.length
        && hookCounts.onStepResult === results.length
        && hookCounts.onStepError === counted.failed
        && hookCounts.onComplete === 1,
    }

    return {
      ok: Object.values(checks).every(Boolean),
      result,
      checks,
      hookCounts,
      stepKeysStarted,
      stepKeysResolved,
      resolvedExecutorKey: resolvedDraftSubmitExecutor.value?.key ?? 'unknown',
      scenarioSummary: {
        successCount: counted.completed,
        wouldExecuteCount: counted.wouldExecute,
        skippedCount: counted.skipped,
        blockedCount: counted.blocked,
        failedCount: counted.failed,
        unavailableCount: counted.unavailable,
      },
    }
  }

  function resetDraftState() {
    const nextDraft = normalizeDraftPayload(resetDraft(createDefaultSettingsDraft()))
    settingsMenu.value = nextDraft.settingsMenu
    draftAssets.value = nextDraft.draftAssets
    draftFloors.value = nextDraft.draftFloors
    activeDraftFloorId.value = nextDraft.activeDraftFloorId
    selectedDraftHotspotId.value = ''
  }

  function clearLegacyDraftCache() {
    clearLegacyDraftCachePersistence()
  }

  function selectSettingsMenu(menuKey) {
    settingsMenu.value = settingsMenu.value.map((item) => ({
      ...item,
      active: item.key === menuKey,
    }))
  }

  function addDraftAsset(filePayload) {
    draftAssets.value = [
      normalizeDraftAsset({
        id: `asset-${Date.now()}`,
        name: filePayload.name,
        preview: filePayload.preview,
        sourceType: filePayload.sourceType ?? 'upload',
        fileName: filePayload.fileName ?? filePayload.name,
        mimeType: filePayload.mimeType ?? null,
        fileSize: filePayload.fileSize ?? null,
        imageWidth: filePayload.imageWidth ?? null,
        imageHeight: filePayload.imageHeight ?? null,
        fileRefToken: filePayload.fileRefToken ?? null,
      }),
      ...draftAssets.value,
    ]
  }

  function applyAssetToActiveDraftFloor(assetId) {
    const asset = draftAssets.value.find((item) => item.id === assetId)
    if (!asset || !activeDraftFloor.value) {
      return
    }

    draftFloors.value = draftFloors.value.map((floor) =>
      floor.id === activeDraftFloor.value.id
        ? {
            ...floor,
            imagePath: asset.preview,
            floorplanAssetId: asset.id,
            aspectRatio: deriveAspectRatio(asset.imageWidth, asset.imageHeight, floor.aspectRatio),
          }
        : floor,
    )
  }

  function updateDraftHotspot(floorId, hotspotId, field, value) {
    draftFloors.value = draftFloors.value.map((floor) => {
      if (floor.id !== floorId) {
        return floor
      }

      return {
        ...floor,
        hotspots: floor.hotspots.map((hotspot) => {
          if (hotspot.id !== hotspotId) {
            return hotspot
          }

          const nextDeviceId = field === 'deviceId' ? value : hotspot.deviceId
          const nextMeta = inferDraftHotspotMeta(draftEntityLibrary.value, nextDeviceId)
          const nextIcon = field === 'icon' ? value : hotspot.icon
          const nextCategory =
            field === 'category'
              ? value
              : nextMeta?.category || hotspot.category || (nextIcon === 'light' ? 'lights' : 'climate')

          return {
            ...hotspot,
            [field]: field === 'x' || field === 'y' ? Number(value) : value,
            icon: nextIcon,
            category: nextCategory,
          }
        }),
      }
    })
  }

  function addDraftHotspot(floorId, initialHotspot = {}) {
    draftFloors.value = draftFloors.value.map((floor) => {
      if (floor.id !== floorId) {
        return floor
      }

      const nextIndex = floor.hotspots.length + 1
      return {
        ...floor,
        hotspots: [
          ...floor.hotspots,
          normalizeDraftHotspot({
            id: initialHotspot.id ?? `hotspot-${Date.now()}`,
            x: initialHotspot.x ?? 50,
            y: initialHotspot.y ?? 50,
            icon: initialHotspot.icon ?? 'light',
            active: initialHotspot.active ?? false,
            label: initialHotspot.label ?? `新热点 ${nextIndex}`,
            category: initialHotspot.category ?? 'lights',
            deviceId: initialHotspot.deviceId ?? draftEntityLibrary.value[0]?.id ?? '',
            roomKey: initialHotspot.roomKey ?? 'living',
            colorGroup: initialHotspot.colorGroup ?? 'blue',
          }),
        ],
      }
    })
  }

  function updateDraftHotspotPosition(hotspotId, x, y) {
    if (!activeDraftFloor.value || !hotspotId) {
      return
    }
    updateDraftHotspot(activeDraftFloor.value.id, hotspotId, 'x', x)
    updateDraftHotspot(activeDraftFloor.value.id, hotspotId, 'y', y)
  }

  function updateDraftHotspotRotation(hotspotId, rotation) {
    if (!activeDraftFloor.value || !hotspotId) {
      return
    }
    updateDraftHotspot(activeDraftFloor.value.id, hotspotId, 'rotation', rotation)
  }

  function selectDraftHotspot(hotspotId) {
    selectedDraftHotspotId.value = hotspotId || ''
  }

  function addDraftHotspotAtCurrentFloor(initialHotspot = {}) {
    if (!activeDraftFloor.value) {
      return
    }
    addDraftHotspot(activeDraftFloor.value.id, initialHotspot)
    if (initialHotspot.id) {
      selectedDraftHotspotId.value = initialHotspot.id
    }
  }

  function removeDraftHotspotById(hotspotId) {
    if (!activeDraftFloor.value || !hotspotId) {
      return
    }
    removeDraftHotspot(activeDraftFloor.value.id, hotspotId)
    if (selectedDraftHotspotId.value === hotspotId) {
      selectedDraftHotspotId.value = ''
    }
  }

  function removeDraftHotspot(floorId, hotspotId) {
    draftFloors.value = draftFloors.value.map((floor) => {
      if (floor.id !== floorId) {
        return floor
      }

      return {
        ...floor,
        hotspots: floor.hotspots.filter((hotspot) => hotspot.id !== hotspotId),
      }
    })
  }

  return {
    roomOptions: settingsRoomOptions,
    colorGroupOptions: settingsColorGroupOptions,
    notifications: settingsNotificationsSeed,
    settingsMenu,
    commonDeviceGroups,
    draftAssets,
    draftFloors,
    activeDraftFloorId,
    selectedDraftHotspotId,
    activeDraftFloor,
    activeDraftHotspots,
    draftEntityLibrary,
    draftSubmitPlan,
    floorplanSubmitPresentation,
    draftSubmitExecutionPreview,
    draftSubmitExecutorContract,
    draftDevicePlacementExecutorAdapterPreview,
    draftFloorplanUploadExecutorAdapterPreview,
    resolvedDraftSubmitExecutor,
    persistDraftNow,
    buildDraftSubmitPlan,
    runDraftSubmitExecution,
    runDraftSubmitExecutionDebug,
    resetDraftState,
    clearLegacyDraftCache,
    selectSettingsMenu,
    addDraftAsset,
    applyAssetToActiveDraftFloor,
    updateDraftHotspot,
    updateDraftHotspotPosition,
    updateDraftHotspotRotation,
    selectDraftHotspot,
    addDraftHotspot,
    addDraftHotspotAtCurrentFloor,
    removeDraftHotspot,
    removeDraftHotspotById,
  }
})
