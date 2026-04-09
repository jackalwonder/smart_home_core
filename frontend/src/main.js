import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { useNotificationStore } from './stores/notification'
import './styles.css'

const app = createApp(App)
const pinia = createPinia()
const notificationStore = useNotificationStore(pinia)

app.config.errorHandler = (error, instance, info) => {
  console.error('[Vue Error Boundary] Component render/update failed.', {
    error,
    info,
    component: instance?.$options?.name ?? instance?.type?.name ?? 'AnonymousComponent',
  })
  notificationStore.pushToast({
    type: 'error',
    message: '界面出现异常，已尝试保护当前页面。请刷新后重试。',
    duration: 4500,
  })
}

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
  notificationStore.pushToast({
    type: 'error',
    message: '后台请求未完成，请稍后再试。',
    duration: 4000,
  })
  event.preventDefault()
})

app.use(pinia)
app.mount('#app')
