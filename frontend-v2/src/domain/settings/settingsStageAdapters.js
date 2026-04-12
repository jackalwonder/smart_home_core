function toNumber(value, fallback = null) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return numeric
  }
  return fallback
}

function normalizeImagePath(path) {
  if (typeof path === 'string' && path.trim()) {
    return path.trim()
  }
  return '/floorplans/songyue-floorplan.jpg'
}

function normalizeAspectRatio(value) {
  if (typeof value === 'string' && value.includes('/')) {
    return value
  }
  return '1200 / 789'
}

export function buildSettingsStageModel(activeDraftFloor, activeDraftHotspots = [], roomOptions = []) {
  const floor = activeDraftFloor || {}
  const hotspots = Array.isArray(activeDraftHotspots) ? activeDraftHotspots : []

  return {
    imageUrl: normalizeImagePath(floor.imagePath),
    aspectRatio: normalizeAspectRatio(floor.aspectRatio),
    rooms: Array.isArray(roomOptions)
      ? roomOptions.map((room) => ({
          id: room.value,
          name: room.label,
          layout: null,
        }))
      : [],
    hotspots: hotspots.map((hotspot) => ({
      id: hotspot.id,
      deviceId: hotspot.deviceId || hotspot.id,
      roomId: hotspot.roomKey || '',
      x: toNumber(hotspot.x, 50),
      y: toNumber(hotspot.y, 50),
      rotation: toNumber(hotspot.rotation, 0),
      icon: hotspot.icon || 'light',
      label: hotspot.label || '未命名热点',
      active: Boolean(hotspot.active),
      category: hotspot.category || 'lights',
      controlKind: '',
      interactionKind: 'edit',
      colorGroup: hotspot.colorGroup || 'blue',
    })),
  }
}
