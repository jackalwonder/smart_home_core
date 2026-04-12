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
import { SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY } from './settingsDraftDevicePlacementRealRunner'
import { SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY } from './settingsDraftFloorplanUploadRealRunner'
import { buildSubmitContextFromSpatialScene } from './settingsDraftSubmitContext'
import { getSpatialScene } from '../shared/api/endpoints/scene'

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
    developerLayoutEditEnabled: Boolean(payload?.developerLayoutEditEnabled ?? fallback.developerLayoutEditEnabled),
    developerLayoutViewDraftEnabled:
      Boolean(payload?.developerLayoutViewDraftEnabled ?? fallback.developerLayoutViewDraftEnabled),
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

function buildSubmitPlanSummary(submitPlan = null) {
  const steps = Array.isArray(submitPlan?.steps) ? submitPlan.steps : []
  const blockers = Array.isArray(submitPlan?.blockers) ? submitPlan.blockers : []
  const ignored = Array.isArray(submitPlan?.ignored) ? submitPlan.ignored : []
  const devicePlacements = Array.isArray(submitPlan?.devicePlacements) ? submitPlan.devicePlacements : []

  return {
    totalSteps: steps.length,
    steps: steps.map((step, index) => ({
      index,
      type: step?.type ?? `step_${index}`,
      status: step?.status ?? 'blocked',
      count: Number.isFinite(Number(step?.count)) ? Number(step.count) : 0,
    })),
    blockerCount: blockers.length,
    ignoredCount: ignored.length,
    floorplanUploadStatus: submitPlan?.floorplanUpload?.status ?? null,
    devicePlacementSummary: {
      total: devicePlacements.length,
      ready: devicePlacements.filter((item) => item?.status === 'ready').length,
      noop: devicePlacements.filter((item) => item?.status === 'noop').length,
      blocked: devicePlacements.filter((item) => item?.status === 'blocked').length,
    },
  }
}

function isSubmitContextObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizePreflightText(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed || fallback
}

function normalizePreflightLevel(level) {
  if (level === 'error' || level === 'warning' || level === 'info') {
    return level
  }
  return 'info'
}

function normalizePreflightScope(scope) {
  if (scope === 'global' || scope === 'floorplan_upload' || scope === 'device_placement_save' || scope === 'room_layout_save') {
    return scope
  }
  return 'global'
}

function buildPreflightItemSignature(item = {}) {
  return `${item.level}|${item.scope}|${item.code}|${item.message}`
}

function pushPreflightItem(items, signatures, item = {}) {
  const normalized = {
    level: normalizePreflightLevel(item.level),
    scope: normalizePreflightScope(item.scope),
    code: normalizePreflightText(item.code, 'unknown'),
    message: normalizePreflightText(item.message, 'Unknown preflight state.'),
  }
  const signature = buildPreflightItemSignature(normalized)
  if (signatures.has(signature)) {
    return
  }
  signatures.add(signature)
  items.push(normalized)
}

