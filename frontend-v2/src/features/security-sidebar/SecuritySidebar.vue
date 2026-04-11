<script setup>
import { computed } from 'vue'
import { useDashboardStore } from '../../stores/dashboard'

const dashboardStore = useDashboardStore()

const activeAlerts = computed(() =>
  dashboardStore.securitySensors.filter((sensor) => ['open', 'triggered'].includes(sensor.state)).length,
)

const armedZones = computed(() =>
  dashboardStore.securityZones.filter((zone) => zone.armed).length,
)

function sensorStateText(state) {
  return ({ open: '打开', closed: '闭合', triggered: '触发', idle: '待命' })[state] || state
}
</script>

<template>
  <div class="sidebar-stack security-sidebar-stack">
    <section class="sidebar-panel security-sidebar-panel security-sidebar-panel--hero">
      <div class="security-sidebar-hero__head">
        <div>
          <p>SECURITY CENTER</p>
          <h3>全屋安防态势</h3>
        </div>
        <span class="security-sidebar-hero__badge">Away Guard</span>
      </div>
      <div class="security-sidebar-hero__time">{{ dashboardStore.timeText }}</div>
      <div class="security-sidebar-hero__date">{{ dashboardStore.dateText }}</div>
      <div class="security-sidebar-hero__stats">
        <div><span>当前告警</span><strong>{{ activeAlerts }}</strong></div>
        <div><span>布防分区</span><strong>{{ armedZones }}</strong></div>
      </div>
    </section>

    <section class="sidebar-panel security-sidebar-panel">
      <div class="panel-title-row"><h3>状态总览</h3><span>LIVE</span></div>
      <div class="security-status-grid">
        <article v-for="card in dashboardStore.securityStatusCards" :key="card.id" class="security-status-card" :class="`is-${card.tone}`">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <p>{{ card.detail }}</p>
        </article>
      </div>
    </section>

    <section class="sidebar-panel security-sidebar-panel">
      <div class="panel-title-row"><h3>安防设备</h3><span>{{ dashboardStore.securitySensorSummary.length }} 类</span></div>
      <div class="security-summary-grid">
        <article v-for="item in dashboardStore.securitySensorSummary" :key="item.id" class="security-summary-card" :class="`is-${item.tone}`">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <p>{{ item.state }}</p>
        </article>
      </div>
    </section>

    <section class="sidebar-panel security-sidebar-panel">
      <div class="panel-title-row"><h3>重点传感器</h3><span>{{ dashboardStore.securitySensors.length }} 个</span></div>
      <div class="security-sensor-list">
        <article v-for="sensor in dashboardStore.securitySensors.slice(0, 5)" :key="sensor.id" class="security-sensor-item" :class="`is-${sensor.priority}`">
          <div>
            <strong>{{ sensor.label }}</strong>
            <p>{{ sensorStateText(sensor.state) }} · {{ sensor.lastSeen }}</p>
          </div>
          <div class="security-sensor-item__meta">
            <span>{{ sensor.battery }}</span>
            <em>{{ sensor.type }}</em>
          </div>
        </article>
      </div>
    </section>

    <section class="sidebar-panel security-sidebar-panel">
      <div class="panel-title-row"><h3>布防动作</h3><span>PROFILE</span></div>
      <div class="notification-list">
        <div v-for="item in dashboardStore.securityActions" :key="item.id" class="notification-item notification-item--security">
          <div>
            <div class="notification-item__label">{{ item.label }}</div>
            <div class="notification-item__meta">{{ item.subtitle }}</div>
          </div>
          <div class="toggle-switch" :class="{ 'is-on': item.enabled }"><span /></div>
        </div>
      </div>
    </section>
  </div>
</template>
