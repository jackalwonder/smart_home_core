<script setup>
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
    default: 'Unknown',
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
</script>

<template>
  <main class="min-h-screen px-4 py-4 sm:px-6 lg:px-8">
    <div class="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside
        class="overflow-hidden rounded-[2.5rem] border border-white/70 bg-ink text-white shadow-panel"
      >
        <div class="border-b border-white/10 px-6 py-6">
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200/80">
            Smart Home Core
          </p>
          <h1 class="mt-4 text-3xl font-semibold tracking-tight">
            Home control without polling lag.
          </h1>
          <p class="mt-3 text-sm leading-6 text-slate-300">
            Navigate room by room, inspect live telemetry, and trigger device actions from a single panel.
          </p>
        </div>

        <div class="grid grid-cols-3 gap-3 px-6 py-5">
          <div class="rounded-2xl bg-white/8 px-4 py-4">
            <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">Rooms</p>
            <p class="mt-2 text-2xl font-semibold">{{ roomCount }}</p>
          </div>
          <div class="rounded-2xl bg-tide/70 px-4 py-4">
            <p class="text-[11px] uppercase tracking-[0.2em] text-emerald-100/70">Devices</p>
            <p class="mt-2 text-2xl font-semibold">{{ deviceCount }}</p>
          </div>
          <div class="rounded-2xl bg-white px-4 py-4 text-ink">
            <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500">Realtime</p>
            <span class="status-pill mt-2" :class="connectionClass">
              {{ connectionLabel }}
            </span>
          </div>
        </div>

        <div class="border-t border-white/10 px-6 py-5">
          <p class="text-xs uppercase tracking-[0.28em] text-slate-400">Rooms</p>
          <div class="mt-4 flex gap-3 overflow-x-auto pb-1 lg:block lg:space-y-3 lg:overflow-visible lg:pb-0">
            <button
              v-for="room in props.rooms"
              :key="room.id"
              type="button"
              class="min-w-[220px] rounded-[1.5rem] border px-4 py-4 text-left transition duration-300 lg:w-full"
              :class="
                room.id === props.selectedRoomId
                  ? 'border-emerald-300 bg-white text-ink shadow-lg shadow-emerald-950/10'
                  : 'border-white/10 bg-white/5 text-slate-200 hover:border-white/25 hover:bg-white/10'
              "
              @click="$emit('select-room', room.id)"
            >
              <p
                class="text-[11px] uppercase tracking-[0.24em]"
                :class="room.id === props.selectedRoomId ? 'text-tide' : 'text-slate-400'"
              >
                {{ room.zone.name }}
              </p>
              <p class="mt-2 text-lg font-semibold">
                {{ room.name }}
              </p>
              <p class="mt-2 text-sm" :class="room.id === props.selectedRoomId ? 'text-slate-500' : 'text-slate-400'">
                {{ room.devices.length }} devices
              </p>
            </button>
          </div>

          <p class="mt-5 text-sm text-slate-400">
            {{ formattedLastMessage }}
          </p>
        </div>
      </aside>

      <section
        class="overflow-hidden rounded-[2.5rem] border border-white/70 bg-white/80 shadow-panel backdrop-blur"
      >
        <slot />
      </section>
    </div>
  </main>
</template>
