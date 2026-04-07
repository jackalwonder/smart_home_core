<script setup>
import { computed } from 'vue'

const props = defineProps({
  rooms: {
    type: Array,
    required: true,
  },
  selectedRoomId: {
    type: Number,
    default: null,
  },
  connectionLabel: {
    type: String,
    default: '未知状态',
  },
  formattedLastMessage: {
    type: String,
    default: '',
  },
})

defineEmits(['select-room'])

const ACTIVE_STATES = new Set(['on', 'online', 'playing', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'auto'])

const ROOM_THEMES = [
  {
    accent: '#0c6e73',
    top: 'rgba(12, 110, 115, 0.24)',
    side: 'rgba(12, 110, 115, 0.32)',
    edge: 'rgba(12, 110, 115, 0.3)',
    glow: 'rgba(12, 110, 115, 0.18)',
    chipBg: 'rgba(12, 110, 115, 0.12)',
    chipText: '#0c6e73',
  },
  {
    accent: '#c99742',
    top: 'rgba(201, 151, 66, 0.26)',
    side: 'rgba(201, 151, 66, 0.34)',
    edge: 'rgba(201, 151, 66, 0.28)',
    glow: 'rgba(201, 151, 66, 0.18)',
    chipBg: 'rgba(201, 151, 66, 0.14)',
    chipText: '#915f18',
  },
  {
    accent: '#28538b',
    top: 'rgba(40, 83, 139, 0.24)',
    side: 'rgba(40, 83, 139, 0.34)',
    edge: 'rgba(40, 83, 139, 0.28)',
    glow: 'rgba(40, 83, 139, 0.16)',
    chipBg: 'rgba(40, 83, 139, 0.12)',
    chipText: '#28538b',
  },
  {
    accent: '#8f5d7a',
    top: 'rgba(143, 93, 122, 0.25)',
    side: 'rgba(143, 93, 122, 0.34)',
    edge: 'rgba(143, 93, 122, 0.28)',
    glow: 'rgba(143, 93, 122, 0.16)',
    chipBg: 'rgba(143, 93, 122, 0.12)',
    chipText: '#7d4968',
  },
  {
    accent: '#5f7c43',
    top: 'rgba(95, 124, 67, 0.24)',
    side: 'rgba(95, 124, 67, 0.34)',
    edge: 'rgba(95, 124, 67, 0.28)',
    glow: 'rgba(95, 124, 67, 0.16)',
    chipBg: 'rgba(95, 124, 67, 0.12)',
    chipText: '#4f6736',
  },
]

const POD_OFFSETS = ['0rem', '1.35rem', '-0.5rem', '1rem', '-0.75rem', '1.1rem']

const currentRoomId = computed(() => props.selectedRoomId ?? props.rooms[0]?.id ?? null)
const selectedRoom = computed(() => props.rooms.find((room) => room.id === currentRoomId.value) ?? props.rooms[0] ?? null)

const overviewRooms = computed(() =>
  props.rooms.map((room, index) => {
    const controllableCount = room.devices.filter((device) => device.can_control).length
    const telemetryCount = room.devices.filter(
      (device) => !device.can_control && ['temperature', 'humidity', 'moisture'].includes(device.device_class ?? ''),
    ).length
    const activeCount = room.devices.filter((device) => {
      const state = `${device.raw_state ?? device.current_status ?? ''}`.trim().toLowerCase()
      return ACTIVE_STATES.has(state)
    }).length

    const tags = collectRoomTags(room).slice(0, 3)
    const theme = ROOM_THEMES[index % ROOM_THEMES.length]

    return {
      ...room,
      controllableCount,
      telemetryCount,
      activeCount,
      statusLabel: room.id === currentRoomId.value ? '当前聚焦' : activeCount > 0 ? `${activeCount} 项活跃` : '待机中',
      summaryText:
        room.description
        || `${controllableCount} 个可控项，${telemetryCount} 个监测点，适合做空间视角下的快速操作。`,
      tags,
      styleVars: {
        '--pod-accent': theme.accent,
        '--pod-top': theme.top,
        '--pod-side': theme.side,
        '--pod-edge': theme.edge,
        '--pod-glow': theme.glow,
        '--pod-chip-bg': theme.chipBg,
        '--pod-chip-text': theme.chipText,
        '--pod-offset': POD_OFFSETS[index % POD_OFFSETS.length],
      },
    }
  }),
)

