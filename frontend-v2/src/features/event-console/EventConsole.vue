<script setup>
import { useDashboardPlaceholderStore } from '../../stores/dashboardPlaceholders'

const dashboardStore = useDashboardPlaceholderStore()
</script>

<template>
  <aside class="event-console">
    <div
      v-for="item in dashboardStore.filteredEventFeed"
      :key="item"
      class="event-console__item"
    >
      {{ item }}
    </div>
  </aside>
</template>

