export const FLOOR_MAP_EDITOR_SCHEMA_VERSION = 1

const VALID_EDGES = new Set(['left', 'right', 'top', 'bottom'])
const VALID_OPENING_TYPES = new Set(['window', 'door', 'balcony'])

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function hasFiniteNumber(value) {
  return Number.isFinite(Number(value))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function parseJsonInput(input) {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    } catch (error) {
      throw new Error('JSON 解析失败，请检查逗号、引号和括号是否完整。')
    }
  }

  return input
}

function normalizeFrame(frame, roomId) {
  if (!isPlainObject(frame)) {
    throw new Error(`房间 ${roomId} 的 frame 必须是对象。`)
  }

  const x = Number(frame.x)
  const y = Number(frame.y)
  const width = Number(frame.width)
  const height = Number(frame.height)

  if (![x, y, width, height].every(Number.isFinite)) {
    throw new Error(`房间 ${roomId} 的 frame.x / y / width / height 必须是数字。`)
  }

  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    width: Number(Math.max(120, width).toFixed(2)),
    height: Number(Math.max(96, height).toFixed(2)),
  }
}

function normalizeOpening(opening, roomId, index) {
  if (!isPlainObject(opening)) {
    throw new Error(`房间 ${roomId} 的 opening[${index}] 必须是对象。`)
  }

  const type = `${opening.type ?? 'window'}`
  const edge = `${opening.edge ?? 'top'}`

  if (!VALID_OPENING_TYPES.has(type)) {
    throw new Error(`房间 ${roomId} 的 opening[${index}].type 仅支持 window / door / balcony。`)
  }

  if (!VALID_EDGES.has(edge)) {
    throw new Error(`房间 ${roomId} 的 opening[${index}].edge 仅支持 left / right / top / bottom。`)
  }

  if (!hasFiniteNumber(opening.start) || !hasFiniteNumber(opening.end)) {
    throw new Error(`房间 ${roomId} 的 opening[${index}].start / end 必须是数字。`)
  }

  const start = clamp(Number(opening.start), 0, 0.98)
  const end = clamp(Number(opening.end), start + 0.02, 1)

  if (!hasFiniteNumber(opening.strength ?? 1)) {
    throw new Error(`房间 ${roomId} 的 opening[${index}].strength 必须是数字。`)
  }

  if (!hasFiniteNumber(opening.softness ?? 0.8)) {
    throw new Error(`房间 ${roomId} 的 opening[${index}].softness 必须是数字。`)
  }

  return {
    type,
    edge,
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    strength: Number(clamp(Number(opening.strength ?? 1), 0, 1.4).toFixed(3)),
    softness: Number(clamp(Number(opening.softness ?? 0.8), 0.1, 1).toFixed(3)),
    tint: `${opening.tint ?? '#fff7e7'}`,
  }
}

function normalizeVisualConfig(visualConfig, roomId) {
  if (!isPlainObject(visualConfig)) {
    throw new Error(`房间 ${roomId} 的 visualConfig 必须是对象。`)
  }

  const nextVisualConfig = { ...visualConfig }

  if (nextVisualConfig.openings !== undefined) {
    if (!Array.isArray(nextVisualConfig.openings)) {
      throw new Error(`房间 ${roomId} 的 visualConfig.openings 必须是数组。`)
    }

    nextVisualConfig.openings = nextVisualConfig.openings.map((opening, index) => normalizeOpening(opening, roomId, index))
  }

  const numericKeys = [
    'daylightStrength',
    'artificialLightGain',
    'climateInfluence',
    'activityInfluence',
    'elevationShiftX',
    'elevationShiftY',
    'floorInset',
    'wallHighlight',
  ]

  numericKeys.forEach((key) => {
    if (nextVisualConfig[key] === undefined) {
      return
    }

    if (!hasFiniteNumber(nextVisualConfig[key])) {
      throw new Error(`房间 ${roomId} 的 visualConfig.${key} 必须是数字。`)
    }

    nextVisualConfig[key] = Number(nextVisualConfig[key])
  })

  if (
    nextVisualConfig.daylightDirection !== undefined
    && typeof nextVisualConfig.daylightDirection !== 'string'
    && !(
      isPlainObject(nextVisualConfig.daylightDirection)
      && hasFiniteNumber(nextVisualConfig.daylightDirection.x)
      && hasFiniteNumber(nextVisualConfig.daylightDirection.y)
    )
  ) {
    throw new Error(`房间 ${roomId} 的 daylightDirection 必须是方向字符串或 { x, y } 向量。`)
  }

  return nextVisualConfig
}

function normalizeRoomDrafts(rooms) {
  if (!isPlainObject(rooms)) {
    throw new Error('rooms 必须是对象映射。')
  }

  return Object.entries(rooms).reduce((result, [roomId, draft]) => {
    if (!isPlainObject(draft)) {
      throw new Error(`房间 ${roomId} 的草稿必须是对象。`)
    }

    const nextDraft = {}

    if (draft.frame !== undefined) {
      nextDraft.frame = normalizeFrame(draft.frame, roomId)
    }

    if (draft.visualConfig !== undefined) {
      nextDraft.visualConfig = normalizeVisualConfig(draft.visualConfig, roomId)
    }

    result[roomId] = nextDraft
    return result
  }, {})
}

function normalizeDeviceDrafts(devices) {
  if (!isPlainObject(devices)) {
    throw new Error('devices 必须是对象映射。')
  }

  return Object.entries(devices).reduce((result, [deviceId, draft]) => {
    if (!isPlainObject(draft)) {
      throw new Error(`设备 ${deviceId} 的草稿必须是对象。`)
    }

    if (!isPlainObject(draft.position) || !hasFiniteNumber(draft.position.x) || !hasFiniteNumber(draft.position.y)) {
      throw new Error(`设备 ${deviceId} 的 position.x / y 必须是数字。`)
    }

    result[deviceId] = {
      roomId: draft.roomId ?? draft.room_id ?? null,
      entity_id: draft.entity_id ?? '',
      position: {
        x: Number(Number(draft.position.x).toFixed(2)),
        y: Number(Number(draft.position.y).toFixed(2)),
      },
    }

    return result
  }, {})
}

export function validateAndNormalizeFloorMapEditorImport(input) {
  const parsed = parseJsonInput(input)

  if (!isPlainObject(parsed)) {
    throw new Error('导入内容必须是一个 JSON 对象。')
  }

  if (Number(parsed.version) !== FLOOR_MAP_EDITOR_SCHEMA_VERSION) {
    throw new Error(`仅支持 version = ${FLOOR_MAP_EDITOR_SCHEMA_VERSION} 的 editor JSON。`)
  }

  return {
    version: FLOOR_MAP_EDITOR_SCHEMA_VERSION,
    exported_at: parsed.exported_at ?? null,
    rooms: normalizeRoomDrafts(parsed.rooms ?? {}),
    devices: normalizeDeviceDrafts(parsed.devices ?? {}),
  }
}
