<script setup>
import { computed } from 'vue'

const props = defineProps({
  rooms: {
    type: Array,
    required: true,
  },
  selectedRoomId: {
    type: [Number, String],
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

    <div class="relative mx-auto grid max-w-[1780px] gap-5 xl:grid-cols-[350px_minmax(0,1fr)] 2xl:grid-cols-[370px_minmax(0,1fr)] xl:gap-7">
      <aside
        class="shell-surface-strong overflow-hidden xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:rounded-[2.8rem]"
      >
        <div class="flex h-full flex-col">
          <div class="relative border-b border-[rgba(39,53,76,0.08)] px-5 py-5 sm:px-6 sm:py-6">
            <div class="absolute right-0 top-0 h-32 w-32 rounded-full bg-auric/12 opacity-80" />
            <p class="shell-kicker sm:text-xs">
              Domestic Atelier
            </p>
            <h1 class="shell-title-hero mt-4 text-[2rem] sm:text-[2.5rem]">
              现代家庭
              <br>
              控制中枢
            </h1>
            <p class="shell-copy mt-3 max-w-md text-sm">
              让房间导航、实时状态和日常控制保持在一个更克制、更高密度的界面里。
            </p>

            <div class="mt-5 grid grid-cols-3 gap-3">
              <div class="shell-card px-3 py-3">
                <p class="shell-meta text-[10px] uppercase tracking-[0.18em]">Rooms</p>
                <p class="mt-2 text-xl font-semibold text-ink">{{ roomCount }}</p>
              </div>
              <div class="shell-card px-3 py-3 border-[#cfe0dc] bg-[#f1f7f6]">
                <p class="shell-meta text-[10px] uppercase tracking-[0.18em] text-[#2d6660]/70">Devices</p>
                <p class="mt-2 text-xl font-semibold text-ink">{{ deviceCount }}</p>
              </div>
              <div class="shell-card px-3 py-3 text-ink">
                <p class="shell-meta text-[10px] uppercase tracking-[0.18em]">Live</p>
                <div class="mt-2">
                  <span :class="connectionClass">
                    {{ connectionLabel }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="flex min-h-0 flex-1 flex-col px-5 py-5 sm:px-6 sm:py-6">
            <div class="shell-card p-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="shell-kicker text-slate-500">Current Room</p>
                  <p class="font-display mt-3 text-[1.65rem] text-ink sm:text-[1.95rem]">
                    {{ selectedRoom?.name ?? '未选择房间' }}
                  </p>
                  <p class="shell-copy mt-2 text-sm leading-6">
                    {{ selectedRoom?.description || '从左侧快速切换空间，把视线固定在真正常用的设备上。' }}
                  </p>
                </div>
                <div class="shell-card px-3 py-3 text-right">
                  <p class="shell-meta text-[11px] uppercase tracking-[0.18em]">最近同步</p>
                  <p class="mt-2 max-w-[8rem] text-sm font-medium leading-5 text-ink">{{ formattedLastMessage }}</p>
                </div>
              </div>
            </div>

            <div class="mt-5 flex items-center justify-between">
              <p class="shell-kicker text-slate-500">Room Navigator</p>
              <span class="shell-status shell-status--idle">
                {{ props.rooms.length }} Rooms
              </span>
            </div>

            <div class="mt-4 flex gap-3 overflow-x-auto pb-2 snap-x xl:hidden">
              <button
                v-for="room in props.rooms"
                :key="room.id"
                type="button"
                class="shell-card shell-card-interactive min-w-[220px] snap-start px-4 py-4 text-left"
                :class="
                  room.id === props.selectedRoomId
                    ? 'shell-focus-outline border-[#c9dfdb] bg-[#f1f7f6] text-ink'
                    : 'text-ink'
                "
                @click="$emit('select-room', room.id)"
              >
                <p
                  class="shell-meta text-[11px] uppercase tracking-[0.24em]"
                  :class="room.id === props.selectedRoomId ? 'text-lagoon' : ''"
                >
                  {{ room.zone?.name ?? '开发态模板' }}
                </p>
                <p class="font-display mt-3 text-[1.35rem] text-ink">{{ room.name }}</p>
                <p class="shell-copy mt-3 text-sm">
                  {{ room.devices.length }} 个主设备项
                </p>
              </button>
            </div>

            <div class="mt-4 hidden min-h-0 flex-1 xl:block">
              <div class="h-full space-y-3 overflow-y-auto pr-1">
                <button
                  v-for="room in props.rooms"
                  :key="room.id"
                  type="button"
                  class="shell-card shell-card-interactive w-full px-4 py-4 text-left"
                  :class="
                    room.id === props.selectedRoomId
                      ? 'shell-focus-outline border-[#c9dfdb] bg-[#f1f7f6] text-ink'
                      : 'text-ink hover:border-slate-200 hover:bg-white/88'
                  "
                  @click="$emit('select-room', room.id)"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p
                        class="shell-meta text-[11px] uppercase tracking-[0.24em]"
                        :class="room.id === props.selectedRoomId ? 'text-lagoon' : ''"
                      >
                        {{ room.zone?.name ?? '开发态模板' }}
                      </p>
                      <p class="font-display mt-3 text-[1.35rem] text-ink">{{ room.name }}</p>
                    </div>
                    <div
                      class="shell-status"
                      :class="room.id === props.selectedRoomId ? 'shell-status--active' : 'shell-status--idle'"
                    >
                      {{ room.devices.length }}
                    </div>
                  </div>

                  <p class="shell-copy mt-3 text-sm leading-6">
                    {{ room.description || '按 Home Assistant 房间自动整理的家庭控制入口。' }}
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <section class="shell-surface overflow-hidden xl:rounded-[2.8rem]">
        <slot />
      </section>
    </div>
  </main>
</template>
