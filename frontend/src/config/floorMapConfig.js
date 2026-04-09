const DEFAULT_VISUAL_CONFIG = {
  ambientPreset: 'balanced',
  materialTone: 'natural',
  spatialPreset: 'balanced',
  baseTone: '#efe5d8',
  daylightDirection: 'top',
  openings: [],
  daylightStrength: 1,
  artificialLightGain: 1,
  climateInfluence: 1,
  activityInfluence: 1,
  brightnessBoost: 1,
  daylightOpacityGain: 1,
  lightOpacityGain: 1,
  openingOpacityGain: 1,
  elevationShiftX: 12,
  elevationShiftY: 10,
  floorInset: 10,
  wallHighlight: 0.74,
}

export const ROOM_AMBIENT_PRESETS = {
  balanced: {
    daylightStrength: 1,
    artificialLightGain: 1,
    climateInfluence: 0.8,
    activityInfluence: 0.85,
    fillLift: 0.42,
  },
  living: {
    daylightStrength: 1.18,
    artificialLightGain: 1.06,
    climateInfluence: 0.72,
    activityInfluence: 1,
    fillLift: 0.5,
  },
  bedroom: {
    daylightStrength: 0.82,
    artificialLightGain: 0.74,
    climateInfluence: 0.58,
    activityInfluence: 0.55,
    fillLift: 0.32,
  },
  kitchen: {
    daylightStrength: 1.08,
    artificialLightGain: 0.92,
    climateInfluence: 0.9,
    activityInfluence: 0.72,
    fillLift: 0.46,
  },
  bathroom: {
    daylightStrength: 1.15,
    artificialLightGain: 1,
    climateInfluence: 0.7,
    activityInfluence: 0.62,
    fillLift: 0.48,
  },
  corridor: {
    daylightStrength: 0.34,
    artificialLightGain: 0.58,
    climateInfluence: 0.4,
    activityInfluence: 0.42,
    fillLift: 0.22,
  },
}

export const MATERIAL_TONES = {
  natural: {
    surfaceTint: '#fff8ef',
    daylightColor: '#fff4de',
    shadowColor: '#dbcab6',
    textTint: '#213041',
  },
  airy: {
    surfaceTint: '#fffaf3',
    daylightColor: '#fff7e5',
    shadowColor: '#d7c7ae',
    textTint: '#1b2d3b',
  },
  soft: {
    surfaceTint: '#f7f0ec',
    daylightColor: '#fff1e7',
    shadowColor: '#d8cac5',
    textTint: '#2b3240',
  },
  crisp: {
    surfaceTint: '#f1f7f9',
    daylightColor: '#f6fbff',
    shadowColor: '#c7d7de',
    textTint: '#17303c',
  },
  clean: {
    surfaceTint: '#f7f8f6',
    daylightColor: '#ffffff',
    shadowColor: '#d6d8d4',
    textTint: '#273442',
  },
}

export const ROOM_SPATIAL_PRESETS = {
  balanced: {
    elevationShiftX: 12,
    elevationShiftY: 10,
    floorInset: 10,
    wallHighlight: 0.72,
    zoningPreset: 'balanced',
  },
  living: {
    elevationShiftX: 16,
    elevationShiftY: 13,
    floorInset: 12,
    wallHighlight: 0.84,
    zoningPreset: 'living',
  },
  bedroom: {
    elevationShiftX: 10,
    elevationShiftY: 9,
    floorInset: 14,
    wallHighlight: 0.68,
    zoningPreset: 'bedroom',
  },
  kitchen: {
    elevationShiftX: 14,
    elevationShiftY: 11,
    floorInset: 11,
    wallHighlight: 0.78,
    zoningPreset: 'service',
  },
  bathroom: {
    elevationShiftX: 13,
    elevationShiftY: 10,
    floorInset: 11,
    wallHighlight: 0.8,
    zoningPreset: 'service',
  },
  corridor: {
    elevationShiftX: 10,
    elevationShiftY: 9,
    floorInset: 12,
    wallHighlight: 0.68,
    zoningPreset: 'corridor',
  },
}

