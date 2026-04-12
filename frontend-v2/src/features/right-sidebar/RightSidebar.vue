<script setup>
import { ref } from 'vue'
import { useDashboardPlaceholderStore } from '../../stores/dashboardPlaceholders'

const dashboardStore = useDashboardPlaceholderStore()
const activeSlide = ref(0)
const slideCount = 2

function goToSlide(index) {
  activeSlide.value = (index + slideCount) % slideCount
}
</script>

<template>
  <div class="sidebar-stack sidebar-stack--dashboard">
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

    <section class="sidebar-panel sidebar-panel--carousel">
      <div class="sidebar-carousel__track" :style="{ transform: `translateX(-${activeSlide * 100}%)` }">
        <article class="sidebar-carousel__slide">
          <div class="panel-title-row">
            <h3>房间环境</h3>
            <span>{{ dashboardStore.highlightedRoomLabel }}</span>
          </div>

          <div class="room-environment-card room-environment-card--embedded">
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
        </article>

        <article class="sidebar-carousel__slide">
          <div class="panel-title-row">
            <h3>通知 &amp; 功能配置</h3>
            <span>V2.0 STABLE</span>
          </div>

          <div class="notification-list notification-list--embedded">
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
        </article>
      </div>

      <div class="sidebar-carousel__nav">
        <button type="button" class="sidebar-carousel__arrow" @click="goToSlide(activeSlide - 1)">‹</button>
        <div class="sidebar-carousel__dots">
          <button
            v-for="index in slideCount"
            :key="index"
            type="button"
            class="sidebar-carousel__dot"
            :class="{ 'is-active': activeSlide === index - 1 }"
            @click="goToSlide(index - 1)"
          />
        </div>
        <button type="button" class="sidebar-carousel__arrow" @click="goToSlide(activeSlide + 1)">›</button>
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

    <section class="quick-categories quick-categories--compact">
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