const activeRoomCount = computed(() => overviewRooms.value.filter((room) => room.activeCount > 0).length)
const controllableRoomCount = computed(() => overviewRooms.value.filter((room) => room.controllableCount > 0).length)

const selectedRoomTags = computed(() => collectRoomTags(selectedRoom.value).slice(0, 4))

const selectedRoomStory = computed(() => {
  if (!selectedRoom.value) {
    return '选择任意房间后，这里会展示该空间的聚焦摘要与扩展方向。'
  }

  const controllableCount = selectedRoom.value.devices.filter((device) => device.can_control).length
  const activeCount = selectedRoom.value.devices.filter((device) => {
    const state = `${device.raw_state ?? device.current_status ?? ''}`.trim().toLowerCase()
    return ACTIVE_STATES.has(state)
  }).length

  return `${selectedRoom.value.name} 当前有 ${controllableCount} 个可控实体，${activeCount} 个处于活跃状态。这个空间总览模块已经可以作为“全屋快速切换 + 状态扫视”的入口。`
})

const capabilityModules = [
  {
    title: '真实户型坐标',
    description: '已经支持上传户型图并自动生成初始布局，后续还能继续拖拽和精修。',
  },
  {
    title: '环境热力层',
    description: '温度、湿度和占用状态已经叠到了房间层上，适合快速判断空间状态。',
  },
  {
    title: '设备定位点',
    description: '现在可以把设备继续放进房间舱体里，并直接从空间图上切换设备状态。',
  },
]

function collectRoomTags(room) {
  if (!room) {
    return []
  }

  const tags = []
  const devices = room.devices ?? []

  if (devices.some((device) => device.entity_domain === 'climate')) {
    tags.push('环境')
  }

  if (devices.some((device) => device.entity_domain === 'media_player' || ['tv', 'media', 'speaker'].includes(device.appliance_type))) {
    tags.push('影音')
  }

  if (devices.some((device) => ['light', 'switch'].includes(device.entity_domain) || device.device_type === 'mijia_light')) {
    tags.push('照明')
  }

  if (devices.some((device) => ['temperature', 'humidity', 'moisture'].includes(device.device_class ?? ''))) {
    tags.push('监测')
  }

  if (devices.some((device) => ['router', 'nas', 'computer', 'camera'].includes(device.appliance_type))) {
    tags.push('网络')
  }

  if (tags.length === 0) {
    tags.push('基础房间')
  }

  return tags
}
</script>

