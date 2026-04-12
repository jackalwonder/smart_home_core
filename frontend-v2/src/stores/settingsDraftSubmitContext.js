function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function isNonEmptyObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function collectSceneRooms(scenePayload = null) {
  return Array.isArray(scenePayload?.rooms) ? scenePayload.rooms : []
}

function collectSceneDevices(scenePayload = null) {
  const rooms = collectSceneRooms(scenePayload)
  const devices = []

  rooms.forEach((room) => {
    const roomId = toFiniteNumber(room?.id)
    const roomDevices = Array.isArray(room?.devices) ? room.devices : []

    roomDevices.forEach((device) => {
      devices.push({
        roomId,
        raw: device,
      })
    })
  })

  return devices
}

function collectDraftEntityIds(draftState = {}) {
  const ids = new Set()
  const draftEntityLibrary = Array.isArray(draftState?.draftEntityLibrary) ? draftState.draftEntityLibrary : []
  const activeDraftHotspots = Array.isArray(draftState?.activeDraftHotspots) ? draftState.activeDraftHotspots : []

  draftEntityLibrary.forEach((item) => {
    const id = normalizeText(item?.id)
    if (id) {
      ids.add(id)
    }
  })

  activeDraftHotspots.forEach((item) => {
    const id = normalizeText(item?.deviceId)
    if (id) {
      ids.add(id)
    }
  })

  return Array.from(ids)
}

function collectDraftRoomKeys(draftState = {}) {
  const keys = new Set()
  const roomOptions = Array.isArray(draftState?.roomOptions) ? draftState.roomOptions : []
  const activeDraftHotspots = Array.isArray(draftState?.activeDraftHotspots) ? draftState.activeDraftHotspots : []

  roomOptions.forEach((item) => {
    const key = normalizeText(item?.value)
    if (key) {
      keys.add(key)
    }
  })

  activeDraftHotspots.forEach((item) => {
    const key = normalizeText(item?.roomKey)
    if (key) {
      keys.add(key)
    }
  })

  return Array.from(keys)
}

function buildRoomLabelLookup(draftState = {}) {
  const roomOptions = Array.isArray(draftState?.roomOptions) ? draftState.roomOptions : []
  return roomOptions.reduce((acc, item) => {
    const key = normalizeText(item?.value)
    const label = normalizeText(item?.label)
    if (key && label) {
      acc[key] = label
    }
    return acc
  }, {})
}

function buildExistingDevicePlacementsByDeviceId(scenePayload = null) {
  const deviceEntries = collectSceneDevices(scenePayload)
  const placementMap = {}

  deviceEntries.forEach((entry) => {
    const deviceId = toFiniteNumber(entry?.raw?.id)
    if (!Number.isFinite(deviceId)) {
      return
    }

    const effectiveLayout = isNonEmptyObject(entry?.raw?.effective_layout) ? entry.raw.effective_layout : {}
    const planX = toFiniteNumber(entry?.raw?.plan_x) ?? toFiniteNumber(effectiveLayout.plan_x)
    const planY = toFiniteNumber(entry?.raw?.plan_y) ?? toFiniteNumber(effectiveLayout.plan_y)
    const planZ = toFiniteNumber(entry?.raw?.plan_z) ?? toFiniteNumber(effectiveLayout.plan_z)
    const planRotation = toFiniteNumber(entry?.raw?.plan_rotation) ?? toFiniteNumber(effectiveLayout.plan_rotation)

    placementMap[deviceId] = {
      plan_x: planX,
      plan_y: planY,
      plan_z: planZ,
      plan_rotation: planRotation ?? 0,
    }
  })

  return placementMap
}

function buildSceneDeviceEntryMeta(entry = null) {
  const rawDevice = entry?.raw ?? {}
  return {
    deviceId: toFiniteNumber(rawDevice.id),
    haEntityId: normalizeText(rawDevice.ha_entity_id),
    entityId: normalizeText(rawDevice.entity_id),
    deviceName: normalizeText(rawDevice.name),
    roomId: toFiniteNumber(entry?.roomId),
  }
}

