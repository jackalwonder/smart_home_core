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
  <main class="app-shell min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
    <div class="mx-auto grid max-w-[1680px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-6">
      <aside
        class="overflow-hidden rounded-[2rem] border border-white/70 bg-ink text-white shadow-panel xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:rounded-[2.5rem]"
      >
        <div class="border-b border-white/10 px-5 py-5 sm:px-6 sm:py-6">
          <p class="text-[11px] font-semibold uppercase tracking-[0.35em] text-emerald-200/80 sm:text-xs">
            智能家居总览
          </p>
          <h1 class="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            按房间管理设备，在一个面板里完成查看与控制。
          </h1>
          <p class="mt-3 max-w-md text-sm leading-6 text-slate-300">
            这套面板会自动展示 Home Assistant 已同步、且适合家庭控制的主设备。手机上便于单手操作，平板和电脑上也能快速切换房间。
          </p>
        </div>

        <div class="grid grid-cols-3 gap-3 px-5 py-5 sm:px-6">
          <div class="rounded-2xl bg-white/8 px-3 py-4 sm:px-4">
            <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">房间</p>
            <p class="mt-2 text-2xl font-semibold">{{ roomCount }}</p>
          </div>
          <div class="rounded-2xl bg-tide/70 px-3 py-4 sm:px-4">
            <p class="text-[11px] uppercase tracking-[0.2em] text-emerald-100/70">设备</p>
            <p class="mt-2 text-2xl font-semibold">{{ deviceCount }}</p>
          </div>
          <div class="rounded-2xl bg-white px-3 py-4 text-ink sm:px-4">
            <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500">实时</p>
            <span class="status-pill mt-2" :class="connectionClass">
              {{ connectionLabel }}
            </span>
          </div>
        </div>

        <div class="border-t border-white/10 px-5 py-5 sm:px-6 sm:py-6">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs uppercase tracking-[0.28em] text-slate-400">当前房间</p>
              <p class="mt-2 text-xl font-semibold text-white sm:text-2xl">
                {{ selectedRoom?.name ?? '未选择房间' }}
              </p>
            </div>
            <div class="rounded-2xl bg-white/8 px-3 py-2 text-right">
              <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">最近同步</p>
              <p class="mt-2 text-sm font-medium text-slate-100">{{ formattedLastMessage }}</p>
            </div>
          </div>

          <div class="mt-5">
            <p class="text-xs uppercase tracking-[0.28em] text-slate-400">房间导航</p>

            <div class="mt-4 flex gap-3 overflow-x-auto pb-2 snap-x xl:hidden">
              <button
                v-for="room in props.rooms"
                :key="room.id"
                type="button"
                class="min-w-[190px] snap-start rounded-[1.5rem] border px-4 py-4 text-left transition duration-300"
                :class="
                  room.id === props.selectedRoomId
                    ? 'border-emerald-300 bg-white text-ink shadow-lg shadow-emerald-950/10'
                    : 'border-white/10 bg-white/5 text-slate-200'
                "
                @click="$emit('select-room', room.id)"
              >
                <p
                  class="text-[11px] uppercase tracking-[0.24em]"
                  :class="room.id === props.selectedRoomId ? 'text-tide' : 'text-slate-400'"
                >
                  {{ room.zone.name }}
                </p>
                <p class="mt-2 text-lg font-semibold">{{ room.name }}</p>
                <p class="mt-2 text-sm" :class="room.id === props.selectedRoomId ? 'text-slate-500' : 'text-slate-400'">
                  {{ room.devices.length }} 个主设备项
                </p>
              </button>
            </div>

            <div class="mt-4 hidden space-y-3 xl:block">
              <button
                v-for="room in props.rooms"
                :key="room.id"
                type="button"
                class="w-full rounded-[1.6rem] border px-4 py-4 text-left transition duration-300"
                :class="
                  room.id === props.selectedRoomId
                    ? 'border-emerald-300 bg-white text-ink shadow-lg shadow-emerald-950/10'
                    : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/20 hover:bg-white/10'
                "
                @click="$emit('select-room', room.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p
                      class="text-[11px] uppercase tracking-[0.24em]"
                      :class="room.id === props.selectedRoomId ? 'text-tide' : 'text-slate-400'"
                    >
                      {{ room.zone.name }}
                    </p>
                    <p class="mt-2 text-lg font-semibold">{{ room.name }}</p>
                  </div>
                  <div
                    class="rounded-full px-3 py-1 text-xs font-semibold"
                    :class="room.id === props.selectedRoomId ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-200'"
                  >
                    {{ room.devices.length }}
                  </div>
                </div>

                <p class="mt-3 text-sm" :class="room.id === props.selectedRoomId ? 'text-slate-500' : 'text-slate-400'">
                  {{ room.description || '按 Home Assistant 房间自动整理的家庭控制入口。' }}
                </p>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <section
        class="overflow-hidden rounded-[2rem] border border-white/70 bg-white/82 shadow-panel backdrop-blur xl:rounded-[2.5rem]"
      >
        <slot />
      </section>
    </div>
  </main>
</template>
