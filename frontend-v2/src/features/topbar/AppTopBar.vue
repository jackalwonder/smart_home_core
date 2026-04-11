<script setup>
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { to: '/dashboard', label: '总览' },
  { to: '/security', label: '安防' },
  { to: '/media', label: '影视' },
]

const actions = ['settings', 'expand', 'cloud', 'snow', 'flash', 'sun', 'moon']

function isActive(path) {
  return route.path === path
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__brand">
      <button class="icon-button" type="button" aria-label="menu">
        <span class="icon-menu" />
      </button>
      <span class="brand-name">Shadow</span>
      <span class="brand-status">HA Connected</span>
    </div>

    <nav class="topbar__nav">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="topbar__tab"
        :class="{ 'is-active': isActive(tab.to) }"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>

    <div class="topbar__actions">
      <template v-for="action in actions" :key="action">
        <RouterLink
          v-if="action === 'settings'"
          to="/settings"
          class="icon-button icon-button--ghost"
          aria-label="settings"
        >
          <span :class="`icon-${action}`" />
        </RouterLink>
        <button
          v-else
          class="icon-button icon-button--ghost"
          type="button"
          :aria-label="action"
        >
          <span :class="`icon-${action}`" />
        </button>
      </template>
    </div>
  </header>
</template>
