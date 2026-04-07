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
  roomCount: {
    type: Number,
    default: 0,
  },
  deviceCount: {
    type: Number,
    default: 0,
  },
  connectionLabel: {
    type: String,
    default: '未知状态',
  },
  connectionClass: {
    type: String,
    default: '',
  },
  formattedLastMessage: {
    type: String,
    default: '',
  },
})

defineEmits(['select-room'])

// 侧边栏允许“未显式选择”状态，因此这里提供一个首房间兜底。
const selectedRoom = computed(() => props.rooms.find((room) => room.id === props.selectedRoomId) ?? props.rooms[0] ?? null)
</script>

<template>
  <main class="app-shell relative min-h-screen overflow-hidden px-3 py-3 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute left-[-6rem] top-[-4rem] h-72 w-72 rounded-full bg-auric/20 blur-3xl sm:h-[24rem] sm:w-[24rem]" />
      <div class="absolute right-[-5rem] top-[10rem] h-72 w-72 rounded-full bg-lagoon/20 blur-3xl sm:h-[26rem] sm:w-[26rem]" />
      <div class="absolute bottom-[-5rem] left-[18%] h-64 w-64 rounded-full bg-obsidian/10 blur-3xl sm:h-[22rem] sm:w-[22rem]" />
    </div>

    <div class="relative mx-auto grid max-w-[1780px] gap-5 xl:grid-cols-[410px_minmax(0,1fr)] xl:gap-7">
      <aside
        class="glass-dark overflow-hidden rounded-[2rem] border border-white/10 text-white shadow-float xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:rounded-[2.8rem]"
      >
        <div class="relative border-b border-white/10 px-5 py-6 sm:px-6 sm:py-7">
          <div class="absolute right-0 top-0 h-32 w-32 rounded-full bg-auric/15 blur-3xl" />
          <p class="text-[11px] font-semibold uppercase tracking-[0.42em] text-amber-200/80 sm:text-xs">
            Domestic Atelier
          </p>
          <h1 class="font-display mt-4 text-[2.2rem] leading-[0.95] text-white sm:text-[2.9rem]">
            更沉稳的
            <br>
            现代家庭控制台
          </h1>
          <p class="mt-4 max-w-md text-sm leading-6 text-slate-300">
            以房间为主线，把 Home Assistant 的原始实体提炼成一张更安静、更有秩序的居家操作界面。视觉上更像高端酒店中控，而不是普通设备列表。
          </p>

          <div class="mt-6 grid gap-3 rounded-[1.8rem] border border-white/10 bg-white/5 p-4">
            <div class="flex items-center justify-between text-[11px] uppercase tracking-[0.28em] text-slate-400">
              <span>Residence Status</span>
              <span>Live</span>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="rounded-[1.2rem] border border-white/10 bg-white/6 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">Rooms</p>
                <p class="mt-2 text-2xl font-semibold text-white">{{ roomCount }}</p>
              </div>
              <div class="rounded-[1.2rem] border border-emerald-300/15 bg-gradient-to-br from-lagoon/90 to-tide/70 px-3 py-3">
                <p class="text-[10px] uppercase tracking-[0.18em] text-emerald-100/70">Devices</p>
                <p class="mt-2 text-2xl font-semibold text-white">{{ deviceCount }}</p>
              </div>
              <div class="rounded-[1.2rem] border border-white/20 bg-white px-3 py-3 text-ink">
                <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">Realtime</p>
                <div class="mt-2">
                  <span class="status-pill" :class="connectionClass">
                    {{ connectionLabel }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-white/10 px-5 py-5 sm:px-6 sm:py-6">
          <div class="rounded-[2rem] border border-white/10 bg-white/6 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-[11px] uppercase tracking-[0.28em] text-slate-400">Current Room</p>
                <p class="font-display mt-3 text-[1.8rem] text-white sm:text-[2.15rem]">
                  {{ selectedRoom?.name ?? '未选择房间' }}
                </p>
                <p class="mt-2 text-sm leading-6 text-slate-300">
                  {{ selectedRoom?.description || '从房间入口切换整屋设备和实时控制，保持浏览路径稳定、聚焦、低干扰。' }}
                </p>
              </div>
              <div class="rounded-[1.4rem] border border-white/10 bg-black/15 px-3 py-3 text-right">
                <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">最近同步</p>
                <p class="mt-2 max-w-[9rem] text-sm font-medium leading-5 text-slate-100">{{ formattedLastMessage }}</p>
              </div>
            </div>
          </div>

          <div class="mt-6 flex items-center justify-between">
            <p class="text-xs uppercase tracking-[0.32em] text-slate-400">Room Navigator</p>
            <span class="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] tracking-[0.18em] text-slate-300">
              {{ props.rooms.length }} Rooms
            </span>
          </div>

          <div class="mt-4 flex gap-3 overflow-x-auto pb-2 snap-x xl:hidden">
            <button
              v-for="room in props.rooms"
              :key="room.id"
              type="button"
              class="min-w-[220px] snap-start rounded-[1.8rem] border px-4 py-4 text-left transition duration-300"
              :class="
                room.id === props.selectedRoomId
                  ? 'border-amber-300/40 bg-gradient-to-br from-white to-amber-50 text-ink shadow-lg shadow-amber-950/10'
                  : 'border-white/10 bg-white/5 text-slate-200'
              "
              @click="$emit('select-room', room.id)"
            >
              <p
                class="text-[11px] uppercase tracking-[0.24em]"
                :class="room.id === props.selectedRoomId ? 'text-lagoon' : 'text-slate-400'"
              >
                {{ room.zone.name }}
              </p>
              <p class="font-display mt-3 text-[1.35rem]">{{ room.name }}</p>
              <p class="mt-3 text-sm" :class="room.id === props.selectedRoomId ? 'text-slate-500' : 'text-slate-400'">
                {{ room.devices.length }} 个主设备项
              </p>
            </button>
          </div>

          <div class="mt-4 hidden space-y-3 xl:block">
            <button
              v-for="room in props.rooms"
              :key="room.id"
              type="button"
              class="w-full rounded-[1.9rem] border px-4 py-4 text-left transition duration-300"
              :class="
                room.id === props.selectedRoomId
                  ? 'border-amber-300/40 bg-gradient-to-br from-white via-white to-amber-50 text-ink shadow-lg shadow-amber-950/10'
                  : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10'
              "
              @click="$emit('select-room', room.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p
                    class="text-[11px] uppercase tracking-[0.24em]"
                    :class="room.id === props.selectedRoomId ? 'text-lagoon' : 'text-slate-400'"
                  >
                    {{ room.zone.name }}
                  </p>
                  <p class="font-display mt-3 text-[1.45rem]">{{ room.name }}</p>
                </div>
                <div
                  class="rounded-full px-3 py-1 text-xs font-semibold"
                  :class="room.id === props.selectedRoomId ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-200'"
                >
                  {{ room.devices.length }}
                </div>
              </div>

              <p class="mt-3 text-sm leading-6" :class="room.id === props.selectedRoomId ? 'text-slate-500' : 'text-slate-400'">
                {{ room.description || '按 Home Assistant 房间自动整理的家庭控制入口。' }}
              </p>
            </button>
          </div>
        </div>
      </aside>

      <section class="glass-panel overflow-hidden rounded-[2rem] border border-white/60 xl:rounded-[2.8rem]">
        <slot />
      </section>
    </div>
  </main>
</template>
