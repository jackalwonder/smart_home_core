function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeImagePath(path) {
  if (typeof path === 'string' && path.trim()) {
    return path.trim()
  }
  return '/floorplans/songyue-floorplan.jpg'
}

function deriveAspectRatio(zone) {
  const width = toNumber(zone?.floor_plan_image_width)
  const height = toNumber(zone?.floor_plan_image_height)
  if (width && height) {
    return `${width} / ${height}`
  }
  return '1200 / 789'
}

function deriveRoomLayout(room) {
  const layout = room?.effective_layout || room?.layout_persisted || room?.layout_derived || room || {}

  return {
    x: toNumber(layout.plan_x),
    y: toNumber(layout.plan_y),
    width: toNumber(layout.plan_width),
    height: toNumber(layout.plan_height),
    rotation: toNumber(layout.plan_rotation) ?? 0,
  }
}

function deriveDeviceLayout(device) {
  const layout = device?.effective_layout || device?.layout_persisted || device?.layout_derived || device || {}

  return {
    x: toNumber(layout.plan_x),
    y: toNumber(layout.plan_y),
    z: toNumber(layout.plan_z),
    rotation: toNumber(layout.plan_rotation) ?? 0,
  }
}

function deriveDeviceCategory(device) {
  const domain = String(device?.entity_domain || '').toLowerCase()
  const applianceType = String(device?.appliance_type || '').toLowerCase()

  if (domain === 'light') return 'lights'
  if (domain === 'climate') return 'climate'
  if (domain === 'fan') return 'fan'
  if (['switch', 'button', 'input_button'].includes(domain)) return 'switch'
  if (['temperature', 'humidity', 'motion', 'presence', 'door', 'window'].includes(applianceType)) return 'sensor'
  return 'generic'
}

function deriveHotspotIcon(device) {
  const domain = String(device?.entityDomain || device?.entity_domain || '').toLowerCase()
  const controlKind = String(device?.controlKind || device?.control_kind || '').toLowerCase()

  if (domain === 'light') return 'light'
  if (domain === 'climate') return 'climate'
  if (domain === 'fan') return 'fan'
  if (controlKind === 'toggle') return 'light'
  return 'presence'
}

function deriveActiveState(device) {
  const currentStatus = String(device?.currentStatus || device?.current_status || '').toLowerCase()
  const rawState = String(device?.rawState || device?.raw_state || '').toLowerCase()

  if (['on', 'open', 'playing', 'active'].includes(currentStatus)) return true
  if (['on', 'open', 'cool', 'heat', 'dry', 'fan_only', 'playing'].includes(rawState)) return true
  return false
}

export function deriveDeviceCapabilities(device) {
  const controlKind = String(device?.controlKind || device?.control_kind || '').toLowerCase()
  const hvacModes = Array.isArray(device?.hvacModes || device?.hvac_modes) ? (device.hvacModes || device.hvac_modes) : []
  const controlOptions = Array.isArray(device?.controlOptions || device?.control_options)
    ? (device.controlOptions || device.control_options)
    : []

  return {
    canToggle: controlKind === 'toggle',
    canPress: controlKind === 'button',
    hasNumberControl: controlKind === 'number' || toNumber(device?.numberValue ?? device?.number_value) !== null,
    hasTargetTemperature: toNumber(device?.targetTemperature ?? device?.target_temperature) !== null,
    hasBrightness: Boolean(device?.supportsBrightness ?? device?.supports_brightness) || toNumber(device?.brightnessValue ?? device?.brightness_value) !== null,
    hasColorTemperature: Boolean(device?.supportsColorTemperature ?? device?.supports_color_temperature) || toNumber(device?.colorTemperature ?? device?.color_temperature) !== null,
    hvacModes,
    controlOptions,
  }
}

function deriveInteractionKind(device) {
  const controlKind = String(device?.control_kind || '').toLowerCase()
  const capabilities = deriveDeviceCapabilities(device)

  if (['toggle', 'button'].includes(controlKind) && !capabilities.hasTargetTemperature && !capabilities.hvacModes.length && !capabilities.hasBrightness && !capabilities.hasColorTemperature && !capabilities.controlOptions.length) {
    return 'direct'
  }

  if (
    capabilities.hasTargetTemperature ||
    capabilities.hvacModes.length > 0 ||
    capabilities.controlOptions.length > 0 ||
    capabilities.hasBrightness ||
    capabilities.hasColorTemperature ||
    capabilities.hasNumberControl ||
    capabilities.canToggle ||
    capabilities.canPress
  ) {
    return 'panel'
  }

  return 'readonly'
}