function buildDraftEntityNameLookup(draftState = {}) {
  const draftEntityLibrary = Array.isArray(draftState?.draftEntityLibrary) ? draftState.draftEntityLibrary : []
  const activeDraftHotspots = Array.isArray(draftState?.activeDraftHotspots) ? draftState.activeDraftHotspots : []
  const lookup = {}

  draftEntityLibrary.forEach((item) => {
    const id = normalizeText(item?.id)
    const name = normalizeText(item?.name)
    if (id && name && !lookup[id]) {
      lookup[id] = name
    }
  })

  activeDraftHotspots.forEach((item) => {
    const id = normalizeText(item?.deviceId)
    const label = normalizeText(item?.label)
    if (id && label && !lookup[id]) {
      lookup[id] = label
    }
  })

  return lookup
}

function collectOrderedDraftHotspotUsages(draftState = {}, roomIdByDraftRoomKey = {}) {
  const activeDraftHotspots = Array.isArray(draftState?.activeDraftHotspots) ? draftState.activeDraftHotspots : []

  return activeDraftHotspots
    .map((item, index) => {
      const draftDeviceId = normalizeText(item?.deviceId)
      const draftRoomKey = normalizeText(item?.roomKey)
      return {
        index,
        hotspotId: normalizeText(item?.id),
        draftDeviceId,
        draftRoomKey,
        mappedRoomId: toFiniteNumber(roomIdByDraftRoomKey?.[draftRoomKey]),
        hotspotLabel: normalizeText(item?.label),
      }
    })
    .filter((item) => item.hotspotId && item.draftDeviceId)
}

function buildFallbackDeviceMap(scenePayload = null, draftState = {}, roomIdByDraftRoomKey = {}, exactMappings = {}, warnings = []) {
  const deviceEntries = collectSceneDevices(scenePayload)
  const orderedUsages = collectOrderedDraftHotspotUsages(draftState, roomIdByDraftRoomKey)
  const fallbackMap = {}
  const usedDeviceIds = new Set(
    Object.values(exactMappings)
      .map((value) => toFiniteNumber(value))
      .filter((value) => Number.isFinite(value)),
  )

  const devicesByRoom = new Map()
  const allDevices = []

  deviceEntries.forEach((entry) => {
    const meta = buildSceneDeviceEntryMeta(entry)
    if (!Number.isFinite(meta.deviceId)) {
      return
    }

    const descriptor = {
      deviceId: meta.deviceId,
      roomId: meta.roomId,
      deviceName: meta.deviceName,
      haEntityId: meta.haEntityId,
      entityId: meta.entityId,
    }

    allDevices.push(descriptor)

    if (!Number.isFinite(meta.roomId)) {
      return
    }

    if (!devicesByRoom.has(meta.roomId)) {
      devicesByRoom.set(meta.roomId, [])
    }
    devicesByRoom.get(meta.roomId).push(descriptor)
  })

  allDevices.sort((left, right) => Number(left.deviceId) - Number(right.deviceId))
  devicesByRoom.forEach((list, roomId) => {
    devicesByRoom.set(
      roomId,
      [...list].sort((left, right) => Number(left.deviceId) - Number(right.deviceId)),
    )
  })

  const tryAssign = (draftDeviceId, descriptor, reason) => {
    if (!draftDeviceId || !descriptor || fallbackMap[draftDeviceId] != null || usedDeviceIds.has(descriptor.deviceId)) {
      return false
    }
    fallbackMap[draftDeviceId] = descriptor.deviceId
    usedDeviceIds.add(descriptor.deviceId)
    warnings.push({
      code: 'fallback_device_mapping_used',
      field: `deviceIdByDraftEntityId.${draftDeviceId}`,
      message: `Mapped draft entity id "${draftDeviceId}" to scene device ${descriptor.deviceId} via ${reason}.`,
    })
    return true
  }

  orderedUsages.forEach((usage) => {
    if (exactMappings[usage.draftDeviceId] != null || fallbackMap[usage.draftDeviceId] != null) {
      return
    }

    const roomDevices = Number.isFinite(usage.mappedRoomId) ? devicesByRoom.get(usage.mappedRoomId) ?? [] : []
    if (!roomDevices.length) {
      return
    }

    const namedMatch = roomDevices.find((device) =>
      !usedDeviceIds.has(device.deviceId)
      && (
        (usage.hotspotLabel && usage.hotspotLabel === device.deviceName)
        || (usage.hotspotLabel && usage.hotspotLabel === device.haEntityId)
        || (usage.hotspotLabel && usage.hotspotLabel === device.entityId)
      ),
    )

    if (tryAssign(usage.draftDeviceId, namedMatch, `room ${usage.mappedRoomId} named match`)) {
      return
    }

    const firstRoomDevice = roomDevices.find((device) => !usedDeviceIds.has(device.deviceId))
    tryAssign(usage.draftDeviceId, firstRoomDevice, `room ${usage.mappedRoomId} fallback`)
  })

  orderedUsages.forEach((usage) => {
    if (exactMappings[usage.draftDeviceId] != null || fallbackMap[usage.draftDeviceId] != null) {
      return
    }

    const nextGlobalDevice = allDevices.find((device) => !usedDeviceIds.has(device.deviceId))
    tryAssign(usage.draftDeviceId, nextGlobalDevice, 'global fallback')
  })

  return fallbackMap
}

