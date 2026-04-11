import { resolveRoomVisualConfig } from '../config/floorMapConfig'

const ACTIVE_STATES = new Set(['on', 'online', 'playing', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'auto', 'opening', 'open'])
const OFFLINE_STATES = new Set(['offline', 'unavailable', 'unknown'])
const ROOM_LAYOUT_FIELDS = ['plan_x', 'plan_y', 'plan_width', 'plan_height', 'plan_rotation']
const DEVICE_LAYOUT_FIELDS = ['plan_x', 'plan_y', 'plan_z', 'plan_rotation']
const ROOM_TONES = [
  {
    fill: '#f2e4cf',
    edge: '#c99a5c',
    glow: 'rgba(201, 154, 92, 0.2)',
    chip: '#9b6a2a',
  },
  {
    fill: '#dbe9e6',
    edge: '#3e7f78',
    glow: 'rgba(62, 127, 120, 0.18)',
    chip: '#2d6660',
  },
  {
    fill: '#dbe3ee',
    edge: '#5474a3',
    glow: 'rgba(84, 116, 163, 0.18)',
    chip: '#466492',
  },
  {
    fill: '#e8dde5',
    edge: '#8e6d84',
    glow: 'rgba(142, 109, 132, 0.16)',
    chip: '#75566d',
  },
  {
    fill: '#e4e7d8',
    edge: '#708050',
    glow: 'rgba(112, 128, 80, 0.16)',
    chip: '#5c6b42',
  },
]

