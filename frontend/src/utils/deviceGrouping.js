const DISPLAY_CONTROL_KINDS = new Set(['toggle', 'number', 'select', 'button'])
const DISPLAY_SENSOR_CLASSES = new Set(['temperature', 'humidity', 'moisture'])
const DISPLAY_SENSOR_UNITS = new Set(['°C', '%'])
const ACTIVE_STATES = new Set(['on', 'online', 'playing', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'auto'])
const VIRTUAL_ROOM_DESCRIPTION_PREFIX = '按 Home Assistant 域自动归类的实体分组：'
const AGGREGATED_APPLIANCE_TYPES = new Set([
  'fridge',
  'air_conditioner',
  'tv',
  'media',
  'purifier',
  'washer',
  'speaker',
  'router',
  'nas',
  'computer',
  'camera',
])

const NOISE_NAME_PATTERNS = [
  /数据上传/i,
  /故障/i,
  /异常事件/i,
  /异常/i,
  /报警/i,
  /告警/i,
  /提醒/i,
  /压缩机/i,
  /通信故障/i,
  /诊断/i,
  /调试/i,
  /测试/i,
  /日志/i,
  /bit\d+/i,
]

const NOISE_ENTITY_PATTERNS = [
  /_fault_/i,
  /_alarm_/i,
  /_error_/i,
  /_warning_/i,
  /_event_/i,
  /_remind_/i,
  /_diagnostic_/i,
  /_compressor_/i,
]

function normalizedText(value) {
  return `${value ?? ''}`.trim().toLowerCase()
}

function sortDevices(devices) {
  return [...(devices ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

function applianceStem(name) {
  const trimmed = `${name ?? ''}`.trim()
  const withoutUploadMarker = trimmed.split(' * ')[0]
  const withoutDoubleSpaceSuffix = withoutUploadMarker.split(/\s{2,}/)[0]
  return withoutDoubleSpaceSuffix.trim()
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text))
}

export function isNoiseDisplayDevice(device) {
  const name = normalizedText(device?.name)
  const entityId = normalizedText(device?.ha_entity_id)
  return matchesAny(name, NOISE_NAME_PATTERNS) || matchesAny(entityId, NOISE_ENTITY_PATTERNS)
}

export function isMeaningfulControlDevice(device) {
  if (!device?.can_control) {
    return false
  }

  if (!DISPLAY_CONTROL_KINDS.has(device.control_kind ?? '')) {
    return false
  }

  return !isNoiseDisplayDevice(device)
}

export function isMeaningfulTelemetryDevice(device) {
  if (!device || device.can_control || isNoiseDisplayDevice(device)) {
    return false
  }

  const deviceClass = normalizedText(device.device_class)
  if (DISPLAY_SENSOR_CLASSES.has(deviceClass)) {
    return true
  }

  return device.entity_domain === 'sensor' && DISPLAY_SENSOR_UNITS.has(`${device.unit_of_measurement ?? ''}`.trim())
}

export function isDisplayDevice(device) {
  return isMeaningfulControlDevice(device) || isMeaningfulTelemetryDevice(device)
}

export function filterDisplayDevices(devices) {
  return sortDevices((devices ?? []).filter(isDisplayDevice))
}

export function countDisplayDevices(devices) {
  return filterDisplayDevices(devices).length
}

export function countControllableDevices(devices) {
  return filterDisplayDevices(devices).filter(isMeaningfulControlDevice).length
}

export function countTelemetryDevices(devices) {
  return filterDisplayDevices(devices).filter(isMeaningfulTelemetryDevice).length
}

export function countActiveDevices(devices) {
  return filterDisplayDevices(devices).filter((device) => {
    const state = normalizedText(device.raw_state ?? device.current_status)
    return ACTIVE_STATES.has(state)
  }).length
}

export function isVirtualRoomBucket(room) {
  return `${room?.description ?? ''}`.startsWith(VIRTUAL_ROOM_DESCRIPTION_PREFIX)
}

export function shouldDisplayDashboardRoom(room) {
  if (!room || isVirtualRoomBucket(room)) {
    return false
  }

  return countDisplayDevices(room.devices) > 0
}

export function shouldDisplaySpatialRoom(room) {
  return Boolean(room) && !isVirtualRoomBucket(room)
}

export function groupKey(device) {
  if (device.ha_device_id) {
    return `device:${device.ha_device_id}`
  }
  if (device.appliance_name) {
    return `name:${device.appliance_name}`
  }
  return `fallback:${applianceStem(device.name) || device.name}`
}

export function groupTitle(devices) {
  return devices[0]?.appliance_name || applianceStem(devices[0]?.name ?? '') || devices[0]?.name || '未命名设备'
}

export function groupType(devices) {
  return devices.find((device) => device.appliance_type && device.appliance_type !== 'generic')?.appliance_type
    || devices[0]?.appliance_type
    || 'generic'
}

export function shouldAggregate(devices) {
  if ((devices?.length ?? 0) <= 1) {
    return false
  }

  const applianceType = groupType(devices)
  const hasControl = devices.some(isMeaningfulControlDevice)
  const hasTelemetry = devices.some(isMeaningfulTelemetryDevice)
  const hasHaDeviceId = devices.some((device) => Boolean(device.ha_device_id))

  if (!hasControl && !hasTelemetry) {
    return false
  }

  if (hasHaDeviceId && (hasControl || hasTelemetry)) {
    return true
  }

  if (AGGREGATED_APPLIANCE_TYPES.has(applianceType)) {
    return true
  }

  return hasControl && hasTelemetry
}

export function groupDevices(devices) {
  const groups = new Map()

  filterDisplayDevices(devices).forEach((device) => {
    const key = groupKey(device)
    const collection = groups.get(key) ?? []
    collection.push(device)
    groups.set(key, collection)
  })

  return [...groups.entries()]
    .map(([key, collection]) => {
      const sortedDevices = sortDevices(collection)
      return {
        key,
        title: groupTitle(sortedDevices),
        applianceType: groupType(sortedDevices),
        isAggregate: shouldAggregate(sortedDevices),
        devices: sortedDevices,
      }
    })
    .filter((group) => group.devices.length > 0)
    .sort((left, right) => {
      if (left.isAggregate !== right.isAggregate) {
        return left.isAggregate ? -1 : 1
      }

      return left.title.localeCompare(right.title, 'zh-CN')
    })
}
