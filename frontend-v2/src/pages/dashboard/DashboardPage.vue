<script setup>
import { computed, onBeforeUnmount, watch } from 'vue'

import AppTopBar from '../../features/topbar/AppTopBar.vue'
import BottomStatsBar from '../../features/bottom-stats/BottomStatsBar.vue'
import ClimateCategoryModal from '../../features/category-modals/ClimateCategoryModal.vue'
import DeviceCategoryModal from '../../features/category-modals/DeviceCategoryModal.vue'
import EventConsole from '../../features/event-console/EventConsole.vue'
import FloorplanStage from '../../features/floorplan-stage/FloorplanStage.vue'
import RightSidebar from '../../features/right-sidebar/RightSidebar.vue'
import { derivePanelKind } from '../../domain/scene/sceneAdapters'
import { useAuthStore } from '../../stores/auth'
import { useDashboardStore } from '../../stores/dashboard'
import { useSceneStore } from '../../stores/scene'

const authStore = useAuthStore()
const dashboardStore = useDashboardStore()
const sceneStore = useSceneStore()

const selectedStageDevice = computed(() => sceneStore.getDevice(dashboardStore.selectedStageDeviceId))
const selectedPanelKind = computed(() => derivePanelKind(selectedStageDevice.value))

const activeDeviceModalDevices = computed(() =>
  dashboardStore.activeCategory === 'device' && selectedStageDevice.value ? [selectedStageDevice.value] : [],
)

const activeClimateModalDevices = computed(() =>
  dashboardStore.activeCategory === 'climate' && selectedStageDevice.value ? [selectedStageDevice.value] : [],
)

const activeDeviceModalTitle = computed(() => selectedStageDevice.value?.name || '设备控制')
const activeClimateModalTitle = computed(() => selectedStageDevice.value?.name || '温控控制')

watch(
  () => authStore.isAuthenticated,
  async (isAuthenticated) => {
    if (!isAuthenticated) {
      sceneStore.disconnectRealtime()
      return
    }

    try {
      await sceneStore.loadScene()
      sceneStore.connectRealtime()
    } catch {
      sceneStore.disconnectRealtime()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  sceneStore.disconnectRealtime()
})

function handleStageDeviceInteract(hotspot) {
  const device = sceneStore.getDevice(hotspot.deviceId)
  dashboardStore.focusDevice(hotspot.deviceId)

  if (!device) {
    return
  }

  if (hotspot.interactionKind === 'direct') {
    sceneStore.controlDirectDevice(hotspot.deviceId).catch(() => {})
    return
  }

  const panelKind = derivePanelKind(device)
  if (panelKind) {
    dashboardStore.openCategory(panelKind, hotspot.deviceId)
  }
}

function handleDeviceToggle(deviceId) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'toggle' }).catch(() => {})
}

function handleDevicePress(deviceId) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'press' }).catch(() => {})
}

function handleDeviceNumber(deviceId, value) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-number', value }).catch(() => {})
}

function handleDeviceOption(deviceId, option) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-option', option }).catch(() => {})
}

function handleDeviceBrightness(deviceId, value) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-brightness', value }).catch(() => {})
}

function handleDeviceColorTemperature(deviceId, value) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-color-temperature', value }).catch(() => {})
}

function handleClimateToggle(deviceId) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'toggle' }).catch(() => {})
}

function handleClimateAdjust(deviceId, delta) {
  const device = sceneStore.getDevice(deviceId)
  if (!device || device.targetTemperature == null) {
    return
  }
  sceneStore.controlDeviceByIntent(deviceId, {
    type: 'set-target-temperature',
    value: Number(device.targetTemperature) + delta,
  }).catch(() => {})
}

function handleClimateMode(deviceId, option) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-hvac-mode', option }).catch(() => {})
}

function handleClimateOption(deviceId, option) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-option', option }).catch(() => {})
}
</script>

<template>
  <div class="dashboard-page">
    <AppTopBar />

    <main class="dashboard-main">
      <section class="dashboard-stage-wrap">
        <FloorplanStage
          :stage-model="sceneStore.stageModel"
          mode="view"
          :selected-hotspot-id="dashboardStore.selectedStageDeviceId"
          :pending-device-ids="sceneStore.pendingDeviceIds"
          :loading="sceneStore.loading"
          :error="sceneStore.error"
          @device-interact="handleStageDeviceInteract"
        />

        <div class="dashboard-stage-console">
          <EventConsole />
        </div>
      </section>

      <aside class="dashboard-sidebar">
        <RightSidebar />
      </aside>
    </main>

    <div class="dashboard-bottom-shell dashboard-bottom-shell--stats-only">
      <BottomStatsBar />
    </div>

    <DeviceCategoryModal
      :open="dashboardStore.activeCategory === 'device'"
      :title="activeDeviceModalTitle"
      icon="light"
      :count="activeDeviceModalDevices.length"
      :devices="activeDeviceModalDevices"
      :selected-device-id="dashboardStore.selectedStageDeviceId"
      :pending-device-ids="sceneStore.pendingDeviceIds"
      @close="dashboardStore.closeCategoryModal()"
      @focus="dashboardStore.focusDevice($event)"
      @toggle="handleDeviceToggle"
      @press="handleDevicePress"
      @set-number="handleDeviceNumber"
      @set-option="handleDeviceOption"
      @set-brightness="handleDeviceBrightness"
      @set-color-temperature="handleDeviceColorTemperature"
    />

    <ClimateCategoryModal
      :open="dashboardStore.activeCategory === 'climate'"
      :title="activeClimateModalTitle"
      :count="activeClimateModalDevices.length"
      :devices="activeClimateModalDevices"
      :selected-device-id="dashboardStore.selectedStageDeviceId"
      :pending-device-ids="sceneStore.pendingDeviceIds"
      @close="dashboardStore.closeCategoryModal()"
      @focus="dashboardStore.focusDevice($event)"
      @toggle-power="handleClimateToggle"
      @adjust-temp="handleClimateAdjust"
      @set-mode="handleClimateMode"
      @set-option="handleClimateOption"
    />
  </div>
</template>