function buildDraftSubmitPreflight(executionArtifacts = {}) {
  const submitPlan = executionArtifacts?.submitPlan ?? null
  const executionPreview = executionArtifacts?.executionPreview ?? null
  const executorContract = executionArtifacts?.executorContract ?? null
  const blockers = Array.isArray(submitPlan?.blockers) ? submitPlan.blockers : []
  const roomLayouts = Array.isArray(submitPlan?.roomLayouts) ? submitPlan.roomLayouts : []
  const floorplanUpload = submitPlan?.floorplanUpload ?? null
  const contractResults = Array.isArray(executorContract?.results) ? executorContract.results : []
  const blockedStepKeys = contractResults
    .filter((item) => item?.executionState === 'blocked')
    .map((item) => normalizePreflightText(item?.stepKey))
    .filter(Boolean)
  const unavailableStepKeys = contractResults
    .filter((item) => item?.executionState === 'unavailable')
    .map((item) => normalizePreflightText(item?.stepKey))
    .filter(Boolean)

  const devicePlacementPreview = buildDevicePlacementExecutorAdapterPreview(submitPlan)
  const floorplanUploadPreview = buildFloorplanUploadExecutorAdapterPreview(submitPlan)
  const items = []
  const signatures = new Set()

  if (!Number.isFinite(Number(floorplanUpload?.zoneId))) {
    pushPreflightItem(items, signatures, {
      level: 'error',
      scope: 'floorplan_upload',
      code: 'missing_zone_mapping',
      message: '缺少 zoneId，无法准备 floorplan 上传请求。',
    })
  }

  blockers
    .filter((item) => item?.type === 'missing_device_mapping')
    .forEach((item) => {
      pushPreflightItem(items, signatures, {
        level: 'error',
        scope: 'device_placement_save',
        code: 'missing_device_mapping',
        message: item?.message || '存在热点未映射到后端 device_id。',
      })
    })

  blockers
    .filter((item) => item?.type === 'floorplan_missing_upload_ref' || item?.type === 'floorplan_upload_ref_unavailable')
    .forEach((item) => {
      pushPreflightItem(items, signatures, {
        level: 'error',
        scope: 'floorplan_upload',
        code: item?.type,
        message: item?.message || '底图上传 fileRefToken 缺失或已失效。',
      })
    })

  roomLayouts
    .filter((item) => item?.status === 'unavailable')
    .forEach((item) => {
      pushPreflightItem(items, signatures, {
        level: 'warning',
        scope: 'room_layout_save',
        code: 'room_layout_truth_unavailable',
        message: item?.reason || 'room_layout_save 当前不可用。',
      })
    })

  const previewSteps = Array.isArray(executionPreview?.steps) ? executionPreview.steps : []
  previewSteps
    .filter((step) => step?.executionState === 'blocked' || step?.executionState === 'unavailable')
    .forEach((step) => {
      pushPreflightItem(items, signatures, {
        level: step.executionState === 'blocked' ? 'error' : 'warning',
        scope: normalizePreflightScope(step?.type),
        code: step.executionState === 'blocked' ? 'step_blocked' : 'step_unavailable',
        message: step?.reason || `步骤 ${step?.type || 'unknown'} 当前 ${step.executionState === 'blocked' ? '被阻塞' : '不可用'}。`,
      })
    })

  const deviceRequests = Array.isArray(devicePlacementPreview?.requests) ? devicePlacementPreview.requests : []
  deviceRequests.forEach((request) => {
    const requestErrors = Array.isArray(request?.errors) ? request.errors : []
    requestErrors.forEach((error) => {
      pushPreflightItem(items, signatures, {
        level: 'error',
        scope: 'device_placement_save',
        code: normalizePreflightText(error?.code, 'device_request_error'),
        message: normalizePreflightText(error?.message, 'device placement 请求不可执行。'),
      })
    })

    if (!request?.requestReady && (request?.status === 'blocked' || request?.status === 'unavailable')) {
      pushPreflightItem(items, signatures, {
        level: request.status === 'blocked' ? 'error' : 'warning',
        scope: 'device_placement_save',
        code: request.status === 'blocked' ? 'device_request_blocked' : 'device_request_unavailable',
        message: normalizePreflightText(request?.label, request?.stepKey || 'device placement request'),
      })
    }
  })

  const floorplanErrors = Array.isArray(floorplanUploadPreview?.errors) ? floorplanUploadPreview.errors : []
  floorplanErrors.forEach((error) => {
    pushPreflightItem(items, signatures, {
      level: 'error',
      scope: 'floorplan_upload',
      code: normalizePreflightText(error?.code, 'floorplan_request_error'),
      message: normalizePreflightText(error?.message, 'floorplan upload 请求不可执行。'),
    })
  })

  if (
    !floorplanUploadPreview?.requestReady
    && (floorplanUploadPreview?.stepStatus === 'blocked' || floorplanUploadPreview?.stepStatus === 'unavailable')
  ) {
    pushPreflightItem(items, signatures, {
      level: floorplanUploadPreview.stepStatus === 'blocked' ? 'error' : 'warning',
      scope: 'floorplan_upload',
      code: floorplanUploadPreview.stepStatus === 'blocked' ? 'floorplan_request_blocked' : 'floorplan_request_unavailable',
      message: 'floorplan upload 预览请求当前不可执行。',
    })
  }

  if (!items.length) {
    pushPreflightItem(items, signatures, {
      level: 'info',
      scope: 'global',
      code: 'preflight_clear',
      message: '当前未发现阻塞 preflight 项。',
    })
  }

  const summary = items.reduce(
    (acc, item) => {
      if (item.level === 'error') acc.errorCount += 1
      else if (item.level === 'warning') acc.warningCount += 1
      else acc.infoCount += 1
      return acc
    },
    {
      totalCount: items.length,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      blockedCount: blockedStepKeys.length,
      unavailableCount: unavailableStepKeys.length,
    },
  )

  return {
    preflightSummary: summary,
    preflightItems: items,
    blockedStepKeys: Array.from(new Set(blockedStepKeys)),
    unavailableStepKeys: Array.from(new Set(unavailableStepKeys)),
  }
}

function normalizePlacementNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function buildNormalizedPlacement(payload = {}) {
  return {
    plan_x: normalizePlacementNumber(payload?.plan_x),
    plan_y: normalizePlacementNumber(payload?.plan_y),
    plan_z: normalizePlacementNumber(payload?.plan_z),
    plan_rotation: normalizePlacementNumber(payload?.plan_rotation) ?? 0,
  }
}

function buildPlacementDiff(submittedPlacement = {}, readbackPlacement = {}) {
  const fields = ['plan_x', 'plan_y', 'plan_z', 'plan_rotation']
  const fieldDiffs = fields.map((field) => {
    const submitted = submittedPlacement?.[field] ?? null
    const readback = readbackPlacement?.[field] ?? null
    return {
      field,
      submitted,
      readback,
      matches: submitted === readback,
    }
  })

  return {
    matches: fieldDiffs.every((item) => item.matches),
    changedFields: fieldDiffs.filter((item) => !item.matches).map((item) => item.field),
    fields: fieldDiffs,
  }
}

function extractDevicePlacementSubmittedPayloads(executionResult = {}) {
  const responses = Array.isArray(executionResult?.metadata?.devicePlacementResponses)
    ? executionResult.metadata.devicePlacementResponses
    : []

  return responses
    .map((item) => ({
      deviceId: normalizePlacementNumber(item?.payload?.device_id),
      submittedPlacement: buildNormalizedPlacement(item?.payload),
      raw: item,
    }))
    .filter((item) => Number.isFinite(item.deviceId))
}

function findDeviceInScenePayload(scenePayload = null, deviceId = null) {
  const normalizedDeviceId = normalizePlacementNumber(deviceId)
  if (!Number.isFinite(normalizedDeviceId)) {
    return null
  }

  const rooms = Array.isArray(scenePayload?.rooms) ? scenePayload.rooms : []
  for (const room of rooms) {
    const devices = Array.isArray(room?.devices) ? room.devices : []
    for (const device of devices) {
      if (normalizePlacementNumber(device?.id) === normalizedDeviceId) {
        return {
          roomId: normalizePlacementNumber(room?.id),
          roomName: typeof room?.name === 'string' ? room.name : '',
          device,
        }
      }
    }
  }

  return null
}

function buildReadbackPlacementFromSceneDevice(sceneDevice = null) {
  if (!sceneDevice || typeof sceneDevice !== 'object') {
    return null
  }

  const effectiveLayout = sceneDevice?.effective_layout && typeof sceneDevice.effective_layout === 'object'
    ? sceneDevice.effective_layout
    : {}

  return buildNormalizedPlacement({
    plan_x: sceneDevice?.plan_x ?? effectiveLayout.plan_x,
    plan_y: sceneDevice?.plan_y ?? effectiveLayout.plan_y,
    plan_z: sceneDevice?.plan_z ?? effectiveLayout.plan_z,
    plan_rotation: sceneDevice?.plan_rotation ?? effectiveLayout.plan_rotation,
  })
}

async function performDevicePlacementReadback(executionResult = {}, options = {}) {
  const readbackAfterExecution = Boolean(options.readbackAfterExecution)
  const submittedPayloads = extractDevicePlacementSubmittedPayloads(executionResult)
  const base = {
    readbackPerformed: false,
    readbackSucceeded: false,
    readbackSource: 'none',
    devicePlacementReadback: {
      requestedCount: submittedPayloads.length,
      matchedCount: 0,
      comparisons: [],
    },
    readbackIssues: [],
  }

  if (!readbackAfterExecution) {
    base.readbackIssues.push({
      code: 'readback_disabled',
      message: 'Readback is disabled for this debug execution.',
    })
    return base
  }

  if (!submittedPayloads.length) {
    base.readbackIssues.push({
      code: 'readback_skipped_no_successful_device_placement',
      message: 'No successful device placement response was available for readback.',
    })
    return base
  }

  const query = isSubmitContextObject(options.sceneQuery) ? options.sceneQuery : {}

  try {
    const scenePayload = await getSpatialScene(query)
    const comparisons = []
    const issues = []

    submittedPayloads.forEach((item) => {
      const sceneMatch = findDeviceInScenePayload(scenePayload, item.deviceId)
      if (!sceneMatch?.device) {
        issues.push({
          code: 'readback_device_not_found',
          deviceId: item.deviceId,
          message: `Unable to locate device ${item.deviceId} in scene readback payload.`,
        })
        return
      }

      const readbackPlacement = buildReadbackPlacementFromSceneDevice(sceneMatch.device)
      comparisons.push({
        deviceId: item.deviceId,
        roomId: sceneMatch.roomId,
        roomName: sceneMatch.roomName,
        submittedPlacement: item.submittedPlacement,
        readbackPlacement,
        placementDiff: buildPlacementDiff(item.submittedPlacement, readbackPlacement),
      })
    })

    return {
      readbackPerformed: true,
      readbackSucceeded: comparisons.length > 0 && issues.length === 0,
      readbackSource: '/api/spatial/scene',
      devicePlacementReadback: {
        requestedCount: submittedPayloads.length,
        matchedCount: comparisons.length,
        comparisons,
      },
      readbackIssues: issues,
    }
  } catch (error) {
    return {
      readbackPerformed: true,
      readbackSucceeded: false,
      readbackSource: '/api/spatial/scene',
      devicePlacementReadback: {
        requestedCount: submittedPayloads.length,
        matchedCount: 0,
        comparisons: [],
      },
      readbackIssues: [
        {
          code: 'readback_request_failed',
          message: error?.message || 'Failed to load spatial scene for readback.',
        },
      ],
    }
  }
}