function buildDeviceIdByDraftHotspotId(
  scenePayload = null,
  draftState = {},
  roomIdByDraftRoomKey = {},
  deviceIdByDraftEntityId = {},
  warnings = [],
) {
  const deviceEntries = collectSceneDevices(scenePayload)
  const hotspotUsages = collectOrderedDraftHotspotUsages(draftState, roomIdByDraftRoomKey)
  const draftEntityNameLookup = buildDraftEntityNameLookup(draftState)
  const mapping = {}
  const usedDeviceIds = new Set()
  const devicesByRoom = new Map()
  const allDevices = []

  deviceEntries.forEach((entry) => {
    const meta = buildSceneDeviceEntryMeta(entry)
    if (!Number.isFinite(meta.deviceId)) {
      return
    }

    const descriptor = {
      deviceId: meta.deviceId,
      roomId: meta.roomId,
      deviceName: meta.deviceName,
      haEntityId: meta.haEntityId,
      entityId: meta.entityId,
    }

    allDevices.push(descriptor)

    if (!Number.isFinite(meta.roomId)) {
      return
    }

    if (!devicesByRoom.has(meta.roomId)) {
      devicesByRoom.set(meta.roomId, [])
    }
    devicesByRoom.get(meta.roomId).push(descriptor)
  })

  allDevices.sort((left, right) => Number(left.deviceId) - Number(right.deviceId))
  devicesByRoom.forEach((list, roomId) => {
    devicesByRoom.set(
      roomId,
      [...list].sort((left, right) => Number(left.deviceId) - Number(right.deviceId)),
    )
  })

  const buildCandidateTexts = (usage) => {
    const candidates = new Set()
    const draftEntityName = normalizeText(draftEntityNameLookup[usage.draftDeviceId])

    ;[
      usage.hotspotLabel,
      usage.draftDeviceId,
      draftEntityName,
    ].forEach((value) => {
      const normalized = normalizeText(value)
      if (normalized) {
        candidates.add(normalized)
      }
    })

    return Array.from(candidates)
  }

  const findNamedMatch = (devices, usage) => {
    const candidateTexts = buildCandidateTexts(usage)
    if (!candidateTexts.length) {
      return null
    }

    return devices.find((device) =>
      !usedDeviceIds.has(device.deviceId)
      && candidateTexts.some((candidate) =>
        candidate === device.deviceName
        || candidate === device.haEntityId
        || candidate === device.entityId,
      ),
    ) ?? null
  }

  const tryAssign = (usage, descriptor, reason) => {
    if (!usage?.hotspotId || !descriptor || usedDeviceIds.has(descriptor.deviceId)) {
      return false
    }
    mapping[usage.hotspotId] = descriptor.deviceId
    usedDeviceIds.add(descriptor.deviceId)

    if (reason !== 'exact_entity_mapping') {
      warnings.push({
        code: 'fallback_hotspot_mapping_used',
        field: `deviceIdByDraftHotspotId.${usage.hotspotId}`,
        message: `Mapped hotspot "${usage.hotspotLabel || usage.hotspotId}" to scene device ${descriptor.deviceId} via ${reason}.`,
      })
    }

    return true
  }

  hotspotUsages.forEach((usage) => {
    const exactDeviceId = toFiniteNumber(deviceIdByDraftEntityId?.[usage.draftDeviceId])
    if (!Number.isFinite(exactDeviceId) || usedDeviceIds.has(exactDeviceId)) {
      return
    }

    const exactDescriptor = allDevices.find((device) => device.deviceId === exactDeviceId) ?? null
    tryAssign(usage, exactDescriptor, 'exact_entity_mapping')
  })

  hotspotUsages.forEach((usage) => {
    if (mapping[usage.hotspotId] != null) {
      return
    }

    const roomDevices = Number.isFinite(usage.mappedRoomId) ? devicesByRoom.get(usage.mappedRoomId) ?? [] : []
    if (!roomDevices.length) {
      return
    }

    const roomNamedMatch = findNamedMatch(roomDevices, usage)
    if (tryAssign(usage, roomNamedMatch, `room ${usage.mappedRoomId} named match`)) {
      return
    }

    const firstRoomDevice = roomDevices.find((device) => !usedDeviceIds.has(device.deviceId)) ?? null
    tryAssign(usage, firstRoomDevice, `room ${usage.mappedRoomId} fallback`)
  })

  hotspotUsages.forEach((usage) => {
    if (mapping[usage.hotspotId] != null) {
      return
    }

    const globalNamedMatch = findNamedMatch(allDevices, usage)
    if (tryAssign(usage, globalNamedMatch, 'global named match')) {
      return
    }

    const nextGlobalDevice = allDevices.find((device) => !usedDeviceIds.has(device.deviceId)) ?? null
    tryAssign(usage, nextGlobalDevice, 'global fallback')
  })

  hotspotUsages.forEach((usage) => {
    if (Object.prototype.hasOwnProperty.call(mapping, usage.hotspotId)) {
      return
    }

    mapping[usage.hotspotId] = undefined
    warnings.push({
      code: 'hotspot_device_mapping_exhausted',
      field: `deviceIdByDraftHotspotId.${usage.hotspotId}`,
      message: `No unique scene device remained for hotspot "${usage.hotspotLabel || usage.hotspotId}".`,
    })
  })

  return mapping
}

