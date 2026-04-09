<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useNotificationStore } from '../stores/notification'

const notificationStore = useNotificationStore()
const { toasts } = storeToRefs(notificationStore)

const toneClassByType = computed(() => ({
  success: 'border-[rgba(45,122,82,0.24)] bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(187,247,208,0.92))] text-[#1f6a46]',
  error: 'border-[rgba(185,64,64,0.22)] bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(252,165,165,0.92))] text-[#8f2f2f]',
  warning: 'border-[rgba(180,83,9,0.24)] bg-[linear-gradient(135deg,rgba(255,247,237,0.98),rgba(253,186,116,0.94))] text-[#8a3b12]',
  loading: 'border-[rgba(79,70,229,0.22)] bg-[linear-gradient(135deg,rgba(238,242,255,0.98),rgba(191,219,254,0.92))] text-[#3730a3]',
}))

function resolveToastClass(type) {
  return toneClassByType.value[type] ?? toneClassByType.value.success
}
</script>

<template>
  <div class="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(92vw,24rem)] flex-col gap-3 sm:right-6 sm:top-6">
    <TransitionGroup
      name="toast-list"
      tag="div"
      class="flex flex-col gap-3"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto rounded-[1.25rem] border px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.14)] backdrop-blur"
        :class="resolveToastClass(toast.type)"
      >
        <div class="flex items-start gap-3">
          <div
            v-if="toast.type === 'loading'"
            class="mt-0.5 h-3 w-3 animate-spin rounded-full border-2 border-current/25 border-t-current"
          />
          <div
            v-else
            class="mt-0.5 h-2.5 w-2.5 rounded-full bg-current/70"
          />
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-70">
              {{ toast.type }}
            </p>
            <p class="mt-1 text-sm font-medium leading-6">
              {{ toast.message }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-[0.14em] opacity-70 transition hover:opacity-100"
            @click="notificationStore.removeToast(toast.id)"
          >
            关闭
          </button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-list-enter-active,
.toast-list-leave-active {
  transition: all 220ms cubic-bezier(0.2, 0.8, 0.24, 1);
}

.toast-list-enter-from,
.toast-list-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.97);
}

.toast-list-move {
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.24, 1);
}
</style>
