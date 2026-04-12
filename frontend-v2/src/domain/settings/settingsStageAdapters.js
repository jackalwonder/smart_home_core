function toNumber(value, fallback = null) {
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return numeric
  }
  return fallback
}

const DEFAULT_FLOORPLAN_IMAGE_URL = '/floorplans/songyue-floorplan.jpg'

function isHttpImagePath(path) {
  return /^https?:\/\//i.test(path)
}

function isFileSystemLikePath(path) {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.includes('\\') || path.startsWith('file:') || path.startsWith('blob:')
}

function normalizeImagePath(path) {
  if (typeof path !== 'string') {
    return DEFAULT_FLOORPLAN_IMAGE_URL
  }

  const trimmedPath = path.trim()
  if (!trimmedPath) {
    return DEFAULT_FLOORPLAN_IMAGE_URL
  }

  if (isFileSystemLikePath(trimmedPath)) {
    return DEFAULT_FLOORPLAN_IMAGE_URL
  }

  if (trimmedPath.startsWith('/floorplans/') || isHttpImagePath(trimmedPath)) {
    return trimmedPath
  }

  return DEFAULT_FLOORPLAN_IMAGE_URL
}

function normalizeAspectRatio(value, imageUrl = DEFAULT_FLOORPLAN_IMAGE_URL) {
  if (imageUrl === DEFAULT_FLOORPLAN_IMAGE_URL) {
    return '1200 / 789'
  }
  if (typeof value === 'string' && value.includes('/')) {
    return value
  }
  return '1200 / 789'
}

export function buildSettingsStageModel(activeDraftFloor, activeDraftHotspots = [], roomOptions = []) {
  const floor = activeDraftFloor || {}
  const hotspots = Array.isArray(activeDraftHotspots) ? activeDraftHotspots : []
  const normalizedImageUrl = normalizeImagePath(floor.imagePath)

  return {
    imageUrl: normalizedImageUrl,
    aspectRatio: normalizeAspectRatio(floor.aspectRatio, normalizedImageUrl),
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