function buildDeviceIdByDraftEntityId(scenePayload = null, draftState = {}, roomIdByDraftRoomKey = {}, issues = [], warnings = []) {
  const draftEntityIds = collectDraftEntityIds(draftState)
  const deviceEntries = collectSceneDevices(scenePayload)
  const byHaEntityId = new Map()
  const byEntityId = new Map()
  const byDeviceName = new Map()
  const byNumericId = new Map()
  const mapping = {}
  const draftEntityNameLookup = buildDraftEntityNameLookup(draftState)

  deviceEntries.forEach((entry) => {
    const meta = buildSceneDeviceEntryMeta(entry)
    const deviceId = meta.deviceId
    if (!Number.isFinite(deviceId)) {
      return
    }

    if (meta.haEntityId && !byHaEntityId.has(meta.haEntityId)) {
      byHaEntityId.set(meta.haEntityId, deviceId)
    }

    if (meta.entityId && !byEntityId.has(meta.entityId)) {
      byEntityId.set(meta.entityId, deviceId)
    }

    if (meta.deviceName && !byDeviceName.has(meta.deviceName)) {
      byDeviceName.set(meta.deviceName, deviceId)
    }

    byNumericId.set(String(deviceId), deviceId)
  })

  draftEntityIds.forEach((draftEntityId) => {
    const normalizedDraftEntityId = normalizeText(draftEntityId)
    if (!normalizedDraftEntityId) {
      return
    }

    let mappedDeviceId = null
    if (byHaEntityId.has(normalizedDraftEntityId)) {
      mappedDeviceId = byHaEntityId.get(normalizedDraftEntityId)
    } else if (byEntityId.has(normalizedDraftEntityId)) {
      mappedDeviceId = byEntityId.get(normalizedDraftEntityId)
    } else if (byDeviceName.has(normalizedDraftEntityId)) {
      mappedDeviceId = byDeviceName.get(normalizedDraftEntityId)
    } else if (byNumericId.has(normalizedDraftEntityId)) {
      mappedDeviceId = byNumericId.get(normalizedDraftEntityId)
    } else {
      const draftEntityName = normalizeText(draftEntityNameLookup[normalizedDraftEntityId])
      if (draftEntityName && byDeviceName.has(draftEntityName)) {
        mappedDeviceId = byDeviceName.get(draftEntityName)
      }
    }

    if (Number.isFinite(mappedDeviceId)) {
      mapping[normalizedDraftEntityId] = mappedDeviceId
    }
  })

  const fallbackMap = buildFallbackDeviceMap(scenePayload, draftState, roomIdByDraftRoomKey, mapping, warnings)
  Object.entries(fallbackMap).forEach(([draftEntityId, deviceId]) => {
    if (!mapping[draftEntityId] && Number.isFinite(toFiniteNumber(deviceId))) {
      mapping[draftEntityId] = toFiniteNumber(deviceId)
    }
  })

  draftEntityIds.forEach((draftEntityId) => {
    const normalizedDraftEntityId = normalizeText(draftEntityId)
    if (!normalizedDraftEntityId || Number.isFinite(toFiniteNumber(mapping[normalizedDraftEntityId]))) {
      return
    }

    issues.push({
      code: 'missing_device_mapping',
      field: `deviceIdByDraftEntityId.${normalizedDraftEntityId}`,
      message: `Unable to map draft entity id "${normalizedDraftEntityId}" to scene device id.`,
    })
  })

  return mapping
}

