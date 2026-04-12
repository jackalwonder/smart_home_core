import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './app/AppShell.vue'
import { router } from './app/router'
import './shared/styles/main.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