export const ROOM_VISUAL_CONFIG = {
  byId: {
    living_room: {
      ambientPreset: 'living',
      materialTone: 'airy',
      spatialPreset: 'living',
      baseTone: '#eee1cf',
      daylightDirection: 'left',
      elevationShiftX: 18,
      elevationShiftY: 14,
      floorInset: 12,
      openings: [
        {
          type: 'window',
          edge: 'left',
          start: 0.14,
          end: 0.4,
          strength: 0.92,
          softness: 0.82,
          tint: '#fff7e7',
        },
        {
          type: 'balcony',
          edge: 'bottom',
          start: 0.58,
          end: 0.9,
          strength: 1,
          softness: 0.96,
          tint: '#fff9ef',
        },
      ],
    },
    bedroom: {
      ambientPreset: 'bedroom',
      materialTone: 'soft',
      spatialPreset: 'bedroom',
      baseTone: '#e8ddd8',
      daylightDirection: 'right',
      elevationShiftX: 10,
      elevationShiftY: 9,
      floorInset: 15,
      openings: [
        {
          type: 'window',
          edge: 'right',
          start: 0.18,
          end: 0.46,
          strength: 0.72,
          softness: 0.68,
          tint: '#fff1e8',
        },
      ],
    },
  },
  byName: [
    {
      matcher: /客厅|起居室/i,
      config: {
        ambientPreset: 'living',
        materialTone: 'airy',
        spatialPreset: 'living',
        baseTone: '#efe3d2',
        daylightDirection: 'left',
        elevationShiftX: 18,
        elevationShiftY: 14,
        floorInset: 12,
        openings: [
          {
            type: 'window',
            edge: 'left',
            start: 0.16,
            end: 0.42,
            strength: 0.88,
            softness: 0.82,
            tint: '#fff7e7',
          },
          {
            type: 'balcony',
            edge: 'bottom',
            start: 0.6,
            end: 0.92,
            strength: 1,
            softness: 0.96,
            tint: '#fffaf1',
          },
        ],
      },
    },
    {
      matcher: /卧室|主卧|次卧/i,
      config: {
        ambientPreset: 'bedroom',
        materialTone: 'soft',
        spatialPreset: 'bedroom',
        baseTone: '#eadfd8',
        daylightDirection: 'right',
        elevationShiftX: 10,
        elevationShiftY: 9,
        floorInset: 15,
        openings: [
          {
            type: 'window',
            edge: 'right',
            start: 0.18,
            end: 0.46,
            strength: 0.72,
            softness: 0.68,
            tint: '#fff1e8',
          },
        ],
      },
    },
    {
      matcher: /厨房/i,
      config: {
        ambientPreset: 'kitchen',
        materialTone: 'crisp',
        spatialPreset: 'kitchen',
        baseTone: '#e7eef0',
        daylightDirection: 'top',
      },
    },
    {
      matcher: /卫生间|浴室/i,
      config: {
        ambientPreset: 'bathroom',
        materialTone: 'clean',
        spatialPreset: 'bathroom',
        baseTone: '#efefea',
        daylightDirection: 'top',
      },
    },
    {
      matcher: /玄关|走廊/i,
      config: {
        ambientPreset: 'corridor',
        materialTone: 'clean',
        spatialPreset: 'corridor',
        baseTone: '#efefe8',
        daylightDirection: 'top',
      },
    },
  ],
}

export const VISUAL_PRIORITY_CONFIG = {
  activityWindowMs: 2600,
  sceneClusterCount: 2,
  maxStrongAnimations: 2,
  maxStrongAnimationsInScene: 1,
  ambientDomains: ['light', 'cover', 'scene'],
  motionDomains: ['climate', 'fan'],
  domainAttention: {
    scene: 1,
    cover: 0.84,
    light: 0.74,
    climate: 0.9,
    fan: 0.94,
    media_player: 0.52,
    switch: 0.42,
    sensor: 0.18,
    generic: 0.3,
  },
  statusAttention: {
    pending: 1,
    success: 0.72,
    error: 0.82,
    realtime: 0.46,
  },
  roomModes: {
    calm: {
      ambientEmphasis: 1,
      primaryMotionEmphasis: 1,
      secondaryMotionEmphasis: 0.62,
      backgroundMotionEmphasis: 0.28,
      feedbackEmphasis: 0.84,
    },
    device: {
      ambientEmphasis: 1.02,
      primaryMotionEmphasis: 1,
      secondaryMotionEmphasis: 0.56,
      backgroundMotionEmphasis: 0.24,
      feedbackEmphasis: 0.8,
    },
    ambient: {
      ambientEmphasis: 1.08,
      primaryMotionEmphasis: 0.74,
      secondaryMotionEmphasis: 0.34,
      backgroundMotionEmphasis: 0.14,
      feedbackEmphasis: 0.68,
    },
    scene: {
      ambientEmphasis: 1.16,
      primaryMotionEmphasis: 0.62,
      secondaryMotionEmphasis: 0.22,
      backgroundMotionEmphasis: 0.1,
      feedbackEmphasis: 0.58,
    },
  },
}

