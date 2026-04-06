<script setup>
import { computed, ref, watch } from 'vue'

import { useSmartHomeStore } from '../stores/smartHome'

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
      cardClass: 'border-sky-200/70 bg-gradient-to-br from-white via-sky-50/85 to-cyan-50/70 shadow-panel',
      iconWrapperClass: 'bg-sky-500 text-white',
      sectionClass: 'border-sky-100 bg-white/82',
      chipClass: 'bg-sky-100 text-sky-700',
      accentColor: '#0ea5e9',
    },
    air_conditioner: {
      eyebrow: '空调控制面板',
      badge: '环境设备',
      cardClass: 'border-teal-200/70 bg-gradient-to-br from-white via-teal-50/85 to-cyan-50/70 shadow-panel',
      iconWrapperClass: 'bg-teal-500 text-white',
      sectionClass: 'border-teal-100 bg-white/82',
      chipClass: 'bg-teal-100 text-teal-700',
      accentColor: '#14b8a6',
    },
    tv: {
      eyebrow: '电视控制面板',
      badge: '影音设备',
      cardClass: 'border-indigo-200/70 bg-gradient-to-br from-white via-indigo-50/88 to-slate-50/72 shadow-panel',
      iconWrapperClass: 'bg-indigo-500 text-white',
      sectionClass: 'border-indigo-100 bg-white/82',
      chipClass: 'bg-indigo-100 text-indigo-700',
      accentColor: '#6366f1',
    },
    media: {
      eyebrow: '影音设备面板',
      badge: '媒体设备',
      cardClass: 'border-violet-200/70 bg-gradient-to-br from-white via-violet-50/88 to-slate-50/72 shadow-panel',
      iconWrapperClass: 'bg-violet-500 text-white',
      sectionClass: 'border-violet-100 bg-white/82',
      chipClass: 'bg-violet-100 text-violet-700',
      accentColor: '#8b5cf6',
    },
    purifier: {
      eyebrow: '净化设备面板',
      badge: '空气设备',
      cardClass: 'border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/88 to-teal-50/70 shadow-panel',
      iconWrapperClass: 'bg-emerald-500 text-white',
      sectionClass: 'border-emerald-100 bg-white/82',
      chipClass: 'bg-emerald-100 text-emerald-700',
      accentColor: '#10b981',
    },
    washer: {
      eyebrow: '洗护设备面板',
      badge: '家务设备',
      cardClass: 'border-blue-200/70 bg-gradient-to-br from-white via-blue-50/85 to-cyan-50/70 shadow-panel',
      iconWrapperClass: 'bg-blue-500 text-white',
      sectionClass: 'border-blue-100 bg-white/82',
      chipClass: 'bg-blue-100 text-blue-700',
      accentColor: '#3b82f6',
    },
    speaker: {
      eyebrow: '音箱控制面板',
      badge: '声音设备',
      cardClass: 'border-fuchsia-200/70 bg-gradient-to-br from-white via-fuchsia-50/85 to-pink-50/70 shadow-panel',
      iconWrapperClass: 'bg-fuchsia-500 text-white',
      sectionClass: 'border-fuchsia-100 bg-white/82',
      chipClass: 'bg-fuchsia-100 text-fuchsia-700',
      accentColor: '#d946ef',
    },
    router: {
      eyebrow: '网络设备面板',
      badge: '连接设备',
      cardClass: 'border-slate-200/70 bg-gradient-to-br from-white via-slate-50/88 to-zinc-50/72 shadow-panel',
      iconWrapperClass: 'bg-slate-700 text-white',
      sectionClass: 'border-slate-200 bg-white/82',
      chipClass: 'bg-slate-100 text-slate-700',
      accentColor: '#475569',
    },
    nas: {
      eyebrow: 'NAS 设备面板',
      badge: '存储设备',
      cardClass: 'border-cyan-200/70 bg-gradient-to-br from-white via-cyan-50/88 to-sky-50/72 shadow-panel',
      iconWrapperClass: 'bg-cyan-600 text-white',
      sectionClass: 'border-cyan-100 bg-white/82',
      chipClass: 'bg-cyan-100 text-cyan-700',
      accentColor: '#0891b2',
    },
    computer: {
      eyebrow: '电脑设备面板',
      badge: '计算设备',
      cardClass: 'border-blue-200/70 bg-gradient-to-br from-white via-blue-50/88 to-indigo-50/72 shadow-panel',
      iconWrapperClass: 'bg-blue-600 text-white',
      sectionClass: 'border-blue-100 bg-white/82',
      chipClass: 'bg-blue-100 text-blue-700',
      accentColor: '#2563eb',
    },
    camera: {
      eyebrow: '安防设备面板',
      badge: '监控设备',
      cardClass: 'border-rose-200/70 bg-gradient-to-br from-white via-rose-50/88 to-orange-50/72 shadow-panel',
      iconWrapperClass: 'bg-rose-500 text-white',
      sectionClass: 'border-rose-100 bg-white/82',
      chipClass: 'bg-rose-100 text-rose-700',
      accentColor: '#f43f5e',
    },
    generic: {
      eyebrow: '设备聚合视图',
      badge: '家庭设备',
      cardClass: 'border-amber-200/80 bg-gradient-to-br from-white via-amber-50/80 to-orange-50/72 shadow-panel',
      iconWrapperClass: 'bg-amber-500 text-white',
      sectionClass: 'border-amber-100 bg-white/82',
      chipClass: 'bg-amber-100 text-amber-700',
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

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--'
  }

  const numericValue = Number(value)
  return Number.isInteger(numericValue) ? `${numericValue}` : numericValue.toFixed(1)
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
</script>