function buildNormalizedFloorplanUpload(executionResult = {}) {
  const requestMeta = executionResult?.metadata?.floorplanUploadRequestMeta ?? {}
  const responsePayload = executionResult?.metadata?.floorplanUploadResponse?.payload ?? {}
  const inputUpload = executionResult?.input?.submitPlan?.floorplanUpload ?? {}

  return {
    zoneId:
      normalizePlacementNumber(responsePayload?.zone_id)
      ?? normalizePlacementNumber(requestMeta?.zoneId)
      ?? normalizePlacementNumber(inputUpload?.zoneId),
    imagePath:
      normalizePreflightText(responsePayload?.image_url)
      || normalizePreflightText(inputUpload?.imagePath)
      || '',
    imageWidth:
      normalizePlacementNumber(responsePayload?.image_width)
      ?? normalizePlacementNumber(requestMeta?.imageWidth),
    imageHeight:
      normalizePlacementNumber(responsePayload?.image_height)
      ?? normalizePlacementNumber(requestMeta?.imageHeight),
    fileName:
      normalizePreflightText(responsePayload?.file_name)
      || normalizePreflightText(requestMeta?.fileName)
      || '',
    fileRefToken:
      normalizePreflightText(executionResult?.metadata?.floorplanUploadFileRefToken)
      || normalizePreflightText(inputUpload?.fileRefToken)
      || '',
  }
}

function buildReadbackFloorplanFromScene(scenePayload = null) {
  const zone = scenePayload?.zone ?? {}
  return {
    zoneId: normalizePlacementNumber(zone?.id),
    floorPlanImagePath: normalizePreflightText(zone?.floor_plan_image_path),
    floorPlanImageWidth: normalizePlacementNumber(zone?.floor_plan_image_width),
    floorPlanImageHeight: normalizePlacementNumber(zone?.floor_plan_image_height),
  }
}

function buildFloorplanDiff(submittedUpload = {}, readbackFloorplan = {}) {
  const fields = [
    { submittedKey: 'zoneId', readbackKey: 'zoneId', name: 'zoneId' },
    { submittedKey: 'imagePath', readbackKey: 'floorPlanImagePath', name: 'floorPlanImagePath' },
    { submittedKey: 'imageWidth', readbackKey: 'floorPlanImageWidth', name: 'floorPlanImageWidth' },
    { submittedKey: 'imageHeight', readbackKey: 'floorPlanImageHeight', name: 'floorPlanImageHeight' },
  ]

  const fieldDiffs = fields.map((field) => {
    const submitted = submittedUpload?.[field.submittedKey] ?? null
    const readback = readbackFloorplan?.[field.readbackKey] ?? null
    return {
      field: field.name,
      submitted,
      readback,
      matches: submitted === readback,
    }
  })

  return {
    matches: fieldDiffs.every((item) => item.matches),
    changedFields: fieldDiffs.filter((item) => !item.matches).map((item) => item.field),
    fields: fieldDiffs,
  }
}