export const ROOM_TRANSITION_ORCHESTRATION = {
  enteringWindowMs: 320,
  exitingWindowMs: 220,
  roomModes: {
    calm: {
      ambientDuration: 220,
      motionDuration: 200,
      feedbackDuration: 180,
      ambientEnterDelay: 0,
      primaryEnterDelay: 55,
      secondaryEnterDelay: 95,
      feedbackEnterDelay: 140,
      ambientExitDelay: 40,
      primaryExitDelay: 18,
      secondaryExitDelay: 0,
      feedbackExitDelay: 0,
    },
    device: {
      ambientDuration: 220,
      motionDuration: 210,
      feedbackDuration: 180,
      ambientEnterDelay: 0,
      primaryEnterDelay: 68,
      secondaryEnterDelay: 110,
      feedbackEnterDelay: 150,
      ambientExitDelay: 44,
      primaryExitDelay: 24,
      secondaryExitDelay: 0,
      feedbackExitDelay: 0,
    },
    ambient: {
      ambientDuration: 240,
      motionDuration: 200,
      feedbackDuration: 180,
      ambientEnterDelay: 0,
      primaryEnterDelay: 88,
      secondaryEnterDelay: 136,
      feedbackEnterDelay: 176,
      ambientExitDelay: 56,
      primaryExitDelay: 28,
      secondaryExitDelay: 0,
      feedbackExitDelay: 0,
    },
    scene: {
      ambientDuration: 260,
      motionDuration: 210,
      feedbackDuration: 180,
      ambientEnterDelay: 0,
      primaryEnterDelay: 102,
      secondaryEnterDelay: 156,
      feedbackEnterDelay: 196,
      ambientExitDelay: 68,
      primaryExitDelay: 34,
      secondaryExitDelay: 8,
      feedbackExitDelay: 0,
    },
  },
}

function mergeConfig(...items) {
  return Object.assign({}, ...items.filter(Boolean))
}

function resolveMatchedConfig(room) {
  const idKey = room?.slug ?? room?.code ?? room?.entity_key ?? room?.room_id ?? room?.id
  if (idKey && ROOM_VISUAL_CONFIG.byId[idKey]) {
    return ROOM_VISUAL_CONFIG.byId[idKey]
  }

  const name = `${room?.name ?? ''}`.trim()
  const matched = ROOM_VISUAL_CONFIG.byName.find((entry) => entry.matcher.test(name))
  return matched?.config ?? null
}

export function resolveRoomVisualConfig(room) {
  const explicitConfig = room?.visual_config ?? room?.visualConfig ?? null
  const matchedConfig = resolveMatchedConfig(room)
  const merged = mergeConfig(DEFAULT_VISUAL_CONFIG, matchedConfig, explicitConfig)
  const preset = ROOM_AMBIENT_PRESETS[merged.ambientPreset] ?? ROOM_AMBIENT_PRESETS.balanced
  const material = MATERIAL_TONES[merged.materialTone] ?? MATERIAL_TONES.natural
  const spatial = ROOM_SPATIAL_PRESETS[merged.spatialPreset ?? merged.ambientPreset] ?? ROOM_SPATIAL_PRESETS.balanced

  return {
    ...DEFAULT_VISUAL_CONFIG,
    ...preset,
    ...material,
    ...spatial,
    ...matchedConfig,
    ...explicitConfig,
    openings: [...(matchedConfig?.openings ?? []), ...(explicitConfig?.openings ?? [])],
  }
}