function hasNumber(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function readLayoutFields(source, fields) {
  return fields.reduce((layout, field) => {
    layout[field] = source?.[field] ?? null
    return layout
  }, {})
}

function readLayoutLayer(source, layerName, fields) {
  const layer = source?.[layerName]
  if (!layer || typeof layer !== 'object') {
    return readLayoutFields({}, fields)
  }

  return readLayoutFields(layer, fields)
}

function resolveEffectiveLayout(source, fields) {
  const fallback = readLayoutFields(source, fields)
  const effective = readLayoutLayer(source, 'effective_layout', fields)
  return {
    ...fallback,
    ...effective,
    source: source?.effective_layout?.source ?? source?.layout_source ?? 'unknown',
    field_sources: source?.effective_layout?.field_sources ?? {},
  }
}

function attachLayoutLayers(source, fields) {
  return {
    ...source,
    ...resolveEffectiveLayout(source, fields),
    layout_persisted: readLayoutLayer(source, 'layout_persisted', fields),
    layout_derived: readLayoutLayer(source, 'layout_derived', fields),
    effective_layout: resolveEffectiveLayout(source, fields),
  }
}

function normalizeState(device) {
  return `${device?.raw_state ?? device?.state ?? device?.current_status ?? ''}`.trim().toLowerCase()
}

export function isDeviceOffline(device) {
  if (device?.online === false) {
    return true
  }

  return OFFLINE_STATES.has(normalizeState(device))
}

export function isDeviceActive(device) {
  return ACTIVE_STATES.has(normalizeState(device))
}

export function getRoomTone(index) {
  return ROOM_TONES[index % ROOM_TONES.length]
}

export function buildRoomMetrics(room, pendingDeviceIds = []) {
  const devices = room?.devices ?? []
  const controllableCount = devices.filter((device) => device.can_control).length
  const activeCount = devices.filter(isDeviceActive).length
  const offlineCount = devices.filter(isDeviceOffline).length
  const pendingCount = devices.filter((device) => pendingDeviceIds.includes(device.id)).length
  const temperatureDevice = devices.find(
    (device) => device.device_class === 'temperature' || hasNumber(device.current_temperature),
  )
  const climateDevice = devices.find((device) => device.entity_domain === 'climate')
  const temperatureValue = temperatureDevice?.raw_state ?? temperatureDevice?.current_temperature ?? climateDevice?.current_temperature ?? null

  return {
    deviceCount: devices.length,
    controllableCount,
    activeCount,
    offlineCount,
    pendingCount,
    temperatureValue: hasNumber(temperatureValue) ? Number(temperatureValue) : null,
  }
}

function fallbackRoomFrame(index, total) {
  const columns = total > 4 ? 3 : 2
  const rows = Math.max(1, Math.ceil(total / columns))
  const column = index % columns
  const row = Math.floor(index / columns)
  const cellWidth = 820 / columns
  const cellHeight = 520 / rows

  return {
    x: 90 + column * cellWidth,
    y: 72 + row * cellHeight,
    width: Math.max(190, cellWidth - 44),
    height: Math.max(150, cellHeight - 36),
  }
}

function fitRoomsToCanvas(rooms) {
  const plannedRooms = rooms.filter(
    (room) =>
      hasNumber(room.plan_x)
      && hasNumber(room.plan_y)
      && hasNumber(room.plan_width)
      && hasNumber(room.plan_height),
  )

  if (plannedRooms.length === 0) {
    return rooms.map((room, index) => fallbackRoomFrame(index, rooms.length))
  }

  const minX = Math.min(...plannedRooms.map((room) => Number(room.plan_x)))
  const minY = Math.min(...plannedRooms.map((room) => Number(room.plan_y)))
  const maxX = Math.max(...plannedRooms.map((room) => Number(room.plan_x) + Number(room.plan_width)))
  const maxY = Math.max(...plannedRooms.map((room) => Number(room.plan_y) + Number(room.plan_height)))
  const sourceWidth = Math.max(1, maxX - minX)
  const sourceHeight = Math.max(1, maxY - minY)
  const scale = Math.min(820 / sourceWidth, 520 / sourceHeight)

  return rooms.map((room, index) => {
    if (
      !hasNumber(room.plan_x)
      || !hasNumber(room.plan_y)
      || !hasNumber(room.plan_width)
      || !hasNumber(room.plan_height)
    ) {
      return fallbackRoomFrame(index, rooms.length)
    }

    return {
      x: 90 + (Number(room.plan_x) - minX) * scale,
      y: 72 + (Number(room.plan_y) - minY) * scale,
      width: Math.max(150, Number(room.plan_width) * scale),
      height: Math.max(116, Number(room.plan_height) * scale),
    }
  })
}

function applyFrameOverride(frame, override) {
  if (!override) {
    return frame
  }

  return {
    x: hasNumber(override.x) ? Number(override.x) : frame.x,
    y: hasNumber(override.y) ? Number(override.y) : frame.y,
    width: hasNumber(override.width) ? Math.max(120, Number(override.width)) : frame.width,
    height: hasNumber(override.height) ? Math.max(96, Number(override.height)) : frame.height,
  }
}

function resolveDevicePosition(frame, device, deviceDraft, deviceIndex, totalDevices, room) {
  if (deviceDraft?.position) {
    return {
      x: clamp(Number(deviceDraft.position.x), frame.x + 12, frame.x + frame.width - 12),
      y: clamp(Number(deviceDraft.position.y), frame.y + 18, frame.y + frame.height - 12),
    }
  }

  const sourcePosition = device?.position
  if (sourcePosition && hasNumber(sourcePosition.x) && hasNumber(sourcePosition.y)) {
    const rawX = Number(sourcePosition.x)
    const rawY = Number(sourcePosition.y)
    const isNormalizedPosition = rawX >= 0 && rawX <= 1 && rawY >= 0 && rawY <= 1

    return {
      x: clamp(
        isNormalizedPosition ? frame.x + frame.width * rawX : rawX,
        frame.x + 12,
        frame.x + frame.width - 12,
      ),
      y: clamp(
        isNormalizedPosition ? frame.y + frame.height * rawY : rawY,
        frame.y + 18,
        frame.y + frame.height - 12,
      ),
    }
  }

  return distributeDevicePoint(frame, room, device, deviceIndex, totalDevices)
}

function mergeVisualConfigOverride(room, override) {
  if (!override) {
    return room
  }

  return {
    ...room,
    visual_config: {
      ...(room?.visual_config ?? room?.visualConfig ?? {}),
      ...override,
      openings: Array.isArray(override.openings)
        ? override.openings.map((opening) => ({ ...opening }))
        : (room?.visual_config?.openings ?? room?.visualConfig?.openings ?? []),
    },
  }
}

function createRoomPoints(frame, options = {}) {
  const inset = Number(options.inset ?? 0)
  const offsetX = Number(options.offsetX ?? 0)
  const offsetY = Number(options.offsetY ?? 0)
  const width = Math.max(72, frame.width - inset * 2)
  const height = Math.max(64, frame.height - inset * 2)
  const x = frame.x + inset + offsetX
  const y = frame.y + inset + offsetY
  const bevel = clamp(Math.min(width, height) * 0.08, 8, 18)

  return [
    { x: x + bevel, y },
    { x: x + width - bevel, y },
    { x: x + width, y: y + bevel },
    { x: x + width, y: y + height - bevel },
    { x: x + width - bevel, y: y + height },
    { x: x + bevel, y: y + height },
    { x, y: y + height - bevel },
    { x, y: y + bevel },
  ]
}

function pointsToPolygon(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function pointsToPath(points, close = false) {
  if (!points.length) {
    return ''
  }

  const [first, ...rest] = points
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')}${close ? ' Z' : ''}`
}

function createRoomPolygon(frame, options = {}) {
  return pointsToPolygon(createRoomPoints(frame, options))
}

function createZonePolygon(frame, x1, y1, x2, y2) {
  const zoneFrame = {
    x: frame.x + frame.width * x1,
    y: frame.y + frame.height * y1,
    width: frame.width * Math.max(0.12, x2 - x1),
    height: frame.height * Math.max(0.12, y2 - y1),
  }

  return createRoomPolygon(zoneFrame, {
    inset: clamp(Math.min(zoneFrame.width, zoneFrame.height) * 0.04, 4, 10),
  })
}

function buildEdgeZone(frame, edge, role) {
  if (edge === 'left') {
    return {
      role,
      polygon: createZonePolygon(frame, 0.1, 0.16, 0.28, 0.82),
    }
  }

  if (edge === 'right') {
    return {
      role,
      polygon: createZonePolygon(frame, 0.72, 0.18, 0.9, 0.82),
    }
  }

  if (edge === 'bottom') {
    return {
      role,
      polygon: createZonePolygon(frame, 0.16, 0.7, 0.88, 0.9),
    }
  }

  return {
    role,
    polygon: createZonePolygon(frame, 0.16, 0.1, 0.84, 0.28),
  }
}

function buildRoomZones(frame, visualConfig) {
  const zoningPreset = visualConfig.zoningPreset ?? visualConfig.spatialPreset ?? 'balanced'
  const dominantEdge = visualConfig.openings?.[0]?.edge ?? visualConfig.daylightDirection ?? 'top'

  if (zoningPreset === 'living') {
    return [
      {
        role: 'conversation',
        polygon: createZonePolygon(frame, 0.2, 0.3, 0.8, 0.76),
      },
      buildEdgeZone(frame, dominantEdge, 'window-lounge'),
    ]
  }

  if (zoningPreset === 'bedroom') {
    return [
      {
        role: 'rest',
        polygon: createZonePolygon(frame, 0.22, 0.34, 0.8, 0.86),
      },
      buildEdgeZone(frame, dominantEdge === 'left' ? 'right' : dominantEdge === 'right' ? 'left' : 'bottom', 'quiet-edge'),
    ]
  }

  if (zoningPreset === 'service') {
    return [
      {
        role: 'service-core',
        polygon: createZonePolygon(frame, 0.18, 0.24, 0.82, 0.78),
      },
      buildEdgeZone(frame, 'bottom', 'circulation'),
    ]
  }

  if (zoningPreset === 'corridor') {
    return [
      {
        role: 'circulation',
        polygon: createZonePolygon(frame, 0.16, 0.28, 0.84, 0.72),
      },
      buildEdgeZone(frame, dominantEdge, 'entry-light'),
    ]
  }

  return [
    {
      role: 'center',
      polygon: createZonePolygon(frame, 0.22, 0.24, 0.78, 0.78),
    },
  ]
}

function buildRoomSpatialSurfaces(frame, visualConfig) {
  const shiftX = clamp(Number(visualConfig.elevationShiftX ?? 12), 6, 22)
  const shiftY = clamp(Number(visualConfig.elevationShiftY ?? 10), 6, 18)
  const floorInset = clamp(Number(visualConfig.floorInset ?? 10), 6, 22)
  const topPoints = createRoomPoints(frame)
  const basePoints = createRoomPoints(frame, { offsetX: shiftX, offsetY: shiftY })
  const innerPoints = createRoomPoints(frame, { inset: floorInset })

  return {
    topPolygon: pointsToPolygon(topPoints),
    basePolygon: pointsToPolygon(basePoints),
    innerPolygon: pointsToPolygon(innerPoints),
    topOutlinePath: pointsToPath([topPoints[7], topPoints[0], topPoints[1], topPoints[2]]),
    leftOutlinePath: pointsToPath([topPoints[6], topPoints[7], topPoints[0]]),
    innerOutlinePath: pointsToPath([innerPoints[7], innerPoints[0], innerPoints[1], innerPoints[2]]),
    wallFaces: [
      {
        id: 'east',
        polygon: pointsToPolygon([topPoints[2], topPoints[3], basePoints[3], basePoints[2]]),
      },
      {
        id: 'south-east',
        polygon: pointsToPolygon([topPoints[3], topPoints[4], basePoints[4], basePoints[3]]),
      },
      {
        id: 'south',
        polygon: pointsToPolygon([topPoints[4], topPoints[5], basePoints[5], basePoints[4]]),
      },
    ],
    wallCapPolygon: pointsToPolygon([topPoints[4], topPoints[5], basePoints[5], basePoints[4]]),
    zones: buildRoomZones(frame, visualConfig),
  }
}

function distributeDevicePoint(roomFrame, sourceRoom, device, deviceIndex, deviceCount) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(deviceCount)))
  const rows = Math.max(1, Math.ceil(deviceCount / columns))
  const column = deviceIndex % columns
  const row = Math.floor(deviceIndex / columns)
  const gapX = roomFrame.width / (columns + 1)
  const gapY = roomFrame.height / (rows + 1)

  if (
    hasNumber(device.plan_x)
    && hasNumber(device.plan_y)
    && hasNumber(sourceRoom?.plan_x)
    && hasNumber(sourceRoom?.plan_y)
    && hasNumber(sourceRoom?.plan_width)
    && hasNumber(sourceRoom?.plan_height)
  ) {
    const relativeX = (Number(device.plan_x) - Number(sourceRoom.plan_x)) / Math.max(1, Number(sourceRoom.plan_width))
    const relativeY = (Number(device.plan_y) - Number(sourceRoom.plan_y)) / Math.max(1, Number(sourceRoom.plan_height))

    return {
      x: roomFrame.x + clamp(relativeX, 0.08, 0.92) * roomFrame.width,
      y: roomFrame.y + clamp(relativeY, 0.16, 0.88) * roomFrame.height,
    }
  }

  if (hasNumber(device.position?.x) && hasNumber(device.position?.y)) {
    return {
      x: roomFrame.x + clamp(Number(device.position.x), 0.08, 0.92) * roomFrame.width,
      y: roomFrame.y + clamp(Number(device.position.y), 0.16, 0.88) * roomFrame.height,
    }
  }

  return {
    x: roomFrame.x + gapX * (column + 1),
    y: roomFrame.y + gapY * (row + 1) + 16,
  }
}

