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

const selectedRoom = computed(() => props.rooms.find((room) => room.id === props.selectedRoomId) ?? props.rooms[0] ?? null)
</script>

<template>
  <main class="app-shell relative min-h-screen overflow-hidden px-3 py-3 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute left-[-4rem] top-[-2rem] h-56 w-56 rounded-full bg-auric/20 blur-3xl sm:h-72 sm:w-72" />
      <div class="absolute right-[-3rem] top-[12rem] h-56 w-56 rounded-full bg-lagoon/20 blur-3xl sm:h-80 sm:w-80" />
      <div class="absolute bottom-[-4rem] left-[22%] h-48 w-48 rounded-full bg-obsidian/12 blur-3xl sm:h-72 sm:w-72" />
    </div>

    <div class="relative mx-auto grid max-w-[1720px] gap-5 xl:grid-cols-[390px_minmax(0,1fr)] xl:gap-7">
      <aside
        class="glass-dark overflow-hidden rounded-[2rem] border border-white/10 text-white shadow-float xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:rounded-[2.8rem]"
      >
        <div class="relative border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6">
          <div class="absolute right-0 top-0 h-32 w-32 rounded-full bg-auric/15 blur-3xl" />
          <p class="text-[11px] font-semibold uppercase tracking-[0.42em] text-amber-200/80 sm:text-xs">
            Residence Console
          </p>
          <h1 class="font-display mt-4 text-[2rem] leading-tight text-white sm:text-[2.55rem]">
            更安静、更精致的
            <br>
            家庭控制中心
          </h1>
          <p class="mt-4 max-w-md text-sm leading-6 text-slate-300">
            以房间为入口，把 Home Assistant 里真正适合日常操作的实体提纯为一张高级、克制、可快速浏览的家庭仪表盘。
          </p>

          <div class="mt-5 flex flex-wrap gap-2">
            <span class="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-200">
              Home Assistant
            </span>
            <span class="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-200">
              Realtime Sync
            </span>
            <span class="rounded-full border border-amber-300/20 bg-amber-300/12 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-amber-100">
              Curated Devices
            </span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3 px-5 py-5 sm:px-6">
          <div class="rounded-[1.6rem] border border-white/8 bg-white/6 px-3 py-4 sm:px-4">
            <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">房间</p>
            <p class="mt-2 text-2xl font-semibold text-white">{{ roomCount }}</p>
          </div>
          <div class="rounded-[1.6rem] border border-emerald-300/12 bg-gradient-to-br from-lagoon/90 to-tide/70 px-3 py-4 sm:px-4">
            <p class="text-[11px] uppercase tracking-[0.2em] text-emerald-100/70">设备</p>
            <p class="mt-2 text-2xl font-semibold text-white">{{ deviceCount }}</p>
          </div>
          <div class="rounded-[1.6rem] border border-white/20 bg-white px-3 py-4 text-ink sm:px-4">
            <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500">实时</p>
            <span class="status-pill mt-2" :class="connectionClass">
              {{ connectionLabel }}
            </span>
          </div>
        </div>

        <div class="border-t border-white/10 px-5 py-5 sm:px-6 sm:py-6">
          <div class="rounded-[1.8rem] border border-white/10 bg-white/6 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-[11px] uppercase tracking-[0.28em] text-slate-400">当前房间</p>
                <p class="font-display mt-3 text-[1.7rem] text-white sm:text-[2rem]">
                  {{ selectedRoom?.name ?? '未选择房间' }}
                </p>
                <p class="mt-2 text-sm leading-6 text-slate-300">
                  {{ selectedRoom?.description || '从房间入口切换整屋设备与状态，保证浏览路径稳定且轻量。' }}
                </p>
              </div>
              <div class="rounded-[1.4rem] border border-white/10 bg-black/15 px-3 py-3 text-right">
                <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">最近同步</p>
                <p class="mt-2 max-w-[9rem] text-sm font-medium leading-5 text-slate-100">{{ formattedLastMessage }}</p>
              </div>
            </div>
          </div>

          <div class="mt-6 flex items-center justify-between">
            <p class="text-xs uppercase tracking-[0.32em] text-slate-400">房间导航</p>
            <span class="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] tracking-[0.18em] text-slate-300">
              {{ props.rooms.length }} Rooms
            </span>
          </div>

          <div class="mt-4 flex gap-3 overflow-x-auto pb-2 snap-x xl:hidden">
            <button
              v-for="room in props.rooms"
              :key="room.id"
              type="button"
              class="min-w-[220px] snap-start rounded-[1.7rem] border px-4 py-4 text-left transition duration-300"
              :class="
                room.id === props.selectedRoomId
                  ? 'border-amber-300/35 bg-gradient-to-br from-white to-amber-50 text-ink shadow-lg shadow-amber-950/10'
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
              class="w-full rounded-[1.75rem] border px-4 py-4 text-left transition duration-300"
              :class="
                room.id === props.selectedRoomId
                  ? 'border-amber-300/35 bg-gradient-to-br from-white to-amber-50 text-ink shadow-lg shadow-amber-950/10'
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

      <section
        class="glass-panel overflow-hidden rounded-[2rem] border border-white/70 shadow-float xl:rounded-[2.8rem]"
      >
        <slot />
      </section>
    </div>
  </main>
</template>
