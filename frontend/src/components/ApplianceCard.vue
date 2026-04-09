<script setup>
import { computed, ref, watch } from 'vue'

import { useSmartHomeStore } from '../stores/smartHome'
import { getControlFeedbackPresentation } from '../utils/controlFeedback'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  applianceType: {
    type: String,
    default: 'generic',
  },
  devices: {
    type: Array,
    required: true,
  },
})

const smartHomeStore = useSmartHomeStore()

const controlDevices = computed(() =>
  props.devices.filter((device) => ['toggle', 'number', 'select', 'button'].includes(device.control_kind ?? '')),
)

const climateDevices = computed(() =>
  props.devices.filter((device) => device.entity_domain === 'climate'),
)

const mediaDevices = computed(() =>
  props.devices.filter((device) => device.entity_domain === 'media_player'),
)

const genericControlDevices = computed(() =>
  controlDevices.value.filter((device) => !['climate', 'media_player'].includes(device.entity_domain)),
)

const sensorDevices = computed(() =>
  props.devices.filter((device) => !device.can_control && ['temperature', 'humidity', 'moisture'].includes(device.device_class ?? '')),
)
const summaryLine = computed(() => `${controlDevices.value.length} 个控制项 · ${sensorDevices.value.length} 个监测项`)
const activeControlCount = computed(() => controlDevices.value.filter((device) => isPoweredOn(device)).length)

const primaryMetric = computed(() => {
  if (climateDevices.value.length > 0) {
    const primaryClimate = climateDevices.value[0]
    return {
      label: '模式',
      value: primaryClimate.hvac_mode ?? primaryClimate.raw_state ?? primaryClimate.current_status ?? '待机',
    }
  }

  if (mediaDevices.value.length > 0) {
    const primaryMedia = mediaDevices.value[0]
    return {
      label: '状态',
      value: primaryMedia.raw_state ?? primaryMedia.current_status ?? '待机',
    }
  }

  if (genericControlDevices.value.length > 0) {
    return {
      label: '激活',
      value: `${activeControlCount.value} 项`,
    }
  }

  return {
    label: '状态',
    value: '在线',
  }
})

const secondaryMetric = computed(() => {
  const temperatureSensor = sensorDevices.value.find((device) => device.device_class === 'temperature')
  if (temperatureSensor) {
    return {
      label: '温度',
      value: formatReading(temperatureSensor.raw_state, temperatureSensor.unit_of_measurement ?? '°C'),
    }
  }

  const humiditySensor = sensorDevices.value.find((device) => device.device_class === 'humidity')
  if (humiditySensor) {
    return {
      label: '湿度',
      value: formatReading(humiditySensor.raw_state, humiditySensor.unit_of_measurement ?? '%'),
    }
  }

  const primaryClimate = climateDevices.value.find(
    (device) => device.target_temperature !== null && device.target_temperature !== undefined,
  )
  if (primaryClimate) {
    return {
      label: '设定',
      value: formatReading(primaryClimate.target_temperature, primaryClimate.unit_of_measurement ?? '°C'),
    }
  }

  const primaryMedia = mediaDevices.value.find(
    (device) => device.media_volume_level !== null && device.media_volume_level !== undefined,
  )
  if (primaryMedia) {
    return {
      label: '音量',
      value: `${Math.round(primaryMedia.media_volume_level)}%`,
    }
  }

  return {
    label: '控制',
    value: `${controlDevices.value.length} 项`,
  }
})

const summaryStats = computed(() => [
  {
    label: '实体',
    value: `${props.devices.length}`,
  },
  primaryMetric.value,
  secondaryMetric.value,
])

