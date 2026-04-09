<script setup>
import { computed, ref, watch } from 'vue'

import FloorMapCanvas from './FloorMapCanvas.vue'
import FloorMapEditorPanel from './FloorMapEditorPanel.vue'
import HomeControlSummary from './HomeControlSummary.vue'
import RoomControlDrawer from './RoomControlDrawer.vue'
import { useFloorMapEditorState } from '../composables/useFloorMapEditorState'
import { useSmartHomeStore } from '../stores/smartHome'
import { buildFloorMapModel, buildRoomMetrics, formatRoomAmbient, getQuickAction } from '../utils/floorMap'

const UI_PREFERENCES_KEY = 'smart-home-cache:floor-map-ui'
const isDevEditorAvailable = import.meta.env.DEV

const props = defineProps({
  scene: {
    type: Object,
    default: () => ({ zone: null, analysis: null, rooms: [] }),
  },
  selectedRoomId: {
    type: [Number, String],
    default: null,
  },
  spatialLoading: {
    type: Boolean,
    default: false,
  },
  spatialBusy: {
    type: Boolean,
    default: false,
  },
  spatialError: {
    type: String,
    default: '',
  },
  actionError: {
    type: String,
    default: '',
  },
  connectionStatus: {
    type: String,
    default: 'idle',
  },
})

const emit = defineEmits(['select-room'])

const smartHomeStore = useSmartHomeStore()
const showSensors = ref(true)
const highlightedDeviceId = ref(null)
const isDrawerOpen = ref(false)
const showEditorPanel = ref(false)

function readUiPreferences() {
  try {
    const rawValue = window.localStorage.getItem(UI_PREFERENCES_KEY)
    return rawValue ? JSON.parse(rawValue) : {}
  } catch (error) {
    console.warn('读取户型偏好失败。', error)
    return {}
  }
}

const initialUiPreferences = readUiPreferences()
if (typeof initialUiPreferences.showSensors === 'boolean') {
  showSensors.value = initialUiPreferences.showSensors
}

const sceneRooms = computed(() => props.scene?.rooms ?? [])
const baseRoomModels = computed(() => buildFloorMapModel(sceneRooms.value, smartHomeStore.pendingDeviceIds))
const floorMapEditor = useFloorMapEditorState(sceneRooms, baseRoomModels)
const editorDraft = computed(() => ({
  roomDrafts: floorMapEditor.roomDrafts.value,
  deviceDrafts: floorMapEditor.deviceDrafts.value,
}))
const previewRoomModels = computed(() =>
  buildFloorMapModel(sceneRooms.value, smartHomeStore.pendingDeviceIds, {
    roomDrafts: editorDraft.value.roomDrafts,
    deviceDrafts: editorDraft.value.deviceDrafts,
  }),
)
const stageRooms = computed(() => (floorMapEditor.enabled.value ? previewRoomModels.value : baseRoomModels.value))
const selectedRoom = computed(() => {
  if (props.selectedRoomId === null || props.selectedRoomId === undefined) {
    return stageRooms.value[0] ?? null
  }

  return stageRooms.value.find((room) => room.id === props.selectedRoomId) ?? null
})
const editorRoom = computed(() =>
  stageRooms.value.find((room) => room.id === (floorMapEditor.selectedRoomId.value ?? props.selectedRoomId))
  ?? (props.selectedRoomId === null || props.selectedRoomId === undefined ? stageRooms.value[0] : null)
  ?? null,
)
const editorRoomDevices = computed(() => editorRoom.value?.devices ?? [])
const editorDevice = computed(() =>
  editorRoomDevices.value.find((device) => device.id === floorMapEditor.selectedDeviceId.value) ?? null,
)
const selectedRoomMetrics = computed(() => buildRoomMetrics(selectedRoom.value, smartHomeStore.pendingDeviceIds))
const selectedRoomAmbient = computed(() => formatRoomAmbient({ metrics: selectedRoomMetrics.value }))
const drawerRoom = computed(() =>
  smartHomeStore.findMergedRoomById(props.selectedRoomId ?? selectedRoom.value?.id ?? null) ?? selectedRoom.value ?? null,
)
const focusedDevice = computed(() =>
  smartHomeStore.findMergedDeviceInRoom(
    drawerRoom.value?.id ?? selectedRoom.value?.id ?? null,
    highlightedDeviceId.value,
  ) ?? null,
)
const stageStateLabel = computed(() => {
  if (props.spatialLoading && sceneRooms.value.length === 0) {
    return 'loading'
  }

  if (props.spatialError) {
    return 'error'
  }

  if (props.connectionStatus === 'disconnected' || props.connectionStatus === 'error') {
    return 'offline'
  }

  if (props.spatialBusy || smartHomeStore.actionFeedback.status === 'pending') {
    return 'pending'
  }

  return 'success'
})