export function derivePanelKind(device) {
  const capabilities = deriveDeviceCapabilities(device)
  if (capabilities.hasTargetTemperature || capabilities.hvacModes.length > 0) {
    return 'climate'
  }
  if (
    capabilities.hasBrightness ||
    capabilities.hasColorTemperature ||
    capabilities.controlOptions.length > 0 ||
    capabilities.hasNumberControl ||
    capabilities.canToggle ||
    capabilities.canPress
  ) {
    return 'device'
  }
  return ''
}

export function mapSceneDtoToDomain(rawScene) {
  const zone = rawScene?.zone ?? null
  const rooms = Array.isArray(rawScene?.rooms) ? rawScene.rooms : []

  const roomsById = {}
  const roomOrder = []
  const devicesById = {}
  const deviceIdsByRoomId = {}

  rooms.forEach((room) => {
    const roomId = Number(room.id)
    if (!Number.isFinite(roomId)) {
      return
    }

    const normalizedRoom = {
      id: roomId,
      zoneId: Number(room.zone_id),
      name: room.name || `房间 ${roomId}`,
      description: room.description || '',
      ambientTemperature: room.ambient_temperature,
      ambientHumidity: room.ambient_humidity,
      occupancyStatus: room.occupancy_status,
      activeDeviceCount: Number(room.active_device_count || 0),
      layout: deriveRoomLayout(room),
      raw: room,
    }

    roomsById[roomId] = normalizedRoom
    roomOrder.push(roomId)

    const roomDevices = Array.isArray(room.devices) ? room.devices : []
    deviceIdsByRoomId[roomId] = []

    roomDevices.forEach((device) => {
      const deviceId = Number(device.id)
      if (!Number.isFinite(deviceId)) {
        return
      }

      const normalizedDevice = {
        id: deviceId,
        roomId,
        name: device.name || `设备 ${deviceId}`,
        entityDomain: device.entity_domain || '',
        deviceType: device.device_type || '',
        applianceType: device.appliance_type || '',
        rawState: device.raw_state || '',
        currentStatus: device.current_status || '',
        canControl: Boolean(device.can_control),
        controlKind: device.control_kind || '',
        controlOptions: Array.isArray(device.control_options) ? device.control_options : [],
        hvacModes: Array.isArray(device.hvac_modes) ? device.hvac_modes : [],
        hvacMode: device.hvac_mode || '',
        numberValue: device.number_value,
        minValue: device.min_value,
        maxValue: device.max_value,
        step: device.step,
        unitOfMeasurement: device.unit_of_measurement || '',
        brightnessValue: device.brightness_value,
        brightnessMin: device.brightness_min,
        brightnessMax: device.brightness_max,
        colorTemperature: device.color_temperature,
        minColorTemperature: device.min_color_temperature,
        maxColorTemperature: device.max_color_temperature,
        targetTemperature: device.target_temperature,
        currentTemperature: device.current_temperature,
        supportsBrightness: Boolean(device.supports_brightness),
        supportsColorTemperature: Boolean(device.supports_color_temperature),
        layout: deriveDeviceLayout(device),
        category: deriveDeviceCategory(device),
        active: deriveActiveState(device),
        raw: device,
      }

      normalizedDevice.capabilities = deriveDeviceCapabilities(normalizedDevice)
      normalizedDevice.interactionKind = deriveInteractionKind(normalizedDevice)

      devicesById[deviceId] = normalizedDevice
      deviceIdsByRoomId[roomId].push(deviceId)
    })
  })

  return {
    rawScene,
    zone: zone
      ? {
          id: Number(zone.id),
          name: zone.name || '默认空间',
          description: zone.description || '',
          imageUrl: normalizeImagePath(zone.floor_plan_image_path),
          aspectRatio: deriveAspectRatio(zone),
          raw: zone,
        }
      : null,
    roomsById,
    roomOrder,
    devicesById,
    deviceIdsByRoomId,
  }
}

