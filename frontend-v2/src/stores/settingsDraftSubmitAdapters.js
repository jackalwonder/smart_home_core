import { hasDraftUploadRef } from './settingsDraftUploadBridge'

function roundTo(value, precision = 2) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }
  const factor = 10 ** precision
  return Math.round(numeric * factor) / factor
}

function clampPercent(value) {
  const numeric = roundTo(value)
  if (numeric == null) {
    return null
  }
  return Math.max(0, Math.min(100, numeric))
}

function normalizeRotation(value) {
  const numeric = roundTo(value)
  return numeric == null ? 0 : numeric
}

function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }
  const trimmed = value.trim()
  return trimmed || fallback
}

function buildRoomIdMap(context = {}) {
  return context.roomIdByDraftRoomKey && typeof context.roomIdByDraftRoomKey === 'object'
    ? context.roomIdByDraftRoomKey
    : {}
}

function buildDeviceIdMap(context = {}) {
  return context.deviceIdByDraftEntityId && typeof context.deviceIdByDraftEntityId === 'object'
    ? context.deviceIdByDraftEntityId
    : {}
}

function buildExistingPlacementMap(context = {}) {
  return context.existingDevicePlacementsByDeviceId && typeof context.existingDevicePlacementsByDeviceId === 'object'
    ? context.existingDevicePlacementsByDeviceId
    : {}
}

function buildNormalizedPlacementPayload(hotspot) {
  return {
    plan_x: clampPercent(hotspot.x),
    plan_y: clampPercent(hotspot.y),
    plan_z: null,
    plan_rotation: normalizeRotation(hotspot.rotation),
  }
}

function isPlacementChanged(nextPayload, currentPayload = {}) {
  return ['plan_x', 'plan_y', 'plan_z', 'plan_rotation'].some((field) => {
    const nextValue = nextPayload[field] ?? null
    const currentValue = roundTo(currentPayload[field])
    return nextValue !== currentValue
  })
}

function buildAssetLookup(draftAssets = []) {
  const lookup = new Map()
  draftAssets.forEach((asset) => {
    if (asset?.id) {
      lookup.set(asset.id, asset)
    }
    if (asset?.preview) {
      lookup.set(`preview:${asset.preview}`, asset)
    }
  })
  return lookup
}

