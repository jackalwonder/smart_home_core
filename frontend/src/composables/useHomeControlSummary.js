import { computed, onBeforeUnmount, onMounted, ref, unref } from 'vue'

import {
  buildRoomMetrics,
  formatDeviceState,
  formatRoomAmbient,
  isDeviceActive,
} from '../utils/floorMap'

const LIGHT_DOMAINS = new Set(['light', 'switch'])
const AIRFLOW_DOMAINS = new Set(['climate', 'fan'])

const WEATHER_STATE_LABELS = {
  clear: '晴朗',
  'clear-night': '晴夜',
  cloudy: '多云',
  exceptional: '特殊天气',
  fog: '雾',
  hail: '冰雹',
  lightning: '雷暴',
  'lightning-rainy': '雷雨',
  partlycloudy: '薄云',
  pouring: '暴雨',
  rainy: '有雨',
  snowy: '降雪',
  'snowy-rainy': '雨夹雪',
  sunny: '晴朗',
  windy: '有风',
  'windy-variant': '阵风',
}

function normalizeText(value) {
  return `${value ?? ''}`.trim()
}

function normalizeState(device) {
  return `${device?.raw_state ?? device?.state ?? device?.current_status ?? ''}`.trim().toLowerCase()
}

function hasNumber(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value))
}

function formatClock(value) {
  return value.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateLine(value) {
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][value.getDay()]
  return `${value.getMonth() + 1} 月 ${value.getDate()} 日 ${weekday}`
}

function timePeriodLabel(hour) {
  if (hour < 6) return '凌晨'
  if (hour < 11) return '上午'
  if (hour < 14) return '中午'
  if (hour < 18) return '下午'
  if (hour < 22) return '夜晚'
  return '深夜'
}

function findClimateDevice(devices) {
  return devices.find((device) => device.entity_domain === 'climate' || AIRFLOW_DOMAINS.has(device.entity_domain))
}

function findSceneDevice(devices) {
  return devices.find((device) => device.entity_domain === 'scene' && isDeviceActive(device))
}

function summarizeLighting(devices) {
  const activeLights = devices.filter((device) => LIGHT_DOMAINS.has(device.entity_domain) && isDeviceActive(device))
  if (activeLights.length === 0) {
    return '灯光安静'
  }

  const brightnessValues = activeLights
    .map((device) => Number(device.brightness ?? device.attributes?.brightness))
    .filter((value) => !Number.isNaN(value))

  if (brightnessValues.length === 0) {
    return `${activeLights.length} 盏灯开启`
  }

  const averageBrightness = brightnessValues.reduce((sum, value) => sum + value, 0) / brightnessValues.length
  if (averageBrightness >= 190) return '灯光偏亮'
  if (averageBrightness >= 110) return '灯光柔亮'
  return '灯光微亮'
}

function summarizeClimate(devices, metrics) {
  const climateDevice = findClimateDevice(devices)
  if (!climateDevice) {
    return metrics.temperatureValue !== null ? `${metrics.temperatureValue.toFixed(0)}°C` : '环境平稳'
  }

  const stateLabel = formatDeviceState(climateDevice)
  if (hasNumber(climateDevice.current_temperature)) {
    return `${stateLabel} ${Number(climateDevice.current_temperature).toFixed(0)}°C`
  }

  if (metrics.temperatureValue !== null) {
    return `${stateLabel} ${metrics.temperatureValue.toFixed(0)}°C`
  }

  return stateLabel
}

function summarizeConnectivity(metrics) {
  if (metrics.offlineCount > 0) {
    return `${metrics.offlineCount} 项离线`
  }

  if (metrics.pendingCount > 0) {
    return `${metrics.pendingCount} 项响应中`
  }

  return '在线稳定'
}

function extractWeather(allDevices, rooms) {
  const weatherDevice = allDevices.find((device) => device.entity_domain === 'weather')
  if (weatherDevice) {
    const state = normalizeState(weatherDevice)
    const label = WEATHER_STATE_LABELS[state] ?? formatDeviceState(weatherDevice)
    const numericTemperature =
      weatherDevice.temperature
      ?? weatherDevice.current_temperature
      ?? weatherDevice.attributes?.temperature
      ?? null

    return {
      headline: label,
      detail: hasNumber(numericTemperature) ? `${Number(numericTemperature).toFixed(0)}°C` : '天气实体在线',
      source: 'weather',
    }
  }

  const outdoorTemperatureDevice = allDevices.find((device) => {
    if (device.device_class !== 'temperature' && !hasNumber(device.current_temperature) && !hasNumber(device.raw_state)) {
      return false
    }

    const label = `${device.name ?? ''} ${device.entity_id ?? ''}`.toLowerCase()
    return ['outdoor', 'outside', '室外', '户外', '阳台'].some((keyword) => label.includes(keyword))
  })

  if (outdoorTemperatureDevice) {
    const value = outdoorTemperatureDevice.current_temperature ?? outdoorTemperatureDevice.raw_state
    return {
      headline: '室外温度',
      detail: hasNumber(value) ? `${Number(value).toFixed(0)}°C` : '已接入',
      source: 'outdoor-temperature',
    }
  }

  const indoorTemperatures = rooms
    .map((room) => buildRoomMetrics(room).temperatureValue)
    .filter((value) => value !== null)

  if (indoorTemperatures.length > 0) {
    const average = indoorTemperatures.reduce((sum, value) => sum + value, 0) / indoorTemperatures.length
    return {
      headline: '室内均温',
      detail: `${average.toFixed(0)}°C`,
      source: 'indoor-average',
    }
  }

  return {
    headline: '天气待接入',
    detail: '保持现有契约，后续可补天气源',
    source: 'fallback',
  }
}