function buildRoomIdByDraftRoomKey(scenePayload = null, draftState = {}, issues = []) {
  const draftRoomKeys = collectDraftRoomKeys(draftState)
  const roomLabelLookup = buildRoomLabelLookup(draftState)
  const rooms = collectSceneRooms(scenePayload)
  const mapping = {}
  const normalizedRooms = rooms
    .map((room) => ({
      id: toFiniteNumber(room?.id),
      name: normalizeText(room?.name),
    }))
    .filter((room) => Number.isFinite(room.id))

  draftRoomKeys.forEach((draftRoomKey) => {
    const normalizedRoomKey = normalizeText(draftRoomKey)
    if (!normalizedRoomKey) {
      return
    }

    const candidates = new Set([normalizedRoomKey])
    const roomLabel = normalizeText(roomLabelLookup[normalizedRoomKey])
    if (roomLabel) {
      candidates.add(roomLabel)
    }

    const matchedRooms = normalizedRooms.filter((room) =>
      candidates.has(room.name) || candidates.has(String(room.id)),
    )

    if (matchedRooms.length === 1) {
      mapping[normalizedRoomKey] = matchedRooms[0].id
      return
    }

    if (matchedRooms.length > 1) {
      issues.push({
        code: 'ambiguous_room_mapping',
        field: `roomIdByDraftRoomKey.${normalizedRoomKey}`,
        message: `Found multiple scene rooms for draft room key "${normalizedRoomKey}".`,
      })
      return
    }

    issues.push({
      code: 'missing_room_mapping',
      field: `roomIdByDraftRoomKey.${normalizedRoomKey}`,
      message: `Unable to map draft room key "${normalizedRoomKey}" to scene room id.`,
    })
  })

  return mapping
}

export function buildSubmitContextFromSpatialScene(scenePayload = null, draftState = {}) {
  const issues = []
  const warnings = []

  const zoneId = toFiniteNumber(scenePayload?.zone?.id)
  if (!Number.isFinite(zoneId)) {
    issues.push({
      code: 'missing_zone_id',
      field: 'zoneId',
      message: 'Scene payload does not contain a numeric zone.id.',
    })
  }

  const currentFloorplanPath = normalizeText(scenePayload?.zone?.floor_plan_image_path)
  if (!currentFloorplanPath) {
    warnings.push({
      code: 'missing_floorplan_path',
      field: 'currentFloorplanPath',
      message: 'Scene zone floor_plan_image_path is missing or empty.',
    })
  }

  const roomIdByDraftRoomKey = buildRoomIdByDraftRoomKey(scenePayload, draftState, issues)
  const deviceIdByDraftEntityId = buildDeviceIdByDraftEntityId(scenePayload, draftState, roomIdByDraftRoomKey, issues, warnings)
  const existingDevicePlacementsByDeviceId = buildExistingDevicePlacementsByDeviceId(scenePayload)

  return {
    submitContext: {
      zoneId,
      currentFloorplanPath: currentFloorplanPath || '',
      deviceIdByDraftEntityId,
      deviceIdByDraftHotspotId: buildDeviceIdByDraftHotspotId(
        scenePayload,
        draftState,
        roomIdByDraftRoomKey,
        deviceIdByDraftEntityId,
        warnings,
      ),
      roomIdByDraftRoomKey,
      existingDevicePlacementsByDeviceId,
    },
    issues,
    warnings,
  }
}