export function buildSettingsDraftSubmitPlan(draftState, submitContext = {}) {
  const draftFloors = Array.isArray(draftState?.draftFloors) ? draftState.draftFloors : []
  const draftAssets = Array.isArray(draftState?.draftAssets) ? draftState.draftAssets : []
  const activeDraftFloorId = draftState?.activeDraftFloorId ?? null
  const draftEntityLibrary = Array.isArray(draftState?.draftEntityLibrary) ? draftState.draftEntityLibrary : []

  const activeDraftFloor = draftFloors.find((floor) => floor.id === activeDraftFloorId) ?? draftFloors[0] ?? null
  const activeDraftHotspots = Array.isArray(activeDraftFloor?.hotspots) ? activeDraftFloor.hotspots : []

  const roomIdByDraftRoomKey = buildRoomIdMap(submitContext)
  const deviceIdByDraftEntityId = buildDeviceIdMap(submitContext)
  const existingDevicePlacementsByDeviceId = buildExistingPlacementMap(submitContext)
  const currentFloorplanPath = normalizeString(submitContext.currentFloorplanPath, '')
  const zoneId = Number(submitContext.zoneId)
  const assetLookup = buildAssetLookup(draftAssets)

  const blockers = []
  const ignored = []
  const roomLayouts = []
  const devicePlacements = []

  const inactiveFloors = draftFloors.filter((floor) => floor.id !== activeDraftFloor?.id)
  inactiveFloors.forEach((floor) => {
    ignored.push({
      type: 'inactive_draft_floor',
      floorId: floor.id,
      reason: '当前后端空间接口以单个 zone 主舞台为主，非激活草稿楼层暂不进入提交计划。',
    })
  })

  const matchedAsset = activeDraftFloor?.floorplanAssetId
    ? assetLookup.get(activeDraftFloor.floorplanAssetId) ?? null
    : activeDraftFloor?.imagePath
      ? assetLookup.get(`preview:${activeDraftFloor.imagePath}`) ?? null
      : null

  let floorplanUpload = {
    status: 'noop',
    reason: '当前草稿未请求新的主舞台底图提交。',
    zoneId: Number.isFinite(zoneId) ? zoneId : null,
    assetId: matchedAsset?.id ?? null,
    imagePath: activeDraftFloor?.imagePath ?? null,
    requiresUpload: false,
  }

  if (!activeDraftFloor) {
    floorplanUpload = {
      status: 'blocked',
      reason: '当前没有可提交的激活楼层草稿。',
      zoneId: Number.isFinite(zoneId) ? zoneId : null,
      assetId: null,
      imagePath: null,
      requiresUpload: false,
    }
    blockers.push({ type: 'missing_active_floor', message: '没有激活草稿楼层，无法生成底图提交流程。' })
  } else if (!Number.isFinite(zoneId)) {
    floorplanUpload = {
      status: 'blocked',
      reason: '缺少 zoneId，无法准备 floorplan 上传请求。',
      zoneId: null,
      assetId: matchedAsset?.id ?? null,
      imagePath: activeDraftFloor.imagePath,
      requiresUpload: Boolean(activeDraftFloor.imagePath),
    }
    blockers.push({ type: 'missing_zone_mapping', message: '提交底图前需要注入 zoneId。' })
  } else if (!activeDraftFloor.imagePath || activeDraftFloor.imagePath === currentFloorplanPath) {
    floorplanUpload = {
      status: 'noop',
      reason: '当前激活草稿底图与已知后端底图一致，暂无上传动作。',
      zoneId,
      assetId: matchedAsset?.id ?? null,
      imagePath: activeDraftFloor.imagePath ?? null,
      requiresUpload: false,
    }
  } else if (!matchedAsset) {
    floorplanUpload = {
      status: 'blocked',
      reason: '当前激活草稿底图没有对应的素材记录，无法准备上传。',
      zoneId,
      assetId: null,
      imagePath: activeDraftFloor.imagePath,
      requiresUpload: true,
    }
    blockers.push({ type: 'floorplan_asset_missing', message: '激活楼层缺少对应的底图素材记录。' })
  } else if (matchedAsset.sourceType !== 'upload') {
    floorplanUpload = {
      status: 'blocked',
      reason: '当前草稿底图来自内置或路径素材，后端现有接口需要 multipart 文件上传。',
      zoneId,
      assetId: matchedAsset.id,
      imagePath: activeDraftFloor.imagePath,
      requiresUpload: true,
      assetMeta: {
        sourceType: matchedAsset.sourceType,
        fileName: matchedAsset.fileName,
        mimeType: matchedAsset.mimeType,
      },
    }
    blockers.push({ type: 'floorplan_requires_upload_asset', message: '底图已变化，但当前素材不是可上传文件桥接。' })
  } else if (!matchedAsset.fileRefToken) {
    floorplanUpload = {
      status: 'blocked',
      reason: '当前草稿底图缺少 fileRefToken，无法定位待上传文件。',
      zoneId,
      assetId: matchedAsset.id,
      imagePath: activeDraftFloor.imagePath,
      requiresUpload: true,
      assetMeta: {
        sourceType: matchedAsset.sourceType,
        fileName: matchedAsset.fileName,
        mimeType: matchedAsset.mimeType,
        fileSize: matchedAsset.fileSize,
        imageWidth: matchedAsset.imageWidth,
        imageHeight: matchedAsset.imageHeight,
      },
    }
    blockers.push({ type: 'floorplan_missing_upload_ref', message: '上传素材缺少 fileRefToken。' })
  } else if (!hasDraftUploadRef(matchedAsset.fileRefToken)) {
    floorplanUpload = {
      status: 'blocked',
      reason: '当前草稿底图的上传引用只剩 token，占位仍在，但内存中的原始文件已不可用。',
      zoneId,
      assetId: matchedAsset.id,
      imagePath: activeDraftFloor.imagePath,
      requiresUpload: true,
      fileRefToken: matchedAsset.fileRefToken,
      assetMeta: {
        sourceType: matchedAsset.sourceType,
        fileName: matchedAsset.fileName,
        mimeType: matchedAsset.mimeType,
        fileSize: matchedAsset.fileSize,
        imageWidth: matchedAsset.imageWidth,
        imageHeight: matchedAsset.imageHeight,
      },
    }
    blockers.push({ type: 'floorplan_upload_ref_unavailable', message: '上传素材的 fileRefToken 仍存在，但页面刷新后原始文件桥接已失效。' })
  } else if (!matchedAsset.imageWidth || !matchedAsset.imageHeight) {
    floorplanUpload = {
      status: 'blocked',
      reason: '当前草稿底图缺少图片尺寸，无法准备上传 payload。',
      zoneId,
      assetId: matchedAsset.id,
      imagePath: activeDraftFloor.imagePath,
      requiresUpload: true,
      fileRefToken: matchedAsset.fileRefToken,
      assetMeta: {
        sourceType: matchedAsset.sourceType,
        fileName: matchedAsset.fileName,
        mimeType: matchedAsset.mimeType,
        fileSize: matchedAsset.fileSize,
        imageWidth: matchedAsset.imageWidth,
        imageHeight: matchedAsset.imageHeight,
      },
    }
    blockers.push({ type: 'floorplan_missing_dimensions', message: '上传素材缺少 imageWidth / imageHeight。' })
  } else {
    floorplanUpload = {
      status: 'ready',
      reason: '当前草稿底图已具备上传桥接所需的元信息与文件引用。',
      zoneId,
      assetId: matchedAsset.id,
      imagePath: activeDraftFloor.imagePath,
      requiresUpload: true,
      fileRefToken: matchedAsset.fileRefToken,
      assetMeta: {
        sourceType: matchedAsset.sourceType,
        fileName: matchedAsset.fileName,
        mimeType: matchedAsset.mimeType,
        fileSize: matchedAsset.fileSize,
        imageWidth: matchedAsset.imageWidth,
        imageHeight: matchedAsset.imageHeight,
      },
      payloadShape: {
        zone_id: zoneId,
        image_width: matchedAsset.imageWidth,
        image_height: matchedAsset.imageHeight,
        preserve_existing: true,
        fileRefToken: matchedAsset.fileRefToken,
      },
    }
  }

  roomLayouts.push({
    status: 'unavailable',
    count: 0,
    reason: '当前设置页 draft 没有独立的房间布局真值，只保留了热点与素材草稿。',
    endpoint: '/api/spatial/rooms/{room_id}/layout',
  })

  activeDraftHotspots.forEach((hotspot) => {
    const draftDeviceId = normalizeString(hotspot.deviceId, '')
    const draftRoomKey = normalizeString(hotspot.roomKey, '')
    const mappedDeviceId = Number(deviceIdByDraftEntityId[draftDeviceId])
    const mappedRoomId = Number(roomIdByDraftRoomKey[draftRoomKey])
    const payload = buildNormalizedPlacementPayload(hotspot)
    const fieldErrors = []

    if (!draftDeviceId) {
      fieldErrors.push('缺少 deviceId')
    }
    if (payload.plan_x == null || payload.plan_y == null) {
      fieldErrors.push('坐标不完整')
    }

    const item = {
      hotspotId: hotspot.id,
      label: hotspot.label,
      draftDeviceId,
      mappedDeviceId: Number.isFinite(mappedDeviceId) ? mappedDeviceId : null,
      draftRoomKey,
      mappedRoomId: Number.isFinite(mappedRoomId) ? mappedRoomId : null,
      payload,
      endpoint: Number.isFinite(mappedDeviceId) ? `/api/spatial/devices/${mappedDeviceId}/placement` : '/api/spatial/devices/{device_id}/placement',
      status: 'ready',
      issues: fieldErrors,
    }

    if (fieldErrors.length) {
      item.status = 'blocked'
      blockers.push({ type: 'invalid_hotspot_payload', hotspotId: hotspot.id, message: fieldErrors.join(' / ') })
    } else if (!Number.isFinite(mappedDeviceId)) {
      item.status = 'blocked'
      item.issues.push('未映射到后端 device_id')
      blockers.push({ type: 'missing_device_mapping', hotspotId: hotspot.id, message: `热点 ${hotspot.label} 尚未映射到后端数值 device_id。` })
    } else {
      const existingPlacement = existingDevicePlacementsByDeviceId[mappedDeviceId] ?? {}
      item.changed = isPlacementChanged(payload, existingPlacement)
      if (!item.changed) {
        item.status = 'noop'
      }
    }

    if (Number.isFinite(mappedRoomId)) {
      item.roomAlignment = 'mapped'
    } else if (draftRoomKey) {
      item.roomAlignment = 'unmapped'
      item.issues.push('未映射到后端 room_id')
    } else {
      item.roomAlignment = 'missing'
    }

    const entityMeta = draftEntityLibrary.find((device) => device.id === draftDeviceId) ?? null
    item.deviceCategory = entityMeta?.category ?? hotspot.category ?? null

    devicePlacements.push(item)
  })

  const readyDevicePlacements = devicePlacements.filter((item) => item.status === 'ready')
  const changedDevicePlacements = readyDevicePlacements.filter((item) => item.changed !== false)

  const steps = [
    {
      type: 'floorplan_upload',
      status: floorplanUpload.status,
      target: floorplanUpload.zoneId,
      count: floorplanUpload.status === 'noop' ? 0 : 1,
    },
    {
      type: 'room_layout_save',
      status: roomLayouts[0].status,
      count: 0,
    },
    {
      type: 'device_placement_save',
      status: changedDevicePlacements.length ? 'ready' : devicePlacements.some((item) => item.status === 'blocked') ? 'partial' : 'noop',
      count: changedDevicePlacements.length,
    },
  ]

  return {
    summary: {
      activeDraftFloorId: activeDraftFloor?.id ?? null,
      totalDraftFloors: draftFloors.length,
      totalDraftAssets: draftAssets.length,
      totalDraftHotspots: activeDraftHotspots.length,
      mappableDevicePlacements: changedDevicePlacements.length,
      blockerCount: blockers.length,
    },
    truthBoundary: {
      floorplan: ['activeDraftFloor.imagePath', 'activeDraftFloor.floorplanAssetId', 'draftAssets[].fileName', 'draftAssets[].mimeType', 'draftAssets[].fileSize', 'draftAssets[].imageWidth', 'draftAssets[].imageHeight', 'draftAssets[].fileRefToken'],
      roomLayouts: [],
      devicePlacements: ['activeDraftHotspots[].deviceId', 'activeDraftHotspots[].roomKey', 'activeDraftHotspots[].x', 'activeDraftHotspots[].y'],
      uiOnly: ['draftAssets[].id', 'draftAssets[].name', 'draftAssets[].preview', 'activeDraftHotspots[].label', 'activeDraftHotspots[].icon', 'activeDraftHotspots[].active', 'activeDraftHotspots[].colorGroup'],
    },
    steps,
    floorplanUpload,
    roomLayouts,
    devicePlacements,
    blockers,
    ignored,
  }
}