watch(
  selectedRoom,
  (room) => {
    if (!room) {
      highlightedDeviceId.value = null
      isDrawerOpen.value = false
      return
    }

    if (highlightedDeviceId.value && room.devices.some((device) => device.id === highlightedDeviceId.value)) {
      return
    }

    highlightedDeviceId.value = room.devices.find((device) => device.can_control)?.id ?? room.devices[0]?.id ?? null
  },
  { immediate: true },
)

watch(
  () => props.selectedRoomId,
  (roomId) => {
    if (!roomId || !floorMapEditor.enabled.value) {
      return
    }

    floorMapEditor.selectRoom(roomId)
  },
  { immediate: true },
)

watch(showSensors, (value) => {
  try {
    window.localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify({ showSensors: value }))
  } catch (error) {
    console.warn('写入户型偏好失败。', error)
  }
})

watch(
  () => floorMapEditor.enabled.value,
  (enabled) => {
    if (!enabled) {
      showEditorPanel.value = false
    }
  },
)

function openDevice(device) {
  if (!device) {
    return
  }

  emit('select-room', device.room_id ?? selectedRoom.value?.id ?? null)
  highlightedDeviceId.value = device.id
  if (floorMapEditor.enabled.value) {
    floorMapEditor.selectDevice(device.id)
  }
  isDrawerOpen.value = true
}

function closeDeviceDrawer() {
  isDrawerOpen.value = false
}

async function handleQuickAction(device) {
  if (!device) {
    return
  }

  const action = getQuickAction(device)
  if (!action) {
    openDevice(device)
    return
  }

  try {
    highlightedDeviceId.value = device.id
    if (action.type === 'toggle') {
      await smartHomeStore.toggleDevice(device.id)
    } else if (action.type === 'button') {
      await smartHomeStore.pressDeviceButton(device.id)
    }
  } catch (error) {
    console.error('Failed to execute quick action.', error)
  }
}

function stageBadgeClass(value) {
  const map = {
    loading: 'shell-status shell-status--loading',
    success: 'shell-status shell-status--success',
    error: 'shell-status shell-status--error',
    offline: 'shell-status shell-status--offline',
    pending: 'shell-status shell-status--pending',
  }

  return map[value] ?? map.loading
}

function toggleEditorMode() {
  if (!isDevEditorAvailable) {
    return
  }

  const nextValue = !floorMapEditor.enabled.value
  floorMapEditor.setEnabled(nextValue)

  if (nextValue && props.selectedRoomId) {
    floorMapEditor.selectRoom(props.selectedRoomId)
    if (highlightedDeviceId.value) {
      floorMapEditor.selectDevice(highlightedDeviceId.value)
    }
  }

  showEditorPanel.value = false
}

function handleEditorRoomSelection(roomId) {
  emit('select-room', roomId)
  floorMapEditor.selectRoom(roomId)
}

function handleEditorDeviceSelection(deviceId) {
  highlightedDeviceId.value = deviceId
  floorMapEditor.selectDevice(deviceId)
}

function handleStageRoomSelection(roomId) {
  emit('select-room', roomId)

  if (floorMapEditor.enabled.value) {
    floorMapEditor.selectRoom(roomId)
  }
}
</script>

