import { createRouter, createWebHistory } from 'vue-router'

import DashboardPage from '../../pages/dashboard/DashboardPage.vue'
import LoginPage from '../../pages/login/LoginPage.vue'
import SecurityPage from '../../pages/security/SecurityPage.vue'
import SettingsPage from '../../pages/settings/SettingsPage.vue'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/login', redirect: '/entertainment' },
  { path: '/entertainment', component: LoginPage },
  { path: '/dashboard', component: DashboardPage },
  { path: '/security', component: SecurityPage },
  { path: '/settings', component: SettingsPage },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})