async function performFloorplanUploadReadback(executionResult = {}, options = {}) {
  const readbackAfterExecution = Boolean(options.readbackAfterExecution)
  const submittedUpload = buildNormalizedFloorplanUpload(executionResult)
  const adapterError = executionResult?.metadata?.floorplanUploadAdapter?.normalizedError ?? null
  const base = {
    readbackPerformed: false,
    readbackSucceeded: false,
    readbackSource: 'none',
    floorplanUploadReadback: {
      submittedUpload,
      readbackFloorplan: null,
      floorplanDiff: null,
    },
    readbackIssues: [],
  }

  if (!readbackAfterExecution) {
    base.readbackIssues.push({
      code: 'readback_disabled',
      message: 'Readback is disabled for this debug execution.',
    })
    return base
  }

  if (!(executionResult?.summary?.successCount > 0) || !submittedUpload.zoneId) {
    if (adapterError?.message) {
      base.readbackIssues.push({
        code: adapterError.code || 'floorplan_upload_not_ready',
        message: adapterError.message,
      })
    } else {
      base.readbackIssues.push({
        code: 'readback_skipped_no_successful_floorplan_upload',
        message: 'No successful floorplan upload response was available for readback.',
      })
    }
    return base
  }

  const query = isSubmitContextObject(options.sceneQuery)
    ? options.sceneQuery
    : submittedUpload.zoneId != null
      ? { zone_id: submittedUpload.zoneId }
      : {}

  try {
    const scenePayload = await getSpatialScene(query)
    const readbackFloorplan = buildReadbackFloorplanFromScene(scenePayload)
    const issues = []

    if (!readbackFloorplan.zoneId) {
      issues.push({
        code: 'readback_zone_missing',
        message: 'Scene readback payload does not include a numeric zone.id.',
      })
    }

    if (!readbackFloorplan.floorPlanImagePath) {
      issues.push({
        code: 'readback_floorplan_path_missing',
        message: 'Scene readback payload does not include zone.floor_plan_image_path.',
      })
    }

    return {
      readbackPerformed: true,
      readbackSucceeded: issues.length === 0,
      readbackSource: '/api/spatial/scene',
      floorplanUploadReadback: {
        submittedUpload,
        readbackFloorplan,
        floorplanDiff: buildFloorplanDiff(submittedUpload, readbackFloorplan),
      },
      readbackIssues: issues,
    }
  } catch (error) {
    return {
      readbackPerformed: true,
      readbackSucceeded: false,
      readbackSource: '/api/spatial/scene',
      floorplanUploadReadback: {
        submittedUpload,
        readbackFloorplan: null,
        floorplanDiff: null,
      },
      readbackIssues: [
        {
          code: 'readback_request_failed',
          message: error?.message || 'Failed to load spatial scene for floorplan readback.',
        },
      ],
    }
  }
}

function resolveDebugExecutionTarget(options = {}) {
  const target = normalizePreflightText(options.debugExecutionTarget, 'floorplan_upload')
  return target === 'device_placement' ? 'device_placement' : 'floorplan_upload'
}

function resolveDebugExecutorKey(target = 'floorplan_upload') {
  return target === 'device_placement'
    ? SETTINGS_DRAFT_DEVICE_PLACEMENT_REAL_EXECUTOR_KEY
    : SETTINGS_DRAFT_FLOORPLAN_UPLOAD_REAL_EXECUTOR_KEY
}

