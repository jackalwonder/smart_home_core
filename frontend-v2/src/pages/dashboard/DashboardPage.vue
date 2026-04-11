<script setup>
import AppTopBar from '../../features/topbar/AppTopBar.vue'
import BottomStatsBar from '../../features/bottom-stats/BottomStatsBar.vue'
import ClimateCategoryModal from '../../features/category-modals/ClimateCategoryModal.vue'
import DeviceCategoryModal from '../../features/category-modals/DeviceCategoryModal.vue'
import EventConsole from '../../features/event-console/EventConsole.vue'
import FloorplanStage from '../../features/floorplan-stage/FloorplanStage.vue'
import RightSidebar from '../../features/right-sidebar/RightSidebar.vue'
import { useDashboardStore } from '../../stores/dashboard'

const dashboardStore = useDashboardStore()
</script>

<template>
  <div class="dashboard-page">
    <AppTopBar />

    <main class="dashboard-main">
      <section class="dashboard-stage-wrap">
        <FloorplanStage />

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
      :open="dashboardStore.activeCategory === 'lights'"
      :title="dashboardStore.activeLightModalTitle"
      icon="light"
      :count="dashboardStore.activeLightModalDevices.length"
      :devices="dashboardStore.activeLightModalDevices"
      :selected-device-id="dashboardStore.selectedStageDeviceId"
      @close="dashboardStore.closeCategoryModal()"
      @focus="dashboardStore.focusDevice($event)"
      @toggle="dashboardStore.toggleLightDevice"
    />

    <ClimateCategoryModal
      :open="dashboardStore.activeCategory === 'climate'"
      :title="dashboardStore.activeClimateModalTitle"
      :count="dashboardStore.activeClimateModalDevices.length"
      :devices="dashboardStore.activeClimateModalDevices"
      :selected-device-id="dashboardStore.selectedStageDeviceId"
      @close="dashboardStore.closeCategoryModal()"
      @focus="dashboardStore.focusDevice($event)"
      @toggle-power="dashboardStore.toggleClimatePower"
      @adjust-temp="dashboardStore.adjustClimateTemp"
      @set-mode="dashboardStore.setClimateMode"
    />
  </div>
</template>
