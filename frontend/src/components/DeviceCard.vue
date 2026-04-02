<script setup>
import { computed, ref, watch } from 'vue'

import { useSmartHomeStore } from '../stores/smartHome'

const props = defineProps({
  device: {
    type: Object,
    required: true,
  },
})

const smartHomeStore = useSmartHomeStore()

const numberDraft = ref(props.device.number_value ?? props.device.min_value ?? 0)
const selectedOption = ref(props.device.raw_state ?? '')

watch(
  () => props.device.number_value,
  (value) => {
    if (value !== null && value !== undefined) {
      numberDraft.value = value
    }
  },
  { immediate: true },
)

watch(
  () => props.device.raw_state,
  (value) => {
    if (typeof value === 'string') {
      selectedOption.value = value
    }
  },
  { immediate: true },
)

const isPending = computed(() => smartHomeStore.isDevicePending(props.device.id))
const controlKind = computed(() => props.device.control_kind)
const isToggle = computed(() => controlKind.value === 'toggle')
const isNumber = computed(() => controlKind.value === 'number')
const isSelect = computed(() => controlKind.value === 'select')
const isButton = computed(() => controlKind.value === 'button')
const isInteractive = computed(() => props.device.can_control)
const isActive = computed(() => ['on', 'online'].includes(props.device.current_status))

const deviceTypeLabels = {
  mijia_light: '米家灯具',
  nas: '网络存储',
  windows_pc: 'Windows 电脑',
  sensor: '传感设备',
  climate: '环境设备',
  camera: '摄像头',
  switch: '开关设备',
}

const statusLabels = {
  on: '开启',
  off: '关闭',
  online: '在线',
  offline: '离线',
  sleeping: '休眠',
  unavailable: '不可用',
  unknown: '未知',
}

const cardClass = computed(() =>
  isActive.value
    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50'
    : 'border-slate-200 bg-white/92',
)

const glowClass = computed(() => (isActive.value ? 'from-emerald-400/25 to-sky-400/10' : 'from-slate-200/0 to-slate-200/0'))
const iconClass = computed(() => (isActive.value ? 'text-tide' : 'text-slate-500'))

const deviceTypeLabel = computed(() => deviceTypeLabels[props.device.device_type] ?? props.device.entity_domain)

const displayState = computed(() => {
  if (isNumber.value && props.device.number_value !== null) {
    return `${props.device.number_value}${props.device.unit_of_measurement ?? ''}`
  }

  if (isSelect.value && props.device.raw_state) {
    return props.device.raw_state
  }

  if (isButton.value) {
    return '可执行'
  }

  if (props.device.raw_state) {
    return statusLabels[props.device.raw_state] ?? props.device.raw_state
  }

  return statusLabels[props.device.current_status] ?? '未知'
})

const helperText = computed(() => {
  if (isToggle.value) {
    return '点击右侧开关即可控制设备的开与关。'
  }

  if (isNumber.value) {
    return '拖动滑杆后，新的数值会立即同步到 Home Assistant。'
  }

  if (isSelect.value) {
    return '选择一个模式后，系统会立即下发到设备。'
  }

  if (isButton.value) {
    return '这是一次性动作按钮，点击后会立刻执行。'
  }

  return '当前仅展示状态，不提供直接控制。'
})

const numberLabel = computed(() => `${numberDraft.value}${props.device.unit_of_measurement ?? ''}`)

async function handleToggle() {
  if (!isToggle.value || isPending.value) {
    return
  }

  try {
    await smartHomeStore.toggleDevice(props.device.id)
  } catch (error) {
    console.error('Failed to toggle device.', error)
  }
}

async function handleNumberChange(event) {
  if (!isNumber.value || isPending.value) {
    return
  }

  const nextValue = Number(event.target.value)
  numberDraft.value = nextValue

  try {
    await smartHomeStore.setDeviceNumber(props.device.id, nextValue)
  } catch (error) {
    console.error('Failed to set numeric value.', error)
  }
}

async function handleSelectChange(event) {
  if (!isSelect.value || isPending.value) {
    return
  }

  const nextOption = event.target.value
  selectedOption.value = nextOption

  try {
    await smartHomeStore.selectDeviceOption(props.device.id, nextOption)
  } catch (error) {
    console.error('Failed to select option.', error)
  }
}

async function handleButtonPress() {
  if (!isButton.value || isPending.value) {
    return
  }

  try {
    await smartHomeStore.pressDeviceButton(props.device.id)
  } catch (error) {
    console.error('Failed to press button.', error)
  }
}
</script>

