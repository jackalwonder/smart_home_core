<script setup>
import { useDashboardStore } from '../../stores/dashboard'

const dashboardStore = useDashboardStore()
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