export function buildFloorMapModel(rooms, pendingDeviceIds = [], options = {}) {
  const roomDrafts = options?.roomDrafts ?? {}
  const deviceDrafts = options?.deviceDrafts ?? {}
  const sceneRooms = (rooms ?? []).map((room) => ({
    ...attachLayoutLayers(room, ROOM_LAYOUT_FIELDS),
    devices: (room.devices ?? []).map((device) => attachLayoutLayers(device, DEVICE_LAYOUT_FIELDS)),
  }))
  const frames = fitRoomsToCanvas(sceneRooms)

  return sceneRooms.map((room, index) => {
    const roomDraft = roomDrafts[room.id] ?? null
    const frame = applyFrameOverride(frames[index], roomDraft?.frame)
    const tone = getRoomTone(index)
    const visualConfig = resolveRoomVisualConfig(mergeVisualConfigOverride(room, roomDraft?.visualConfig))
    const metrics = buildRoomMetrics(room, pendingDeviceIds)
    const devices = (room.devices ?? []).map((device, deviceIndex) => {
      const deviceDraft = deviceDrafts[device.id] ?? null
      const point = resolveDevicePosition(frame, device, deviceDraft, deviceIndex, room.devices.length || 1, room)

      return {
        ...device,
        entity_id: device.entity_id ?? device.ha_entity_id ?? '',
        type: device.type ?? device.entity_domain ?? device.device_type ?? 'generic',
        state: device.state ?? device.raw_state ?? device.current_status ?? 'unknown',
        position: {
          x: point.x,
          y: point.y,
        },
        active: isDeviceActive(device),
        offline: isDeviceOffline(device),
        pending: pendingDeviceIds.includes(device.id),
        draftOverlay: deviceDraft?.position ? { position: { ...deviceDraft.position } } : null,
        layoutLayers: {
          persisted: device.layout_persisted,
          derived: device.layout_derived,
          effective: device.effective_layout,
        },
      }
    })

    return {
      ...room,
      frame,
      polygon: createRoomPolygon(frame),
      spatialSurfaces: buildRoomSpatialSurfaces(frame, visualConfig),
      labelX: frame.x + 18,
      labelY: frame.y + 28,
      centerX: frame.x + frame.width / 2,
      centerY: frame.y + frame.height / 2,
      tone,
      visualConfig,
      metrics,
      devices,
      draftOverlay: roomDraft
        ? {
            frame: roomDraft.frame ? { ...roomDraft.frame } : null,
            visualConfig: roomDraft.visualConfig ?? null,
          }
        : null,
      layoutLayers: {
        persisted: room.layout_persisted,
        derived: room.layout_derived,
        effective: room.effective_layout,
      },
    }
  })
}