<template>
  <article
    class="group relative overflow-hidden rounded-[2rem] border p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-panel"
    :class="cardClass"
  >
    <div class="absolute inset-0 bg-gradient-to-br transition duration-500" :class="glowClass" />

    <div class="relative flex items-start justify-between gap-4">
      <div class="flex items-center gap-4">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/60 bg-white/90 shadow-sm"
          :class="iconClass"
        >
          <svg
            v-if="device.device_type === 'nas'"
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="4" y="4" width="16" height="6" rx="2" />
            <rect x="4" y="14" width="16" height="6" rx="2" />
            <path d="M8 7h.01M8 17h.01M16 7h2M16 17h2" />
          </svg>

          <svg
            v-else-if="device.device_type === 'windows_pc'"
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
          </svg>

          <svg
            v-else-if="device.device_type === 'mijia_light'"
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12.74V18h8v-3.26A7 7 0 0 0 12 2Z" />
          </svg>

          <svg
            v-else-if="isButton"
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>

          <svg
            v-else-if="isSelect"
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M7 6h10" />
            <path d="M7 12h10" />
            <path d="M7 18h10" />
            <path d="m15 9 2 3 2-3" />
          </svg>

          <svg
            v-else-if="isNumber"
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 7h10" />
            <path d="M4 17h16" />
            <circle cx="17" cy="7" r="2" />
            <circle cx="8" cy="17" r="2" />
          </svg>

          <svg
            v-else-if="device.device_type === 'switch'"
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="7" y="2" width="10" height="20" rx="5" />
            <path d="M12 7v5" />
          </svg>

          <svg
            v-else
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </div>

        <div class="min-w-0">
          <p class="truncate text-lg font-semibold text-ink">{{ device.name }}</p>
          <p class="mt-1 text-sm text-slate-500">{{ deviceTypeLabel }}</p>
          <p class="mt-1 truncate text-xs uppercase tracking-[0.18em] text-slate-400">{{ device.ha_entity_id }}</p>
        </div>
      </div>

      <div
        class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
        :class="isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'"
      >
        {{ displayState }}
      </div>
    </div>

    <div class="relative mt-6 rounded-[1.5rem] bg-slate-950/[0.03] px-4 py-4">
      <p class="text-sm font-medium text-ink">
        {{ isInteractive ? '可执行控制' : '只读状态' }}
      </p>
      <p class="mt-1 text-sm leading-6 text-slate-500">{{ helperText }}</p>

      <div v-if="isToggle" class="mt-4 flex items-center justify-between gap-4">
        <div class="text-sm text-slate-500">
          {{ isActive ? '当前处于开启状态' : '当前处于关闭状态' }}
        </div>

        <button
          type="button"
          class="relative inline-flex h-8 w-16 shrink-0 items-center rounded-full transition duration-300"
          :class="[
            isActive ? 'bg-tide' : 'bg-slate-300',
            isInteractive ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
            isPending ? 'animate-pulse' : '',
          ]"
          :disabled="!isInteractive || isPending"
          :aria-pressed="isActive"
          @click="handleToggle"
        >
          <span
            class="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-md transition duration-300"
            :class="isActive ? 'translate-x-8' : 'translate-x-0'"
          />
        </button>
      </div>

      <div v-else-if="isNumber" class="mt-4">
        <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
          <span>当前值</span>
          <span class="font-medium text-ink">{{ numberLabel }}</span>
        </div>
        <input
          type="range"
          class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-tide"
          :min="device.min_value ?? 0"
          :max="device.max_value ?? 100"
          :step="device.step ?? 1"
          :value="numberDraft"
          :disabled="!isInteractive || isPending"
          @input="numberDraft = Number($event.target.value)"
          @change="handleNumberChange"
        >
        <div class="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>{{ device.min_value ?? 0 }}</span>
          <span>{{ device.max_value ?? 100 }}</span>
        </div>
      </div>

      <div v-else-if="isSelect" class="mt-4">
        <select
          v-model="selectedOption"
          class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-tide"
          :disabled="!isInteractive || isPending"
          @change="handleSelectChange"
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

      <div v-else-if="isButton" class="mt-4">
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="!isInteractive || isPending"
          @click="handleButtonPress"
        >
          {{ isPending ? '执行中...' : '执行动作' }}
        </button>
      </div>
    </div>
  </article>
</template>
