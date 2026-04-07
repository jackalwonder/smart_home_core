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
} = storeToRefs(smartHomeStore)

const connectionLabel = computed(() => {
  const labels = {
    idle: '待连接',
    connecting: '连接中',
    connected: '实时在线',
    reconnecting: '重连中',
    disconnected: '已断开',
    error: '连接异常',
  }

  return labels[connectionStatus.value] ?? '未知状态'
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
    return '正在等待设备状态更新'
  }

  return `最近同步于 ${new Date(lastMessageAt.value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`
})

onMounted(() => {
  // 首次进入页面时同时拉首屏数据并建立实时连接。
  smartHomeStore.initialize().catch(() => {})
})

watch(
  selectedRoomId,
  (roomId) => {
    if (!roomId) {
      return
    }

    // 房间切换后补拉一次该房间设备，保证详情视图拿到最新控制项。
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
      class="m-4 rounded-[1.9rem] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-700 shadow-sm sm:m-6 xl:m-8"
    >
      {{ error }}
    </div>

    <div
      v-else-if="isLoading"
      class="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:p-8"
    >
      <div
        v-for="placeholder in 5"
        :key="placeholder"
        class="h-60 animate-pulse rounded-[2rem] border border-white/80 bg-white/65 shadow-sm"
      />
    </div>

    <div
      v-else-if="rooms.length === 0"
      class="flex min-h-[420px] items-center justify-center px-4 py-8 sm:px-6 xl:min-h-[520px] xl:px-8"
    >
      <div class="max-w-2xl rounded-[2.2rem] border border-white/80 bg-gradient-to-br from-white via-white/85 to-amber-50/70 px-6 py-8 text-center shadow-sm sm:px-8">
        <p class="text-[11px] uppercase tracking-[0.34em] text-lagoon">Curated Empty State</p>
        <h2 class="font-display mt-4 text-[2rem] text-ink sm:text-[2.5rem]">还没有可展示的房间</h2>
        <p class="mt-3 text-sm leading-6 text-slate-500 sm:text-base">
          当前 Home Assistant 里还没有同步出适合主面板展示的设备。等设备分配到房间并拥有可控能力后，这里会自动出现。
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