export const useSettingsEditorStore = defineStore('settings-editor', () => {
  const loadedDraft = loadDraft(createDefaultSettingsDraft())
  const normalizedDraft = normalizeDraftPayload(loadedDraft.draft)

  const developerLayoutEditEnabled = ref(normalizedDraft.developerLayoutEditEnabled)
  const developerLayoutViewDraftEnabled = ref(normalizedDraft.developerLayoutViewDraftEnabled)
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
      developerLayoutEditEnabled: developerLayoutEditEnabled.value,
      developerLayoutViewDraftEnabled: developerLayoutViewDraftEnabled.value,
      settingsMenu: settingsMenu.value,
      draftAssets: draftAssets.value,
      draftFloors: draftFloors.value,
      activeDraftFloorId: activeDraftFloorId.value,
    }
  }

  watch(
    [developerLayoutEditEnabled, developerLayoutViewDraftEnabled, settingsMenu, draftAssets, draftFloors, activeDraftFloorId],
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

  function buildDraftSubmitExecutionArtifacts(submitContext = null) {
    const hasSubmitContext = Boolean(submitContext && typeof submitContext === 'object')

    if (!hasSubmitContext) {
      return {
        source: 'default_computed',
        submitContext: null,
        submitPlan: draftSubmitPlan.value,
        executionPreview: draftSubmitExecutionPreview.value,
        executorContract: draftSubmitExecutorContract.value,
        executor: resolvedDraftSubmitExecutor.value,
        executorKey: resolvedDraftSubmitExecutor.value?.key ?? 'unknown',
      }
    }

    const contextualSubmitPlan = buildDraftSubmitPlan(submitContext)
    const contextualExecutionPreview = buildSettingsDraftSubmitExecutionPreview(contextualSubmitPlan)
    const contextualExecutorContract = buildSettingsDraftExecutorContract(
      contextualSubmitPlan,
      contextualExecutionPreview,
    )
    const contextualExecutor = resolveSettingsDraftExecutor({
      submitPlan: contextualSubmitPlan,
      executorContract: contextualExecutorContract,
      submitContext,
    })

    return {
      source: 'submit_context',
      submitContext,
      submitPlan: contextualSubmitPlan,
      executionPreview: contextualExecutionPreview,
      executorContract: contextualExecutorContract,
      executor: contextualExecutor,
      executorKey: contextualExecutor?.key ?? 'unknown',
    }
  }

  function buildDraftStateForSubmitContext() {
    return {
      roomOptions: settingsRoomOptions,
      draftEntityLibrary: draftEntityLibrary.value,
      activeDraftHotspots: activeDraftHotspots.value,
    }
  }

  async function resolveDebugSubmitContext(options = {}) {
    if (isSubmitContextObject(options.submitContext)) {
      return {
        source: 'external',
        submitContext: options.submitContext,
        issues: [],
        warnings: [],
      }
    }

    const shouldBuildFromScene = Boolean(options.autoBuildSubmitContextFromScene)
    if (!shouldBuildFromScene) {
      return {
        source: 'none',
        submitContext: null,
        issues: [],
        warnings: [],
      }
    }

    try {
      const query = isSubmitContextObject(options.sceneQuery) ? options.sceneQuery : {}
      const scenePayload = await getSpatialScene(query)
      const contextBuild = buildSubmitContextFromSpatialScene(
        scenePayload,
        buildDraftStateForSubmitContext(),
      )

      return {
        source: 'scene',
        submitContext: contextBuild.submitContext,
        issues: Array.isArray(contextBuild.issues) ? contextBuild.issues : [],
        warnings: Array.isArray(contextBuild.warnings) ? contextBuild.warnings : [],
      }
    } catch (error) {
      return {
        source: 'none',
        submitContext: null,
        issues: [
          {
            code: 'scene_submit_context_build_failed',
            field: 'submitContext',
            message: error?.message || 'Failed to load scene payload for submit context.',
          },
        ],
        warnings: [],
      }
    }
  }

  async function runDraftSubmitExecution(options = {}) {
    const snapshotOnly = Boolean(options.snapshotOnly)
    const executionArtifacts = options._executionArtifacts
      ?? buildDraftSubmitExecutionArtifacts(options.submitContext ?? null)
    const executor = executionArtifacts.executor
      ?? resolveSettingsDraftExecutor({
        submitPlan: executionArtifacts.submitPlan,
        executorContract: executionArtifacts.executorContract,
        submitContext: executionArtifacts.submitContext,
      })

    const result = await executor.run({
      submitPlan: executionArtifacts.submitPlan,
      executorContract: executionArtifacts.executorContract,
      submitContext: executionArtifacts.submitContext,
      logger: options.logger ?? null,
      hooks: options.hooks ?? {},
      abortSignal: options.abortSignal ?? null,
    })

    let corrected = false
    let floorplanCorrected = false
    let draftWriteApplied = false
    let draftWriteSkipped = false
    const skippedDraftWriteReasons = []

    if (snapshotOnly) {
      draftWriteSkipped = true
      skippedDraftWriteReasons.push('snapshot_only_enabled')
    } else {
      corrected = applySuccessfulDevicePlacementCorrections(result, draftFloors)
      floorplanCorrected = applySuccessfulFloorplanUploadCorrections(
        result,
        draftFloors,
        draftAssets,
        activeDraftFloorId,
      )
      if (corrected || floorplanCorrected) {
        saveDraft(buildPersistedDraftPayload())
        draftWriteApplied = true
      }
    }

    return {
      ...result,
      draftWriteControl: {
        snapshotOnly,
        draftWriteSkipped,
        draftWriteApplied,
        skippedDraftWriteReasons,
        corrected,
        floorplanCorrected,
      },
    }
  }

  async function runDraftSubmitExecutionDebug(options = {}) {
    const debugExecutionTarget = resolveDebugExecutionTarget(options)
    const normalizedOptions = {
      ...options,
      snapshotOnly: options.snapshotOnly ?? true,
      readbackAfterExecution: options.readbackAfterExecution ?? true,
      autoBuildSubmitContextFromScene:
        options.autoBuildSubmitContextFromScene
        ?? !isSubmitContextObject(options.submitContext),
      debugExecutionTarget,
    }
    const debugSubmitContext = await resolveDebugSubmitContext(normalizedOptions)
    const closedLoopSubmitContext = {
      ...(debugSubmitContext.submitContext ?? {}),
      executorKey: resolveDebugExecutorKey(debugExecutionTarget),
    }
    const executionArtifacts = buildDraftSubmitExecutionArtifacts(closedLoopSubmitContext)
    const preflight = buildDraftSubmitPreflight(executionArtifacts)
    const hookCounts = {
      onStepStart: 0,
      onStepResult: 0,
      onStepError: 0,
      onComplete: 0,
    }

    const stepKeysStarted = []
    const stepKeysResolved = []

    const result = await runDraftSubmitExecution({
      ...normalizedOptions,
      _executionArtifacts: executionArtifacts,
      hooks: {
        ...(normalizedOptions.hooks ?? {}),
        onStepStart(step) {
          hookCounts.onStepStart += 1
          stepKeysStarted.push(step?.stepKey ?? 'unknown')
          normalizedOptions.hooks?.onStepStart?.(step)
        },
        onStepResult(stepResult) {
          hookCounts.onStepResult += 1
          stepKeysResolved.push(stepResult?.stepKey ?? 'unknown')
          normalizedOptions.hooks?.onStepResult?.(stepResult)
        },
        onStepError(stepError) {
          hookCounts.onStepError += 1
          normalizedOptions.hooks?.onStepError?.(stepError)
        },
        onComplete(finalResult) {
          hookCounts.onComplete += 1
          normalizedOptions.hooks?.onComplete?.(finalResult)
        },
      },
    })
    const shouldReadback =
      Boolean(normalizedOptions.readbackAfterExecution)
      && executionArtifacts.executorKey === resolveDebugExecutorKey(debugExecutionTarget)
      && (result?.summary?.successCount ?? 0) > 0
    const readback = shouldReadback
      ? debugExecutionTarget === 'device_placement'
        ? await performDevicePlacementReadback(result, {
          readbackAfterExecution: normalizedOptions.readbackAfterExecution,
          sceneQuery: normalizedOptions.sceneQuery,
        })
        : await performFloorplanUploadReadback(result, {
          readbackAfterExecution: normalizedOptions.readbackAfterExecution,
          sceneQuery: normalizedOptions.sceneQuery,
        })
      : {
        readbackPerformed: false,
        readbackSucceeded: false,
        readbackSource: 'none',
        devicePlacementReadback:
          debugExecutionTarget === 'device_placement'
            ? {
              requestedCount: extractDevicePlacementSubmittedPayloads(result).length,
              matchedCount: 0,
              comparisons: [],
            }
            : null,
        floorplanUploadReadback:
          debugExecutionTarget === 'floorplan_upload'
            ? {
              submittedUpload: buildNormalizedFloorplanUpload(result),
              readbackFloorplan: null,
              floorplanDiff: null,
            }
            : null,
        readbackIssues: [
          {
            code: 'readback_not_triggered',
            message:
              debugExecutionTarget === 'device_placement'
                ? 'Readback was not triggered because no successful real device placement request completed.'
                : 'Readback was not triggered because no successful real floorplan upload request completed.',
          },
        ],
      }

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
    const networkSummaries = Array.isArray(result?.metadata?.networkSummaries)
      ? result.metadata.networkSummaries
      : results
        .map((item) => (item?.networkSummary ? { stepKey: item.stepKey, ...item.networkSummary } : null))
        .filter(Boolean)
    const networkSummaryByStep = networkSummaries.reduce((acc, item) => {
      const stepKey = typeof item?.stepKey === 'string' ? item.stepKey : ''
      if (!stepKey) {
        return acc
      }
      acc[stepKey] = item
      return acc
    }, {})

    return {
      ok: Object.values(checks).every(Boolean),
      result,
      snapshotOnly: Boolean(normalizedOptions.snapshotOnly),
      draftWriteSkipped: Boolean(result?.draftWriteControl?.draftWriteSkipped),
      skippedDraftWriteReasons: Array.isArray(result?.draftWriteControl?.skippedDraftWriteReasons)
        ? result.draftWriteControl.skippedDraftWriteReasons
        : [],
      checks,
      hookCounts,
      stepKeysStarted,
      stepKeysResolved,
      submitContextSource: debugSubmitContext.source,
      executionArtifactSource: executionArtifacts.source,
      usedSubmitContext: executionArtifacts.submitContext,
      submitContextIssues: debugSubmitContext.issues,
      contextBuildWarnings: debugSubmitContext.warnings,
      usedSubmitPlanSummary: buildSubmitPlanSummary(executionArtifacts.submitPlan),
      usedExecutorKey: executionArtifacts.executorKey,
      resolvedExecutorKey: executionArtifacts.executorKey,
      preflightSummary: preflight.preflightSummary,
      preflightItems: preflight.preflightItems,
      blockedStepKeys: preflight.blockedStepKeys,
      unavailableStepKeys: preflight.unavailableStepKeys,
      networkSummaries,
      networkSummaryByStep,
      readbackPerformed: readback.readbackPerformed,
      readbackSucceeded: readback.readbackSucceeded,
      readbackSource: readback.readbackSource,
      devicePlacementReadback: readback.devicePlacementReadback ?? null,
      floorplanUploadReadback: readback.floorplanUploadReadback ?? null,
      readbackIssues: readback.readbackIssues,
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
    developerLayoutEditEnabled.value = nextDraft.developerLayoutEditEnabled
    developerLayoutViewDraftEnabled.value = nextDraft.developerLayoutViewDraftEnabled
    settingsMenu.value = nextDraft.settingsMenu
    draftAssets.value = nextDraft.draftAssets
    draftFloors.value = nextDraft.draftFloors
    activeDraftFloorId.value = nextDraft.activeDraftFloorId
    selectedDraftHotspotId.value = ''
  }

  function clearLegacyDraftCache() {
    clearLegacyDraftCachePersistence()
  }

  function setDeveloperLayoutEditEnabled(value) {
    developerLayoutEditEnabled.value = Boolean(value)
  }

  function setDeveloperLayoutViewDraftEnabled(value) {
    developerLayoutViewDraftEnabled.value = Boolean(value)
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

  function syncDraftEntityLibrary(entityLibrary = []) {
    const normalizedLibrary = (Array.isArray(entityLibrary) ? entityLibrary : [])
      .map((entity, index) => {
        const normalizedId = String(entity?.id ?? '').trim()
        if (!normalizedId) {
          return null
        }

        return {
          id: normalizedId,
          name: entity?.name ?? `设备 ${index + 1}`,
          category: entity?.category ?? 'other',
        }
      })
      .filter(Boolean)

    if (!normalizedLibrary.length) {
      return
    }

    draftEntityLibrary.value = normalizedLibrary
  }

  function replaceActiveDraftFloorHotspots(hotspots = [], floorPatch = {}) {
    if (!activeDraftFloor.value) {
      return
    }

    const targetFloor = activeDraftFloor.value
    const fallbackRoomKey = settingsRoomOptions[0]?.value ?? 'living'
    const fallbackColorGroup = settingsColorGroupOptions[0]?.value ?? 'blue'
    const hotspotMetaByDeviceId = new Map(
      targetFloor.hotspots.map((item) => [String(item.deviceId ?? ''), item]),
    )

    const normalizedHotspots = (Array.isArray(hotspots) ? hotspots : []).map((item, index) => {
      const normalizedDeviceId = String(item?.deviceId ?? '').trim()
      const matchedMeta = hotspotMetaByDeviceId.get(normalizedDeviceId) ?? null
      return normalizeDraftHotspot(
        {
          id: String(item?.id ?? `runtime-hotspot-${index + 1}`),
          x: item?.x ?? 50,
          y: item?.y ?? 50,
          icon: item?.icon ?? matchedMeta?.icon ?? 'light',
          active: item?.active ?? false,
          rotation: item?.rotation ?? matchedMeta?.rotation ?? 0,
          label: item?.label ?? matchedMeta?.label ?? `热点 ${index + 1}`,
          category: item?.category ?? matchedMeta?.category ?? 'lights',
          deviceId: normalizedDeviceId,
          roomKey: matchedMeta?.roomKey ?? fallbackRoomKey,
          colorGroup: matchedMeta?.colorGroup ?? fallbackColorGroup,
        },
        index,
      )
    })

    draftFloors.value = draftFloors.value.map((floor) =>
      floor.id === targetFloor.id
        ? {
            ...floor,
            imagePath: typeof floorPatch?.imagePath === 'string' && floorPatch.imagePath.trim()
              ? floorPatch.imagePath.trim()
              : floor.imagePath,
            aspectRatio: typeof floorPatch?.aspectRatio === 'string' && floorPatch.aspectRatio.includes('/')
              ? floorPatch.aspectRatio
              : floor.aspectRatio,
            hotspots: normalizedHotspots,
          }
        : floor,
    )

    if (!normalizedHotspots.some((item) => item.id === selectedDraftHotspotId.value)) {
      selectedDraftHotspotId.value = ''
    }
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
    developerLayoutEditEnabled,
    developerLayoutViewDraftEnabled,
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
    setDeveloperLayoutEditEnabled,
    setDeveloperLayoutViewDraftEnabled,
    selectSettingsMenu,
    addDraftAsset,
    syncDraftEntityLibrary,
    replaceActiveDraftFloorHotspots,
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