<template>
  <section class="px-4 pt-4 sm:px-5 sm:pt-5 xl:px-8 xl:pt-8">
    <div class="relative overflow-hidden rounded-[2rem] border border-white/70 bg-gradient-to-br from-white/92 via-white/86 to-stone-50/74 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
      <div class="pointer-events-none absolute inset-0">
        <div class="absolute left-[-4rem] top-[-5rem] h-48 w-48 rounded-full bg-lagoon/10 blur-3xl sm:h-64 sm:w-64" />
        <div class="absolute right-[-3rem] top-[15%] h-52 w-52 rounded-full bg-auric/16 blur-3xl sm:h-72 sm:w-72" />
        <div class="absolute bottom-[-4rem] left-[35%] h-44 w-44 rounded-full bg-sky-200/30 blur-3xl sm:h-56 sm:w-56" />
      </div>

      <div class="relative">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div class="max-w-3xl">
            <p class="text-xs font-semibold uppercase tracking-[0.34em] text-lagoon sm:text-sm">Spatial Overview</p>
            <h2 class="font-display mt-3 text-[2.1rem] leading-[0.96] text-ink sm:text-[2.6rem] xl:text-[3rem]">
              全屋可视化总览舱
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
              这是一层建立在现有房间数据上的空间总览地图。它负责快速切换房间、扫视设备密度和判断活跃空间，下面的工作台已经能继续进入真实户型编辑与设备控制。
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-3 xl:min-w-[480px]">
            <div class="control-surface rounded-[1.4rem] px-4 py-4">
              <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">空间数</p>
              <p class="mt-2 text-2xl font-semibold text-ink">{{ overviewRooms.length }}</p>
            </div>
            <div class="control-surface rounded-[1.4rem] px-4 py-4">
              <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">活跃房间</p>
              <p class="mt-2 text-2xl font-semibold text-ink">{{ activeRoomCount }}</p>
            </div>
            <div class="control-surface rounded-[1.4rem] px-4 py-4">
              <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">可控空间</p>
              <p class="mt-2 text-2xl font-semibold text-ink">{{ controllableRoomCount }}</p>
            </div>
          </div>
        </div>

        <div class="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_330px]">
          <div class="home-stage rounded-[2rem] border border-white/60 bg-gradient-to-br from-[#f7f1e8] via-white/70 to-[#f0ebe3] p-4 sm:p-5">
            <div class="home-stage__floor" />
            <div class="home-stage__floor home-stage__floor--grid" />

            <div class="relative z-10 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <button
                v-for="room in overviewRooms"
                :key="room.id"
                type="button"
                class="room-pod text-left transition duration-300"
                :class="{ 'is-current': room.id === currentRoomId }"
                :style="room.styleVars"
                :aria-pressed="room.id === currentRoomId"
                @click="$emit('select-room', room.id)"
              >
                <span class="room-pod__shadow" />
                <span class="room-pod__shell" />

                <div class="room-pod__content">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">{{ room.zone.name }}</p>
                      <h3 class="font-display mt-3 truncate text-[1.6rem] leading-none text-ink">{{ room.name }}</h3>
                    </div>
                    <span class="room-pod__status">
                      {{ room.statusLabel }}
                    </span>
                  </div>

                  <p class="mt-3 min-h-[3.5rem] text-sm leading-6 text-slate-500">
                    {{ room.summaryText }}
                  </p>

                  <div class="mt-3 flex flex-wrap gap-2">
                    <span
                      v-for="tag in room.tags"
                      :key="tag"
                      class="room-pod__tag"
                    >
                      {{ tag }}
                    </span>
                  </div>

                  <div class="mt-4 grid grid-cols-3 gap-2">
                    <div class="room-pod__metric">
                      <p class="room-pod__metric-label">设备</p>
                      <p class="room-pod__metric-value">{{ room.devices.length }}</p>
                    </div>
                    <div class="room-pod__metric">
                      <p class="room-pod__metric-label">可控</p>
                      <p class="room-pod__metric-value">{{ room.controllableCount }}</p>
                    </div>
                    <div class="room-pod__metric">
                      <p class="room-pod__metric-label">监测</p>
                      <p class="room-pod__metric-value">{{ room.telemetryCount }}</p>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <aside class="glass-soft rounded-[2rem] p-5 sm:p-6">
            <p class="text-[11px] uppercase tracking-[0.28em] text-lagoon">Room Spotlight</p>
            <h3 class="font-display mt-4 text-[2rem] leading-none text-ink">
              {{ selectedRoom?.name ?? '未选择房间' }}
            </h3>
            <p class="mt-3 text-sm leading-6 text-slate-500">
              {{ selectedRoomStory }}
            </p>

            <div class="mt-5 grid grid-cols-3 gap-3">
              <div class="rounded-[1.2rem] border border-slate-200/80 bg-white/75 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">在线态</p>
                <p class="mt-2 text-sm font-semibold text-ink">{{ connectionLabel }}</p>
              </div>
              <div class="rounded-[1.2rem] border border-slate-200/80 bg-white/75 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">同步</p>
                <p class="mt-2 text-sm font-semibold text-ink">{{ formattedLastMessage || '等待首条消息' }}</p>
              </div>
              <div class="rounded-[1.2rem] border border-slate-200/80 bg-white/75 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">区域</p>
                <p class="mt-2 text-sm font-semibold text-ink">{{ selectedRoom?.zone.name ?? '--' }}</p>
              </div>
            </div>

            <div class="mt-5 flex flex-wrap gap-2">
              <span
                v-for="tag in selectedRoomTags"
                :key="tag"
                class="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm text-slate-600"
              >
                {{ tag }}
              </span>
            </div>

            <div class="mt-6">
              <p class="text-[11px] uppercase tracking-[0.28em] text-slate-500">当前能力</p>
              <div class="mt-3 space-y-3">
                <div
                  v-for="module in capabilityModules"
                  :key="module.title"
                  class="rounded-[1.4rem] border border-slate-200/80 bg-white/80 px-4 py-4"
                >
                  <p class="text-sm font-semibold text-ink">{{ module.title }}</p>
                  <p class="mt-2 text-sm leading-6 text-slate-500">{{ module.description }}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-stage {
  position: relative;
  overflow: hidden;
  min-height: 30rem;
}

