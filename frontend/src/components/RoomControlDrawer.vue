<script setup>
import { computed, ref, watch } from 'vue'

import { useSmartHomeStore } from '../stores/smartHome'
import { getControlFeedbackPresentation } from '../utils/controlFeedback'
import { formatDeviceState, getDevicePrimaryMetric, isDeviceActive, isDeviceOffline } from '../utils/floorMap'

const props = defineProps({
  room: {
    type: Object,
    default: null,
  },
  device: {
    type: Object,
    default: null,
  },
  actionError: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['close', 'select-device'])

const smartHomeStore = useSmartHomeStore()
const numberDraft = ref(0)
const selectDraft = ref('')
const brightnessDraft = ref(0)
const colorTemperatureDraft = ref(0)

const resolvedRoom = computed(() =>
  smartHomeStore.selectRoomViewById(props.room?.id ?? props.device?.room_id ?? null) ?? props.room ?? null,
)
const roomDevices = computed(() => resolvedRoom.value?.devices ?? [])
const currentDevice = computed(() =>
  smartHomeStore.selectDeviceViewById(props.device?.id ?? null, resolvedRoom.value?.id ?? props.device?.room_id ?? null)
  ?? props.device
  ?? roomDevices.value[0]
  ?? null,
)
const isPending = computed(() => (currentDevice.value ? smartHomeStore.isDevicePending(currentDevice.value.id) : false))
const feedbackState = computed(() => {
  if (!currentDevice.value) {
    return 'idle'
  }

  if (isPending.value) {
    return 'pending'
  }

  if (smartHomeStore.actionFeedback.deviceId === currentDevice.value.id) {
    return smartHomeStore.actionFeedback.status
  }

  return 'idle'
})
const feedbackLabel = computed(() => {
  return feedbackPresentation.value.label
})
const feedbackPresentation = computed(() =>
  getControlFeedbackPresentation({
    feedbackState: feedbackState.value,
    offline: currentDevice.value ? isDeviceOffline(currentDevice.value) : false,
    active: currentDevice.value ? isDeviceActive(currentDevice.value) : false,
  }),
)
const feedbackClass = computed(() => feedbackPresentation.value.badgeClass)
const deviceSourcePresentation = computed(() => {
  if (!currentDevice.value) {
    return {
      key: 'unknown',
      label: '来源未知',
      badgeClass: 'shell-status shell-status--idle',
      description: '当前设备来源信息暂不可用。',
    }
  }

  const device = currentDevice.value
  const source = device.source
    ?? (device.isDetailBacked && device.isSceneBacked
      ? 'merged'
      : device.isDetailBacked
        ? 'detail'
        : 'scene')

  if (source === 'merged') {
    return {
      key: 'merged',
      label: 'merged',
      badgeClass: 'shell-status shell-status--success',
      description: '设备详情与空间场景都已同步，当前显示的是合并结果。',
    }
  }

  if (source === 'detail') {
    return {
      key: 'detail',
      label: 'detail-only',
      badgeClass: 'shell-status shell-status--idle',
      description: '当前设备主要来自详情链，空间位置信息可能稍后补齐。',
    }
  }

  return {
    key: 'scene',
    label: 'scene-only',
    badgeClass: 'shell-status shell-status--warning',
    description: '当前设备仅由空间场景数据支撑，部分详情字段可能仍在同步中。',
  }
})
const shouldShowSceneOnlyNotice = computed(() => deviceSourcePresentation.value.key === 'scene')
const drawerSurfaceClass = computed(() => {
  const classMap = {
    offline: 'border-slate-200/85',
    pending: 'border-amber-200/90',
    success: 'border-emerald-200/90',
    error: 'border-rose-200/90',
    active: 'border-[#cfe0dc]',
    idle: 'border-white/75',
  }

  return classMap[feedbackPresentation.value.tone] ?? classMap.idle
})
const actionSurfaceClass = computed(() => feedbackPresentation.value.surfaceClass)

watch(
  currentDevice,
  (device) => {
    if (!device) {
      return
    }

    numberDraft.value = device.target_temperature ?? device.number_value ?? device.min_value ?? 0
    selectDraft.value = device.hvac_mode ?? device.raw_state ?? ''
    brightnessDraft.value = device.brightness_value ?? 50
    colorTemperatureDraft.value = device.color_temperature ?? 3500
  },
  { immediate: true },
)

async function handleToggle() {
  if (!currentDevice.value || isPending.value) {
    return
  }

  try {
    await smartHomeStore.toggleDevice(currentDevice.value.id)
  } catch (error) {
    console.error('Failed to toggle drawer device.', error)
  }
}

async function handleNumberChange(event) {
  if (!currentDevice.value || isPending.value) {
    return
  }

  const nextValue = Number(event.target.value)
  numberDraft.value = nextValue

  try {
    await smartHomeStore.setDeviceNumber(currentDevice.value.id, nextValue)
  } catch (error) {
    console.error('Failed to update drawer numeric control.', error)
  }
}

async function handleSelectChange(event) {
  if (!currentDevice.value || isPending.value) {
    return
  }

  const nextValue = event.target.value
  selectDraft.value = nextValue

  try {
    await smartHomeStore.selectDeviceOption(currentDevice.value.id, nextValue)
  } catch (error) {
    console.error('Failed to update drawer select control.', error)
  }
}

async function handleButtonPress() {
  if (!currentDevice.value || isPending.value) {
    return
  }

  try {
    await smartHomeStore.pressDeviceButton(currentDevice.value.id)
  } catch (error) {
    console.error('Failed to execute drawer button control.', error)
  }
}

async function handleBrightnessChange(event) {
  if (!currentDevice.value || isPending.value) {
    return
  }

  const nextValue = Number(event.target.value)
  brightnessDraft.value = nextValue

  try {
    await smartHomeStore.setDeviceBrightness(currentDevice.value.id, nextValue)
  } catch (error) {
    console.error('Failed to update brightness.', error)
  }
}

async function handleColorTemperatureChange(event) {
  if (!currentDevice.value || isPending.value) {
    return
  }

  const nextValue = Number(event.target.value)
  colorTemperatureDraft.value = nextValue

  try {
    await smartHomeStore.setDeviceColorTemperature(currentDevice.value.id, nextValue)
  } catch (error) {
    console.error('Failed to update color temperature.', error)
  }
}

function isClimate(device) {
  return device?.entity_domain === 'climate'
}

function controlLabel(device) {
  if (!device) {
    return '未选中设备'
  }

  if (device.control_kind === 'toggle') return '快速开关'
  if (device.control_kind === 'number') return '数值控制'
  if (device.control_kind === 'select') return '模式切换'
  if (device.control_kind === 'button') return '动作执行'
  if (isClimate(device)) return '环境控制'
  return '状态详情'
}
</script>

<template>
  <transition
    enter-active-class="transition duration-300 ease-[cubic-bezier(0.2,0.9,0.24,1)]"
    enter-from-class="translate-y-5 scale-[0.985] opacity-0"
    enter-to-class="translate-y-0 scale-100 opacity-100"
    leave-active-class="transition duration-220 ease-in"
    leave-from-class="translate-y-0 scale-100 opacity-100"
    leave-to-class="translate-y-4 scale-[0.992] opacity-0"
  >
    <section
      v-if="resolvedRoom && currentDevice"
      class="shell-surface-strong p-5 sm:p-6"
      :class="drawerSurfaceClass"
    >
      <transition
        mode="out-in"
        enter-active-class="transition duration-220 ease-out"
        enter-from-class="translate-y-2 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-160 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-1 opacity-0"
      >
        <div :key="currentDevice.id">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="shell-kicker">Secondary Control</p>
            <h3 class="shell-title-section mt-3">{{ currentDevice.name }}</h3>
            <p class="shell-copy mt-2 text-sm">{{ resolvedRoom.name }} · {{ controlLabel(currentDevice) }}</p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span :class="deviceSourcePresentation.badgeClass">
                {{ deviceSourcePresentation.label }}
              </span>
              <span class="shell-chip">
                {{ deviceSourcePresentation.description }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span :class="feedbackClass">
              {{ feedbackLabel }}
            </span>
            <button
              type="button"
              class="shell-chip shell-chip--interactive"
              @click="emit('close')"
            >
              关闭
            </button>
          </div>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <div class="shell-card px-4 py-3">
          <p class="shell-meta uppercase tracking-[0.18em]">当前状态</p>
          <p class="mt-2 text-lg font-semibold text-ink">{{ formatDeviceState(currentDevice) }}</p>
        </div>
        <div class="shell-card px-4 py-3">
          <p class="shell-meta uppercase tracking-[0.18em]">主读数</p>
          <p class="mt-2 text-lg font-semibold text-ink">{{ getDevicePrimaryMetric(currentDevice) }}</p>
        </div>
        <div class="shell-card px-4 py-3">
          <p class="shell-meta uppercase tracking-[0.18em]">在线态</p>
          <p class="mt-2 text-lg font-semibold" :class="isDeviceOffline(currentDevice) ? 'text-slate-400' : 'text-emerald-700'">
            {{ isDeviceOffline(currentDevice) ? '离线' : '在线' }}
          </p>
        </div>
      </div>

      <div
        v-if="actionError"
        class="shell-state-surface shell-state-surface--error mt-4 text-sm"
      >
        {{ actionError }}
      </div>

      <div
        v-if="shouldShowSceneOnlyNotice"
        class="shell-state-surface shell-state-surface--warning mt-4 text-sm"
      >
        当前设备仍处于 `scene-only` 状态，控制可继续执行，但详情字段可能会在后续同步中补全。
      </div>

      <div class="mt-5 p-4" :class="actionSurfaceClass">
        <div class="flex items-center justify-between gap-3">
          <p class="shell-heading">设备直控</p>
          <span
            :class="feedbackClass"
          >
            {{ feedbackLabel }}
          </span>
        </div>

        <div v-if="currentDevice.control_kind === 'toggle' || isClimate(currentDevice)" class="mt-4 flex items-center justify-between gap-4">
          <div>
            <p class="shell-copy text-sm">快速电源</p>
            <p class="shell-meta mt-1 text-xs">单击点位也是这个动作，长按会进入这里做细控。</p>
          </div>
          <button
            type="button"
            class="relative inline-flex h-10 w-20 items-center rounded-full transition duration-300"
            :class="[isDeviceActive(currentDevice) ? 'bg-[#2d6660]' : 'bg-slate-300', isPending ? 'animate-pulse' : '']"
            :disabled="isPending"
            @click="handleToggle"
          >
            <span
              class="absolute left-1 top-1 h-8 w-8 rounded-full bg-white shadow-md transition duration-300"
              :class="isDeviceActive(currentDevice) ? 'translate-x-10' : 'translate-x-0'"
            />
          </button>
        </div>

        <div
          v-if="isClimate(currentDevice) && currentDevice.target_temperature !== null && currentDevice.target_temperature !== undefined"
          class="mt-5"
        >
          <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
            <span>目标温度</span>
            <span class="font-medium text-ink">{{ numberDraft }}{{ currentDevice.unit_of_measurement ?? '°C' }}</span>
          </div>
          <input
            :value="numberDraft"
            type="range"
            class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
            :min="currentDevice.min_value ?? 16"
            :max="currentDevice.max_value ?? 30"
            :step="currentDevice.step ?? 1"
            :disabled="isPending"
            @input="numberDraft = Number($event.target.value)"
            @change="handleNumberChange"
          >
        </div>

        <div v-if="isClimate(currentDevice) && currentDevice.hvac_modes?.length" class="mt-5">
          <p class="mb-2 text-sm text-slate-500">运行模式</p>
          <select
            :value="selectDraft"
            class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none"
            :disabled="isPending"
            @change="handleSelectChange"
          >
            <option v-for="option in currentDevice.hvac_modes" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>

        <div v-if="currentDevice.control_kind === 'number'" class="mt-5">
          <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
            <span>数值控制</span>
            <span class="font-medium text-ink">{{ numberDraft }}{{ currentDevice.unit_of_measurement ?? '' }}</span>
          </div>
          <input
            :value="numberDraft"
            type="range"
            class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
            :min="currentDevice.min_value ?? 0"
            :max="currentDevice.max_value ?? 100"
            :step="currentDevice.step ?? 1"
            :disabled="isPending"
            @input="numberDraft = Number($event.target.value)"
            @change="handleNumberChange"
          >
        </div>

        <div v-if="currentDevice.control_kind === 'select'" class="mt-5">
          <p class="mb-2 text-sm text-slate-500">可选项</p>
          <select
            :value="selectDraft"
            class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink outline-none"
            :disabled="isPending"
            @change="handleSelectChange"
          >
            <option v-for="option in currentDevice.control_options ?? []" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>

        <div v-if="currentDevice.control_kind === 'button'" class="mt-5">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-2xl bg-[#2d6660] px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isPending"
            @click="handleButtonPress"
          >
            {{ isPending ? '执行中...' : '执行动作' }}
          </button>
        </div>

        <div v-if="currentDevice.supports_brightness" class="mt-5">
          <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
            <span>亮度</span>
            <span class="font-medium text-ink">{{ brightnessDraft }}%</span>
          </div>
          <input
            :value="brightnessDraft"
            type="range"
            class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
            min="1"
            max="100"
            step="1"
            :disabled="isPending"
            @input="brightnessDraft = Number($event.target.value)"
            @change="handleBrightnessChange"
          >
        </div>

        <div v-if="currentDevice.supports_color_temperature" class="mt-5">
          <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
            <span>色温</span>
            <span class="font-medium text-ink">{{ colorTemperatureDraft }}K</span>
          </div>
          <input
            :value="colorTemperatureDraft"
            type="range"
            class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
            :min="currentDevice.min_color_temperature ?? 2700"
            :max="currentDevice.max_color_temperature ?? 6500"
            step="50"
            :disabled="isPending"
            @input="colorTemperatureDraft = Number($event.target.value)"
            @change="handleColorTemperatureChange"
          >
        </div>
      </div>

        <div v-if="roomDevices.length > 1" class="mt-5">
          <p class="shell-kicker text-slate-500">同房间设备</p>
          <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="device in roomDevices"
            :key="device.id"
            type="button"
            class="shell-chip shell-chip--interactive"
            :class="device.id === currentDevice.id ? 'border-[#c9dfdb] bg-[#f1f7f6] text-[#2d6660]' : 'border-slate-200 bg-white text-slate-600'"
            @click="emit('select-device', device)"
          >
            {{ device.name }}
            </button>
          </div>
        </div>
        </div>
      </transition>
    </section>
  </transition>
</template>