function buildRoomSummary(room, selectedRoomId, pendingDeviceIds) {
  const devices = room.devices ?? []
  const metrics = buildRoomMetrics(room, pendingDeviceIds)
  const activeSceneDevice = findSceneDevice(devices)
  const activeAirflowDevice = devices.find((device) => AIRFLOW_DOMAINS.has(device.entity_domain) && isDeviceActive(device))
  const roomAmbient = formatRoomAmbient({ metrics })
  const lightingLine = summarizeLighting(devices)
  const climateLine = summarizeClimate(devices, metrics)
  const connectivityLine = summarizeConnectivity(metrics)

  const badges = [roomAmbient, lightingLine, connectivityLine]
  if (activeSceneDevice?.name) {
    badges.unshift(activeSceneDevice.name)
  } else if (activeAirflowDevice) {
    badges.unshift(formatDeviceState(activeAirflowDevice))
  }

  let headline = metrics.pendingCount > 0 ? '正在响应' : metrics.offlineCount > 0 ? '需要留意' : '状态平稳'
  if (activeSceneDevice?.name) {
    headline = activeSceneDevice.name
  } else if (metrics.activeCount > 0) {
    headline = `${metrics.activeCount} 项正在运行`
  }

  const importanceScore =
    (room.id === selectedRoomId ? 48 : 0)
    + metrics.pendingCount * 28
    + (activeSceneDevice ? 24 : 0)
    + metrics.offlineCount * 18
    + metrics.activeCount * 8
    + metrics.controllableCount

  return {
    ...room,
    metrics,
    headline,
    summary: [climateLine, lightingLine].join(' · '),
    statusLine: connectivityLine,
    badges: badges.filter(Boolean).slice(0, 3),
    sceneName: normalizeText(activeSceneDevice?.name),
    importanceScore,
    selected: room.id === selectedRoomId,
    online: metrics.offlineCount === 0,
  }
}

function buildHouseholdStatus(roomSummaries, options, now) {
  const activeRooms = roomSummaries.filter((room) => room.metrics.activeCount > 0)
  const pendingRooms = roomSummaries.filter((room) => room.metrics.pendingCount > 0)
  const offlineRooms = roomSummaries.filter((room) => room.metrics.offlineCount > 0)
  const sceneRoom = roomSummaries.find((room) => room.sceneName)
  const recentActivity = options.visualActivity ?? []
  const recentRooms = new Set(recentActivity.map((entry) => entry.roomId).filter(Boolean))
  const recentControlCount = recentActivity.filter((entry) => ['pending', 'success', 'error'].includes(entry.status)).length
  const connectionStatus = options.connectionStatus ?? 'idle'
  const hour = now.getHours()

  if (options.spatialError) {
    return {
      tone: 'error',
      eyebrow: '空间状态',
      title: '空间数据暂时不可用',
      description: options.spatialError,
      badge: '需要处理',
    }
  }

  if (options.spatialLoading && roomSummaries.length === 0) {
    return {
      tone: 'loading',
      eyebrow: '家庭状态',
      title: '正在恢复首页空间视图',
      description: '首轮接口返回后，户型主舞台和摘要层会一起落回真实状态。',
      badge: '加载中',
    }
  }

  if (options.spatialBusy || options.actionFeedback?.status === 'pending' || pendingRooms.length > 0) {
    return {
      tone: 'pending',
      eyebrow: '家庭状态',
      title: '家里正在响应控制',
      description: pendingRooms[0]
        ? `${pendingRooms[0].name} 正在同步新的空间状态，环境层会先于设备动作更新。`
        : '控制指令已发出，正在等待设备状态回流。',
      badge: '执行中',
    }
  }

  if (sceneRoom) {
    return {
      tone: 'scene',
      eyebrow: '家庭状态',
      title: `${sceneRoom.sceneName} 已接管 ${sceneRoom.name}`,
      description: '当前优先展示房间整体变化，再补充关键设备动作和轻量反馈。',
      badge: '场景中',
    }
  }

  if (recentRooms.size >= 2 || (activeRooms.length >= 2 && recentControlCount >= 2)) {
    return {
      tone: 'active',
      eyebrow: '家庭状态',
      title: '多设备联动中',
      description: `${recentRooms.size || activeRooms.length} 个房间在最近一轮联动中发生变化，摘要层会优先提炼最值得看的状态。`,
      badge: '联动中',
    }
  }

  if (offlineRooms.length > 0 || ['disconnected', 'error'].includes(connectionStatus)) {
    return {
      tone: 'warning',
      eyebrow: '家庭状态',
      title: '有设备暂时离线',
      description: offlineRooms[0]
        ? `${offlineRooms[0].name} 存在离线设备，系统会保留空间状态，但弱化相关设备交互。`
        : '实时连接异常，正在等待下一次状态同步。',
      badge: '离线提醒',
    }
  }

  if (activeRooms.length > 0) {
    return {
      tone: 'active',
      eyebrow: '家庭状态',
      title: '家庭空间正在运转',
      description: `${activeRooms.length} 个房间保持运行，当前更适合通过户型主舞台快速理解空间变化。`,
      badge: '运行中',
    }
  }

  return {
    tone: 'calm',
    eyebrow: '家庭状态',
    title: hour >= 22 || hour < 6 ? '夜间待机中' : '家庭状态平稳',
    description: hour >= 22 || hour < 6
      ? '大部分设备处于安静状态，空间层以基础采光和材质氛围为主。'
      : '当前没有需要优先处理的联动，首页摘要会持续关注新的房间变化。',
    badge: `${timePeriodLabel(hour)}模式`,
  }
}