export function formatDeviceState(device) {
  const state = `${device?.raw_state ?? device?.state ?? device?.current_status ?? ''}`.trim()
  if (!state) {
    return '未知'
  }

  const map = {
    on: '开启',
    off: '关闭',
    online: '在线',
    offline: '离线',
    unavailable: '离线',
    heat: '制热',
    cool: '制冷',
    fan_only: '送风',
    auto: '自动',
    open: '打开',
    opening: '开启中',
    closed: '关闭',
    closing: '关闭中',
  }

  return map[state.toLowerCase()] ?? state
}

export function getDevicePrimaryMetric(device) {
  if (hasNumber(device.current_temperature)) {
    return `${Number(device.current_temperature).toFixed(0)}${device.unit_of_measurement ?? '°C'}`
  }

  if (hasNumber(device.target_temperature)) {
    return `设定 ${Number(device.target_temperature).toFixed(0)}${device.unit_of_measurement ?? '°C'}`
  }

  if (hasNumber(device.number_value)) {
    return `${Number(device.number_value).toFixed(0)}${device.unit_of_measurement ?? ''}`
  }

  if (device.fan_mode) {
    return `风量 ${device.fan_mode}`
  }

  return formatDeviceState(device)
}

export function getQuickAction(device) {
  if (!device?.can_control) {
    return null
  }

  if (device.control_kind === 'toggle') {
    return {
      type: 'toggle',
      label: isDeviceActive(device) ? '关闭' : '开启',
    }
  }

  if (device.entity_domain === 'climate' || device.entity_domain === 'media_player') {
    return {
      type: 'toggle',
      label: isDeviceActive(device) ? '待机' : '启动',
    }
  }

  if (device.control_kind === 'button') {
    return {
      type: 'button',
      label: '执行',
    }
  }

  return null
}

export function formatRoomAmbient(roomModel) {
  const metrics = roomModel?.metrics
  if (!metrics) {
    return '等待空间数据'
  }

  if (metrics.temperatureValue !== null) {
    return `${metrics.temperatureValue.toFixed(0)}°C`
  }

  if (metrics.activeCount > 0) {
    return `${metrics.activeCount} 项活跃`
  }

  if (metrics.offlineCount > 0) {
    return `${metrics.offlineCount} 项离线`
  }

  return '待机中'
}
