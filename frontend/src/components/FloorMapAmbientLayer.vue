<script setup>
defineProps({
  room: {
    type: Object,
    required: true,
  },
  ambient: {
    type: Object,
    required: true,
  },
  transition: {
    type: Object,
    default: () => ({
      phase: 'idle',
      ambientDelay: 0,
      ambientDuration: 220,
    }),
  },
})
</script>

<template>
  <g
    class="ambient-layer"
    pointer-events="none"
    :style="{
      opacity: ambient.priority.ambientVisibility ?? 1,
      transform: `scale(${ambient.priority.scale ?? 1})`,
      transformOrigin: `${room.centerX}px ${room.centerY}px`,
      transformBox: 'fill-box',
    }"
  >
    <defs>
      <linearGradient
        :id="ambient.ids.daylight"
        gradientUnits="userSpaceOnUse"
        :x1="ambient.daylightGradient.x1"
        :y1="ambient.daylightGradient.y1"
        :x2="ambient.daylightGradient.x2"
        :y2="ambient.daylightGradient.y2"
      >
        <stop offset="0%" :stop-color="ambient.daylightStartColor" />
        <stop :offset="ambient.daylightMidOffset" :stop-color="ambient.daylightMidColor" />
        <stop offset="100%" :stop-color="ambient.daylightEndColor" />
      </linearGradient>

      <linearGradient
        v-for="opening in ambient.daylightOpenings"
        :id="`${ambient.ids.daylight}-${opening.id}`"
        :key="`gradient-${opening.id}`"
        gradientUnits="userSpaceOnUse"
        :x1="opening.x1"
        :y1="opening.y1"
        :x2="opening.x2"
        :y2="opening.y2"
      >
        <stop offset="0%" :stop-color="opening.colorStart" />
        <stop :offset="opening.midOffset" :stop-color="opening.colorMid" />
        <stop offset="100%" :stop-color="opening.colorEnd" />
      </linearGradient>

      <radialGradient
        :id="ambient.ids.light"
        gradientUnits="userSpaceOnUse"
        :cx="ambient.lightGradient.cx"
        :cy="ambient.lightGradient.cy"
        :fx="ambient.lightGradient.fx"
        :fy="ambient.lightGradient.fy"
        :r="ambient.lightGradient.r"
      >
        <stop offset="0%" :stop-color="ambient.lightCoreColor" />
        <stop offset="52%" :stop-color="ambient.lightMidColor" />
        <stop offset="100%" :stop-color="ambient.lightOuterColor" />
      </radialGradient>

      <linearGradient
        :id="ambient.ids.climate"
        gradientUnits="userSpaceOnUse"
        :x1="room.frame.x"
        :y1="room.frame.y + room.frame.height"
        :x2="room.frame.x + room.frame.width"
        :y2="room.frame.y"
      >
        <stop offset="0%" :stop-color="ambient.climateStartColor" />
        <stop offset="100%" :stop-color="ambient.climateEndColor" />
      </linearGradient>

      <radialGradient
        :id="ambient.ids.activity"
        gradientUnits="userSpaceOnUse"
        :cx="room.centerX"
        :cy="room.centerY"
        :r="Math.max(room.frame.width, room.frame.height) * 0.84"
      >
        <stop offset="0%" :stop-color="ambient.activityColor" />
        <stop offset="100%" stop-color="rgba(255,255,255,0)" />
      </radialGradient>
    </defs>

    <template v-if="ambient.usesOpeningDaylight">
      <g
        v-for="opening in ambient.daylightOpenings"
        :key="opening.id"
      >
        <polygon
          class="ambient-layer__shape"
          :points="opening.polygon"
          :fill="`url(#${ambient.ids.daylight}-${opening.id})`"
          :opacity="opening.opacity * ambient.priority.ambientEmphasis * (ambient.priority.openingBoost ?? 1)"
          :style="{ transitionDelay: `${transition.ambientDelay}ms`, transitionDuration: `${transition.ambientDuration}ms` }"
        />
        <line
          class="ambient-layer__opening-line"
          :x1="opening.openingLine.x1"
          :y1="opening.openingLine.y1"
          :x2="opening.openingLine.x2"
          :y2="opening.openingLine.y2"
          :stroke="opening.colorStart"
          :opacity="opening.lineOpacity * ambient.priority.ambientEmphasis * (ambient.priority.openingBoost ?? 1)"
          :stroke-width="1.6 + opening.softness * 1.2"
          :style="{ transitionDelay: `${transition.ambientDelay}ms`, transitionDuration: `${transition.ambientDuration}ms` }"
        />
      </g>
    </template>
    <polygon
      v-else
      class="ambient-layer__shape"
      :points="room.polygon"
      :fill="`url(#${ambient.ids.daylight})`"
      :opacity="ambient.daylightOpacity * ambient.priority.ambientEmphasis * (ambient.priority.daylightBoost ?? 1)"
      :style="{ transitionDelay: `${transition.ambientDelay}ms`, transitionDuration: `${transition.ambientDuration}ms` }"
    />
    <polygon
      class="ambient-layer__shape"
      :points="room.polygon"
      :fill="`url(#${ambient.ids.light})`"
      :opacity="ambient.ambientLightOpacity * ambient.priority.ambientEmphasis * (ambient.priority.lightBoost ?? 1)"
      :style="{ transitionDelay: `${transition.ambientDelay}ms`, transitionDuration: `${transition.ambientDuration}ms` }"
    />
    <polygon
      class="ambient-layer__shape"
      :points="room.polygon"
      :fill="`url(#${ambient.ids.climate})`"
      :opacity="ambient.climateOpacity * ambient.priority.ambientEmphasis"
      :style="{ transitionDelay: `${transition.ambientDelay}ms`, transitionDuration: `${transition.ambientDuration}ms` }"
    />
    <polygon
      class="ambient-layer__shape"
      :points="room.polygon"
      :fill="`url(#${ambient.ids.activity})`"
      :opacity="ambient.activityOpacity"
      :style="{ transitionDelay: `${transition.ambientDelay}ms`, transitionDuration: `${transition.ambientDuration}ms` }"
    />
  </g>
</template>

<style scoped>
.ambient-layer__shape {
  transition:
    opacity 320ms ease,
    fill 320ms ease,
    transform 320ms ease;
}

.ambient-layer__opening-line {
  transition:
    opacity 320ms ease,
    stroke 320ms ease,
    stroke-width 320ms ease,
    transform 320ms ease;
  stroke-linecap: round;
}

.ambient-layer {
  transition:
    opacity 320ms ease,
    transform 340ms ease;
}
</style>