const sensorSnapshots = computed(() => {
  const readings = []

  sensorDevices.value.forEach((device) => {
    const value = formatReading(device.raw_state, device.unit_of_measurement ?? '')
    if (value && readings.length < 3) {
      readings.push({
        label: shortLabel(device),
        value,
      })
    }
  })

  climateDevices.value.forEach((device) => {
    if (readings.length >= 3) {
      return
    }

    if (device.current_temperature !== null && device.current_temperature !== undefined) {
      readings.push({
        label: `${shortLabel(device)} 室温`,
        value: formatReading(device.current_temperature, device.unit_of_measurement ?? '°C'),
      })
    }
  })

  mediaDevices.value.forEach((device) => {
    if (readings.length >= 3) {
      return
    }

    if (device.media_volume_level !== null && device.media_volume_level !== undefined) {
      readings.push({
        label: `${shortLabel(device)} 音量`,
        value: `${Math.round(device.media_volume_level)}%`,
      })
    }
  })

  return readings
})

const climateSummary = computed(() => {
  if (climateDevices.value.length === 0) {
    return ''
  }

  const primaryClimate = climateDevices.value[0]
  const parts = []

  if (primaryClimate.hvac_mode) {
    parts.push(primaryClimate.hvac_mode)
  }

  if (primaryClimate.target_temperature !== null && primaryClimate.target_temperature !== undefined) {
    parts.push(`设定 ${formatReading(primaryClimate.target_temperature, primaryClimate.unit_of_measurement ?? '°C')}`)
  }

  if (primaryClimate.current_temperature !== null && primaryClimate.current_temperature !== undefined) {
    parts.push(`室温 ${formatReading(primaryClimate.current_temperature, primaryClimate.unit_of_measurement ?? '°C')}`)
  }

  return parts.join(' · ') || `${climateDevices.value.length} 个环境设备可控制`
})

const mediaSummary = computed(() => {
  if (mediaDevices.value.length === 0) {
    return ''
  }

  const primaryMedia = mediaDevices.value[0]
  const parts = []

  if (primaryMedia.raw_state ?? primaryMedia.current_status) {
    parts.push(primaryMedia.raw_state ?? primaryMedia.current_status)
  }

  if (primaryMedia.media_source) {
    parts.push(primaryMedia.media_source)
  }

  if (primaryMedia.media_volume_level !== null && primaryMedia.media_volume_level !== undefined) {
    parts.push(`音量 ${Math.round(primaryMedia.media_volume_level)}%`)
  }

  return parts.join(' · ') || `${mediaDevices.value.length} 个影音设备可控制`
})

const genericSummary = computed(() => {
  if (genericControlDevices.value.length === 0) {
    return ''
  }

  const supportedKinds = [...new Set(genericControlDevices.value.map((device) => controlKindLabel(device.control_kind)))]
  const preview = supportedKinds.slice(0, 2).join(' / ')
  return preview ? `${preview} 等 ${genericControlDevices.value.length} 项` : `${genericControlDevices.value.length} 个子项可控制`
})

const sliderDrafts = ref({})
const selectDrafts = ref({})

watch(
  () => props.devices,
  (devices) => {
    const nextSliderDrafts = {}
    const nextSelectDrafts = {}

    devices.forEach((device) => {
      if (device.control_kind === 'number') {
        nextSliderDrafts[device.id] = device.number_value ?? device.min_value ?? 0
      }

      if (device.entity_domain === 'climate' && device.target_temperature !== null && device.target_temperature !== undefined) {
        nextSliderDrafts[device.id] = device.target_temperature
      }

      if (device.entity_domain === 'media_player' && device.media_volume_level !== null && device.media_volume_level !== undefined) {
        nextSliderDrafts[device.id] = device.media_volume_level
      }

      if (device.control_kind === 'select') {
        nextSelectDrafts[device.id] = device.raw_state ?? ''
      }

      if (device.entity_domain === 'climate' && device.hvac_mode) {
        nextSelectDrafts[device.id] = device.hvac_mode
      }

      if (device.entity_domain === 'media_player' && device.media_source) {
        nextSelectDrafts[device.id] = device.media_source
      }
    })

    sliderDrafts.value = nextSliderDrafts
    selectDrafts.value = nextSelectDrafts
  },
  { immediate: true, deep: true },
)

