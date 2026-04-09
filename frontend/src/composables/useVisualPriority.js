import { computed, unref } from 'vue'

import { VISUAL_PRIORITY_CONFIG } from '../config/floorMapConfig'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function domainKey(deviceOrActivity) {
  return `${deviceOrActivity?.entity_domain ?? deviceOrActivity?.domain ?? deviceOrActivity?.type ?? 'generic'}`.trim().toLowerCase() || 'generic'
}

function roomIdOf(item) {
  return item?.roomId ?? item?.room_id ?? item?.id ?? null
}

function isDomainIn(domain, collection) {
  return collection.includes(domain)
}

function activityScore(entry) {
  return VISUAL_PRIORITY_CONFIG.statusAttention[entry.status] ?? 0.2
}

function baseDeviceScore(device) {
  const domain = domainKey(device)
  return VISUAL_PRIORITY_CONFIG.domainAttention[domain] ?? VISUAL_PRIORITY_CONFIG.domainAttention.generic
}

function buildRoomMode(activities) {
  const domains = activities.map((entry) => domainKey(entry))
  const distinctDeviceCount = new Set(activities.map((entry) => entry.deviceId)).size
  const hasScene = domains.includes('scene')
  const hasAmbient = domains.some((domain) => isDomainIn(domain, VISUAL_PRIORITY_CONFIG.ambientDomains))
  const hasMotion = domains.some((domain) => isDomainIn(domain, VISUAL_PRIORITY_CONFIG.motionDomains))

  if (hasScene || distinctDeviceCount >= VISUAL_PRIORITY_CONFIG.sceneClusterCount) {
    return 'scene'
  }

  if (hasAmbient) {
    return 'ambient'
  }

  if (hasMotion) {
    return 'device'
  }

  return 'calm'
}

function buildDevicePriority(room, roomActivities, roomMode, pendingDeviceIds, roomPriority) {
  const modeConfig = VISUAL_PRIORITY_CONFIG.roomModes[roomMode]
  const motionDevices = (room.devices ?? []).filter((device) => VISUAL_PRIORITY_CONFIG.motionDomains.includes(domainKey(device)))
  const maxStrongAnimations = roomMode === 'scene'
    ? VISUAL_PRIORITY_CONFIG.maxStrongAnimationsInScene
    : VISUAL_PRIORITY_CONFIG.maxStrongAnimations

  const scoredDevices = (room.devices ?? []).map((device) => {
    const deviceActivities = roomActivities.filter((entry) => entry.deviceId === device.id)
    const recentActivityScore = deviceActivities.reduce((sum, entry) => sum + activityScore(entry), 0)
    const pendingBoost = pendingDeviceIds.includes(device.id) ? 0.66 : 0
    const activeBoost = device.active ? 0.18 : 0

    return {
      deviceId: device.id,
      domain: domainKey(device),
      score: baseDeviceScore(device) + recentActivityScore + pendingBoost + activeBoost,
    }
  })

  const primaryMotionIds = scoredDevices
    .filter((entry) => VISUAL_PRIORITY_CONFIG.motionDomains.includes(entry.domain))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(maxStrongAnimations, motionDevices.length)))
    .map((entry) => entry.deviceId)

  return Object.fromEntries(scoredDevices.map((entry) => {
    const isPrimaryMotion = primaryMotionIds.includes(entry.deviceId)
    const isMotionDevice = VISUAL_PRIORITY_CONFIG.motionDomains.includes(entry.domain)
    const hasRecentFeedback = roomActivities.some((activity) => activity.deviceId === entry.deviceId && ['pending', 'success', 'error'].includes(activity.status))

    let tier = 'background'
    let motionEmphasis = modeConfig.backgroundMotionEmphasis

    if (isPrimaryMotion) {
      tier = 'primary'
      motionEmphasis = modeConfig.primaryMotionEmphasis
    } else if (isMotionDevice) {
      tier = 'secondary'
      motionEmphasis = modeConfig.secondaryMotionEmphasis
    } else if (hasRecentFeedback) {
      tier = 'secondary'
      motionEmphasis = 0
    }

      return [
        entry.deviceId,
        {
          roomId: room.id,
          tier,
          roomMode,
          score: entry.score,
        motionEmphasis: clamp((motionEmphasis ?? 0) * (roomPriority.motionVisibility ?? 1), 0, 1),
        feedbackEmphasis: clamp(modeConfig.feedbackEmphasis * (tier === 'background' ? 0.78 : tier === 'secondary' ? 0.92 : 1) * (roomPriority.feedbackVisibility ?? 1), 0.24, 1),
        hotspotEmphasis: clamp((tier === 'background' ? 0.82 : tier === 'secondary' ? 0.92 : 1) * (roomPriority.hotspotVisibility ?? 1), 0.64, 1),
        suppressMotion: tier === 'background' || (!isPrimaryMotion && roomMode === 'scene' && isMotionDevice),
      },
    ]
  }))
}

