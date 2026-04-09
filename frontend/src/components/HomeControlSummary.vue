<script setup>
import { computed } from 'vue'

import { useHomeControlSummary } from '../composables/useHomeControlSummary'
import { useSmartHomeStore } from '../stores/smartHome'

const props = defineProps({
  rooms: {
    type: Array,
    default: () => [],
  },
  selectedRoomId: {
    type: [Number, String],
    default: null,
  },
  connectionStatus: {
    type: String,
    default: 'idle',
  },
  spatialLoading: {
    type: Boolean,
    default: false,
  },
  spatialBusy: {
    type: Boolean,
    default: false,
  },
  spatialError: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select-room'])

const smartHomeStore = useSmartHomeStore()

const {
  clock,
  weather,
  householdStatus,
  primaryFeedback,
  supportingNotices,
  keyRooms,
} = useHomeControlSummary(
  computed(() => props.rooms),
  computed(() => props.selectedRoomId),
  computed(() => ({
    connectionStatus: props.connectionStatus,
    spatialLoading: props.spatialLoading,
    spatialBusy: props.spatialBusy,
    spatialError: props.spatialError,
    actionFeedback: smartHomeStore.actionFeedback,
    visualActivity: smartHomeStore.visualActivity,
    pendingDeviceIds: smartHomeStore.pendingDeviceIds,
    lastMessageAt: smartHomeStore.lastMessageAt,
  })),
)

const compactNotice = computed(() => supportingNotices.value[0] ?? '')
const summaryRooms = computed(() => keyRooms.value.slice(0, 2))
const householdDescription = computed(() => {
  const text = `${householdStatus.value.description ?? ''}`.trim()
  if (text.length <= 48) {
    return text
  }

  const sentence = text.split('，')[0]?.trim()
  return sentence ? `${sentence}。` : `${text.slice(0, 46).trimEnd()}…`
})

function toneClass(tone) {
  const map = {
    calm: 'shell-status shell-status--idle',
    scene: 'shell-status shell-status--active',
    active: 'shell-status shell-status--active',
    pending: 'shell-status shell-status--pending',
    warning: 'shell-status shell-status--warning',
    error: 'shell-status shell-status--error',
    loading: 'shell-status shell-status--loading',
    success: 'shell-status shell-status--success',
  }

  return map[tone] ?? map.calm
}

function feedbackToneClass(tone) {
  const map = {
    calm: 'shell-state-surface shell-state-surface--idle',
    pending: 'shell-state-surface shell-state-surface--pending',
    success: 'shell-state-surface shell-state-surface--success',
    warning: 'shell-state-surface shell-state-surface--warning',
    error: 'shell-state-surface shell-state-surface--error',
  }

  return map[tone] ?? map.calm
}
</script>

<template>
  <section class="shell-surface relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
    <div class="pointer-events-none absolute inset-0">
      <div class="absolute left-[-4rem] top-[-5rem] h-40 w-40 rounded-full bg-[#dcc79d]/35 opacity-70" />
      <div class="absolute right-[-2rem] top-[12%] h-44 w-44 rounded-full bg-[#bfd6d3]/38 opacity-70" />
      <div class="absolute bottom-[-4rem] left-[38%] h-36 w-36 rounded-full bg-white/60 opacity-90" />
    </div>

    <div class="relative">
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.58fr)_320px]">
        <div class="shell-surface-muted px-5 py-5">
          <div class="flex flex-wrap items-center gap-2">
            <span :class="toneClass(householdStatus.tone)">
              {{ householdStatus.badge }}
            </span>
            <span class="shell-chip">
              {{ clock.periodLabel }}
            </span>
          </div>

          <div class="mt-5 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p class="shell-kicker">{{ householdStatus.eyebrow }}</p>
              <h2 class="shell-title-hero mt-3 max-w-2xl">
                {{ householdStatus.title }}
              </h2>
              <p class="shell-copy mt-3 max-w-xl">
                {{ householdDescription }}
              </p>
            </div>

            <div class="shell-card min-w-[210px] px-4 py-4 text-right">
              <p class="shell-meta uppercase tracking-[0.22em]">{{ clock.dateText }}</p>
              <p class="mt-2 text-[2.15rem] font-semibold leading-none text-ink">{{ clock.timeText }}</p>
              <p class="shell-copy mt-3 text-sm">{{ weather.headline }}</p>
            </div>
          </div>

          <div class="mt-5 px-4 py-4" :class="feedbackToneClass(primaryFeedback.tone)">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="shell-meta uppercase tracking-[0.24em]">{{ primaryFeedback.label }}</p>
                <p class="mt-2 text-base font-semibold text-ink/90">{{ primaryFeedback.message }}</p>
              </div>
              <p class="max-w-xs text-right text-sm text-current/80">
                {{ primaryFeedback.detail }}
              </p>
            </div>
          </div>

          <div v-if="compactNotice" class="mt-4 flex flex-wrap gap-2">
            <span class="shell-chip">{{ compactNotice }}</span>
          </div>
        </div>

        <aside class="shell-surface-muted px-5 py-5">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="shell-kicker">关键房间</p>
              <p class="shell-copy mt-2 text-sm">只保留当前最值得看的空间。</p>
            </div>
            <span class="shell-chip">
              {{ summaryRooms.length }} 个摘要
            </span>
          </div>

          <div class="mt-5 space-y-3">
            <button
              v-for="room in summaryRooms"
              :key="room.id"
              type="button"
              class="shell-card shell-card-interactive w-full px-4 py-4 text-left"
              :class="room.selected ? 'shell-focus-outline border-[#c9dfdb] bg-[#f1f7f6]' : 'hover:border-slate-200/80 hover:bg-white/88'"
              @click="emit('select-room', room.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-base font-semibold text-ink">{{ room.name }}</p>
                    <span :class="room.online ? 'shell-status shell-status--success' : 'shell-status shell-status--offline'">
                      {{ room.online ? '在线' : '离线提醒' }}
                    </span>
                  </div>
                  <p class="mt-2 text-sm font-medium text-slate-700">{{ room.headline }}</p>
                </div>
                <p class="text-xs text-slate-400">{{ room.statusLine }}</p>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="badge in room.badges.slice(0, 2)"
                  :key="badge"
                  class="shell-chip"
                >
                  {{ badge }}
                </span>
              </div>
            </button>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>
