const DEV_SHOWCASE_PREFIX = 'dev_showcase'

export const DEV_SHOWCASE_ENABLED = import.meta.env.DEV && import.meta.env.VITE_DEV_SHOWCASE === 'true'

const DEV_SHOWCASE_ZONE = {
  id: `${DEV_SHOWCASE_PREFIX}_zone`,
  name: '开发态回家模式',
  description: '用于本地开发预览的高端中控默认模板。',
}

const ROOM_TEMPLATE_CONFIG = {
  living: {
    ambientPreset: 'living',
    materialTone: 'airy',
    spatialPreset: 'living',
    baseTone: '#f1e2d0',
    daylightDirection: 'left',
    daylightStrength: 1.34,
    artificialLightGain: 1.24,
    climateInfluence: 0.78,
    activityInfluence: 1.1,
    brightnessBoost: 1.16,
    daylightOpacityGain: 1.24,
    lightOpacityGain: 1.22,
    openingOpacityGain: 1.3,
    elevationShiftX: 18,
    elevationShiftY: 14,
    floorInset: 12,
    wallHighlight: 0.88,
    openings: [
      {
        type: 'window',
        edge: 'left',
        start: 0.14,
        end: 0.42,
        strength: 1,
        softness: 0.82,
        tint: '#fff7e8',
      },
      {
        type: 'balcony',
        edge: 'bottom',
        start: 0.56,
        end: 0.92,
        strength: 1.12,
        softness: 0.98,
        tint: '#fffaf1',
      },
    ],
  },
  masterBedroom: {
    ambientPreset: 'bedroom',
    materialTone: 'soft',
    spatialPreset: 'bedroom',
    baseTone: '#e8ddd7',
    daylightDirection: 'right',
    daylightStrength: 0.56,
    artificialLightGain: 0.68,
    climateInfluence: 0.5,
    activityInfluence: 0.44,
    brightnessBoost: 0.88,
    daylightOpacityGain: 0.92,
    lightOpacityGain: 0.82,
    openingOpacityGain: 0.9,
    elevationShiftX: 10,
    elevationShiftY: 9,
    floorInset: 15,
    wallHighlight: 0.66,
    openings: [
      {
        type: 'window',
        edge: 'right',
        start: 0.18,
        end: 0.52,
        strength: 0.72,
        softness: 0.66,
        tint: '#fff0e6',
      },
    ],
  },
  study: {
    ambientPreset: 'balanced',
    materialTone: 'crisp',
    spatialPreset: 'balanced',
    baseTone: '#e8eef1',
    daylightDirection: 'top',
    daylightStrength: 0.48,
    artificialLightGain: 0.64,
    climateInfluence: 0.56,
    activityInfluence: 0.42,
    brightnessBoost: 0.84,
    daylightOpacityGain: 0.88,
    lightOpacityGain: 0.8,
    openingOpacityGain: 0.84,
    elevationShiftX: 11,
    elevationShiftY: 10,
    floorInset: 13,
    wallHighlight: 0.72,
    openings: [
      {
        type: 'window',
        edge: 'top',
        start: 0.22,
        end: 0.58,
        strength: 0.48,
        softness: 0.58,
        tint: '#f9fcff',
      },
    ],
  },
  entry: {
    ambientPreset: 'corridor',
    materialTone: 'clean',
    spatialPreset: 'corridor',
    baseTone: '#efefe8',
    daylightDirection: 'top',
    daylightStrength: 0.22,
    artificialLightGain: 0.62,
    climateInfluence: 0.38,
    activityInfluence: 0.36,
    brightnessBoost: 0.82,
    daylightOpacityGain: 0.72,
    lightOpacityGain: 0.84,
    openingOpacityGain: 0.72,
    elevationShiftX: 10,
    elevationShiftY: 9,
    floorInset: 12,
    wallHighlight: 0.7,
    openings: [
      {
        type: 'door',
        edge: 'top',
        start: 0.38,
        end: 0.68,
        strength: 0.26,
        softness: 0.46,
        tint: '#fffaf0',
      },
    ],
  },
}

