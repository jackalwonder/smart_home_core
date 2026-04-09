import { ref } from 'vue'
import { defineStore } from 'pinia'

let nextToastId = 0
const toastTimers = new Map()

export const useNotificationStore = defineStore('notification', () => {
  const toasts = ref([])

  function clearToastTimer(id) {
    const timer = toastTimers.get(id)
    if (timer) {
      window.clearTimeout(timer)
      toastTimers.delete(id)
    }
  }

  function startToastTimer(id, duration) {
    clearToastTimer(id)

    if (!duration || duration <= 0) {
      return
    }

    const timer = window.setTimeout(() => {
      removeToast(id)
    }, duration)
    toastTimers.set(id, timer)
  }

  function removeToast(id) {
    clearToastTimer(id)

    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function pushToast({ type = 'success', message, duration = 3000 }) {
    const id = ++nextToastId
    const toast = {
      id,
      type,
      message,
      duration,
    }

    toasts.value = [...toasts.value, toast]
    startToastTimer(id, duration)

    return id
  }

  function updateToast(id, { type, message, duration } = {}) {
    const currentToast = toasts.value.find((toast) => toast.id === id)
    if (!currentToast) {
      return null
    }

    const nextToast = {
      ...currentToast,
      ...(type !== undefined ? { type } : {}),
      ...(message !== undefined ? { message } : {}),
      ...(duration !== undefined ? { duration } : {}),
    }

    toasts.value = toasts.value.map((toast) => (toast.id === id ? nextToast : toast))

    if (duration !== undefined) {
      startToastTimer(id, duration)
    }

    return nextToast
  }

  function clearToasts() {
    for (const timer of toastTimers.values()) {
      window.clearTimeout(timer)
    }
    toastTimers.clear()
    toasts.value = []
  }

  return {
    toasts,
    pushToast,
    updateToast,
    removeToast,
    clearToasts,
  }
})
