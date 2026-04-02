<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'

import DashboardLayout from './components/DashboardLayout.vue'
import RoomView from './components/RoomView.vue'
import { useSmartHomeStore } from './stores/smartHome'

const smartHomeStore = useSmartHomeStore()
const {
  rooms,
  isLoading,
  error,
  actionError,
  connectionStatus,
  roomCount,
  deviceCount,
  lastMessageAt,
  selectedRoomId,
  selectedRoom,
} =
  storeToRefs(smartHomeStore)

const connectionLabel = computed(() => {
  const labels = {
    idle: 'Idle',
    connecting: 'Connecting',
    connected: 'Live',
    reconnecting: 'Reconnecting',
    disconnected: 'Disconnected',
    error: 'Connection issue',
  }

  return labels[connectionStatus.value] ?? 'Unknown'
})

const connectionClass = computed(() => {
  const classes = {
    idle: 'bg-slate-200 text-slate-700',
    connecting: 'bg-amber-100 text-amber-700',
    connected: 'bg-emerald-100 text-emerald-700',
    reconnecting: 'bg-sky-100 text-sky-700',
    disconnected: 'bg-rose-100 text-rose-700',
    error: 'bg-rose-100 text-rose-700',
  }

  return classes[connectionStatus.value] ?? classes.idle
})

const formattedLastMessage = computed(() => {
  if (!lastMessageAt.value) {
    return 'Waiting for updates'
  }

  return `Last update ${new Date(lastMessageAt.value).toLocaleTimeString()}`
})

onMounted(() => {
  smartHomeStore.initialize().catch(() => {})
})

watch(
  selectedRoomId,
  (roomId) => {
    if (!roomId) {
      return
    }

    smartHomeStore.fetchRoomDevices(roomId).catch(() => {})
  },
  { immediate: false },
)

onBeforeUnmount(() => {
  smartHomeStore.disconnectRealtime()
})
</script>

<template>
  <DashboardLayout
    :rooms="rooms"
    :selected-room-id="selectedRoomId"
    :room-count="roomCount"
    :device-count="deviceCount"
    :connection-label="connectionLabel"
    :connection-class="connectionClass"
    :formatted-last-message="formattedLastMessage"
    @select-room="smartHomeStore.setSelectedRoom"
  >
    <div
      v-if="error"
      class="m-6 rounded-[1.75rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 lg:m-8"
    >
      {{ error }}
    </div>

    <div
      v-else-if="isLoading"
      class="grid gap-5 p-6 md:grid-cols-2 lg:p-8"
    >
      <div
        v-for="placeholder in 6"
        :key="placeholder"
        class="h-72 animate-pulse rounded-[2rem] bg-slate-100"
      />
    </div>

    <div
      v-else-if="rooms.length === 0"
      class="flex h-full min-h-[480px] items-center justify-center px-6 py-10 lg:px-8"
    >
      <div class="rounded-[2rem] bg-slate-50 px-8 py-10 text-center">
        <h2 class="text-xl font-semibold text-ink">No rooms found yet</h2>
        <p class="mt-2 text-slate-500">
          Create rooms and devices from the management API, then this dashboard will light up.
        </p>
      </div>
    </div>

    <RoomView
      v-else
      :room="selectedRoom"
      :action-error="actionError"
    />
  </DashboardLayout>
</template>