const applianceMeta = computed(() => {
  const metaMap = {
    fridge: {
      eyebrow: '冰箱控制面板',
      badge: '温控设备',
      iconWrapperClass: 'bg-sky-600 text-white',
      accentColor: '#0ea5e9',
    },
    air_conditioner: {
      eyebrow: '空调控制面板',
      badge: '环境设备',
      iconWrapperClass: 'bg-teal-500 text-white',
      accentColor: '#14b8a6',
    },
    tv: {
      eyebrow: '电视控制面板',
      badge: '影音设备',
      iconWrapperClass: 'bg-indigo-500 text-white',
      accentColor: '#6366f1',
    },
    media: {
      eyebrow: '影音设备面板',
      badge: '媒体设备',
      iconWrapperClass: 'bg-violet-500 text-white',
      accentColor: '#8b5cf6',
    },
    purifier: {
      eyebrow: '净化设备面板',
      badge: '空气设备',
      iconWrapperClass: 'bg-emerald-500 text-white',
      accentColor: '#10b981',
    },
    washer: {
      eyebrow: '洗护设备面板',
      badge: '家务设备',
      iconWrapperClass: 'bg-blue-500 text-white',
      accentColor: '#3b82f6',
    },
    speaker: {
      eyebrow: '音箱控制面板',
      badge: '声音设备',
      iconWrapperClass: 'bg-fuchsia-500 text-white',
      accentColor: '#d946ef',
    },
    router: {
      eyebrow: '网络设备面板',
      badge: '连接设备',
      iconWrapperClass: 'bg-slate-700 text-white',
      accentColor: '#475569',
    },
    nas: {
      eyebrow: 'NAS 设备面板',
      badge: '存储设备',
      iconWrapperClass: 'bg-cyan-600 text-white',
      accentColor: '#0891b2',
    },
    computer: {
      eyebrow: '电脑设备面板',
      badge: '计算设备',
      iconWrapperClass: 'bg-blue-600 text-white',
      accentColor: '#2563eb',
    },
    camera: {
      eyebrow: '安防设备面板',
      badge: '监控设备',
      iconWrapperClass: 'bg-rose-500 text-white',
      accentColor: '#f43f5e',
    },
    generic: {
      eyebrow: '设备聚合视图',
      badge: '家庭设备',
      iconWrapperClass: 'bg-amber-500 text-white',
      accentColor: '#f59e0b',
    },
  }

  return metaMap[props.applianceType] ?? metaMap.generic
})

function shortLabel(device) {
  const prefix = props.title.trim()
  let next = device.name

  if (next.startsWith(prefix)) {
    next = next.slice(prefix.length).trim()
  }

  return next.replace(/^[*]\s*/, '').replace(/\s+/g, ' ').trim() || device.name
}

function controlKindLabel(controlKind) {
  const labels = {
    toggle: '开关',
    number: '滑杆',
    select: '选项',
    button: '动作',
  }

  return labels[controlKind] ?? '控制'
}

function isPending(deviceId) {
  return smartHomeStore.isDevicePending(deviceId)
}

function isPoweredOn(device) {
  return ['on', 'playing', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'auto'].includes(device.raw_state ?? device.current_status)
}

function isOffline(device) {
  return ['offline', 'unavailable'].includes(device.raw_state ?? device.current_status)
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--'
  }

  const numericValue = Number(value)
  return Number.isInteger(numericValue) ? `${numericValue}` : numericValue.toFixed(1)
}

function formatReading(value, unit = '') {
  if (value === null || value === undefined || value === '') {
    return '--'
  }

  const formatted = Number.isNaN(Number(value)) ? `${value}` : formatNumber(value)
  return `${formatted}${unit}`
}

