<script setup>
import { computed } from 'vue'
import AppTopBar from '../../features/topbar/AppTopBar.vue'
import FloorplanStage from '../../features/floorplan-stage/FloorplanStage.vue'
import SecuritySidebar from '../../features/security-sidebar/SecuritySidebar.vue'
import { useDashboardPlaceholderStore } from '../../stores/dashboardPlaceholders'

const dashboardStore = useDashboardPlaceholderStore()

const activeAlerts = computed(() =>
  dashboardStore.securitySensors.filter((sensor) => ['open', 'triggered'].includes(sensor.state)).length,
)

const armedZones = computed(() =>
  dashboardStore.securityZones.filter((zone) => zone.armed).length,
)

function zoneRoomLabel(roomKey) {
  return dashboardStore.roomOptions.find((room) => room.value === roomKey)?.label ?? roomKey
}
</script>

<template>
  <div class="dashboard-page security-page security-page--dedicated">
    <AppTopBar />

    <main class="security-shell">
      <section class="security-stage-panel">
        <header class="security-stage-panel__head">
          <div>
            <p>HOME SECURITY</p>
            <h2>门窗 / 人体 / 布防联动</h2>
          </div>
          <div class="security-stage-panel__summary">
            <div><span>当前告警</span><strong>{{ activeAlerts }}</strong></div>
            <div><span>已布防分区</span><strong>{{ armedZones }}</strong></div>
          </div>
        </header>

        <div class="security-stage-wrap">
          <FloorplanStage />

          <div class="security-stage-overlay">
            <div class="security-stage-strip">
              <article v-for="item in dashboardStore.securitySensorSummary" :key="item.id" class="security-stage-strip__card" :class="`is-${item.tone}`">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
                <p>{{ item.state }}</p>
              </article>
            </div>

            <button v-for="hotspot in dashboardStore.securityStageHotspots" :key="hotspot.id" type="button" class="security-stage-hotspot" :class="`is-${hotspot.tone}`" :style="{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }">
              <strong>{{ hotspot.label }}</strong>
              <span>{{ hotspot.state }}</span>
            </button>
          </div>
        </div>

        <div class="security-zone-grid">
          <article v-for="zone in dashboardStore.securityZones" :key="zone.id" class="security-zone-card" :class="{ 'is-armed': zone.armed }">
            <div class="security-zone-card__head">
              <strong>{{ zone.label }}</strong>
              <span>{{ zone.armed ? 'ARMED' : 'STANDBY' }}</span>
            </div>
            <p>{{ zoneRoomLabel(zone.roomKey) }} · {{ zone.mode }}</p>
            <em>风险等级 {{ zone.level }}</em>
          </article>
        </div>

        <section class="security-feed-panel">
          <div class="panel-title-row"><h3>安防事件流</h3><span>{{ dashboardStore.securityFeed.length }} 条</span></div>
          <div class="security-feed-list">
            <article v-for="item in dashboardStore.securityFeed" :key="item.id" class="security-feed-item" :class="`is-${item.level}`">
              <span>{{ item.time }}</span>
              <div>
                <strong>{{ item.title }}</strong>
                <p>{{ item.detail }}</p>
              </div>
            </article>
          </div>
        </section>
      </section>

      <aside class="dashboard-sidebar security-shell__sidebar">
        <SecuritySidebar />
      </aside>
    </main>
  </div>
</template>

