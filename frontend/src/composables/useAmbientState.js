import { computed, unref } from 'vue'

import { isDeviceActive } from '../utils/floorMap'

const DEFAULT_LIGHT_COLOR = '#fff0cf'
const DEFAULT_DAYLIGHT_COLOR = '#fff6df'
const COOL_CLIMATE_COLOR = '#d7e9ff'
const WARM_CLIMATE_COLOR = '#ffe2c2'
const NEUTRAL_CLIMATE_COLOR = '#f6ede0'

export const AMBIENT_RULES = {
  lightOn: 'light.on 会提升房间人工照明权重。',
  brightness: 'brightness 映射到 0~1 的 lightIntensity，并进入房间整体 opacity 与 fill 混合。',
  curtain: 'curtain 或 cover 决定 daylightFactor，并继续作用到每个 opening 的入光强度。',
  climate: 'climate 不直接加亮房间，只通过轻微冷暖色氛围层影响空间色调。',
  active: '活跃设备数量影响房间环境层的存在感，但不会覆盖灯光和采光主效果。',
  opening: 'opening 负责定义自然光从哪面墙、哪一段开口进入房间，并支持多个开口叠加。',
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex) {
  const normalized = `${hex ?? ''}`.replace('#', '').trim()
  if (normalized.length !== 6) {
    return { r: 255, g: 255, b: 255 }
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mixHex(left, right, weight) {
  const ratio = clamp(weight, 0, 1)
  const source = hexToRgb(left)
  const target = hexToRgb(right)

  return rgbToHex({
    r: source.r + (target.r - source.r) * ratio,
    g: source.g + (target.g - source.g) * ratio,
    b: source.b + (target.b - source.b) * ratio,
  })
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

function resolveDirectionVector(direction) {
  if (typeof direction === 'object' && direction !== null) {
    const x = Number(direction.x)
    const y = Number(direction.y)
    const magnitude = Math.hypot(x, y) || 1
    return {
      x: clamp(x / magnitude, -1, 1),
      y: clamp(y / magnitude, -1, 1),
    }
  }

  const map = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    top: { x: 0, y: -1 },
    bottom: { x: 0, y: 1 },
  }

  return map[direction] ?? map.top
}

function resolveDaylightGradient(frame, direction) {
  const vector = resolveDirectionVector(direction)
  const centerX = frame.x + frame.width / 2
  const centerY = frame.y + frame.height / 2
  const spanX = frame.width / 2
  const spanY = frame.height / 2

  return {
    x1: centerX + vector.x * spanX * 0.98,
    y1: centerY + vector.y * spanY * 0.98,
    x2: centerX - vector.x * spanX * 0.98,
    y2: centerY - vector.y * spanY * 0.98,
    vector,
  }
}

function pointOnEdge(frame, edge, ratio) {
  const clampedRatio = clamp(ratio, 0, 1)

  if (edge === 'left') {
    return {
      x: frame.x,
      y: frame.y + frame.height * clampedRatio,
    }
  }

  if (edge === 'right') {
    return {
      x: frame.x + frame.width,
      y: frame.y + frame.height * clampedRatio,
    }
  }

  if (edge === 'bottom') {
    return {
      x: frame.x + frame.width * clampedRatio,
      y: frame.y + frame.height,
    }
  }

  return {
    x: frame.x + frame.width * clampedRatio,
    y: frame.y,
  }
}

function inwardVector(edge) {
  const map = {
    left: { x: 1, y: 0 },
    right: { x: -1, y: 0 },
    top: { x: 0, y: 1 },
    bottom: { x: 0, y: -1 },
  }

  return map[edge] ?? map.top
}

function openingColor(visualConfig, opening) {
  return opening?.tint ?? visualConfig.daylightColor ?? DEFAULT_DAYLIGHT_COLOR
}

function openingOpacityMultiplier(type) {
  const map = {
    window: 1,
    balcony: 1.12,
    door: 0.74,
  }

  return map[type] ?? 1
}

function buildOpeningDaylightEffects(room, visualConfig, adjustedDaylight, curtainFactor) {
  const openings = Array.isArray(visualConfig.openings) ? visualConfig.openings : []
  if (openings.length === 0) {
    return []
  }

  const depthBase = Math.max(room.frame.width, room.frame.height)

  return openings.map((opening, index) => {
    const startPoint = pointOnEdge(room.frame, opening.edge, opening.start ?? 0)
    const endPoint = pointOnEdge(room.frame, opening.edge, opening.end ?? 1)
    const openingCenter = {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    }
    const inward = inwardVector(opening.edge)
    const softness = clamp(opening.softness ?? 0.76, 0.35, 1.2)
    const strength = clamp(
      adjustedDaylight * curtainFactor * (opening.strength ?? 1) * openingOpacityMultiplier(opening.type),
      0,
      1,
    )
    const directionalBias = clamp(0.86 + adjustedDaylight * 0.42 + (opening.strength ?? 1) * 0.18, 0.82, 1.34)
    const depth = depthBase * (0.28 + softness * 0.46) * directionalBias
    const spread = depthBase * (0.048 + softness * 0.08) * (1.08 - adjustedDaylight * 0.18)
    const innerStart = {
      x: startPoint.x + inward.x * depth + (opening.edge === 'top' || opening.edge === 'bottom' ? -spread : 0),
      y: startPoint.y + inward.y * depth + (opening.edge === 'left' || opening.edge === 'right' ? -spread : 0),
    }
    const innerEnd = {
      x: endPoint.x + inward.x * depth + (opening.edge === 'top' || opening.edge === 'bottom' ? spread : 0),
      y: endPoint.y + inward.y * depth + (opening.edge === 'left' || opening.edge === 'right' ? spread : 0),
    }
    const centerDepth = depthBase * (0.54 + softness * 0.28) * directionalBias
    const focusPoint = {
      x: openingCenter.x + inward.x * centerDepth,
      y: openingCenter.y + inward.y * centerDepth,
    }
    const gradientLength = depthBase * (0.52 + softness * 0.46) * directionalBias
    const gradientStart = {
      x: openingCenter.x,
      y: openingCenter.y,
    }
    const gradientEnd = {
      x: openingCenter.x + inward.x * gradientLength,
      y: openingCenter.y + inward.y * gradientLength,
    }

    return {
      id: `opening-${room.id}-${index}`,
      type: opening.type ?? 'window',
      polygon: [
        `${startPoint.x},${startPoint.y}`,
        `${endPoint.x},${endPoint.y}`,
        `${innerEnd.x},${innerEnd.y}`,
        `${focusPoint.x},${focusPoint.y}`,
        `${innerStart.x},${innerStart.y}`,
      ].join(' '),
      opacity: clamp(0.12 + strength * 0.56, 0.1, 0.84),
      lineOpacity: clamp(0.18 + strength * 0.56, 0.18, 0.88),
      colorStart: rgba(openingColor(visualConfig, opening), clamp(0.72 + strength * 0.16, 0.72, 0.88)),
      colorMid: rgba(openingColor(visualConfig, opening), clamp(0.24 + strength * 0.14, 0.24, 0.4)),
      colorEnd: rgba(mixHex(openingColor(visualConfig, opening), visualConfig.shadowColor ?? '#e8dcc8', 0.3), clamp(0.08 + strength * 0.1, 0.08, 0.18)),
      midOffset: `${Math.round(clamp(42 + strength * 18, 42, 60))}%`,
      x1: gradientStart.x,
      y1: gradientStart.y,
      x2: gradientEnd.x,
      y2: gradientEnd.y,
      openingLine: {
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
      },
      softness,
    }
  })
}

function normalizedState(device) {
  return `${device?.raw_state ?? device?.state ?? device?.current_status ?? ''}`.trim().toLowerCase()
}

function normalizedBrightness(device) {
  const rawValue = Number(device?.brightness_value)
  if (Number.isNaN(rawValue)) {
    return isDeviceActive(device) ? 0.62 : 0
  }

  if (rawValue > 100) {
    return clamp(rawValue / 255, 0, 1)
  }

  return clamp(rawValue / 100, 0, 1)
}

function isLightDevice(device) {
  const domain = `${device?.entity_domain ?? device?.type ?? device?.device_type ?? ''}`.toLowerCase()
  return domain.includes('light')
}

function isCurtainDevice(device) {
  const domain = `${device?.entity_domain ?? device?.type ?? device?.device_type ?? ''}`.toLowerCase()
  return domain.includes('cover') || domain.includes('curtain')
}

function isClimateDevice(device) {
  return `${device?.entity_domain ?? ''}`.toLowerCase() === 'climate'
}

function resolveLightContribution(device) {
  if (!isLightDevice(device) || !isDeviceActive(device)) {
    return 0
  }

  const intensity = normalizedBrightness(device)
  return clamp(0.22 + intensity * 0.78, 0.18, 1)
}

function resolveLightAnchor(room, devices) {
  const activeLights = devices
    .filter((device) => isLightDevice(device) && isDeviceActive(device) && device?.position)
    .map((device) => ({
      x: Number(device.position.x),
      y: Number(device.position.y),
      weight: resolveLightContribution(device),
    }))
    .filter((entry) => Number.isFinite(entry.x) && Number.isFinite(entry.y) && entry.weight > 0)

  if (activeLights.length === 0) {
    return {
      cx: room.centerX,
      cy: room.centerY,
    }
  }

  const totalWeight = activeLights.reduce((sum, entry) => sum + entry.weight, 0) || 1
  const weightedX = activeLights.reduce((sum, entry) => sum + entry.x * entry.weight, 0) / totalWeight
  const weightedY = activeLights.reduce((sum, entry) => sum + entry.y * entry.weight, 0) / totalWeight

  return {
    cx: clamp(weightedX, room.frame.x + room.frame.width * 0.22, room.frame.x + room.frame.width * 0.78),
    cy: clamp(weightedY, room.frame.y + room.frame.height * 0.24, room.frame.y + room.frame.height * 0.76),
  }
}

function combineLightContributions(contributions) {
  if (contributions.length === 0) {
    return 0
  }

  return contributions.reduce((accumulator, current) => 1 - (1 - accumulator) * (1 - current), 0)
}

function resolveCurtainOpenness(device) {
  if (!isCurtainDevice(device)) {
    return null
  }

  const numericValue = Number(device?.number_value)
  if (!Number.isNaN(numericValue)) {
    return clamp(numericValue / 100, 0.08, 1)
  }

  const state = normalizedState(device)
  if (state === 'open' || state === 'opening' || state === 'on') {
    return state === 'opening' ? 0.76 : 1
  }
  if (state === 'closed' || state === 'closing' || state === 'off') {
    return state === 'closing' ? 0.24 : 0.08
  }

  return 0.52
}

function resolveClimateMood(device) {
  if (!isClimateDevice(device)) {
    return null
  }

  const mode = `${device?.hvac_mode ?? device?.raw_state ?? device?.state ?? ''}`.trim().toLowerCase()
  const currentTemperature = Number(device?.current_temperature)
  const validTemperature = Number.isNaN(currentTemperature) ? null : currentTemperature

  if (mode === 'cool') {
    return { color: COOL_CLIMATE_COLOR, intensity: 0.22 + (validTemperature !== null ? clamp((30 - validTemperature) / 14, 0, 0.18) : 0.08) }
  }

  if (mode === 'heat') {
    return { color: WARM_CLIMATE_COLOR, intensity: 0.2 + (validTemperature !== null ? clamp((validTemperature - 18) / 16, 0, 0.18) : 0.08) }
  }

  if (mode === 'dry' || mode === 'fan_only' || mode === 'auto') {
    return { color: NEUTRAL_CLIMATE_COLOR, intensity: 0.1 }
  }

  return null
}

function buildAmbientState(room, roomPriority = {}) {
  const devices = room?.devices ?? []
  const visualConfig = room?.visualConfig ?? {}
  const roomMode = `${roomPriority?.roomMode ?? 'calm'}`.trim().toLowerCase()
  const activeCount = devices.filter(isDeviceActive).length
  const lightContributions = devices.map(resolveLightContribution).filter((value) => value > 0)
  const curtainFactors = devices.map(resolveCurtainOpenness).filter((value) => value !== null)
  const climateMoods = devices.map(resolveClimateMood).filter(Boolean)
  const artificialLight = combineLightContributions(lightContributions)
  const daylightFactor = curtainFactors.length > 0
    ? curtainFactors.reduce((sum, value) => sum + value, 0) / curtainFactors.length
    : 0.58
  const climateMood = climateMoods[0] ?? { color: NEUTRAL_CLIMATE_COLOR, intensity: 0.04 }
  const activeWeight = devices.length > 0 ? clamp(activeCount / devices.length, 0, 1) : 0
  const adjustedDaylight = clamp(daylightFactor * (visualConfig.daylightStrength ?? 1), 0.06, 1)
  const adjustedLight = clamp(artificialLight * (visualConfig.artificialLightGain ?? 1), 0, 1)
  const adjustedClimate = clamp(climateMood.intensity * (visualConfig.climateInfluence ?? 1), 0.03, 0.3)
  const adjustedActivity = clamp(activeWeight * (visualConfig.activityInfluence ?? 1), 0, 1)
  const ambientEmphasis = clamp(roomPriority.ambientEmphasis ?? 1, 0.84, 1.28)
  const roomContrast = clamp(
    roomMode === 'scene'
      ? 1.18
      : roomMode === 'ambient'
        ? 1.12
        : roomMode === 'device'
          ? 1.06
          : 0.8,
    0.76,
    1.22,
  )
  const opacityBias = clamp(
    roomMode === 'scene'
      ? 1.22
      : roomMode === 'ambient'
        ? 1.12
        : roomMode === 'device'
          ? 1.04
          : 0.78,
    0.72,
    1.24,
  )
  const activeBoost = clamp(
    1 + adjustedActivity * 0.18 + Math.max(0, ambientEmphasis - 1) * 0.46,
    0.88,
    1.22,
  )
  const brightness = clamp(
    (0.055 + adjustedLight * 0.74 + adjustedDaylight * 0.34)
    * (visualConfig.brightnessBoost ?? 1)
    * roomContrast
    * activeBoost,
    0.05,
    1,
  )
  const roomBaseFill = mixHex(
    visualConfig.baseTone ?? room.tone.fill,
    visualConfig.surfaceTint ?? '#fff8ef',
    brightness * (visualConfig.fillLift ?? 0.42) + adjustedDaylight * 0.1,
  )
  const roomEdgeColor = mixHex(room.tone.edge, climateMood.color, adjustedClimate * 0.36)
  const lightAnchor = resolveLightAnchor(room, devices)
  const daylightOpacity = clamp(
    (0.06 + adjustedDaylight * 0.62)
    * (visualConfig.daylightOpacityGain ?? 1)
    * opacityBias
    * (1 + Math.max(0, ambientEmphasis - 1) * 0.48),
    0.06,
    0.94,
  )
  const lightOpacity = clamp(
    (0.04 + adjustedLight * 0.88)
    * (visualConfig.lightOpacityGain ?? 1)
    * opacityBias
    * (1 + Math.max(0, ambientEmphasis - 1) * 0.4),
    0.06,
    0.96,
  )
  const climateOpacity = clamp(adjustedClimate, 0.03, 0.28)
  const activityOpacity = clamp(adjustedActivity * 0.18, 0, 0.18)
  const openingDaylightEffects = buildOpeningDaylightEffects(room, visualConfig, adjustedDaylight, daylightFactor)
    .map((effect) => ({
      ...effect,
      opacity: clamp(
        effect.opacity
        * (visualConfig.openingOpacityGain ?? 1)
        * (0.92 + adjustedDaylight * 0.26)
        * opacityBias
        * (1 + Math.max(0, ambientEmphasis - 1) * 0.56),
        0.06,
        0.92,
      ),
      lineOpacity: clamp(
        effect.lineOpacity
        * (visualConfig.openingOpacityGain ?? 1)
        * (0.96 + adjustedDaylight * 0.18)
        * opacityBias
        * (1 + Math.max(0, ambientEmphasis - 1) * 0.34),
        0.12,
        0.94,
      ),
    }))
  const daylightGradient = resolveDaylightGradient(room.frame, visualConfig.daylightDirection)
  const daylightStartAlpha = clamp(0.65 + adjustedDaylight * 0.2, 0.65, 0.85)
  const daylightMidAlpha = clamp(0.22 + adjustedDaylight * 0.12, 0.22, 0.36)
  const daylightEndAlpha = clamp(0.08 + adjustedDaylight * 0.1, 0.08, 0.18)
  const lightRadius = Math.max(room.frame.width, room.frame.height) * clamp(0.46 + adjustedLight * 0.12, 0.46, 0.62)

  return {
    roomId: room.id,
    brightness,
    daylightFactor,
    artificialLight,
    activeWeight,
    climate: climateMood,
    visualConfig,
    baseFill: roomBaseFill,
    edgeColor: roomEdgeColor,
    textColor: mixHex(visualConfig.textTint ?? '#213041', '#0f172a', brightness * 0.2),
    secondaryTextColor: rgba('#334155', 0.72 + brightness * 0.16),
    shellHighlightOpacity: clamp((0.18 + brightness * 0.28) * opacityBias, 0.16, 0.58),
    ambientLightOpacity: lightOpacity,
    daylightOpacity,
    climateOpacity,
    activityOpacity,
    lightGradient: {
      cx: lightAnchor.cx,
      cy: lightAnchor.cy,
      fx: lightAnchor.cx,
      fy: lightAnchor.cy,
      r: lightRadius,
    },
    lightCoreColor: rgba(DEFAULT_LIGHT_COLOR, clamp(0.88 + adjustedLight * 0.08, 0.88, 0.96)),
    lightMidColor: rgba(DEFAULT_LIGHT_COLOR, clamp(0.22 + adjustedLight * 0.18, 0.22, 0.42)),
    lightOuterColor: rgba(DEFAULT_LIGHT_COLOR, clamp(0.02 + adjustedLight * 0.04, 0.02, 0.08)),
    daylightGradient,
    daylightOpenings: openingDaylightEffects,
    usesOpeningDaylight: openingDaylightEffects.length > 0,
    daylightStartColor: rgba(visualConfig.daylightColor ?? DEFAULT_DAYLIGHT_COLOR, daylightStartAlpha),
    daylightMidColor: rgba(visualConfig.daylightColor ?? DEFAULT_DAYLIGHT_COLOR, daylightMidAlpha),
    daylightMidOffset: `${Math.round(clamp(38 + adjustedDaylight * 16, 38, 54))}%`,
    daylightEndColor: rgba(visualConfig.shadowColor ?? DEFAULT_DAYLIGHT_COLOR, daylightEndAlpha),
    climateStartColor: rgba(climateMood.color, 0.5),
    climateEndColor: rgba(climateMood.color, 0),
    activityColor: rgba(room.tone.edge, 0.18),
    ids: {
      daylight: `ambient-daylight-${room.id}`,
      light: `ambient-light-${room.id}`,
      climate: `ambient-climate-${room.id}`,
      activity: `ambient-activity-${room.id}`,
    },
  }
}

export function useAmbientState(roomModels, roomPriorityByIdRef = null) {
  const ambientRooms = computed(() => {
    const rooms = unref(roomModels) ?? []
    const roomPriorityById = unref(roomPriorityByIdRef) ?? {}
    return rooms.map((room) => ({
      roomId: room.id,
      ambient: {
        ...buildAmbientState(room, roomPriorityById[room.id] ?? null),
        priority: roomPriorityById[room.id] ?? { ambientEmphasis: 1, roomMode: 'calm', hasSceneCluster: false },
      },
    }))
  })

  const ambientByRoomId = computed(() =>
    Object.fromEntries(ambientRooms.value.map((entry) => [entry.roomId, entry.ambient])),
  )

  return {
    ambientRooms,
    ambientByRoomId,
    rules: AMBIENT_RULES,
  }
}