const ROOM_TEMPLATES = [
  {
    key: 'living',
    id: `${DEV_SHOWCASE_PREFIX}_living_room`,
    name: '客厅',
    description: '开发态默认中控主舞台。',
    matcher: /客厅|起居室/i,
    plan: { x: 240, y: 240, width: 520, height: 292 },
    visualConfig: ROOM_TEMPLATE_CONFIG.living,
    devices: [
      {
        id: `${DEV_SHOWCASE_PREFIX}_living_main_light`,
        name: '客厅主灯',
        entity_domain: 'light',
        device_type: 'mijia_light',
        appliance_type: 'light',
        can_control: true,
        control_kind: 'toggle',
        supports_brightness: true,
        brightness_min: 1,
        brightness_max: 100,
        brightness_value: 82,
        color_temperature: 3600,
        min_color_temperature: 2700,
        max_color_temperature: 6500,
        current_status: 'on',
        raw_state: 'on',
        position: { x: 0.42, y: 0.3 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_living_accent_light`,
        name: '客厅辅助灯',
        entity_domain: 'light',
        device_type: 'mijia_light',
        appliance_type: 'light',
        can_control: true,
        control_kind: 'toggle',
        supports_brightness: true,
        brightness_min: 1,
        brightness_max: 100,
        brightness_value: 46,
        color_temperature: 3400,
        min_color_temperature: 2700,
        max_color_temperature: 6500,
        current_status: 'on',
        raw_state: 'on',
        position: { x: 0.7, y: 0.4 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_living_climate`,
        name: '客厅空调',
        entity_domain: 'climate',
        device_type: 'climate',
        appliance_type: 'air_conditioner',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'cool',
        raw_state: 'cool',
        hvac_mode: 'cool',
        hvac_modes: ['off', 'cool', 'heat', 'fan_only', 'auto'],
        fan_modes: ['low', 'medium', 'high'],
        fan_mode: 'medium',
        current_temperature: 26,
        target_temperature: 23,
        unit_of_measurement: '°C',
        position: { x: 0.78, y: 0.22 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_living_fan`,
        name: '客厅风扇',
        entity_domain: 'fan',
        device_type: 'fan',
        appliance_type: 'fan',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'on',
        raw_state: 'on',
        fan_mode: 'low',
        number_value: 32,
        position: { x: 0.3, y: 0.54 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_living_curtain`,
        name: '客厅窗帘',
        entity_domain: 'cover',
        device_type: 'curtain',
        appliance_type: 'curtain',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'open',
        raw_state: 'open',
        number_value: 78,
        position: { x: 0.12, y: 0.42 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_living_tv`,
        name: '客厅电视',
        entity_domain: 'media_player',
        device_type: 'media_player',
        appliance_type: 'tv',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'off',
        raw_state: 'off',
        media_volume_level: 0.24,
        position: { x: 0.58, y: 0.68 },
      },
    ],
  },
  {
    key: 'masterBedroom',
    id: `${DEV_SHOWCASE_PREFIX}_master_bedroom`,
    name: '主卧',
    description: '开发态默认卧室模板。',
    matcher: /主卧|主人房/i,
    plan: { x: 792, y: 184, width: 272, height: 228 },
    visualConfig: ROOM_TEMPLATE_CONFIG.masterBedroom,
    devices: [
      {
        id: `${DEV_SHOWCASE_PREFIX}_master_main_light`,
        name: '主卧主灯',
        entity_domain: 'light',
        device_type: 'mijia_light',
        appliance_type: 'light',
        can_control: true,
        control_kind: 'toggle',
        supports_brightness: true,
        brightness_value: 0,
        current_status: 'off',
        raw_state: 'off',
        position: { x: 0.46, y: 0.28 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_master_bedside_light`,
        name: '主卧床头灯',
        entity_domain: 'light',
        device_type: 'mijia_light',
        appliance_type: 'light',
        can_control: true,
        control_kind: 'toggle',
        supports_brightness: true,
        brightness_value: 18,
        color_temperature: 3000,
        current_status: 'on',
        raw_state: 'on',
        position: { x: 0.72, y: 0.62 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_master_climate`,
        name: '主卧空调',
        entity_domain: 'climate',
        device_type: 'climate',
        appliance_type: 'air_conditioner',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'off',
        raw_state: 'off',
        hvac_mode: 'off',
        hvac_modes: ['off', 'cool', 'heat', 'fan_only', 'auto'],
        fan_modes: ['low', 'medium', 'high'],
        fan_mode: 'low',
        current_temperature: 25,
        target_temperature: 25,
        unit_of_measurement: '°C',
        position: { x: 0.82, y: 0.24 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_master_curtain`,
        name: '主卧窗帘',
        entity_domain: 'cover',
        device_type: 'curtain',
        appliance_type: 'curtain',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'closed',
        raw_state: 'closed',
        number_value: 18,
        position: { x: 0.9, y: 0.4 },
      },
    ],
  },
  {
    key: 'study',
    id: `${DEV_SHOWCASE_PREFIX}_study`,
    name: '书房',
    description: '开发态默认次卧/书房模板。',
    matcher: /次卧|书房|客房/i,
    plan: { x: 812, y: 446, width: 238, height: 170 },
    visualConfig: ROOM_TEMPLATE_CONFIG.study,
    devices: [
      {
        id: `${DEV_SHOWCASE_PREFIX}_study_main_light`,
        name: '书房主灯',
        entity_domain: 'light',
        device_type: 'mijia_light',
        appliance_type: 'light',
        can_control: true,
        control_kind: 'toggle',
        supports_brightness: true,
        brightness_value: 0,
        current_status: 'off',
        raw_state: 'off',
        position: { x: 0.42, y: 0.28 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_study_desk_light`,
        name: '书桌灯',
        entity_domain: 'light',
        device_type: 'mijia_light',
        appliance_type: 'light',
        can_control: true,
        control_kind: 'toggle',
        supports_brightness: true,
        brightness_value: 0,
        current_status: 'off',
        raw_state: 'off',
        position: { x: 0.7, y: 0.58 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_study_fan`,
        name: '书房风扇',
        entity_domain: 'fan',
        device_type: 'fan',
        appliance_type: 'fan',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'off',
        raw_state: 'off',
        fan_mode: 'low',
        position: { x: 0.22, y: 0.42 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_study_curtain`,
        name: '书房窗帘',
        entity_domain: 'cover',
        device_type: 'curtain',
        appliance_type: 'curtain',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'closed',
        raw_state: 'closed',
        number_value: 22,
        position: { x: 0.46, y: 0.12 },
      },
    ],
  },
  {
    key: 'entry',
    id: `${DEV_SHOWCASE_PREFIX}_entry`,
    name: '玄关',
    description: '开发态默认玄关模板。',
    matcher: /玄关|走廊/i,
    plan: { x: 96, y: 158, width: 176, height: 138 },
    visualConfig: ROOM_TEMPLATE_CONFIG.entry,
    devices: [
      {
        id: `${DEV_SHOWCASE_PREFIX}_entry_main_light`,
        name: '玄关主灯',
        entity_domain: 'light',
        device_type: 'mijia_light',
        appliance_type: 'light',
        can_control: true,
        control_kind: 'toggle',
        supports_brightness: true,
        brightness_value: 28,
        current_status: 'on',
        raw_state: 'on',
        position: { x: 0.44, y: 0.34 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_entry_wash_light`,
        name: '走廊氛围灯',
        entity_domain: 'light',
        device_type: 'mijia_light',
        appliance_type: 'light',
        can_control: true,
        control_kind: 'toggle',
        supports_brightness: true,
        brightness_value: 16,
        current_status: 'on',
        raw_state: 'on',
        position: { x: 0.72, y: 0.58 },
      },
      {
        id: `${DEV_SHOWCASE_PREFIX}_entry_fan`,
        name: '玄关新风',
        entity_domain: 'fan',
        device_type: 'fan',
        appliance_type: 'fan',
        can_control: true,
        control_kind: 'toggle',
        current_status: 'off',
        raw_state: 'off',
        fan_mode: 'low',
        position: { x: 0.18, y: 0.52 },
      },
    ],
  },
]

function cloneOpening(opening) {
  return { ...opening }
}

function cloneDevice(device, roomId) {
  return {
    ...device,
    room_id: roomId,
    entity_id: device.entity_id ?? device.ha_entity_id ?? `${device.entity_domain}.${device.id}`,
    ha_entity_id: device.ha_entity_id ?? `${device.entity_domain}.${device.id}`,
  }
}

function cloneRoomTemplate(template) {
  return {
    id: template.id,
    zone_id: null,
    zone: null,
    name: template.name,
    description: template.description,
    plan_x: template.plan.x,
    plan_y: template.plan.y,
    plan_width: template.plan.width,
    plan_height: template.plan.height,
    plan_rotation: 0,
    visual_config: {
      ...template.visualConfig,
      openings: template.visualConfig.openings.map(cloneOpening),
    },
    devices: template.devices.map((device) => cloneDevice(device, template.id)),
  }
}

function mergeRoomWithTemplate(room, template) {
  return {
    ...room,
    id: template.id,
    name: template.name,
    description: template.description,
    plan_x: template.plan.x,
    plan_y: template.plan.y,
    plan_width: template.plan.width,
    plan_height: template.plan.height,
    plan_rotation: 0,
    visual_config: {
      ...template.visualConfig,
      openings: template.visualConfig.openings.map(cloneOpening),
    },
    devices: template.devices.map((device) => cloneDevice(device, template.id)),
  }
}

function matchTemplateRoom(rooms, template, usedRoomIds) {
  return rooms.find((room) => !usedRoomIds.has(`${room.id}`) && template.matcher.test(`${room.name ?? ''}`.trim()))
}

export function isDevShowcaseRoomId(roomId) {
  return `${roomId ?? ''}`.startsWith(DEV_SHOWCASE_PREFIX)
}

export function isDevShowcaseDeviceId(deviceId) {
  return `${deviceId ?? ''}`.startsWith(DEV_SHOWCASE_PREFIX)
}

export function applyDevShowcaseRooms(rooms) {
  if (!DEV_SHOWCASE_ENABLED) {
    return rooms
  }

  const workingRooms = Array.isArray(rooms) ? rooms.map((room) => ({ ...room, devices: [...(room.devices ?? [])] })) : []
  const usedRoomIds = new Set()

  ROOM_TEMPLATES.forEach((template) => {
    const matchedRoom = matchTemplateRoom(workingRooms, template, usedRoomIds)
    if (matchedRoom) {
      usedRoomIds.add(`${matchedRoom.id}`)
      const roomIndex = workingRooms.findIndex((room) => room.id === matchedRoom.id)
      workingRooms.splice(roomIndex, 1, mergeRoomWithTemplate(matchedRoom, template))
      return
    }

    workingRooms.push(cloneRoomTemplate(template))
  })

  return workingRooms
}

export function applyDevShowcaseScene(scene) {
  if (!DEV_SHOWCASE_ENABLED) {
    return scene
  }

  const nextRooms = applyDevShowcaseRooms(scene?.rooms ?? [])
  return {
    zone: scene?.zone ?? DEV_SHOWCASE_ZONE,
    analysis: scene?.analysis ?? null,
    rooms: nextRooms,
  }
}

function isActiveDevice(device) {
  return ['on', 'cool', 'heat', 'auto', 'fan_only', 'open'].includes(`${device?.raw_state ?? device?.current_status ?? ''}`.toLowerCase())
}

export function createDevShowcaseActivities(rooms) {
  if (!DEV_SHOWCASE_ENABLED) {
    return []
  }

  const livingRoom = rooms.find((room) => /客厅|起居室/i.test(`${room.name ?? ''}`))
  const entries = []

  if (livingRoom) {
    entries.push({
      roomId: livingRoom.id,
      deviceId: `${DEV_SHOWCASE_PREFIX}_scene_homecoming`,
      domain: 'scene',
      status: 'success',
      source: 'dev-showcase',
    })
  }

  rooms.forEach((room) => {
    ;(room.devices ?? [])
      .filter((device) => isDevShowcaseDeviceId(device.id) && isActiveDevice(device))
      .forEach((device) => {
        entries.push({
          roomId: room.id,
          deviceId: device.id,
          domain: device.entity_domain ?? device.type ?? 'generic',
          status: 'success',
          source: 'dev-showcase',
        })
      })
  })

  return entries
}

export function getDevShowcasePreferredRoomId(rooms) {
  const livingRoom = (rooms ?? []).find((room) => /客厅|起居室/i.test(`${room.name ?? ''}`))
  return livingRoom?.id ?? rooms?.[0]?.id ?? null
}
