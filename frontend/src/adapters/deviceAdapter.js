function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback
  }

  return `${value}`.trim()
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source ?? {}, key)
}

function deriveEntityId(raw = {}) {
  return normalizeText(raw.entity_id ?? raw.ha_entity_id ?? '', '')
}

function deriveEntityDomain(raw = {}) {
  const explicitDomain = normalizeText(raw.entity_domain ?? '', '').toLowerCase()
  if (explicitDomain) {
    return explicitDomain
  }

  const entityId = deriveEntityId(raw)
  if (entityId.includes('.')) {
    return entityId.split('.')[0].toLowerCase()
  }

  return normalizeText(raw.type ?? raw.device_type ?? 'generic', 'generic').toLowerCase()
}

function deriveCurrentStatus(raw = {}) {
  return normalizeText(raw.current_status ?? raw.state ?? raw.raw_state ?? 'unknown', 'unknown').toLowerCase()
}

function deriveState(raw = {}) {
  return normalizeText(raw.state ?? raw.raw_state ?? raw.current_status ?? 'unknown', 'unknown').toLowerCase()
}

function deriveOnline(raw = {}) {
  if (typeof raw.online === 'boolean') {
    return raw.online
  }

  const status = deriveCurrentStatus(raw)
  return !['offline', 'unavailable'].includes(status)
}

function normalizeNumberArray(values) {
  return Array.isArray(values) ? values : []
}

function normalizeDeviceBase(raw = {}) {
  const entityId = deriveEntityId(raw)
  const entityDomain = deriveEntityDomain(raw)
  const currentStatus = deriveCurrentStatus(raw)
  const state = deriveState(raw)
  const normalizedType = normalizeText(raw.type ?? raw.device_type ?? entityDomain ?? 'generic', 'generic').toLowerCase()
  const normalizedDeviceType = normalizeText(raw.device_type ?? raw.type ?? entityDomain ?? 'generic', 'generic').toLowerCase()

  return {
    ...raw,
    id: raw.id,
    room_id: raw.room_id ?? raw.roomId ?? null,
    name: normalizeText(raw.name ?? raw.friendly_name ?? 'Unknown device', 'Unknown device'),
    entity_id: entityId || `${entityDomain}.${raw.id ?? 'unknown'}`,
    ha_entity_id: entityId || `${entityDomain}.${raw.id ?? 'unknown'}`,
    ha_device_id: raw.ha_device_id ?? raw.haDeviceId ?? null,
    type: normalizedType,
    device_type: normalizedDeviceType,
    entity_domain: entityDomain,
    current_status: currentStatus,
    raw_state: normalizeText(raw.raw_state ?? currentStatus, currentStatus).toLowerCase(),
    state,
    online: deriveOnline(raw),
    can_control: Boolean(raw.can_control),
    control_kind: raw.control_kind ?? null,
    control_options: normalizeNumberArray(raw.control_options),
    hvac_modes: normalizeNumberArray(raw.hvac_modes),
    media_source_options: normalizeNumberArray(raw.media_source_options),
    roomId: undefined,
    haDeviceId: undefined,
  }
}

export function normalizeDeviceEntity(raw = {}) {
  return normalizeDeviceBase(raw)
}

export function extractSceneDeviceLayout(raw = {}) {
  return {
    plan_x: raw.plan_x ?? null,
    plan_y: raw.plan_y ?? null,
    plan_z: raw.plan_z ?? null,
    plan_rotation: raw.plan_rotation ?? null,
    position: raw.position ?? null,
  }
}

export function normalizeDeviceRead(raw = {}) {
  return normalizeDeviceBase(raw)
}

export function normalizeDevicePatch(raw = {}) {
  const patch = {}

  if (hasOwn(raw, 'id')) patch.id = raw.id
  if (hasOwn(raw, 'room_id')) patch.room_id = raw.room_id
  if (hasOwn(raw, 'roomId')) patch.room_id = raw.roomId
  if (hasOwn(raw, 'name')) patch.name = normalizeText(raw.name, 'Unknown device')
  if (hasOwn(raw, 'friendly_name')) patch.name = normalizeText(raw.friendly_name, 'Unknown device')

  if (hasOwn(raw, 'entity_id') || hasOwn(raw, 'ha_entity_id')) {
    const entityId = deriveEntityId(raw)
    patch.entity_id = entityId
    patch.ha_entity_id = entityId
  }

  if (hasOwn(raw, 'ha_device_id')) patch.ha_device_id = raw.ha_device_id
  if (hasOwn(raw, 'device_type') || hasOwn(raw, 'type')) {
    patch.type = normalizeText(raw.type ?? raw.device_type ?? 'generic', 'generic').toLowerCase()
    patch.device_type = normalizeText(raw.device_type ?? raw.type ?? 'generic', 'generic').toLowerCase()
  }
  if (hasOwn(raw, 'entity_domain')) {
    patch.entity_domain = normalizeText(raw.entity_domain ?? '', '').toLowerCase()
  }
  if (hasOwn(raw, 'current_status')) {
    patch.current_status = normalizeText(raw.current_status ?? 'unknown', 'unknown').toLowerCase()
  }
  if (hasOwn(raw, 'raw_state')) {
    patch.raw_state = normalizeText(raw.raw_state ?? '', '').toLowerCase()
  }
  if (hasOwn(raw, 'state')) {
    patch.state = normalizeText(raw.state ?? 'unknown', 'unknown').toLowerCase()
  }
  if (hasOwn(raw, 'online')) {
    patch.online = Boolean(raw.online)
  }

  if (hasOwn(raw, 'can_control')) patch.can_control = Boolean(raw.can_control)
  if (hasOwn(raw, 'control_kind')) patch.control_kind = raw.control_kind ?? null
  if (hasOwn(raw, 'control_options')) patch.control_options = normalizeNumberArray(raw.control_options)
  if (hasOwn(raw, 'hvac_modes')) patch.hvac_modes = normalizeNumberArray(raw.hvac_modes)
  if (hasOwn(raw, 'media_source_options')) patch.media_source_options = normalizeNumberArray(raw.media_source_options)

  const passthroughKeys = [
    'device_class',
    'number_value',
    'min_value',
    'max_value',
    'step',
    'unit_of_measurement',
    'target_temperature',
    'current_temperature',
    'hvac_mode',
    'fan_mode',
    'fan_modes',
    'media_volume_level',
    'media_source',
    'appliance_name',
    'appliance_type',
    'brightness_value',
    'brightness_min',
    'brightness_max',
    'color_temperature',
    'min_color_temperature',
    'max_color_temperature',
    'supports_brightness',
    'supports_color_temperature',
    'plan_x',
    'plan_y',
    'plan_z',
    'plan_rotation',
    'position',
  ]

  passthroughKeys.forEach((key) => {
    if (hasOwn(raw, key)) {
      patch[key] = raw[key]
    }
  })

  return patch
}

export function normalizeDevicePatchV2(raw = {}) {
  return normalizeDevicePatch(raw)
}

export function mergeDevicePatch(base, rawPatch = {}) {
  const patch = normalizeDevicePatch(rawPatch)
  if (!base) {
    return normalizeDeviceRead(rawPatch)
  }

  return normalizeDeviceRead({
    ...base,
    ...patch,
    control_options: patch.control_options ?? base.control_options,
    hvac_modes: patch.hvac_modes ?? base.hvac_modes,
    media_source_options: patch.media_source_options ?? base.media_source_options,
  })
}