<template>
  <section class="px-4 pt-5 sm:px-5 sm:pt-6 xl:px-10 xl:pt-10">
    <div class="space-y-6">
      <div class="xl:max-w-[96rem]">
        <HomeControlSummary
          :rooms="sceneRooms"
          :selected-room-id="props.selectedRoomId"
          :connection-status="props.connectionStatus"
          :spatial-loading="props.spatialLoading"
          :spatial-busy="props.spatialBusy"
          :spatial-error="props.spatialError"
          @select-room="handleStageRoomSelection"
        />
      </div>

      <div class="shell-surface overflow-hidden px-5 py-5 sm:px-6 sm:py-6 xl:px-7 xl:py-7">

        <div v-if="props.spatialError" class="shell-state-surface shell-state-surface--error text-sm">
          {{ props.spatialError }}
        </div>

        <div
          v-if="props.spatialLoading && sceneRooms.length === 0"
          class="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.58fr)_320px]"
        >
          <div class="shell-loading-block h-[540px] animate-pulse" />
          <div class="space-y-4">
            <div class="shell-loading-block h-44 animate-pulse" />
            <div class="shell-loading-block h-72 animate-pulse" />
          </div>
        </div>

        <div
          v-else-if="sceneRooms.length === 0"
          class="shell-empty-state mt-8 px-6 py-12 text-center text-sm leading-6"
        >
          当前空间场景还没有可渲染的房间。等首轮空间接口返回后，这里会自动回到真实户型视图。
        </div>

        <div v-else class="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.78fr)_320px]">
          <div class="space-y-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <span :class="stageBadgeClass(stageStateLabel)">
                  {{ stageStateLabel }}
                </span>
                <span class="shell-chip">
                  点击快控，长按详情
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="shell-chip shell-chip--interactive"
                  :class="showSensors ? 'border-[#c9dfdb] bg-[#f1f7f6] text-[#2d6660]' : 'border-slate-200/75 bg-white/82 text-slate-500'"
                  @click="showSensors = !showSensors"
                >
                  {{ showSensors ? '隐藏传感器' : '显示传感器' }}
                </button>
                <button
                  v-if="isDevEditorAvailable"
                  type="button"
                  class="shell-chip shell-chip--interactive"
                  :class="floorMapEditor.enabled ? 'border-[#d8c59f] bg-[#faf4e8] text-[#915f18]' : 'border-slate-200/75 bg-white/82 text-slate-500'"
                  @click="toggleEditorMode"
                >
                  {{ floorMapEditor.enabled ? '退出标注' : '标注模式' }}
                </button>
              </div>
            </div>

            <div class="xl:pr-2">
              <FloorMapCanvas
                :rooms="sceneRooms"
                :selected-room-id="props.selectedRoomId"
                :selected-device-id="highlightedDeviceId"
                :pending-device-ids="smartHomeStore.pendingDeviceIds"
                :show-sensors="showSensors"
                :editor-enabled="floorMapEditor.enabled"
                :editor-draft="editorDraft"
                :editor-selected-room-id="floorMapEditor.selectedRoomId"
                :editor-selected-device-id="floorMapEditor.selectedDeviceId"
                :editor-selected-opening-index="floorMapEditor.selectedOpeningIndex"
                @select-room="handleStageRoomSelection"
                @quick-action="handleQuickAction"
                @open-device="openDevice"
                @editor-select-room="handleEditorRoomSelection"
                @editor-select-device="handleEditorDeviceSelection"
                @editor-select-opening="floorMapEditor.selectOpening"
                @editor-update-room-frame="floorMapEditor.updateRoomFrame"
                @editor-update-device-position="floorMapEditor.updateDevicePosition"
                @editor-update-opening="floorMapEditor.updateOpening"
              />
            </div>

            <div
              v-if="floorMapEditor.enabled"
              class="shell-surface-muted px-4 py-3 opacity-85"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="shell-kicker">开发标注</p>
                  <p class="shell-copy mt-1 text-sm">编辑器已启用，面板默认收起，不打断主舞台浏览。</p>
                </div>
                <button
                  type="button"
                  class="shell-chip shell-chip--interactive"
                  :class="showEditorPanel ? 'border-[#d8c59f] bg-[#faf4e8] text-[#915f18]' : 'border-slate-200/75 bg-white/82 text-slate-500'"
                  @click="showEditorPanel = !showEditorPanel"
                >
                  {{ showEditorPanel ? '收起编辑面板' : '展开编辑面板' }}
                </button>
              </div>
            </div>

            <FloorMapEditorPanel
              v-if="floorMapEditor.enabled && showEditorPanel"
              class="opacity-90"
              :selected-room="editorRoom"
              :selected-room-visual-config="floorMapEditor.selectedRoomVisualConfig"
              :selected-room-devices="editorRoomDevices"
              :selected-device="editorDevice"
              :selected-opening-index="floorMapEditor.selectedOpeningIndex"
              :selected-opening="floorMapEditor.selectedOpening"
              :export-status="floorMapEditor.exportStatus"
              :export-json="floorMapEditor.exportJson"
              :has-draft-changes="floorMapEditor.hasDraftChanges"
              :can-restore-import-snapshot="floorMapEditor.canRestoreImportSnapshot"
              :last-import-meta="floorMapEditor.lastImportMeta"
              @select-room="handleEditorRoomSelection"
              @select-device="handleEditorDeviceSelection"
              @select-opening="floorMapEditor.selectOpening"
              @update-room-frame="floorMapEditor.updateRoomFrame"
              @update-room-visual="floorMapEditor.updateRoomVisual"
              @add-opening="floorMapEditor.addOpening"
              @update-opening="floorMapEditor.updateOpening"
              @remove-opening="floorMapEditor.removeOpening"
              @reset-selected-room="floorMapEditor.resetSelectedRoom"
              @reset-selected-device="floorMapEditor.resetSelectedDevice"
              @reset-all="floorMapEditor.resetAll"
              @import-json="floorMapEditor.importFromText"
              @import-file="floorMapEditor.importFromFile"
              @restore-import-snapshot="floorMapEditor.restoreLastImportSnapshot"
              @copy-export="floorMapEditor.copyExport"
              @download-export="floorMapEditor.downloadExport"
            />

            <RoomControlDrawer
              v-if="isDrawerOpen && focusedDevice"
              :room="drawerRoom"
              :device="focusedDevice"
              :action-error="props.actionError"
              @close="closeDeviceDrawer"
              @select-device="openDevice"
            />
          </div>

          <aside class="space-y-4">
            <div class="shell-surface-muted p-5">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="shell-kicker">Room Focus</p>
                  <h3 class="shell-title-section mt-3">{{ selectedRoom?.name ?? '未选择房间' }}</h3>
                  <p class="shell-copy mt-3 text-sm">
                    {{ selectedRoom ? `${selectedRoom.name} 当前 ${selectedRoomAmbient}。` : '从户型图中选择一个房间。' }}
                  </p>
                </div>
                <span class="shell-status shell-status--idle">
                  {{ selectedRoom?.zone?.name ?? props.scene?.zone?.name ?? '默认区域' }}
                </span>
              </div>

              <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                <div class="shell-card px-4 py-3">
                  <p class="shell-meta uppercase tracking-[0.18em]">设备</p>
                  <p class="mt-2 text-xl font-semibold text-ink">{{ selectedRoomMetrics.deviceCount }}</p>
                </div>
                <div class="shell-card px-4 py-3">
                  <p class="shell-meta uppercase tracking-[0.18em]">可控</p>
                  <p class="mt-2 text-xl font-semibold text-ink">{{ selectedRoomMetrics.controllableCount }}</p>
                </div>
                <div class="shell-card px-4 py-3">
                  <p class="shell-meta uppercase tracking-[0.18em]">离线</p>
                  <p class="mt-2 text-xl font-semibold text-ink">{{ selectedRoomMetrics.offlineCount }}</p>
                </div>
                <div class="shell-card px-4 py-3">
                  <p class="shell-meta uppercase tracking-[0.18em]">待处理</p>
                  <p class="mt-2 text-xl font-semibold text-ink">{{ selectedRoomMetrics.pendingCount }}</p>
                </div>
              </div>
            </div>

            <div class="shell-surface-muted p-5">
              <div class="flex items-center justify-between gap-3">
                <p class="shell-kicker text-slate-500">Room Navigator</p>
                <span class="shell-status shell-status--idle">{{ sceneRooms.length }} Rooms</span>
              </div>

              <div class="mt-4 space-y-3">
                <button
                  v-for="room in stageRooms"
                  :key="room.id"
                  type="button"
                  class="shell-card shell-card-interactive w-full px-4 py-4 text-left"
                  :class="room.id === props.selectedRoomId ? 'shell-focus-outline border-[#c9dfdb] bg-[#f1f7f6]' : 'hover:border-slate-200 hover:bg-white/88'"
                  @click="floorMapEditor.enabled ? handleEditorRoomSelection(room.id) : handleStageRoomSelection(room.id)"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="shell-heading">{{ room.name }}</p>
                      <p class="shell-copy mt-1 text-sm">{{ formatRoomAmbient({ metrics: buildRoomMetrics(room, smartHomeStore.pendingDeviceIds) }) }}</p>
                    </div>
                    <span class="shell-status shell-status--idle">
                      {{ room.devices.length }}
                    </span>
                  </div>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </section>
</template>
