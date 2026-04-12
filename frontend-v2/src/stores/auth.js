import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '../shared/api/client'

export const useAuthStore = defineStore('auth', () => {
  const status = ref('idle')
  const source = ref('')
  const scopes = ref([])
  const errorMessage = ref('')
  const initialized = ref(false)

  const isChecking = computed(() => status.value === 'checking')
  const isAuthenticated = computed(() => scopes.value.includes('control'))
  const requiresAuth = computed(() => initialized.value && !isAuthenticated.value)

  async function bootstrap() {
    if (status.value === 'checking') {
      return
    }

    status.value = 'checking'
    errorMessage.value = ''

    try {
      const session = await apiClient.get('/api/auth/session')
      source.value = session?.source || ''
      scopes.value = Array.isArray(session?.scopes) ? session.scopes : []
      status.value = 'authenticated'
    } catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        source.value = ''
        scopes.value = []
        status.value = 'anonymous'
      } else {
        status.value = 'error'
        errorMessage.value = error.message || '无法连接后端服务。'
      }
    } finally {
      initialized.value = true
    }
  }

  async function createControlSession(apiKey) {
    status.value = 'checking'
    errorMessage.value = ''

    try {
      const session = await apiClient.post('/api/auth/control-session', { api_key: apiKey })
      source.value = session?.source || ''
      scopes.value = Array.isArray(session?.scopes) ? session.scopes : []
      status.value = 'authenticated'
      initialized.value = true
      return session
    } catch (error) {
      status.value = 'anonymous'
      initialized.value = true
      errorMessage.value = error.message || '控制密钥无效。'
      throw error
    }
  }

  async function clearControlSession() {
    try {
      await apiClient.delete('/api/auth/control-session')
    } finally {
      source.value = ''
      scopes.value = []
      status.value = 'anonymous'
    }
  }

  function clearError() {
    errorMessage.value = ''
  }

  return {
    status,
    source,
    scopes,
    errorMessage,
    initialized,
    isChecking,
    isAuthenticated,
    requiresAuth,
    bootstrap,
    createControlSession,
    clearControlSession,
    clearError,
  }
})