export function buildStageModel(zone, roomsById, roomOrder, devicesById, deviceIdsByRoomId) {
  const rooms = roomOrder
    .map((roomId) => roomsById[roomId])
    .filter(Boolean)
    .map((room) => ({
      id: room.id,
      name: room.name,
      layout: room.layout,
    }))

  const hotspots = roomOrder.flatMap((roomId) => {
    const room = roomsById[roomId]
    const deviceIds = deviceIdsByRoomId[roomId] || []

    return deviceIds
      .map((deviceId) => devicesById[deviceId])
      .filter((device) => device && device.layout.x !== null && device.layout.y !== null)
      .map((device) => ({
        id: `device-${device.id}`,
        deviceId: device.id,
        roomId: room.id,
        x: device.layout.x,
        y: device.layout.y,
        icon: deriveHotspotIcon(device),
        label: device.name,
        active: device.active,
        category: device.category,
        controlKind: device.controlKind,
        interactionKind: device.interactionKind,
      }))
  })

  return {
    imageUrl: zone?.imageUrl || '/floorplans/songyue-floorplan.jpg',
    aspectRatio: zone?.aspectRatio || '1200 / 789',
    rooms,
    hotspots,
  }
}

export function patchKnownDeviceStateFields(device, patch) {
  if (!device) {
    return device
  }

  const next = { ...device }

  if (typeof patch.current_status === 'string') {
    next.currentStatus = patch.current_status
  }

  if (typeof patch.raw_state === 'string') {
    next.rawState = patch.raw_state
  }

  if (typeof patch.online === 'boolean') {
    next.online = patch.online
  }

  next.active = deriveActiveState({
    currentStatus: next.currentStatus,
    rawState: next.rawState,
  })

  return next
}

export function buildDirectControlPayload(device) {
  if (!device) {
    return null
  }

  if (device.controlKind === 'toggle') {
    return {
      device_id: device.id,
      control_kind: 'toggle',
      action: 'toggle',
    }
  }

  if (device.controlKind === 'button') {
    return {
      device_id: device.id,
      control_kind: 'button',
    }
  }

  return null
}

export function buildCapabilityControlPayload(device, intent) {
  if (!device || !intent?.type) {
    return null
  }

  if (intent.type === 'toggle' && device.capabilities?.canToggle) {
    return {
      device_id: device.id,
      control_kind: 'toggle',
      action: 'toggle',
    }
  }

  if (intent.type === 'press' && device.capabilities?.canPress) {
    return {
      device_id: device.id,
      control_kind: 'button',
    }
  }

  if (intent.type === 'set-target-temperature' && device.capabilities?.hasTargetTemperature) {
    return {
      device_id: device.id,
      control_kind: 'number',
      value: Number(intent.value),
    }
  }

  if (intent.type === 'set-number' && device.capabilities?.hasNumberControl) {
    return {
      device_id: device.id,
      control_kind: 'number',
      value: Number(intent.value),
    }
  }

  if (intent.type === 'set-hvac-mode' && device.capabilities?.hvacModes?.includes(intent.option)) {
    return {
      device_id: device.id,
      control_kind: 'select',
      option: intent.option,
    }
  }

  if (intent.type === 'set-option' && device.capabilities?.controlOptions?.includes(intent.option)) {
    return {
      device_id: device.id,
      control_kind: 'select',
      option: intent.option,
    }
  }

  if (intent.type === 'set-brightness' && device.capabilities?.hasBrightness) {
    return {
      device_id: device.id,
      control_kind: 'brightness',
      value: Number(intent.value),
    }
  }

  if (intent.type === 'set-color-temperature' && device.capabilities?.hasColorTemperature) {
    return {
      device_id: device.id,
      control_kind: 'color_temperature',
      value: Number(intent.value),
    }
  }

  return null
}

export function buildOptimisticDevicePatch(device) {
  if (!device || device.controlKind !== 'toggle') {
    return null
  }

  if (device.active) {
    return {
      current_status: 'off',
      raw_state: 'off',
    }
  }

  return {
    current_status: 'on',
    raw_state: 'on',
  }
}

export function buildOptimisticCapabilityPatch(device, intent) {
  if (!device || !intent?.type) {
    return null
  }

  if (intent.type === 'toggle') {
    return buildOptimisticDevicePatch(device)
  }

  if (intent.type === 'set-target-temperature') {
    return { targetTemperature: Number(intent.value) }
  }

  if (intent.type === 'set-number') {
    return { numberValue: Number(intent.value) }
  }

  if (intent.type === 'set-hvac-mode') {
    return { hvacMode: intent.option, rawState: intent.option }
  }

  if (intent.type === 'set-option') {
    return { selectedOption: intent.option }
  }

  if (intent.type === 'set-brightness') {
    return { brightnessValue: Number(intent.value) }
  }

  if (intent.type === 'set-color-temperature') {
    return { colorTemperature: Number(intent.value) }
  }

  return null
}
