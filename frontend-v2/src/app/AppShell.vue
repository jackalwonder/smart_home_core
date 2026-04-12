<script setup>
import { computed, onMounted, ref } from 'vue'

import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const apiKey = ref('')
const submitting = ref(false)
const localError = ref('')

const showAuthOverlay = computed(() =>
  authStore.initialized && (!authStore.isAuthenticated || authStore.status === 'error'),
)

const authHint = computed(() => {
  if (authStore.status === 'error') {
    return authStore.errorMessage || '当前无法连接后端，请确认后端服务和代理已启动。'
  }

  return '请输入具备 control 权限的 API Key，换取当前浏览器会话。'
})

async function submitSession() {
  const nextKey = apiKey.value.trim()
  if (!nextKey) {
    localError.value = '请输入控制密钥。'
    return
  }

  submitting.value = true
  localError.value = ''
  authStore.clearError()

  try {
    await authStore.createControlSession(nextKey)
    apiKey.value = ''
  } catch (error) {
    localError.value = error.message || '控制密钥无效。'
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  authStore.bootstrap()
})
</script>

<template>
  <RouterView />

  <Transition name="modal-fade">
    <div v-if="showAuthOverlay" class="auth-shell">
      <div class="auth-shell__scrim" />
      <section class="auth-shell__panel">
        <p class="auth-shell__eyebrow">CONTROL SESSION</p>
        <h1>连接后端控制会话</h1>
        <p class="auth-shell__copy">{{ authHint }}</p>

        <label class="auth-shell__field">
          <span>Control API Key</span>
          <input
            v-model="apiKey"
            type="password"
            autocomplete="off"
            placeholder="请输入 APP_CONTROL_API_KEY"
            @keydown.enter.prevent="submitSession()"
          >
        </label>

        <p v-if="localError || authStore.errorMessage" class="auth-shell__error">
          {{ localError || authStore.errorMessage }}
        </p>

        <div class="auth-shell__actions">
          <button
            type="button"
            class="settings-action-button auth-shell__submit"
            :disabled="submitting || authStore.isChecking"
            @click="submitSession()"
          >
            {{ submitting || authStore.isChecking ? '连接中...' : '建立会话' }}
          </button>
          <button
            v-if="authStore.status === 'error'"
            type="button"
            class="settings-inline-button"
            :disabled="authStore.isChecking"
            @click="authStore.bootstrap()"
          >
            重试检查
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>
