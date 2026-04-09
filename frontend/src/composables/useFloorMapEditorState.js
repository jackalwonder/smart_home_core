import { computed, ref, unref } from 'vue'

import { resolveRoomVisualConfig } from '../config/floorMapConfig'
import { validateAndNormalizeFloorMapEditorImport } from '../utils/floorMapEditorImport'

const EDITABLE_VISUAL_KEYS = [
  'ambientPreset',
  'materialTone',
  'spatialPreset',
  'baseTone',
  'daylightDirection',
  'daylightStrength',
  'artificialLightGain',
  'climateInfluence',
  'activityInfluence',
  'elevationShiftX',
  'elevationShiftY',
  'floorInset',
  'wallHighlight',
  'openings',
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function cloneVisualConfig(value) {
  return EDITABLE_VISUAL_KEYS.reduce((result, key) => {
    if (key === 'openings') {
      result.openings = Array.isArray(value?.openings) ? value.openings.map((opening) => ({ ...opening })) : []
      return result
    }

    result[key] = value?.[key]
    return result
  }, {})
}

function normalizeOpening(opening = {}) {
  const start = clamp(Number(opening.start ?? 0.1), 0, 0.98)
  const end = clamp(Number(opening.end ?? 0.3), start + 0.02, 1)

  return {
    type: opening.type ?? 'window',
    edge: opening.edge ?? 'top',
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    strength: Number(clamp(Number(opening.strength ?? 1), 0, 1.4).toFixed(3)),
    softness: Number(clamp(Number(opening.softness ?? 0.8), 0.1, 1).toFixed(3)),
    tint: opening.tint ?? '#fff7e7',
  }
}

function normalizeFrame(frame = {}) {
  return {
    x: Number((frame.x ?? 0).toFixed(2)),
    y: Number((frame.y ?? 0).toFixed(2)),
    width: Number(Math.max(120, frame.width ?? 240).toFixed(2)),
    height: Number(Math.max(96, frame.height ?? 180).toFixed(2)),
  }
}

function cloneDraftPayload(value) {
  return JSON.parse(JSON.stringify(value))
}

export function useFloorMapEditorState(roomsRef, roomModelsRef) {
  const enabled = ref(false)
  const roomDrafts = ref({})
  const deviceDrafts = ref({})
  const selectedRoomId = ref(null)
  const selectedDeviceId = ref(null)
  const selectedOpeningIndex = ref(null)
  const exportStatus = ref({
    tone: 'idle',
    message: '当前还没有临时配置改动。',
  })
  const lastImportSnapshot = ref(null)
  const lastImportMeta = ref(null)

  const rooms = computed(() => unref(roomsRef) ?? [])
  const roomModels = computed(() => unref(roomModelsRef) ?? [])

  const selectedRoomModel = computed(() =>
    roomModels.value.find((room) => room.id === selectedRoomId.value)
    ?? roomModels.value[0]
    ?? null,
  )

  const selectedRoomDraft = computed(() =>
    selectedRoomModel.value ? roomDrafts.value[selectedRoomModel.value.id] ?? null : null,
  )

  const selectedRoomVisualConfig = computed(() => {
    if (!selectedRoomModel.value) {
      return null
    }

    if (selectedRoomDraft.value?.visualConfig) {
      return selectedRoomDraft.value.visualConfig
    }

    return cloneVisualConfig(resolveRoomVisualConfig(selectedRoomModel.value))
  })

  const selectedRoomDevices = computed(() => selectedRoomModel.value?.devices ?? [])
  const selectedDevice = computed(() =>
    selectedRoomDevices.value.find((device) => device.id === selectedDeviceId.value) ?? null,
  )

  const selectedOpening = computed(() => {
    if (!selectedRoomVisualConfig.value || selectedOpeningIndex.value === null) {
      return null
    }

    return selectedRoomVisualConfig.value.openings?.[selectedOpeningIndex.value] ?? null
  })

  const hasDraftChanges = computed(() =>
    Object.keys(roomDrafts.value).length > 0 || Object.keys(deviceDrafts.value).length > 0,
  )
  const canRestoreImportSnapshot = computed(() => Boolean(lastImportSnapshot.value))

  const exportPayload = computed(() => ({
    version: 1,
    exported_at: new Date().toISOString(),
    rooms: roomDrafts.value,
    devices: deviceDrafts.value,
  }))

  const exportJson = computed(() => JSON.stringify(exportPayload.value, null, 2))

  function captureSnapshot() {
    return {
      roomDrafts: cloneDraftPayload(roomDrafts.value),
      deviceDrafts: cloneDraftPayload(deviceDrafts.value),
      selectedRoomId: selectedRoomId.value,
      selectedDeviceId: selectedDeviceId.value,
      selectedOpeningIndex: selectedOpeningIndex.value,
    }
  }

  function findRoomModel(roomId) {
    return roomModels.value.find((room) => room.id === roomId) ?? null
  }

  function ensureRoomDraft(roomId = selectedRoomId.value) {
    if (!roomId || roomDrafts.value[roomId]) {
      return roomDrafts.value[roomId] ?? null
    }

    const roomModel = findRoomModel(roomId)
    if (!roomModel) {
      return null
    }

    const nextDraft = {
      frame: normalizeFrame(roomModel.frame),
      visualConfig: cloneVisualConfig(resolveRoomVisualConfig(roomModel)),
    }

    nextDraft.visualConfig.openings = nextDraft.visualConfig.openings.map((opening) => normalizeOpening(opening))

    roomDrafts.value = {
      ...roomDrafts.value,
      [roomId]: nextDraft,
    }

    return nextDraft
  }

  function ensureDeviceDraft(deviceId = selectedDeviceId.value) {
    if (!deviceId || deviceDrafts.value[deviceId]) {
      return deviceDrafts.value[deviceId] ?? null
    }

    const device = roomModels.value.flatMap((room) => room.devices ?? []).find((entry) => entry.id === deviceId)
    if (!device) {
      return null
    }

    const nextDraft = {
      roomId: device.room_id ?? selectedRoomId.value ?? null,
      entity_id: device.entity_id ?? '',
      position: {
        x: Number(device.position.x.toFixed(2)),
        y: Number(device.position.y.toFixed(2)),
      },
    }

    deviceDrafts.value = {
      ...deviceDrafts.value,
      [deviceId]: nextDraft,
    }

    return nextDraft
  }

  function touchStatus(message, tone = 'success') {
    exportStatus.value = { message, tone }
  }

  function selectRoom(roomId) {
    if (!roomId) {
      return
    }

    selectedRoomId.value = roomId
    const roomDraft = ensureRoomDraft(roomId)
    const roomModel = findRoomModel(roomId)

    if (!selectedDevice.value && roomModel?.devices?.length) {
      selectedDeviceId.value = roomModel.devices[0].id
    } else if (selectedDevice.value && !roomModel?.devices.some((device) => device.id === selectedDevice.value.id)) {
      selectedDeviceId.value = roomModel?.devices[0]?.id ?? null
    }

    if ((roomDraft?.visualConfig?.openings?.length ?? 0) > 0) {
      selectedOpeningIndex.value = clamp(selectedOpeningIndex.value ?? 0, 0, roomDraft.visualConfig.openings.length - 1)
    } else {
      selectedOpeningIndex.value = null
    }
  }

  function selectDevice(deviceId) {
    if (!deviceId) {
      selectedDeviceId.value = null
      return
    }

    const roomModel = roomModels.value.find((room) => room.devices.some((device) => device.id === deviceId))
    if (roomModel) {
      selectedRoomId.value = roomModel.id
      ensureRoomDraft(roomModel.id)
    }

    selectedDeviceId.value = deviceId
    ensureDeviceDraft(deviceId)
  }

  function selectOpening(index) {
    selectedOpeningIndex.value = index
    ensureRoomDraft()
  }

  function setEnabled(value) {
    enabled.value = value

    if (value) {
      const nextRoomId = selectedRoomId.value ?? roomModels.value[0]?.id ?? null
      if (nextRoomId) {
        selectRoom(nextRoomId)
      }
      return
    }

    selectedOpeningIndex.value = null
  }

  function updateRoomFrame(patch) {
    const roomDraft = ensureRoomDraft()
    if (!roomDraft) {
      return
    }

    roomDrafts.value = {
      ...roomDrafts.value,
      [selectedRoomId.value]: {
        ...roomDraft,
        frame: normalizeFrame({
          ...roomDraft.frame,
          ...patch,
        }),
      },
    }

    touchStatus('已更新房间基础框体。')
  }

  function updateRoomVisual(patch) {
    const roomDraft = ensureRoomDraft()
    if (!roomDraft) {
      return
    }

    const nextVisualConfig = {
      ...roomDraft.visualConfig,
      ...patch,
    }

    if (Array.isArray(nextVisualConfig.openings)) {
      nextVisualConfig.openings = nextVisualConfig.openings.map((opening) => normalizeOpening(opening))
    }

    roomDrafts.value = {
      ...roomDrafts.value,
      [selectedRoomId.value]: {
        ...roomDraft,
        visualConfig: nextVisualConfig,
      },
    }

    touchStatus('已更新房间视觉配置。')
  }

  function updateDevicePosition(deviceId, position) {
    if (!deviceId) {
      return
    }

    const roomModel = selectedRoomModel.value
    const nextDraft = ensureDeviceDraft(deviceId)
    if (!nextDraft || !roomModel) {
      return
    }

    deviceDrafts.value = {
      ...deviceDrafts.value,
      [deviceId]: {
        ...nextDraft,
        roomId: roomModel.id,
        position: {
          x: Number(clamp(Number(position.x), roomModel.frame.x + 12, roomModel.frame.x + roomModel.frame.width - 12).toFixed(2)),
          y: Number(clamp(Number(position.y), roomModel.frame.y + 18, roomModel.frame.y + roomModel.frame.height - 12).toFixed(2)),
        },
      },
    }

    touchStatus('已更新设备点位。')
  }

  function addOpening() {
    const roomDraft = ensureRoomDraft()
    if (!roomDraft) {
      return
    }

    const openings = [...(roomDraft.visualConfig.openings ?? []), normalizeOpening()]
    updateRoomVisual({ openings })
    selectedOpeningIndex.value = openings.length - 1
  }

  function updateOpening(index, patch) {
    const roomDraft = ensureRoomDraft()
    if (!roomDraft) {
      return
    }

    const openings = [...(roomDraft.visualConfig.openings ?? [])]
    if (!openings[index]) {
      return
    }

    openings[index] = normalizeOpening({
      ...openings[index],
      ...patch,
    })

    updateRoomVisual({ openings })
  }

  function removeOpening(index) {
    const roomDraft = ensureRoomDraft()
    if (!roomDraft) {
      return
    }

    const openings = [...(roomDraft.visualConfig.openings ?? [])]
    openings.splice(index, 1)
    updateRoomVisual({ openings })
    if (openings.length === 0) {
      selectedOpeningIndex.value = null
      return
    }

    selectedOpeningIndex.value = clamp(selectedOpeningIndex.value ?? 0, 0, openings.length - 1)
  }

  function resetSelectedRoom() {
    if (!selectedRoomId.value) {
      return
    }

    const nextRooms = { ...roomDrafts.value }
    delete nextRooms[selectedRoomId.value]
    roomDrafts.value = nextRooms
    selectedOpeningIndex.value = null
    touchStatus('已恢复当前房间的默认配置。', 'warning')
  }

  function resetSelectedDevice() {
    if (!selectedDeviceId.value) {
      return
    }

    const nextDevices = { ...deviceDrafts.value }
    delete nextDevices[selectedDeviceId.value]
    deviceDrafts.value = nextDevices
    touchStatus('已恢复当前设备点位。', 'warning')
  }

  function resetAll() {
    roomDrafts.value = {}
    deviceDrafts.value = {}
    selectedOpeningIndex.value = null
    touchStatus('已恢复全部默认配置。', 'warning')
  }

  function applyImportedDraft(normalizedPayload, sourceLabel = '粘贴 JSON') {
    const roomKeys = Object.keys(normalizedPayload.rooms)
    const deviceKeys = Object.keys(normalizedPayload.devices)
    const visibleRoomIds = new Set(rooms.value.map((room) => `${room.id}`))
    const visibleDeviceIds = new Set(roomModels.value.flatMap((room) => room.devices ?? []).map((device) => `${device.id}`))
    const matchedRoomCount = roomKeys.filter((id) => visibleRoomIds.has(`${id}`)).length
    const matchedDeviceCount = deviceKeys.filter((id) => visibleDeviceIds.has(`${id}`)).length

    lastImportSnapshot.value = captureSnapshot()
    lastImportMeta.value = {
      sourceLabel,
      importedAt: new Date().toISOString(),
      roomCount: roomKeys.length,
      deviceCount: deviceKeys.length,
      matchedRoomCount,
      matchedDeviceCount,
    }

    roomDrafts.value = cloneDraftPayload(normalizedPayload.rooms)
    deviceDrafts.value = cloneDraftPayload(normalizedPayload.devices)

    const preferredRoomId =
      roomKeys.find((id) => visibleRoomIds.has(`${id}`))
      ?? selectedRoomId.value
      ?? rooms.value[0]?.id
      ?? null

    if (preferredRoomId) {
      selectRoom(preferredRoomId)
    }

    const preferredDeviceId =
      deviceKeys.find((id) => visibleDeviceIds.has(`${id}`))
      ?? selectedDeviceId.value
      ?? null

    if (preferredDeviceId && visibleDeviceIds.has(`${preferredDeviceId}`)) {
      selectDevice(preferredDeviceId)
    }

    touchStatus(
      `已从${sourceLabel}导入 ${roomKeys.length} 个房间草稿、${deviceKeys.length} 个设备草稿；当前场景命中 ${matchedRoomCount} 个房间 / ${matchedDeviceCount} 个设备。`,
      'success',
    )
  }

  function importFromText(rawText, sourceLabel = '粘贴 JSON') {
    try {
      const normalizedPayload = validateAndNormalizeFloorMapEditorImport(rawText)
      applyImportedDraft(normalizedPayload, sourceLabel)
      return true
    } catch (error) {
      console.error('Failed to import editor JSON.', error)
      exportStatus.value = {
        tone: 'error',
        message: error instanceof Error ? error.message : '导入失败，请检查 JSON 结构。',
      }
      return false
    }
  }

  async function importFromFile(file) {
    if (!file) {
      return false
    }

    try {
      const text = await file.text()
      return importFromText(text, `文件 ${file.name}`)
    } catch (error) {
      console.error('Failed to read editor file.', error)
      exportStatus.value = {
        tone: 'error',
        message: '读取文件失败，请重新选择 JSON 文件。',
      }
      return false
    }
  }

  function restoreLastImportSnapshot() {
    if (!lastImportSnapshot.value) {
      return
    }

    const snapshot = lastImportSnapshot.value
    roomDrafts.value = cloneDraftPayload(snapshot.roomDrafts)
    deviceDrafts.value = cloneDraftPayload(snapshot.deviceDrafts)
    selectedRoomId.value = snapshot.selectedRoomId
    selectedDeviceId.value = snapshot.selectedDeviceId
    selectedOpeningIndex.value = snapshot.selectedOpeningIndex
    lastImportSnapshot.value = null
    touchStatus('已恢复到导入前的草稿状态。', 'warning')
  }

  async function copyExport() {
    try {
      await navigator.clipboard.writeText(exportJson.value)
      touchStatus('已复制 floorMap 配置 JSON。')
    } catch (error) {
      console.error('Failed to copy editor export.', error)
      exportStatus.value = {
        tone: 'error',
        message: '复制失败，请改用下载 JSON。',
      }
    }
  }

  function downloadExport() {
    const blob = new Blob([exportJson.value], { type: 'application/json;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `floor-map-editor-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    anchor.click()
    window.URL.revokeObjectURL(url)
    touchStatus('已下载 floorMap 配置 JSON。')
  }

  return {
    enabled,
    roomDrafts,
    deviceDrafts,
    selectedRoomId,
    selectedDeviceId,
    selectedOpeningIndex,
    selectedRoomModel,
    selectedRoomVisualConfig,
    selectedRoomDevices,
    selectedDevice,
    selectedOpening,
    hasDraftChanges,
    canRestoreImportSnapshot,
    exportStatus,
    exportJson,
    lastImportMeta,
    setEnabled,
    selectRoom,
    selectDevice,
    selectOpening,
    updateRoomFrame,
    updateRoomVisual,
    updateDevicePosition,
    addOpening,
    updateOpening,
    removeOpening,
    resetSelectedRoom,
    resetSelectedDevice,
    resetAll,
    importFromText,
    importFromFile,
    restoreLastImportSnapshot,
    copyExport,
    downloadExport,
  }
}
