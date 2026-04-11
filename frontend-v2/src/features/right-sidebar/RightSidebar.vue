<script setup>
import { useDashboardStore } from '../../stores/dashboard'

const dashboardStore = useDashboardStore()
</script>

<template>
  <div class="sidebar-stack">
    <section class="sidebar-panel sidebar-panel--clock">
      <div class="clock-panel">
        <div class="clock-panel__time">{{ dashboardStore.timeText }}</div>
        <div class="clock-panel__date">{{ dashboardStore.dateText }}</div>
      </div>
    </section>

    <section class="sidebar-panel sidebar-panel--weather">
      <div class="weather-panel__top">
        <div>
          <div class="weather-panel__temp">24.2℃</div>
          <div class="weather-panel__desc">多云</div>
        </div>
        <div class="weather-panel__meta">
          <div>CHENGDU</div>
          <div>星期二 03月31日</div>
        </div>
      </div>

      <div class="weather-metrics">
        <div
          v-for="metric in dashboardStore.weatherMetrics"
          :key="metric.label"
          class="weather-metric"
        >
          <div class="weather-metric__row">
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
          </div>
          <div class="weather-metric__track">
            <div
              class="weather-metric__fill"
              :class="`is-${metric.tone}`"
              :style="{ width: `${metric.progress * 100}%` }"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="sidebar-panel">
      <div class="panel-title-row">
        <h3>房间环境</h3>
        <span>{{ dashboardStore.highlightedRoomLabel }}</span>
      </div>

      <div class="room-environment-card">
        <div class="room-environment-card__primary">
          <strong>{{ dashboardStore.currentRoomEnvironment.temperature }}</strong>
          <span>{{ dashboardStore.currentRoomEnvironment.comfort }}</span>
        </div>
        <div class="room-environment-card__grid">
          <div>
            <span>湿度</span>
            <strong>{{ dashboardStore.currentRoomEnvironment.humidity }}</strong>
          </div>
          <div>
            <span>在线设备</span>
            <strong>{{ dashboardStore.currentRoomEnvironment.online }}</strong>
          </div>
          <div>
            <span>空气质量</span>
            <strong>{{ dashboardStore.currentRoomEnvironment.aqi }}</strong>
          </div>
          <div>
            <span>照度</span>
            <strong>{{ dashboardStore.currentRoomEnvironment.lux }}</strong>
          </div>
        </div>

        <div class="room-trend">
          <div class="room-trend__head">
            <span>能耗趋势</span>
            <strong>最近 5 个周期</strong>
          </div>
          <div class="room-trend__bars">
            <span
              v-for="(point, index) in dashboardStore.currentRoomEnvironment.energyTrend"
              :key="`${dashboardStore.highlightedRoomLabel}-${index}`"
              class="room-trend__bar"
              :style="{ height: `${point}%` }"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="sidebar-panel">
      <div class="panel-title-row">
        <h3>房间热点筛选</h3>
        <button
          v-if="dashboardStore.activeRoomKey"
          type="button"
          class="sidebar-link-button"
          @click="dashboardStore.clearRoomFilter()"
        >
          清除
        </button>
      </div>

      <div class="room-filter-grid">
        <button
          v-for="room in dashboardStore.roomFilters"
          :key="room.value"
          type="button"
          class="room-filter-card"
          :class="{ 'is-active': room.active }"
          @mouseenter="dashboardStore.previewRoom(room.value)"
          @mouseleave="dashboardStore.clearPreviewRoom()"
          @click="dashboardStore.selectRoom(room.value)"
        >
          <span>{{ room.label }}</span>
          <strong>{{ room.count }}</strong>
        </button>
      </div>
    </section>

    <section class="sidebar-panel">
      <div class="panel-title-row">
        <h3>通知 &amp; 功能配置</h3>
        <span>V2.0 STABLE</span>
      </div>

      <div class="notification-list">
        <div
          v-for="notification in dashboardStore.notifications"
          :key="notification.id"
          class="notification-item"
        >
          <div class="notification-item__label">{{ notification.label }}</div>
          <div class="toggle-switch" :class="{ 'is-on': notification.enabled }">
            <span />
          </div>
        </div>
      </div>
    </section>

    <section class="sidebar-panel sidebar-panel--media">
      <div class="media-card">
        <div class="media-card__status">书房 HOMEPOD</div>
        <div class="media-card__body">
          <div class="media-card__cover" />
          <div>
            <div class="media-card__title">APT.</div>
            <div class="media-card__artist">Sandaru Sathsara</div>
          </div>
        </div>
      </div>
    </section>

    <section class="quick-categories">
      <button
        v-for="category in dashboardStore.quickCategories"
        :key="category.key"
        type="button"
        class="quick-category"
        :class="{ 'is-selected': category.selected }"
        @click="dashboardStore.selectCategory(category.key)"
      >
        <span class="quick-category__label">{{ category.label }}</span>
        <strong>{{ category.count }}</strong>
      </button>
    </section>
  </div>
</template>
