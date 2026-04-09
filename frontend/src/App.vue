<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'

import DashboardLayout from './components/DashboardLayout.vue'
import FloorPlanStudio from './components/FloorPlanStudio.vue'
import RoomView from './components/RoomView.vue'
import { useSmartHomeStore } from './stores/smartHome'

const smartHomeStore = useSmartHomeStore()
const {
  rooms,
  spatialScene,
  isLoading,
  spatialLoading,
  spatialBusy,
  error,
  spatialError,
  actionError,
  connectionStatus,
  roomCount,
  deviceCount,
  lastMessageAt,
  selectedRoomId,
  selectedRoom,
  selectedSceneRoom,
  selectedMergedRoom,
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
    idle: 'shell-status shell-status--idle',
    connecting: 'shell-status shell-status--pending',
    connected: 'shell-status shell-status--success',
    reconnecting: 'shell-status shell-status--loading',
    disconnected: 'shell-status shell-status--offline',
    error: 'shell-status shell-status--error',
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
    if (!roomId || (!selectedRoom.value && !selectedSceneRoom.value)) {
      return
    }

    // 房间切换后补拉一次该房间设备，保证 RoomView 以 detail 设备为主。
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
      class="shell-state-surface shell-state-surface--error m-4 px-5 py-4 text-sm sm:m-6 xl:m-8"
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
        class="shell-loading-block h-60 animate-pulse"
      />
    </div>

    <div
      v-else-if="rooms.length === 0"
      class="flex min-h-[420px] items-center justify-center px-4 py-8 sm:px-6 xl:min-h-[520px] xl:px-8"
    >
      <div class="shell-empty-state max-w-2xl px-6 py-8 text-center sm:px-8">
        <p class="shell-kicker">Curated Empty State</p>
        <h2 class="shell-title-section mt-4 text-[2rem] sm:text-[2.5rem]">还没有可展示的房间</h2>
        <p class="shell-copy mt-3 sm:text-base">
          当前 Home Assistant 里还没有同步出适合主面板展示的设备。等设备分配到房间并拥有可控能力后，这里会自动出现。
        </p>
      </div>
    </div>

    <div v-else class="pb-4 sm:pb-5 xl:pb-8">
      <FloorPlanStudio
        :scene="spatialScene"
        :selected-room-id="selectedRoomId"
        :spatial-loading="spatialLoading"
        :spatial-busy="spatialBusy"
        :spatial-error="spatialError"
        :action-error="actionError"
        :connection-status="connectionStatus"
        @select-room="smartHomeStore.setSelectedRoom"
      />

      <RoomView
        :room="selectedMergedRoom"
        :action-error="actionError"
      />
    </div>
  </DashboardLayout>
</template>
