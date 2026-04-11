<script setup>
import { useDashboardStore } from '../../stores/dashboard'

const dashboardStore = useDashboardStore()
</script>

<template>
  <section class="stats-bar">
    <div v-for="item in dashboardStore.filteredStats" :key="item.key" class="stat-item">
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
    </div>
  </section>
</template>