async function handleToggle(deviceId) {
  try {
    await smartHomeStore.toggleDevice(deviceId)
  } catch (error) {
    console.error('Failed to toggle grouped device.', error)
  }
}

async function handleNumberChange(deviceId, event) {
  const value = Number(event.target.value)
  sliderDrafts.value = { ...sliderDrafts.value, [deviceId]: value }

  try {
    await smartHomeStore.setDeviceNumber(deviceId, value)
  } catch (error) {
    console.error('Failed to set grouped numeric value.', error)
  }
}

async function handleSelectChange(deviceId, event) {
  const option = event.target.value
  selectDrafts.value = { ...selectDrafts.value, [deviceId]: option }

  try {
    await smartHomeStore.selectDeviceOption(deviceId, option)
  } catch (error) {
    console.error('Failed to select grouped option.', error)
  }
}

async function handleButtonPress(deviceId) {
  try {
    await smartHomeStore.pressDeviceButton(deviceId)
  } catch (error) {
    console.error('Failed to press grouped action button.', error)
  }
}

const aggregateFeedback = computed(() => {
  const pending = props.devices.some((device) => isPending(device.id))
  const offline = props.devices.some((device) => isOffline(device))
  const active = props.devices.some((device) => isPoweredOn(device))

  return getControlFeedbackPresentation({
    feedbackState: pending ? 'pending' : 'idle',
    offline,
    active,
  })
})

const articleClass = computed(() => {
  if (aggregateFeedback.value.tone === 'offline') return 'border-slate-200/85 bg-[rgba(248,250,252,0.94)]'
  if (aggregateFeedback.value.tone === 'pending') return 'border-amber-200/85 bg-[rgba(255,247,235,0.96)]'
  if (aggregateFeedback.value.tone === 'active') return 'border-[#cfe0dc] bg-[rgba(241,247,246,0.94)]'
  return 'border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(251,247,240,0.82))]'
})
</script>

