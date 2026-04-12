import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useDashboardStore = defineStore('dashboard-ui', () => {
  const activeCategory = ref('')
  const activeRoomKey = ref('')
  const previewRoomKey = ref('')
  const selectedStageDeviceId = ref(0)
  const modalCloseGuardUntil = ref(0)

  function focusDevice(deviceId) {
    selectedStageDeviceId.value = Number(deviceId) || 0
  }

  function selectRoom(roomKey) {
    activeRoomKey.value = activeRoomKey.value === roomKey ? '' : roomKey
    previewRoomKey.value = ''
  }

  function clearRoomFilter() {
    activeRoomKey.value = ''
    previewRoomKey.value = ''
  }

  function previewRoom(roomKey) {
    if (!activeRoomKey.value) {
      previewRoomKey.value = roomKey
    }
  }

  function clearPreviewRoom() {
    if (!activeRoomKey.value) {
      previewRoomKey.value = ''
    }
  }

  function openCategory(categoryKey, deviceId = 0) {
    if (!categoryKey) {
      return
    }
    if (Date.now() < modalCloseGuardUntil.value) {
      return
    }
    activeCategory.value = categoryKey
    selectedStageDeviceId.value = Number(deviceId) || 0
  }

  function closeCategoryModal() {
    modalCloseGuardUntil.value = Date.now() + 320
    activeCategory.value = ''
    selectedStageDeviceId.value = 0
  }

  return {
    activeCategory,
    activeRoomKey,
    previewRoomKey,
    selectedStageDeviceId,
    modalCloseGuardUntil,
    focusDevice,
    selectRoom,
    clearRoomFilter,
    previewRoom,
    clearPreviewRoom,
    openCategory,
    closeCategoryModal,
  }
})
