<script setup>
import { computed } from 'vue'

import { useDashboardStore } from '../../stores/dashboard'

const dashboardStore = useDashboardStore()
const activeLightCount = computed(() => dashboardStore.visibleStageHotspots.filter((item) => item.active).length)

function getRoomAnchor(roomKey, axis) {
  return dashboardStore.roomAnchors.find((anchor) => anchor.key === roomKey)?.[axis] ?? 50
}
</script>

<template>
  <section class="stage">
    <div
      class="stage__canvas"
      :style="{ aspectRatio: dashboardStore.currentFloor?.aspectRatio || '1200 / 789' }"
    >
      <div class="stage__frame">
        <img
          class="stage__floorplan"
          :src="dashboardStore.currentStageImage"
          alt="当前主舞台户型图"
        >
      </div>

      <div class="stage__backdrop-mask" />
      <div class="stage__edge-shadow stage__edge-shadow--left" />
      <div class="stage__edge-shadow stage__edge-shadow--right" />
      <div class="stage__edge-shadow stage__edge-shadow--bottom" />

      <button
        v-for="room in dashboardStore.roomLayers"
        :key="room.key"
        type="button"
        class="stage-room-layer"
        :class="{ 'is-active': (dashboardStore.previewRoomKey || dashboardStore.activeRoomKey) === room.key }"
        :style="{ clipPath: `polygon(${room.polygon})` }"
        @mouseenter="dashboardStore.previewRoom(room.key)"
        @mouseleave="dashboardStore.clearPreviewRoom()"
        @click="dashboardStore.selectRoom(room.key)"
      >
        <span
          class="stage-room-layer__label"
          :style="{ left: `${getRoomAnchor(room.key, 'x')}%`, top: `${getRoomAnchor(room.key, 'y')}%` }"
        >
          {{ room.label }}
        </span>
      </button>

      <div
        v-for="glow in dashboardStore.roomGlows"
        :key="glow.id"
        class="stage-glow"
        :class="`stage-glow--${glow.tone}`"
        :style="{
          left: `${glow.x}%`,
          top: `${glow.y}%`,
          width: `${glow.width}%`,
          height: `${glow.height}%`,
        }"
      />

      <div
        v-for="badge in dashboardStore.roomBadges"
        :key="badge.id"
        class="stage-temp-badge"
        :style="{ left: `${badge.x}%`, top: `${badge.y}%` }"
      >
        {{ badge.value }}
      </div>

      <button
        v-for="hotspot in dashboardStore.visibleStageHotspots"
        :key="hotspot.id"
        type="button"
        class="stage-hotspot"
        :class="[
          `is-${hotspot.icon}`,
          `is-group-${hotspot.colorGroup}`,
          {
            'is-active': hotspot.active,
            'is-selected': hotspot.selected,
          },
        ]"
        :style="{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }"
        :aria-label="hotspot.label"
        @click="dashboardStore.openCategoryFromStage(hotspot.category, hotspot.deviceId)"
      >
        <span class="stage-hotspot__icon" />
      </button>
    </div>

    <div class="stage__summary">
      <button
        v-if="dashboardStore.activeRoomKey"
        type="button"
        class="stage-chip stage-chip--interactive"
        @click="dashboardStore.clearRoomFilter()"
      >
        <span class="stage-chip__label">当前房间</span>
        <strong>{{ dashboardStore.highlightedRoomLabel }}</strong>
      </button>
      <div class="stage-chip">
        <span class="stage-chip__label">热点</span>
        <strong>{{ dashboardStore.visibleStageHotspots.length }}</strong>
      </div>
      <div class="stage-chip stage-chip--active">
        <span class="stage-chip__label">灯光</span>
        <strong>{{ activeLightCount }}</strong>
      </div>
      <div class="stage-chip">
        <span class="stage-chip__label">模式</span>
        <strong>2.5D</strong>
      </div>
    </div>
  </section>
</template>
