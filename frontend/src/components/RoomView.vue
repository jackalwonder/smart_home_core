<script setup>
import DeviceCard from './DeviceCard.vue'

defineProps({
  room: {
    type: Object,
    default: null,
  },
  actionError: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <section class="h-full px-6 py-6 lg:px-8 lg:py-8">
    <template v-if="room">
      <header class="border-b border-slate-200 pb-6">
        <p class="text-sm font-semibold uppercase tracking-[0.28em] text-tide">{{ room.zone.name }}</p>
        <div class="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="text-3xl font-semibold tracking-tight text-ink">{{ room.name }}</h2>
            <p v-if="room.description" class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {{ room.description }}
            </p>
          </div>

          <div class="rounded-[1.75rem] bg-mist px-5 py-4">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-500">Devices in room</p>
            <p class="mt-2 text-3xl font-semibold text-ink">{{ room.devices.length }}</p>
          </div>
        </div>
      </header>

      <div
        v-if="actionError"
        class="mt-5 rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      >
        {{ actionError }}
      </div>

      <div v-if="room.devices.length > 0" class="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        <DeviceCard
          v-for="device in room.devices"
          :key="device.id"
          :device="device"
        />
      </div>

      <div
        v-else
        class="mt-6 rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-slate-500"
      >
        This room is ready, but no devices have been linked yet.
      </div>
    </template>

    <div
      v-else
      class="flex h-full min-h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-500"
    >
      Select a room from the sidebar to inspect live devices.
    </div>
  </section>
</template>