function buildPrimaryFeedback(roomSummaries, options) {
  const actionFeedback = options.actionFeedback ?? { status: 'idle', message: '', deviceId: null }
  if (actionFeedback.status !== 'idle') {
    const labelMap = {
      pending: '当前动作',
      success: '最近完成',
      error: '需要处理',
    }

    return {
      tone: actionFeedback.status,
      label: labelMap[actionFeedback.status] ?? '家庭反馈',
      message: actionFeedback.message || '状态已更新',
      detail: actionFeedback.status === 'pending' ? '以设备回流为准' : '空间层已同步最新状态',
    }
  }

  const offlineRoom = roomSummaries.find((room) => room.metrics.offlineCount > 0)
  if (offlineRoom) {
    return {
      tone: 'warning',
      label: '离线提醒',
      message: `${offlineRoom.name} 有 ${offlineRoom.metrics.offlineCount} 项设备暂时离线`,
      detail: '已自动弱化对应设备动画与交互',
    }
  }

  return {
    tone: 'calm',
    label: '实时状态',
    message: options.lastMessageAt
      ? `最近同步于 ${new Date(options.lastMessageAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
      : '正在等待首条状态回流',
    detail: '房间摘要与空间主舞台保持同一真相源',
  }
}

function buildSupportingNotices(roomSummaries, options) {
  const notices = []
  const activeRoomCount = roomSummaries.filter((room) => room.metrics.activeCount > 0).length
  const controllableRoomCount = roomSummaries.filter((room) => room.metrics.controllableCount > 0).length
  const offlineRoomCount = roomSummaries.filter((room) => room.metrics.offlineCount > 0).length

  notices.push(`${activeRoomCount} 个房间有设备在运行`)
  notices.push(`${controllableRoomCount} 个房间可直接快控`)

  if (offlineRoomCount > 0) {
    notices.push(`${offlineRoomCount} 个房间包含离线设备`)
  }

  if (options.connectionStatus === 'connected') {
    notices.push('WebSocket 实时在线')
  } else if (options.connectionStatus === 'reconnecting') {
    notices.push('正在重连实时通道')
  }

  return notices.slice(0, 3)
}

export function useHomeControlSummary(roomsRef, selectedRoomIdRef, optionsRef) {
  const now = ref(new Date())
  let timerId = 0

  onMounted(() => {
    timerId = window.setInterval(() => {
      now.value = new Date()
    }, 30000)
  })

  onBeforeUnmount(() => {
    if (timerId) {
      window.clearInterval(timerId)
      timerId = 0
    }
  })

  const rooms = computed(() => unref(roomsRef) ?? [])
  const selectedRoomId = computed(() => unref(selectedRoomIdRef) ?? rooms.value[0]?.id ?? null)
  const options = computed(() => unref(optionsRef) ?? {})

  const roomSummaries = computed(() =>
    rooms.value
      .map((room) => buildRoomSummary(room, selectedRoomId.value, options.value.pendingDeviceIds ?? []))
      .sort((left, right) => right.importanceScore - left.importanceScore),
  )

  const clock = computed(() => ({
    timeText: formatClock(now.value),
    dateText: formatDateLine(now.value),
    periodLabel: timePeriodLabel(now.value.getHours()),
  }))

  const weather = computed(() =>
    extractWeather(
      rooms.value.flatMap((room) => room.devices ?? []),
      rooms.value,
    ),
  )

  const householdStatus = computed(() => buildHouseholdStatus(roomSummaries.value, options.value, now.value))
  const primaryFeedback = computed(() => buildPrimaryFeedback(roomSummaries.value, options.value))
  const supportingNotices = computed(() => buildSupportingNotices(roomSummaries.value, options.value))
  const keyRooms = computed(() => roomSummaries.value.slice(0, 3))

  return {
    clock,
    weather,
    householdStatus,
    primaryFeedback,
    supportingNotices,
    keyRooms,
  }
}