<template>
  <article
    class="overflow-hidden rounded-[2rem] border p-5 sm:p-6"
    :class="applianceMeta.cardClass"
  >
    <div class="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-start lg:justify-between" :class="applianceMeta.sectionClass">
      <div class="flex items-start gap-4 rounded-[1.65rem] border px-4 py-4" :class="applianceMeta.sectionClass">
        <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm" :class="applianceMeta.iconWrapperClass">
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

        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em]" :class="applianceMeta.chipClass">{{ applianceMeta.eyebrow }}</p>
          <h3 class="font-display mt-3 text-[2rem] leading-none text-ink sm:text-[2.25rem]">{{ title }}</h3>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
            这张卡片会优先按 Home Assistant 的设备维度聚合显示。后续同一台冰箱、空调、电视、NAS 或电脑新增相关实体时，也会优先并入这里。
          </p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3 sm:min-w-[280px]">
        <div class="rounded-2xl border px-4 py-3" :class="applianceMeta.sectionClass">
          <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">类型</p>
          <p class="mt-2 text-sm font-semibold text-ink">{{ applianceMeta.badge }}</p>
        </div>
        <div class="rounded-2xl border px-4 py-3" :class="applianceMeta.sectionClass">
          <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">控制项</p>
          <p class="mt-2 text-2xl font-semibold text-ink">{{ controlDevices.length }}</p>
        </div>
        <div class="rounded-2xl border px-4 py-3" :class="applianceMeta.sectionClass">
          <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">监测项</p>
          <p class="mt-2 text-2xl font-semibold text-ink">{{ sensorDevices.length }}</p>
        </div>
      </div>
    </div>

    <div v-if="sensorDevices.length > 0" class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="device in sensorDevices"
        :key="device.id"
        class="rounded-[1.5rem] border px-4 py-4"
        :class="applianceMeta.sectionClass"
      >
        <p class="text-xs uppercase tracking-[0.16em] text-slate-400">{{ shortLabel(device) }}</p>
        <p class="mt-3 text-3xl font-semibold text-ink">
          {{ device.raw_state ?? '--' }}
          <span v-if="device.unit_of_measurement" class="ml-1 text-base font-medium text-slate-500">
            {{ device.unit_of_measurement }}
          </span>
        </p>
      </div>
    </div>

    <div v-if="climateDevices.length > 0" class="mt-5 grid gap-4 xl:grid-cols-2">
      <div
        v-for="device in climateDevices"
        :key="`climate-${device.id}`"
        class="rounded-[1.5rem] border px-4 py-4"
        :class="applianceMeta.sectionClass"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-ink sm:text-base">{{ shortLabel(device) }}</p>
            <p class="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{{ device.ha_entity_id }}</p>
          </div>
          <div class="rounded-full px-3 py-1 text-xs font-semibold" :class="applianceMeta.chipClass">
            空调
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between gap-4">
          <div>
            <p class="text-sm text-slate-500">当前模式</p>
            <p class="mt-1 text-base font-semibold text-ink">{{ device.hvac_mode ?? device.raw_state ?? device.current_status }}</p>
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
          <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
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
          <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{{ device.min_value ?? 16 }}</span>
            <span>当前室温 {{ formatNumber(device.current_temperature) }}{{ device.unit_of_measurement ?? '°C' }}</span>
            <span>{{ device.max_value ?? 30 }}</span>
          </div>
        </div>

        <div v-if="device.hvac_modes?.length" class="mt-4">
          <p class="mb-2 text-sm text-slate-500">运行模式</p>
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

    <div v-if="mediaDevices.length > 0" class="mt-5 grid gap-4 xl:grid-cols-2">
      <div
        v-for="device in mediaDevices"
        :key="`media-${device.id}`"
        class="rounded-[1.5rem] border px-4 py-4"
        :class="applianceMeta.sectionClass"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-ink sm:text-base">{{ shortLabel(device) }}</p>
            <p class="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{{ device.ha_entity_id }}</p>
          </div>
          <div class="rounded-full px-3 py-1 text-xs font-semibold" :class="applianceMeta.chipClass">
            影音
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between gap-4">
          <div>
            <p class="text-sm text-slate-500">播放状态</p>
            <p class="mt-1 text-base font-semibold text-ink">{{ device.raw_state ?? device.current_status }}</p>
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
          <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
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
          <p class="mb-2 text-sm text-slate-500">输入源</p>
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

    <div v-if="genericControlDevices.length > 0" class="mt-5 grid gap-4 xl:grid-cols-2">
      <div
        v-for="device in genericControlDevices"
        :key="device.id"
        class="rounded-[1.5rem] border px-4 py-4"
        :class="applianceMeta.sectionClass"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-ink sm:text-base">{{ shortLabel(device) }}</p>
            <p class="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{{ device.ha_entity_id }}</p>
          </div>
          <div class="rounded-full px-3 py-1 text-xs font-semibold" :class="applianceMeta.chipClass">
            {{ controlKindLabel(device.control_kind) }}
          </div>
        </div>

        <div v-if="device.control_kind === 'toggle'" class="mt-4 flex items-center justify-between gap-4">
          <p class="text-sm text-slate-500">{{ device.raw_state ?? device.current_status }}</p>
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
          <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
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
          <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
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
  </article>
</template>
