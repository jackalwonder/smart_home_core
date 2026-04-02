<script setup>
import { computed } from 'vue'

import { useSmartHomeStore } from '../stores/smartHome'

const props = defineProps({
  device: {
    type: Object,
    required: true,
  },
})

const smartHomeStore = useSmartHomeStore()

const isInteractive = computed(() => ['mijia_light', 'switch', 'windows_pc'].includes(props.device.device_type))
const isActive = computed(() => ['on', 'online'].includes(props.device.current_status))
const isPending = computed(() => smartHomeStore.isDevicePending(props.device.id))

const cardClass = computed(() =>
  isActive.value
    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50'
    : 'border-slate-200 bg-white/90',
)

const glowClass = computed(() => (isActive.value ? 'from-emerald-400/25 to-sky-400/10' : 'from-slate-200/0 to-slate-200/0'))

const statusLabel = computed(() => props.device.current_status.replaceAll('_', ' '))

const iconClass = computed(() => (isActive.value ? 'text-tide' : 'text-slate-500'))

async function handleToggle() {
  if (!isInteractive.value || isPending.value) {
    return
  }

  try {
    await smartHomeStore.toggleDevice(props.device.id)
  } catch (error) {
    console.error('Failed to toggle device.', error)
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

        <div>
          <p class="text-lg font-semibold text-ink">{{ device.name }}</p>
          <p class="mt-1 text-sm text-slate-500">{{ device.device_type }}</p>
          <p class="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{{ device.ha_entity_id }}</p>
        </div>
      </div>

      <div class="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
        :class="isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'">
        {{ statusLabel }}
      </div>
    </div>

    <div class="relative mt-6 flex items-center justify-between gap-4 rounded-[1.5rem] bg-slate-950/[0.03] px-4 py-3">
      <div>
        <p class="text-sm font-medium text-ink">{{ isActive ? 'Currently active' : 'Currently idle' }}</p>
        <p class="text-sm text-slate-500">
          {{ isInteractive ? 'Tap the switch to send a live action.' : 'Status only device.' }}
        </p>
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
  </article>
</template>