<template>
  <article
    class="shell-card relative flex h-full min-h-[23rem] flex-col overflow-hidden rounded-[2rem] border p-4 sm:p-5"
    :class="articleClass"
  >
    <div class="absolute right-[-3rem] top-[-3rem] h-36 w-36 rounded-full bg-white/50 opacity-80" />

    <div class="relative flex items-start justify-between gap-3">
      <div class="flex min-w-0 items-start gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.2rem] shadow-sm" :class="applianceMeta.iconWrapperClass">
          <svg v-if="applianceType === 'fridge'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 3h10" />
            <path d="M8 3v18" />
            <path d="M16 3v18" />
            <path d="M8 11h8" />
            <path d="M10 7h.01M10 15h.01" />
          </svg>
          <svg v-else-if="applianceType === 'air_conditioner'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="5" width="16" height="5" rx="2" />
            <path d="M7 14c1 .5 1.5 1.5 1.5 2.5S8 18.5 7 19" />
            <path d="M12 14c1 .5 1.5 1.5 1.5 2.5S13 18.5 12 19" />
            <path d="M17 14c1 .5 1.5 1.5 1.5 2.5S18 18.5 17 19" />
          </svg>
          <svg v-else-if="applianceType === 'tv' || applianceType === 'media'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="12" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
          <svg v-else-if="applianceType === 'purifier'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="7" y="3" width="10" height="18" rx="3" />
            <path d="M10 8h4M10 12h4M10 16h4" />
          </svg>
          <svg v-else-if="applianceType === 'speaker'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="7" y="3" width="10" height="18" rx="4" />
            <circle cx="12" cy="9" r="1.2" />
            <circle cx="12" cy="15" r="2.2" />
          </svg>
          <svg v-else-if="applianceType === 'router'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 14h14v5H5z" />
            <path d="M9 10a3 3 0 0 1 6 0" />
            <path d="M6.5 8a5.5 5.5 0 0 1 11 0" />
          </svg>
          <svg v-else-if="applianceType === 'nas'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="4" width="14" height="16" rx="2" />
            <path d="M8 8h8M8 12h8M8 16h3" />
            <circle cx="16.5" cy="16.5" r="0.5" fill="currentColor" stroke="none" />
          </svg>
          <svg v-else-if="applianceType === 'computer'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
          </svg>
          <svg v-else-if="applianceType === 'camera'" class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 8h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4z" />
            <path d="M16 11l4-2v8l-4-2z" />
          </svg>
          <svg v-else class="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </div>

        <div class="min-w-0">
          <p class="shell-kicker">{{ applianceMeta.eyebrow }}</p>
          <h3 class="font-display mt-2 truncate text-[1.6rem] leading-none text-ink sm:text-[1.85rem]">{{ title }}</h3>
          <p class="shell-copy mt-2 text-sm">{{ summaryLine }}</p>
        </div>
      </div>

      <div :class="aggregateFeedback.badgeClass">
        {{ applianceMeta.badge }}
      </div>
    </div>

    <div class="mt-4 grid grid-cols-3 gap-3">
      <div
        v-for="stat in summaryStats"
        :key="stat.label"
        class="shell-card px-3 py-3"
      >
        <p class="shell-meta text-[10px] uppercase tracking-[0.18em]">{{ stat.label }}</p>
        <p class="mt-2 truncate text-lg font-semibold text-ink sm:text-xl">{{ stat.value }}</p>
      </div>
    </div>

    <div v-if="sensorSnapshots.length > 0" class="mt-4 flex flex-wrap gap-2">
      <div
        v-for="snapshot in sensorSnapshots"
        :key="snapshot.label"
        class="shell-chip gap-2 px-3 py-1.5 text-sm"
      >
        <span class="shell-meta">{{ snapshot.label }}</span>
        <span class="font-semibold text-ink">{{ snapshot.value }}</span>
      </div>
    </div>

    <div class="mt-5 flex flex-1 flex-col">
      <div class="flex items-center justify-between gap-3">
        <p class="shell-kicker text-slate-500">控制次级区域</p>
        <p class="shell-meta text-xs">按需展开，保持总览更整齐</p>
      </div>

      <div class="mt-3 space-y-3">
        <details
          v-if="climateDevices.length > 0"
          class="shell-card rounded-[1.45rem]"
        >
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <div class="min-w-0">
              <p class="shell-heading text-sm">环境控制</p>
              <p class="shell-copy mt-1 truncate text-sm">{{ climateSummary }}</p>
            </div>
            <div class="shell-status shell-status--idle">
              {{ climateDevices.length }} 项
            </div>
          </summary>

          <div class="space-y-3 border-t border-black/5 px-4 py-4">
            <div
              v-for="device in climateDevices"
              :key="`climate-${device.id}`"
              class="shell-card px-4 py-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-ink sm:text-base">{{ shortLabel(device) }}</p>
                  <p class="shell-meta mt-1 text-xs uppercase tracking-[0.16em]">{{ device.ha_entity_id }}</p>
                </div>
                <button
                  type="button"
                  class="relative inline-flex h-8 w-16 items-center rounded-full transition duration-300"
                  :class="[isPoweredOn(device) ? applianceMeta.iconWrapperClass : 'bg-slate-300', isPending(device.id) ? 'animate-pulse' : '']"
                  :disabled="isPending(device.id)"
                  @click="handleToggle(device.id)"
                >
                  <span
                    class="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-md transition duration-300"
                    :class="isPoweredOn(device) ? 'translate-x-8' : 'translate-x-0'"
                  />
                </button>
              </div>

              <div v-if="device.target_temperature !== null && device.target_temperature !== undefined" class="mt-4">
                <div class="shell-copy mb-2 flex items-center justify-between text-sm">
                  <span>目标温度</span>
                  <span class="font-medium text-ink">
                    {{ formatNumber(sliderDrafts[device.id]) }}
                    <span>{{ device.unit_of_measurement ?? '°C' }}</span>
                  </span>
                </div>
                <input
                  :value="sliderDrafts[device.id]"
                  type="range"
                  class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
                  :style="{ accentColor: applianceMeta.accentColor }"
                  :min="device.min_value ?? 16"
                  :max="device.max_value ?? 30"
                  :step="device.step ?? 1"
                  :disabled="isPending(device.id)"
                  @input="sliderDrafts = { ...sliderDrafts, [device.id]: Number($event.target.value) }"
                  @change="handleNumberChange(device.id, $event)"
                >
                <div class="shell-meta mt-2 flex items-center justify-between text-xs">
                  <span>{{ device.min_value ?? 16 }}</span>
                  <span>当前室温 {{ formatNumber(device.current_temperature) }}{{ device.unit_of_measurement ?? '°C' }}</span>
                  <span>{{ device.max_value ?? 30 }}</span>
                </div>
              </div>

              <div v-if="device.hvac_modes?.length" class="mt-4">
                <p class="shell-copy mb-2 text-sm">运行模式</p>
                <select
                  :value="selectDrafts[device.id]"
                  class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition"
                  :disabled="isPending(device.id)"
                  @change="handleSelectChange(device.id, $event)"
                >
                  <option
                    v-for="option in device.hvac_modes"
                    :key="option"
                    :value="option"
                  >
                    {{ option }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </details>

        <details
          v-if="mediaDevices.length > 0"
          class="shell-card rounded-[1.45rem]"
        >
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <div class="min-w-0">
              <p class="shell-heading text-sm">影音控制</p>
              <p class="shell-copy mt-1 truncate text-sm">{{ mediaSummary }}</p>
            </div>
            <div class="shell-status shell-status--idle">
              {{ mediaDevices.length }} 项
            </div>
          </summary>

          <div class="space-y-3 border-t border-black/5 px-4 py-4">
            <div
              v-for="device in mediaDevices"
              :key="`media-${device.id}`"
              class="shell-card px-4 py-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-ink sm:text-base">{{ shortLabel(device) }}</p>
                  <p class="shell-meta mt-1 text-xs uppercase tracking-[0.16em]">{{ device.ha_entity_id }}</p>
                </div>
                <button
                  type="button"
                  class="relative inline-flex h-8 w-16 items-center rounded-full transition duration-300"
                  :class="[isPoweredOn(device) ? applianceMeta.iconWrapperClass : 'bg-slate-300', isPending(device.id) ? 'animate-pulse' : '']"
                  :disabled="isPending(device.id)"
                  @click="handleToggle(device.id)"
                >
                  <span
                    class="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-md transition duration-300"
                    :class="isPoweredOn(device) ? 'translate-x-8' : 'translate-x-0'"
                  />
                </button>
              </div>

              <div v-if="device.media_volume_level !== null && device.media_volume_level !== undefined" class="mt-4">
                <div class="shell-copy mb-2 flex items-center justify-between text-sm">
                  <span>音量</span>
                  <span class="font-medium text-ink">{{ Math.round(sliderDrafts[device.id] ?? 0) }}%</span>
                </div>
                <input
                  :value="sliderDrafts[device.id]"
                  type="range"
                  class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
                  :style="{ accentColor: applianceMeta.accentColor }"
                  min="0"
                  max="100"
                  step="1"
                  :disabled="isPending(device.id)"
                  @input="sliderDrafts = { ...sliderDrafts, [device.id]: Number($event.target.value) }"
                  @change="handleNumberChange(device.id, $event)"
                >
              </div>

              <div v-if="device.media_source_options?.length" class="mt-4">
                <p class="shell-copy mb-2 text-sm">输入源</p>
                <select
                  :value="selectDrafts[device.id]"
                  class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition"
                  :disabled="isPending(device.id)"
                  @change="handleSelectChange(device.id, $event)"
                >
                  <option
                    v-for="option in device.media_source_options"
                    :key="option"
                    :value="option"
                  >
                    {{ option }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </details>

        <details
          v-if="genericControlDevices.length > 0"
          class="shell-card rounded-[1.45rem]"
        >
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <div class="min-w-0">
              <p class="shell-heading text-sm">设备控制</p>
              <p class="shell-copy mt-1 truncate text-sm">{{ genericSummary }}</p>
            </div>
            <div class="shell-status shell-status--idle">
              {{ genericControlDevices.length }} 项
            </div>
          </summary>

          <div class="space-y-3 border-t border-black/5 px-4 py-4">
            <div
              v-for="device in genericControlDevices"
              :key="device.id"
              class="shell-card px-4 py-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-ink sm:text-base">{{ shortLabel(device) }}</p>
                  <p class="shell-meta mt-1 text-xs uppercase tracking-[0.16em]">{{ device.ha_entity_id }}</p>
                </div>
                <div class="shell-status shell-status--idle">
                  {{ controlKindLabel(device.control_kind) }}
                </div>
              </div>

              <div v-if="device.control_kind === 'toggle'" class="mt-4 flex items-center justify-between gap-4">
                <p class="shell-copy text-sm">{{ device.raw_state ?? device.current_status }}</p>
                <button
                  type="button"
                  class="relative inline-flex h-8 w-16 items-center rounded-full transition duration-300"
                  :class="[device.current_status === 'on' ? applianceMeta.iconWrapperClass : 'bg-slate-300', isPending(device.id) ? 'animate-pulse' : '']"
                  :disabled="isPending(device.id)"
                  @click="handleToggle(device.id)"
                >
                  <span
                    class="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-md transition duration-300"
                    :class="device.current_status === 'on' ? 'translate-x-8' : 'translate-x-0'"
                  />
                </button>
              </div>

              <div v-else-if="device.control_kind === 'number'" class="mt-4">
                <div class="shell-copy mb-2 flex items-center justify-between text-sm">
                  <span>{{ shortLabel(device) }}</span>
                  <span class="font-medium text-ink">
                    {{ sliderDrafts[device.id] }}
                    <span v-if="device.unit_of_measurement">{{ device.unit_of_measurement }}</span>
                  </span>
                </div>
                <input
                  :value="sliderDrafts[device.id]"
                  type="range"
                  class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
                  :style="{ accentColor: applianceMeta.accentColor }"
                  :min="device.min_value ?? 0"
                  :max="device.max_value ?? 100"
                  :step="device.step ?? 1"
                  :disabled="isPending(device.id)"
                  @input="sliderDrafts = { ...sliderDrafts, [device.id]: Number($event.target.value) }"
                  @change="handleNumberChange(device.id, $event)"
                >
                <div class="shell-meta mt-2 flex items-center justify-between text-xs">
                  <span>{{ device.min_value ?? 0 }}</span>
                  <span>{{ device.max_value ?? 100 }}</span>
                </div>
              </div>

              <div v-else-if="device.control_kind === 'select'" class="mt-4">
                <select
                  :value="selectDrafts[device.id]"
                  class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition"
                  :disabled="isPending(device.id)"
                  @change="handleSelectChange(device.id, $event)"
                >
                  <option
                    v-for="option in device.control_options"
                    :key="option"
                    :value="option"
                  >
                    {{ option }}
                  </option>
                </select>
              </div>

              <div v-else-if="device.control_kind === 'button'" class="mt-4">
                <button
                  type="button"
                  class="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  :class="applianceMeta.iconWrapperClass"
                  :disabled="isPending(device.id)"
                  @click="handleButtonPress(device.id)"
                >
                  {{ isPending(device.id) ? '执行中...' : '执行动作' }}
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </article>
</template>
