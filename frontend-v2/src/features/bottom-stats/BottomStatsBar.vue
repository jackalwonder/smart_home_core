<script setup>
import { useDashboardPlaceholderStore } from '../../stores/dashboardPlaceholders'

const dashboardStore = useDashboardPlaceholderStore()
</script>

<template>
  <section class="stats-bar">
    <div v-for="item in dashboardStore.filteredStats" :key="item.key" class="stat-item">
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
    </div>
  </section>
</template>