export function useVisualPriority(roomModelsRef, visualActivityRef, pendingDeviceIdsRef, selectedRoomIdRef = null) {
  const priorityState = computed(() => {
    const rooms = unref(roomModelsRef) ?? []
    const visualActivity = unref(visualActivityRef) ?? []
    const pendingDeviceIds = unref(pendingDeviceIdsRef) ?? []
    const selectedRoomId = unref(selectedRoomIdRef) ?? rooms[0]?.id ?? null
    const cutoff = Date.now() - VISUAL_PRIORITY_CONFIG.activityWindowMs
    const recentActivity = visualActivity.filter((entry) => entry.timestamp >= cutoff)

    const roomPriorityById = {}
    const devicePriorityById = {}

    rooms.forEach((room) => {
      const roomActivities = recentActivity.filter((entry) => entry.roomId === roomIdOf(room))
      const roomMode = buildRoomMode(roomActivities)
      const modeConfig = VISUAL_PRIORITY_CONFIG.roomModes[roomMode]
      const isSelectedRoom = room.id === selectedRoomId
      const roomPriority = {
        selected: isSelectedRoom,
        ambientEmphasis: clamp(modeConfig.ambientEmphasis * (isSelectedRoom ? 1.15 : 0.86), 0.82, 1.38),
        ambientVisibility: clamp(isSelectedRoom ? 1.06 : 0.84, 0.8, 1.08),
        motionVisibility: clamp(isSelectedRoom ? 1 : 0.84, 0.78, 1),
        feedbackVisibility: clamp(isSelectedRoom ? 1 : 0.88, 0.82, 1),
        hotspotVisibility: clamp(isSelectedRoom ? 1 : 0.9, 0.84, 1),
        saturation: clamp(isSelectedRoom ? 1 : 0.86, 0.82, 1),
        daylightBoost: clamp(isSelectedRoom ? 1.12 : 0.92, 0.88, 1.14),
        lightBoost: clamp(isSelectedRoom ? 1.1 : 0.9, 0.86, 1.12),
        openingBoost: clamp(isSelectedRoom ? 1.14 : 0.9, 0.86, 1.16),
        floorContrast: clamp(isSelectedRoom ? 1.12 : 0.92, 0.88, 1.14),
        outlineEmphasis: clamp(isSelectedRoom ? 1.2 : 0.84, 0.8, 1.24),
        scale: isSelectedRoom ? 1.016 : 0.992,
      }
      const devicePriority = buildDevicePriority(room, roomActivities, roomMode, pendingDeviceIds, roomPriority)

      roomPriorityById[room.id] = {
        roomMode,
        ambientEmphasis: roomPriority.ambientEmphasis,
        ambientVisibility: roomPriority.ambientVisibility,
        motionVisibility: roomPriority.motionVisibility,
        feedbackVisibility: roomPriority.feedbackVisibility,
        hotspotVisibility: roomPriority.hotspotVisibility,
        saturation: roomPriority.saturation,
        daylightBoost: roomPriority.daylightBoost,
        lightBoost: roomPriority.lightBoost,
        openingBoost: roomPriority.openingBoost,
        floorContrast: roomPriority.floorContrast,
        outlineEmphasis: roomPriority.outlineEmphasis,
        scale: roomPriority.scale,
        selected: roomPriority.selected,
        hasSceneCluster: roomMode === 'scene',
        dominantDomains: [...new Set(roomActivities.map((entry) => domainKey(entry)))],
      }

      Object.assign(devicePriorityById, devicePriority)
    })

    return {
      roomPriorityById,
      devicePriorityById,
    }
  })

  const roomPriorityById = computed(() => priorityState.value.roomPriorityById)
  const devicePriorityById = computed(() => priorityState.value.devicePriorityById)

  return {
    roomPriorityById,
    devicePriorityById,
    config: VISUAL_PRIORITY_CONFIG,
  }
}