.home-stage__floor {
  position: absolute;
  inset: 30% 4% 2% 4%;
  border-radius: 2.4rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.75), rgba(232, 224, 213, 0.82));
  border: 1px solid rgba(39, 53, 76, 0.06);
  box-shadow: 0 50px 80px rgba(42, 32, 17, 0.12);
  transform: perspective(1600px) rotateX(68deg) rotateZ(-27deg);
  transform-origin: center;
}

.home-stage__floor--grid {
  background-image:
    linear-gradient(rgba(17, 24, 39, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(17, 24, 39, 0.08) 1px, transparent 1px);
  background-size: 62px 62px;
  mix-blend-mode: multiply;
  opacity: 0.7;
}

.room-pod {
  position: relative;
  min-height: 15.5rem;
}

.room-pod__shadow {
  position: absolute;
  left: 14%;
  right: 14%;
  bottom: 10%;
  height: 2.8rem;
  border-radius: 999px;
  background: var(--pod-glow);
  filter: blur(18px);
  opacity: 0.95;
}

.room-pod__shell {
  position: absolute;
  inset: 18% 6% 4% 6%;
  border-radius: 1.9rem;
  border: 1px solid var(--pod-edge);
  background:
    linear-gradient(135deg, var(--pod-top), rgba(255, 255, 255, 0.92) 58%, rgba(255, 255, 255, 0.78) 100%);
  box-shadow:
    0 34px 52px rgba(30, 41, 59, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  transform: perspective(1000px) rotateX(68deg) rotateZ(-28deg);
  transform-origin: center;
  transition: transform 240ms ease, box-shadow 240ms ease, border-color 240ms ease;
}

.room-pod__shell::before {
  content: "";
  position: absolute;
  left: 10%;
  right: 5%;
  bottom: -1.15rem;
  height: 1.65rem;
  border-radius: 0 0 1.5rem 1.5rem;
  background: linear-gradient(180deg, var(--pod-side), rgba(21, 31, 47, 0.06));
  transform: skewX(-28deg);
  opacity: 0.92;
}

.room-pod__shell::after {
  content: "";
  position: absolute;
  inset: 10% 14% auto auto;
  width: 42%;
  height: 18%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.95), transparent);
  filter: blur(10px);
  opacity: 0.85;
}

.room-pod__content {
  position: relative;
  z-index: 1;
  border-radius: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(250, 247, 242, 0.82));
  box-shadow: 0 20px 36px rgba(30, 41, 59, 0.1);
  padding: 1.15rem 1.1rem 1.2rem;
  backdrop-filter: blur(20px);
  transition: transform 240ms ease, border-color 240ms ease, box-shadow 240ms ease;
}

.room-pod__status {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--pod-chip-bg);
  color: var(--pod-chip-text);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  padding: 0.45rem 0.75rem;
  white-space: nowrap;
}

.room-pod__tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--pod-chip-bg);
  color: var(--pod-chip-text);
  font-size: 0.78rem;
  padding: 0.38rem 0.75rem;
}

.room-pod__metric {
  border-radius: 1rem;
  border: 1px solid rgba(39, 53, 76, 0.08);
  background: rgba(255, 255, 255, 0.7);
  padding: 0.7rem 0.75rem;
}

.room-pod__metric-label {
  color: rgb(100 116 139);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.room-pod__metric-value {
  color: rgb(21 31 47);
  font-size: 1.15rem;
  font-weight: 600;
  margin-top: 0.35rem;
}

.room-pod:hover .room-pod__shell,
.room-pod.is-current .room-pod__shell {
  transform: perspective(1000px) rotateX(68deg) rotateZ(-28deg) translate3d(0, -0.65rem, 0);
  box-shadow:
    0 44px 62px rgba(30, 41, 59, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
}

.room-pod:hover .room-pod__content,
.room-pod.is-current .room-pod__content {
  transform: translateY(-0.25rem);
  border-color: color-mix(in srgb, var(--pod-accent) 24%, white);
  box-shadow: 0 28px 42px rgba(30, 41, 59, 0.14);
}

.room-pod.is-current .room-pod__content {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(249, 246, 240, 0.86));
}

@media (min-width: 1024px) {
  .room-pod {
    transform: translateY(var(--pod-offset));
  }

  .room-pod:hover,
  .room-pod.is-current {
    transform: translateY(calc(var(--pod-offset) - 0.35rem));
  }
}

@media (max-width: 767px) {
  .home-stage {
    min-height: auto;
  }

  .home-stage__floor {
    inset: 58% -12% -16% -12%;
  }

  .room-pod {
    min-height: 14.5rem;
  }
}
</style>
