<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import FloorplanStage from '../../features/floorplan-stage/FloorplanStage.vue'
import { buildSettingsStageModel } from '../../domain/settings/settingsStageAdapters'
import { useSettingsEditorStore } from '../../stores/settingsEditor'
import { registerDraftUploadFile } from '../../stores/settingsDraftUploadBridge'

const settingsStore = useSettingsEditorStore()
const fileInput = ref(null)
const deletingHotspotId = ref('')
const snapEnabled = ref(true)
const stepSize = ref(1)
const hotspotEditorOpen = ref(false)
const selectedLabelInput = ref(null)
const pendingLabelFocusHotspotId = ref('')
const deviceSearchQuery = ref('')
const coordinateFieldValues = ref({
  x: '',
  y: '',
  rotation: '',
})
const isDevExecutionDebug = import.meta.env.DEV
const draftExecutionDebugRunning = ref(false)
const draftExecutionDebugReport = ref(null)
const draftExecutionTarget = ref('floorplan_upload')
const draftExecutionSnapshotOnly = ref(true)
const draftExecutionReadbackAfterExecution = ref(true)
const draftExecutionAutoBuildSubmitContextFromScene = ref(true)

const settingsMenuLabels = {
  devices: '常用设备',
  system: '系统设置',
  page: '页面设置',
  features: '功能设置',
}

const hotspotTypeOptions = [
  { value: 'light', label: '灯光' },
  { value: 'climate', label: '温控' },
  { value: 'fan', label: '风扇' },
  { value: 'presence', label: '人体' },
]

const hotspotCategoryOptions = [
  { value: 'lights', label: '灯光类' },
  { value: 'climate', label: '温控类' },
  { value: 'fans', label: '风扇类' },
  { value: 'presence', label: '人体类' },
  { value: 'sensors', label: '传感类' },
]

const currentSettingsMenuKey = computed(
  () => settingsStore.settingsMenu.find((item) => item.active)?.key ?? 'page',
)

const selectedDraftHotspotId = computed(() => settingsStore.selectedDraftHotspotId)

const activeEditorHotspot = computed(
  () => settingsStore.activeDraftHotspots.find((item) => item.id === selectedDraftHotspotId.value) ?? null,
)

const selectedWidgetHotspot = computed(
  () => activeEditorHotspot.value,
)

const selectedWidgetDevice = computed(
  () => settingsStore.draftEntityLibrary.find((device) => device.id === selectedWidgetHotspot.value?.deviceId) ?? null,
)

const selectedWidgetRoomLabel = computed(
  () => settingsStore.roomOptions.find((room) => room.value === selectedWidgetHotspot.value?.roomKey)?.label ?? '未设置',
)

const deviceCategoryLabelMap = {
  lights: '灯光类',
  climate: '温控类',
  fans: '风扇类',
  sensor: '传感类',
  sensors: '传感类',
  presence: '人体类',
}

const deviceOptionItems = computed(() => {
  const roomLabelMap = new Map(settingsStore.roomOptions.map((room) => [room.value, room.label]))

  return settingsStore.draftEntityLibrary.map((device) => {
    const roomKeys = Array.from(
      new Set(
        settingsStore.activeDraftHotspots
          .filter((hotspot) => hotspot.deviceId === device.id)
          .map((hotspot) => hotspot.roomKey)
          .filter(Boolean),
      ),
    )

    const roomLabels = roomKeys.map((roomKey) => roomLabelMap.get(roomKey) ?? roomKey)
    const categoryLabel = deviceCategoryLabelMap[device.category] ?? device.category ?? '未分类'
    const searchText = [
      device.name,
      device.id,
      device.category,
      categoryLabel,
      ...roomLabels,
      ...roomKeys,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return {
      id: device.id,
      name: device.name || device.id,
      category: device.category || '',
      categoryLabel,
      roomLabels,
      subtitle: [device.id, roomLabels.join(' / ') || '未放置房间', categoryLabel].join(' · '),
      searchText,
    }
  })
})

const filteredDeviceOptionItems = computed(() => {
  const keyword = deviceSearchQuery.value.trim().toLowerCase()
  if (!keyword) {
    return deviceOptionItems.value
  }
  return deviceOptionItems.value.filter((item) => item.searchText.includes(keyword))
})

const selectedDeviceOptionItem = computed(() =>
  deviceOptionItems.value.find((item) => item.id === selectedWidgetHotspot.value?.deviceId) ?? null,
)

const hasInvalidSelectedDevice = computed(
  () => Boolean(selectedWidgetHotspot.value?.deviceId) && !selectedDeviceOptionItem.value,
)

const stageSummaryCards = computed(() => [
  { id: 'widgets', label: '当前舞台控件', value: settingsStore.activeDraftHotspots.length, detail: '热点标签与控件落点' },
  { id: 'selected', label: '已选热点', value: selectedDraftHotspotId.value ? 1 : 0, detail: selectedDraftHotspotId.value ? '单点编辑中' : '点击点位进入编辑态' },
  { id: 'assets', label: '可用素材', value: settingsStore.draftAssets.length, detail: '支持上传并切换主舞台底图' },
])

const saveDraftButtonNotice = computed(() => {
  const presentation = settingsStore.floorplanSubmitPresentation

  return {
    tone: presentation.tone,
    title: '保存布局',
    caption:
      presentation.status === 'ready'
        ? '当前点击仍只保存草稿，且这份底图草稿已具备后续提交条件。'
        : presentation.isRefExpired
          ? '当前点击只保存草稿；底图上传引用已失效，如需后续提交请重新选择文件。'
          : presentation.status === 'blocked'
            ? '当前点击只保存草稿，底图暂不具备后续提交条件。'
            : '当前点击只保存草稿；现有底图与已知后端状态一致，暂无额外提交动作。',
    tag:
      presentation.status === 'ready'
        ? 'ready'
        : presentation.isRefExpired
          ? 'ref expired'
          : presentation.status === 'blocked'
            ? 'blocked'
            : 'noop',
  }
})

const executionSummaryNotice = computed(() => {
  const preview = settingsStore.draftSubmitExecutionPreview

  if (preview.canExecute) {
    return {
      tone: 'ready',
      title: '未来执行预览',
      message: `如果现在执行，预计有 ${preview.wouldRunCount} 步会真正运行，${preview.noopCount} 步会保持不变。`,
      detail: `共 ${preview.totalCount} 步，当前没有阻塞项。`,
    }
  }

  if (preview.blockedCount > 0) {
    return {
      tone: 'blocked',
      title: '未来执行预览',
      message: `如果现在执行，预计有 ${preview.wouldRunCount} 步可运行，${preview.blockedCount} 步会被阻塞。`,
      detail: preview.blockingReasons[0] || `共 ${preview.totalCount} 步，其中 ${preview.unavailableCount} 步当前不可用。`,
    }
  }

  if (preview.unavailableCount > 0) {
    return {
      tone: 'noop',
      title: '未来执行预览',
      message: `如果现在执行，主要是 ${preview.unavailableCount} 步暂不可用，其余 ${preview.noopCount} 步不会产生变化。`,
      detail: `共 ${preview.totalCount} 步，当前没有可运行的执行步。`,
    }
  }

  return {
    tone: 'noop',
    title: '未来执行预览',
    message: `如果现在执行，预计 ${preview.noopCount} 步保持不变。`,
    detail: `共 ${preview.totalCount} 步。`,
  }
})

function normalizeDebugText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  return String(value)
}

function countObjectKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 0
  }
  return Object.keys(value).length
}

function formatDebugJson(value) {
  if (value === null || value === undefined) {
    return '—'
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const draftExecutionDebugBaseInfo = computed(() => {
  const report = draftExecutionDebugReport.value ?? {}
  return {
    usedExecutorKey: normalizeDebugText(report.usedExecutorKey || report.resolvedExecutorKey),
    submitContextSource: normalizeDebugText(report.submitContextSource),
    snapshotOnly: Boolean(report.snapshotOnly),
    draftWriteSkipped: Boolean(report.draftWriteSkipped),
  }
})

const draftExecutionDebugContextSummary = computed(() => {
  const submitContext = draftExecutionDebugReport.value?.usedSubmitContext ?? {}
  return {
    zoneId: normalizeDebugText(submitContext.zoneId),
    currentFloorplanPath: normalizeDebugText(submitContext.currentFloorplanPath),
    deviceIdCount: countObjectKeys(submitContext.deviceIdByDraftEntityId),
    roomIdCount: countObjectKeys(submitContext.roomIdByDraftRoomKey),
  }
})

const draftExecutionDebugPreflightItems = computed(() =>
  Array.isArray(draftExecutionDebugReport.value?.preflightItems)
    ? draftExecutionDebugReport.value.preflightItems
    : [],
)

const draftExecutionDebugNetworkSummaryEntries = computed(() =>
  Object.entries(draftExecutionDebugReport.value?.networkSummaryByStep ?? {}).map(([stepKey, summary]) => ({
    stepKey,
    summary: summary ?? {},
  })),
)

const draftExecutionDebugReadbackSections = computed(() => {
  const report = draftExecutionDebugReport.value ?? {}
  return [
    {
      key: 'devicePlacementReadback',
      title: 'device placement 回读',
      value: report.devicePlacementReadback ?? null,
    },
    {
      key: 'floorplanUploadReadback',
      title: 'floorplan upload 回读',
      value: report.floorplanUploadReadback ?? null,
    },
  ].filter((item) => Boolean(item.value))
})

const draftExecutionDebugReadbackIssues = computed(() =>
  Array.isArray(draftExecutionDebugReport.value?.readbackIssues)
    ? draftExecutionDebugReport.value.readbackIssues
    : [],
)

const draftExecutionDebugConfigSummary = computed(() => ({
  target: draftExecutionTarget.value,
  snapshotOnly: draftExecutionSnapshotOnly.value,
  readbackAfterExecution: draftExecutionReadbackAfterExecution.value,
  autoBuildSubmitContextFromScene: draftExecutionAutoBuildSubmitContextFromScene.value,
}))

const settingsStageModel = computed(() =>
  buildSettingsStageModel(
    settingsStore.activeDraftFloor,
    settingsStore.activeDraftHotspots,
    settingsStore.roomOptions,
  ),
)

watch(activeEditorHotspot, (hotspot) => {
  if (!hotspot) {
    hotspotEditorOpen.value = false
    deletingHotspotId.value = ''
    return
  }
}, { immediate: true })

watch(selectedDraftHotspotId, async (hotspotId) => {
  deviceSearchQuery.value = ''
  if (!hotspotId || pendingLabelFocusHotspotId.value !== hotspotId) {
    return
  }
  await nextTick()
  selectedLabelInput.value?.focus?.()
  selectedLabelInput.value?.select?.()
  pendingLabelFocusHotspotId.value = ''
})

watch(
  () => [
    selectedWidgetHotspot.value?.id,
    selectedWidgetHotspot.value?.x,
    selectedWidgetHotspot.value?.y,
    selectedWidgetHotspot.value?.rotation,
  ],
  () => {
    if (!selectedWidgetHotspot.value) {
      coordinateFieldValues.value = {
        x: '',
        y: '',
        rotation: '',
      }
      return
    }
    coordinateFieldValues.value = {
      x: String(selectedWidgetHotspot.value.x ?? ''),
      y: String(selectedWidgetHotspot.value.y ?? ''),
      rotation: String(selectedWidgetHotspot.value.rotation ?? 0),
    }
  },
  { immediate: true },
)

function triggerUpload() {
  fileInput.value?.click()
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
      URL.revokeObjectURL(objectUrl)
    }
    image.onerror = () => {
      reject(new Error('无法读取图片尺寸'))
      URL.revokeObjectURL(objectUrl)
    }
    image.src = objectUrl
  })
}

async function handleUpload(event) {
  const [file] = event.target.files ?? []
  if (!file) return
  const preview = await readFileAsDataUrl(file)
  const dimensions = await readImageDimensions(file)
  const uploadRef = registerDraftUploadFile(file, {
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
  })
  settingsStore.addDraftAsset({
    name: file.name,
    preview,
    sourceType: 'upload',
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
    fileRefToken: uploadRef.token,
  })
  event.target.value = ''
}

function clampCoordinate(value) {
  return Math.min(100, Math.max(0, value))
}

function normalizeCoordinate(value) {
  const numeric = clampCoordinate(Number(value) || 0)
  if (!snapEnabled.value) return Number(numeric.toFixed(1))
  const step = Number(stepSize.value) || 1
  return Number((Math.round(numeric / step) * step).toFixed(1))
}

function updateHotspotField(hotspotId, field, value) {
  if (!settingsStore.activeDraftFloor || !hotspotId) return
  settingsStore.updateDraftHotspot(settingsStore.activeDraftFloor.id, hotspotId, field, value)
}

function updateHotspotCoordinate(hotspotId, axis, value) {
  updateHotspotField(hotspotId, axis, normalizeCoordinate(value))
}

function updateHotspotRotationValue(hotspotId, value) {
  if (!hotspotId) return
  settingsStore.updateDraftHotspotRotation(hotspotId, Number(value) || 0)
}

function updateSelectedHotspotField(field, value) {
  updateHotspotField(selectedWidgetHotspot.value?.id, field, value)
}

function updateSelectedHotspotCoordinate(axis, value) {
  updateHotspotCoordinate(selectedWidgetHotspot.value?.id, axis, value)
}

function updateSelectedHotspotRotation(value) {
  updateHotspotRotationValue(selectedWidgetHotspot.value?.id, value)
}

function bindSelectedDevice(deviceId) {
  updateSelectedHotspotField('deviceId', deviceId)
  deviceSearchQuery.value = ''
}

function commitSelectedCoordinate(axis) {
  updateSelectedHotspotCoordinate(axis, coordinateFieldValues.value[axis])
}

function commitSelectedRotation() {
  updateSelectedHotspotRotation(coordinateFieldValues.value.rotation)
}

function nudgeSelectedHotspot(axis, delta) {
  if (!selectedWidgetHotspot.value) return
  updateSelectedHotspotCoordinate(axis, Number(selectedWidgetHotspot.value[axis] ?? 0) + delta)
}

function nudgeSelectedRotation(delta) {
  if (!selectedWidgetHotspot.value) return
  updateSelectedHotspotRotation(Number(selectedWidgetHotspot.value.rotation ?? 0) + delta)
}

function closeHotspotEditor() {
  hotspotEditorOpen.value = false
  deletingHotspotId.value = ''
}

function openHotspotActions() {
  if (!selectedWidgetHotspot.value) return
  hotspotEditorOpen.value = true
  deletingHotspotId.value = ''
}

function setEditorHotspot(hotspotId, options = {}) {
  const { openModal = true } = options
  settingsStore.selectDraftHotspot(hotspotId)
  deletingHotspotId.value = ''
  hotspotEditorOpen.value = Boolean(openModal)
}

function handleStageHotspotSelect(hotspotId) {
  if (!hotspotId) {
    return
  }
  setEditorHotspot(hotspotId, { openModal: false })
}

function handleStageHotspotMove(payload) {
  if (!payload?.hotspotId) {
    return
  }
  settingsStore.updateDraftHotspotPosition(payload.hotspotId, payload.x, payload.y)
}

function handleStageHotspotCreate(position) {
  const hotspotId = `hotspot-${Date.now()}`
  const currentHotspot = settingsStore.activeDraftHotspots.find(
    (item) => item.id === settingsStore.selectedDraftHotspotId,
  )
  const fallbackRoomKey = settingsStore.roomOptions[0]?.value ?? 'living'
  const fallbackColorGroup = settingsStore.colorGroupOptions[0]?.value ?? 'blue'
  settingsStore.addDraftHotspotAtCurrentFloor({
    id: hotspotId,
    x: position?.x ?? 50,
    y: position?.y ?? 50,
    label: `新热点 ${settingsStore.activeDraftHotspots.length + 1}`,
    roomKey: currentHotspot?.roomKey ?? fallbackRoomKey,
    colorGroup: currentHotspot?.colorGroup ?? fallbackColorGroup,
    deviceId: currentHotspot?.deviceId ?? settingsStore.draftEntityLibrary[0]?.id ?? '',
  })
  pendingLabelFocusHotspotId.value = hotspotId
  setEditorHotspot(hotspotId, { openModal: false })
}

function handleStageHotspotRemove(hotspotId) {
  settingsStore.removeDraftHotspotById(hotspotId)
  closeHotspotEditor()
}

function handleStageHotspotRotate(payload) {
  const hotspotId = payload?.hotspotId
  if (!hotspotId) {
    return
  }
  const hotspot = settingsStore.activeDraftHotspots.find((item) => item.id === hotspotId)
  const baseRotation = Number(hotspot?.rotation ?? 0)
  settingsStore.updateDraftHotspotRotation(hotspotId, baseRotation + Number(payload?.delta || 0))
}

function duplicateHotspot(hotspot) {
  if (!settingsStore.activeDraftFloor) return
  const hotspotId = `hotspot-${Date.now()}`
  settingsStore.addDraftHotspot(settingsStore.activeDraftFloor.id, {
    id: hotspotId,
    x: normalizeCoordinate(Number(hotspot.x) + (snapEnabled.value ? Number(stepSize.value) : 1.5)),
    y: normalizeCoordinate(Number(hotspot.y) + (snapEnabled.value ? Number(stepSize.value) : 1.5)),
    icon: hotspot.icon,
    active: hotspot.active,
    label: `${hotspot.label} 副本`,
    category: hotspot.category,
    deviceId: hotspot.deviceId,
    roomKey: hotspot.roomKey,
    colorGroup: hotspot.colorGroup,
  })
  pendingLabelFocusHotspotId.value = hotspotId
  setEditorHotspot(hotspotId, { openModal: false })
  closeHotspotEditor()
}

function requestDeleteHotspot(hotspotId) {
  deletingHotspotId.value = hotspotId
}

function cancelDeleteHotspot() {
  deletingHotspotId.value = ''
}

function confirmDeleteHotspot(hotspotId) {
  if (!settingsStore.activeDraftFloor) return
  settingsStore.removeDraftHotspotById(hotspotId)
  closeHotspotEditor()
}

function nudgeHotspot(hotspot, axis, delta) {
  if (!settingsStore.activeDraftFloor) return
  updateHotspotCoordinate(hotspot.id, axis, Number(hotspot[axis]) + delta)
}

async function runDraftExecutionDebug() {
  if (!isDevExecutionDebug) return
  draftExecutionDebugRunning.value = true
  try {
    const report = await settingsStore.runDraftSubmitExecutionDebug({
      logger: console,
      debugExecutionTarget: draftExecutionTarget.value,
      snapshotOnly: draftExecutionSnapshotOnly.value,
      readbackAfterExecution: draftExecutionReadbackAfterExecution.value,
      autoBuildSubmitContextFromScene: draftExecutionAutoBuildSubmitContextFromScene.value,
    })
    draftExecutionDebugReport.value = report
    console.debug('[settings-draft-debug]', report)
  } finally {
    draftExecutionDebugRunning.value = false
  }
}

function clearDraftExecutionDebugReport() {
  draftExecutionDebugReport.value = null
}

</script>

<template>
  <div class="settings-page">
    <header class="topbar settings-topbar">
      <div class="topbar__brand"><span class="brand-name">Shadow</span><span class="brand-status">HA Connected</span></div>
      <nav class="topbar__nav"><RouterLink class="topbar__tab" to="/dashboard">总览</RouterLink><RouterLink class="topbar__tab" to="/security">安防</RouterLink><RouterLink class="topbar__tab" to="/entertainment">影视</RouterLink></nav>
      <div class="topbar__actions"><RouterLink class="icon-button icon-button--ghost" to="/settings" aria-label="settings"><span class="icon-settings" /></RouterLink></div>
    </header>

    <main class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-sidebar__head"><p>HOME HUB</p><h1>场景控制</h1></div>
        <div class="settings-sidebar__menu"><button v-for="item in settingsStore.settingsMenu" :key="item.key" type="button" class="settings-menu-item" :class="{ 'is-active': item.active }" @click="settingsStore.selectSettingsMenu(item.key)">{{ settingsMenuLabels[item.key] || item.label }}</button></div>
        <div class="settings-sidebar__actions"><button type="button" class="settings-save-button" @click="settingsStore.persistDraftNow()">保存界面状态</button><button type="button" class="settings-chip-button" @click="settingsStore.resetDraftState()">重置草稿</button><button type="button" class="settings-chip-button" @click="settingsStore.clearLegacyDraftCache()">清空旧缓存</button></div>
      </aside>

      <section class="settings-content">
        <header class="settings-content__head">
          <h2>{{ currentSettingsMenuKey === 'devices' ? '常用设备库' : currentSettingsMenuKey === 'page' ? '中台页面设置' : currentSettingsMenuKey === 'system' ? '系统设置' : '功能扩展设置' }}</h2>
          <p>{{ currentSettingsMenuKey === 'devices' ? '整理主舞台和快捷控制里最常用的设备卡片。' : currentSettingsMenuKey === 'page' ? '聚焦主舞台展示、底图切换与点位调整，保持界面更接近中控屏。' : currentSettingsMenuKey === 'system' ? '统一调整通知、模式开关与联动入口。' : '保留扩展位，后续可接入更多专属模块。' }}</p>
        </header>

        <section v-if="currentSettingsMenuKey === 'devices'" class="settings-panel">
          <div class="device-library-list"><article v-for="group in settingsStore.commonDeviceGroups" :key="group.key" class="device-library-card"><div class="device-library-card__icon" :class="`is-${group.icon}`" /><div class="device-library-card__body"><strong>{{ group.title }}</strong><p>{{ group.desc }}</p></div><div class="device-library-card__meta">{{ group.count }} 个常用设备</div><button type="button" class="device-library-card__action" @click="settingsStore.selectSettingsMenu('page')">进入配置</button></article></div>
        </section>

        <section v-else-if="currentSettingsMenuKey === 'page'" class="settings-stage-layout">
          <aside class="settings-toolbox">
            <div class="settings-toolbox__head"><strong>设备卡片</strong><input type="text" placeholder="搜索设备..." /></div>
            <div class="settings-toolbox__chips"><button type="button" class="settings-toolbox__chip is-active">all</button><button type="button" class="settings-toolbox__chip">light</button><button type="button" class="settings-toolbox__chip">climate</button><button type="button" class="settings-toolbox__chip">sensor</button></div>
            <section class="settings-toolbox__section"><div class="settings-section-head"><strong>素材资源</strong><button type="button" class="settings-inline-button" @click="triggerUpload()">上传素材</button></div><input ref="fileInput" class="settings-hidden-input" type="file" accept="image/*" @change="handleUpload" /><div class="settings-asset-strip"><button v-for="asset in settingsStore.draftAssets" :key="asset.id" type="button" class="settings-asset-pill" :class="{ 'is-active': asset.id === settingsStore.activeDraftFloor?.floorplanAssetId }" @click="settingsStore.applyAssetToActiveDraftFloor(asset.id)">{{ asset.name }}</button></div></section>
            <section class="settings-toolbox__section"><div class="settings-section-head"><strong>设备库卡片</strong><span class="settings-section-meta">{{ settingsStore.draftEntityLibrary.length }} 个实体</span></div><div class="settings-toolbox__list settings-toolbox__list--dense"><article v-for="group in settingsStore.commonDeviceGroups" :key="group.key" class="settings-toolbox__item"><div><strong>{{ group.title }}</strong><p>{{ group.key }}</p></div><span>{{ group.count }}</span></article><article v-for="device in settingsStore.draftEntityLibrary.slice(0, 10)" :key="device.id" class="settings-toolbox__item settings-toolbox__item--entity"><div><strong>{{ device.name }}</strong><p>{{ device.id }}</p></div><span>{{ device.category }}</span></article></div></section>
          </aside>

          <section class="settings-stage-center">
            <div class="settings-stage-center__toolbar">
              <button type="button" class="settings-action-button settings-action-button--status" :class="`is-${saveDraftButtonNotice.tone}`">
                <span class="settings-action-button__title">{{ saveDraftButtonNotice.title }}</span>
                <span class="settings-action-button__caption">{{ saveDraftButtonNotice.caption }}</span>
                <span class="settings-action-button__tag">{{ saveDraftButtonNotice.tag }}</span>
              </button>
              <span class="settings-stage-center__hint">当前场景：{{ settingsStore.activeDraftFloor?.name || '未命名楼层' }}</span>
            </div>
            <div class="settings-stage-stats">
              <article
                v-for="card in stageSummaryCards"
                :key="card.id"
                class="settings-stage-stat"
              >
                <span>{{ card.label }}</span>
                <strong>{{ card.value }}</strong>
                <p>{{ card.detail }}</p>
              </article>
            </div>

            <FloorplanStage
              :stage-model="settingsStageModel"
              mode="edit"
              :selected-hotspot-id="settingsStore.selectedDraftHotspotId"
              :show-summary="false"
              @hotspot-select="handleStageHotspotSelect"
              @hotspot-position-change="handleStageHotspotMove"
              @hotspot-create="handleStageHotspotCreate"
              @hotspot-remove="handleStageHotspotRemove"
              @hotspot-rotate="handleStageHotspotRotate"
            />

            <div class="settings-stage-info-bar">
              <div>
                <strong>编辑态信息</strong>
                <span>已简化为热点布局与主舞台素材配置</span>
              </div>
              <div class="settings-stage-info-bar__meta">
                <span>网格吸附 {{ snapEnabled ? '开启' : '关闭' }}</span>
                <span>步进 {{ stepSize }}%</span>
              </div>
            </div>

            <div class="settings-stage-execution-area">
              <div class="settings-stage-submit-banner" :class="`is-${settingsStore.floorplanSubmitPresentation.tone}`">
                <div class="settings-stage-submit-banner__copy">
                  <strong>{{ settingsStore.floorplanSubmitPresentation.title }}</strong>
                  <p>{{ settingsStore.floorplanSubmitPresentation.message }}</p>
                  <span>{{ settingsStore.floorplanSubmitPresentation.detail }}</span>
                </div>
                <div class="settings-stage-submit-banner__meta">
                  <span class="settings-stage-submit-banner__status">{{ settingsStore.floorplanSubmitPresentation.status }}</span>
                  <span v-if="settingsStore.draftSubmitPlan.blockers.length">{{ settingsStore.draftSubmitPlan.blockers.length }} 个 blocker</span>
                </div>
              </div>
              <div class="settings-execution-summary" :class="`is-${executionSummaryNotice.tone}`">
                <div class="settings-execution-summary__copy">
                  <strong>{{ executionSummaryNotice.title }}</strong>
                  <p>{{ executionSummaryNotice.message }}</p>
                  <span>{{ executionSummaryNotice.detail }}</span>
                </div>
                <div class="settings-execution-summary__meta">
                  <span>run {{ settingsStore.draftSubmitExecutionPreview.wouldRunCount }}</span>
                  <span>noop {{ settingsStore.draftSubmitExecutionPreview.noopCount }}</span>
                  <span>blocked {{ settingsStore.draftSubmitExecutionPreview.blockedCount }}</span>
                </div>
              </div>
              <div v-if="isDevExecutionDebug" class="settings-dev-debug-layout">
                <div class="settings-dev-execution-panel">
                  <div class="settings-dev-execution-panel__head">
                    <div>
                      <strong>开发态执行闭环验证</strong>
                      <span>仅用于开发调试，可验证当前解析到的 executor、结果结构与执行摘要。</span>
                    </div>
                    <div class="settings-dev-execution-panel__actions">
                      <button type="button" class="settings-inline-button" :disabled="draftExecutionDebugRunning" @click="runDraftExecutionDebug()">
                        {{ draftExecutionDebugRunning ? '验证中...' : '运行执行调试' }}
                      </button>
                      <button type="button" class="settings-inline-button" @click="clearDraftExecutionDebugReport()">
                        清空调试结果
                      </button>
                    </div>
                  </div>

                  <div class="settings-dev-execution-panel__controls">
                    <label class="settings-dev-execution-panel__control">
                      <span>debugExecutionTarget</span>
                      <select v-model="draftExecutionTarget">
                        <option value="device_placement">device_placement</option>
                        <option value="floorplan_upload">floorplan_upload</option>
                      </select>
                    </label>
                    <label class="settings-dev-execution-panel__toggle">
                      <span>snapshotOnly</span>
                      <input v-model="draftExecutionSnapshotOnly" type="checkbox" />
                    </label>
                    <label class="settings-dev-execution-panel__toggle">
                      <span>readbackAfterExecution</span>
                      <input v-model="draftExecutionReadbackAfterExecution" type="checkbox" />
                    </label>
                    <label class="settings-dev-execution-panel__toggle">
                      <span>autoBuildSubmitContextFromScene</span>
                      <input v-model="draftExecutionAutoBuildSubmitContextFromScene" type="checkbox" />
                    </label>
                  </div>
                  <div v-if="draftExecutionDebugReport" class="settings-dev-execution-panel__body">
                    <div class="settings-dev-execution-panel__summary">
                      <span>executor {{ draftExecutionDebugBaseInfo.usedExecutorKey }}</span>
                      <span>ok {{ draftExecutionDebugReport.ok ? 'yes' : 'no' }}</span>
                      <span>success {{ draftExecutionDebugReport.scenarioSummary.successCount }}</span>
                      <span>failed {{ draftExecutionDebugReport.scenarioSummary.failedCount }}</span>
                      <span>would {{ draftExecutionDebugReport.scenarioSummary.wouldExecuteCount }}</span>
                      <span>noop {{ draftExecutionDebugReport.scenarioSummary.skippedCount }}</span>
                      <span>blocked {{ draftExecutionDebugReport.scenarioSummary.blockedCount }}</span>
                      <span>unavailable {{ draftExecutionDebugReport.scenarioSummary.unavailableCount }}</span>
                    </div>
                    <div class="settings-dev-execution-panel__checks">
                      <span>shape {{ draftExecutionDebugReport.checks.stepShapeValid ? 'ok' : 'fail' }}</span>
                      <span>summary {{ draftExecutionDebugReport.checks.countsMatch ? 'ok' : 'fail' }}</span>
                      <span>hooks {{ draftExecutionDebugReport.checks.hookCountsMatch ? 'ok' : 'fail' }}</span>
                    </div>
                  </div>
                </div>

                <div v-if="draftExecutionDebugReport" class="settings-dev-debug-results">
                  <section class="settings-dev-debug-section">
                    <div class="settings-dev-debug-section__head">
                      <strong>本次调试配置摘要</strong>
                      <span>直接展示页面当前传给 debug 执行链的参数。</span>
                    </div>
                    <div class="settings-dev-debug-pill-row">
                      <span>target {{ draftExecutionDebugConfigSummary.target }}</span>
                      <span>snapshotOnly {{ draftExecutionDebugConfigSummary.snapshotOnly ? 'true' : 'false' }}</span>
                      <span>readbackAfterExecution {{ draftExecutionDebugConfigSummary.readbackAfterExecution ? 'true' : 'false' }}</span>
                      <span>autoBuildSubmitContextFromScene {{ draftExecutionDebugConfigSummary.autoBuildSubmitContextFromScene ? 'true' : 'false' }}</span>
                    </div>
                  </section>

                  <section class="settings-dev-debug-section">
                    <div class="settings-dev-debug-section__head">
                      <strong>本次调试基础信息</strong>
                      <span>读取 store 已返回的数据，不重新计算业务逻辑。</span>
                    </div>
                    <div class="settings-dev-debug-pill-row">
                      <span>usedExecutorKey {{ draftExecutionDebugBaseInfo.usedExecutorKey }}</span>
                      <span>submitContextSource {{ draftExecutionDebugBaseInfo.submitContextSource }}</span>
                      <span>snapshotOnly {{ draftExecutionDebugBaseInfo.snapshotOnly ? 'true' : 'false' }}</span>
                      <span>draftWriteSkipped {{ draftExecutionDebugBaseInfo.draftWriteSkipped ? 'true' : 'false' }}</span>
                    </div>
                  </section>

                  <section class="settings-dev-debug-section">
                    <div class="settings-dev-debug-section__head">
                      <strong>submitContext 摘要</strong>
                      <span>只展示已回传字段的概览。</span>
                    </div>
                    <div class="settings-dev-debug-pill-row">
                      <span>zoneId {{ draftExecutionDebugContextSummary.zoneId }}</span>
                      <span>currentFloorplanPath {{ draftExecutionDebugContextSummary.currentFloorplanPath }}</span>
                      <span>deviceIdByDraftEntityId {{ draftExecutionDebugContextSummary.deviceIdCount }}</span>
                      <span>roomIdByDraftRoomKey {{ draftExecutionDebugContextSummary.roomIdCount }}</span>
                    </div>
                  </section>

                  <section class="settings-dev-debug-section">
                    <div class="settings-dev-debug-section__head">
                      <strong>preflight</strong>
                      <span>
                        summary
                        {{ formatDebugJson(draftExecutionDebugReport.preflightSummary) }}
                      </span>
                    </div>
                    <div v-if="draftExecutionDebugPreflightItems.length" class="settings-dev-debug-list">
                      <article v-for="item in draftExecutionDebugPreflightItems" :key="`${item.scope}-${item.code}-${item.message}`" class="settings-dev-debug-item">
                        <div class="settings-dev-debug-item__meta">
                          <span>{{ item.level }}</span>
                          <span>{{ item.scope }}</span>
                          <span>{{ item.code }}</span>
                        </div>
                        <p>{{ item.message }}</p>
                      </article>
                    </div>
                    <div v-else class="settings-dev-debug-empty">暂无 preflight 明细。</div>
                  </section>

                  <section class="settings-dev-debug-section">
                    <div class="settings-dev-debug-section__head">
                      <strong>network</strong>
                      <span>按 step 展示 networkSummary。</span>
                    </div>
                    <div v-if="draftExecutionDebugNetworkSummaryEntries.length" class="settings-dev-debug-list">
                      <article v-for="item in draftExecutionDebugNetworkSummaryEntries" :key="item.stepKey" class="settings-dev-debug-item">
                        <div class="settings-dev-debug-item__meta">
                          <span>{{ item.stepKey }}</span>
                          <span>{{ item.summary.mode || '—' }}</span>
                          <span>{{ item.summary.method || '—' }}</span>
                          <span>{{ item.summary.status || '—' }}</span>
                        </div>
                        <p>endpoint {{ normalizeDebugText(item.summary.endpoint) }}</p>
                        <p>duration {{ normalizeDebugText(item.summary.durationMs) }}ms · request {{ normalizeDebugText(item.summary.requestCount) }} · success {{ normalizeDebugText(item.summary.successCount) }} · failed {{ normalizeDebugText(item.summary.failedCount) }}</p>
                        <p v-if="item.summary.targets">targets {{ formatDebugJson(item.summary.targets) }}</p>
                        <p v-if="item.summary.zoneId">zoneId {{ normalizeDebugText(item.summary.zoneId) }}</p>
                        <p v-if="Object.prototype.hasOwnProperty.call(item.summary, 'hasFormData')">hasFormData {{ item.summary.hasFormData ? 'true' : 'false' }}</p>
                      </article>
                    </div>
                    <div v-else class="settings-dev-debug-empty">暂无 network 摘要。</div>
                  </section>

                  <section class="settings-dev-debug-section">
                    <div class="settings-dev-debug-section__head">
                      <strong>readback</strong>
                      <span>展示回读结果和对照差异。</span>
                    </div>
                    <div v-if="draftExecutionDebugReadbackSections.length" class="settings-dev-debug-list">
                      <article v-for="section in draftExecutionDebugReadbackSections" :key="section.key" class="settings-dev-debug-item">
                        <div class="settings-dev-debug-item__meta">
                          <span>{{ section.title }}</span>
                        </div>
                        <pre class="settings-dev-debug-pre">{{ formatDebugJson(section.value) }}</pre>
                      </article>
                    </div>
                    <div v-else class="settings-dev-debug-empty">暂无 readback 明细。</div>
                    <div class="settings-dev-debug-section__head settings-dev-debug-section__head--spaced">
                      <strong>readbackIssues</strong>
                    </div>
                    <div v-if="draftExecutionDebugReadbackIssues.length" class="settings-dev-debug-list">
                      <article v-for="issue in draftExecutionDebugReadbackIssues" :key="`${issue.code}-${issue.message}`" class="settings-dev-debug-item">
                        <div class="settings-dev-debug-item__meta">
                          <span>{{ issue.code }}</span>
                        </div>
                        <p>{{ issue.message }}</p>
                      </article>
                    </div>
                    <div v-else class="settings-dev-debug-empty">暂无 readbackIssues。</div>
                  </section>
                </div>

                <div v-else class="settings-dev-debug-empty settings-dev-debug-empty--panel">
                  当前还没有调试结果，先在上方选择 target 和开关，再点击“运行执行调试”。
                </div>
              </div>
            </div>

          </section>

          <aside class="settings-widget-panel settings-widget-panel--rich">
            <div class="settings-widget-panel__head"><strong>点位设置</strong><span>{{ selectedWidgetHotspot ? '右侧为主编辑区' : '未选中热点' }}</span></div>
            <div v-if="selectedWidgetHotspot" :key="selectedWidgetHotspot.id" class="settings-widget-panel__detail">
              <section class="settings-widget-panel__summary"><div class="settings-widget-pill"><span>绑定实体</span><strong>{{ selectedWidgetDevice?.name || selectedWidgetHotspot.deviceId || '未绑定' }}</strong></div><div class="settings-widget-pill"><span>房间</span><strong>{{ selectedWidgetRoomLabel }}</strong></div><div class="settings-widget-pill"><span>编辑方式</span><strong>右侧主编辑</strong></div></section>
              <section class="settings-widget-panel__section-block">
                <div class="settings-widget-panel__section-head"><strong>基本信息</strong><span>先定义名称和视觉语义，再继续绑定实体</span></div>
                <div class="settings-widget-panel__group settings-widget-panel__group--grid">
                  <label class="settings-widget-panel__field settings-widget-panel__field--wide"><span>显示名称</span><input ref="selectedLabelInput" :value="selectedWidgetHotspot.label" type="text" @input="updateSelectedHotspotField('label', $event.target.value)" /></label>
                  <label class="settings-widget-panel__field"><span>分类</span><select :value="selectedWidgetHotspot.category || 'lights'" @change="updateSelectedHotspotField('category', $event.target.value)"><option v-for="category in hotspotCategoryOptions" :key="category.value" :value="category.value">{{ category.label }}</option></select></label>
                  <label class="settings-widget-panel__field"><span>控件图标</span><select :value="selectedWidgetHotspot.icon" @change="updateSelectedHotspotField('icon', $event.target.value)"><option v-for="type in hotspotTypeOptions" :key="type.value" :value="type.value">{{ type.label }}</option></select></label>
                </div>
              </section>
              <section class="settings-widget-panel__section-block">
                <div class="settings-widget-panel__section-head"><strong>设备与归属</strong><span>高频绑定项集中在同一组，减少来回跳转</span></div>
                <div class="settings-widget-panel__group settings-widget-panel__group--grid">
                  <div class="settings-widget-panel__field settings-widget-panel__field--wide settings-device-picker">
                    <div class="settings-device-picker__head">
                      <span>实体绑定</span>
                      <button v-if="selectedWidgetHotspot.deviceId" type="button" class="settings-inline-button" @click="bindSelectedDevice('')">清空绑定</button>
                    </div>
                    <div class="settings-device-picker__current" :class="{ 'is-invalid': hasInvalidSelectedDevice }">
                      <strong>{{ selectedDeviceOptionItem?.name || selectedWidgetHotspot.deviceId || '未绑定实体' }}</strong>
                      <span v-if="selectedDeviceOptionItem">{{ selectedDeviceOptionItem.subtitle }}</span>
                      <span v-else-if="hasInvalidSelectedDevice">当前绑定值 {{ selectedWidgetHotspot.deviceId }} 不在候选列表中，请重新选择。</span>
                      <span v-else>当前还没有绑定设备，可通过下方搜索并选择。</span>
                    </div>
                    <input v-model="deviceSearchQuery" type="text" placeholder="搜索设备名 / deviceId / 房间 / 类别" />
                    <div v-if="filteredDeviceOptionItems.length" class="settings-device-picker__list">
                      <button
                        v-for="device in filteredDeviceOptionItems"
                        :key="device.id"
                        type="button"
                        class="settings-device-picker__item"
                        :class="{ 'is-selected': selectedWidgetHotspot.deviceId === device.id }"
                        @click="bindSelectedDevice(device.id)"
                      >
                        <div>
                          <strong>{{ device.name }}</strong>
                          <span>{{ device.subtitle }}</span>
                        </div>
                        <em>{{ selectedWidgetHotspot.deviceId === device.id ? '当前绑定' : '选择' }}</em>
                      </button>
                    </div>
                    <div v-else class="settings-device-picker__empty">
                      <strong>没有匹配设备</strong>
                      <span>可尝试按设备名、deviceId、房间或类别重新搜索。</span>
                    </div>
                  </div>
                  <label class="settings-widget-panel__field"><span>所属房间</span><select :value="selectedWidgetHotspot.roomKey" @change="updateSelectedHotspotField('roomKey', $event.target.value)"><option v-for="room in settingsStore.roomOptions" :key="room.value" :value="room.value">{{ room.label }}</option></select></label>
                </div>
              </section>
              <section class="settings-widget-panel__section-block">
                <div class="settings-widget-panel__section-head"><strong>视觉样式</strong><span>颜色组会直接影响舞台上的热点识别感</span></div>
                <div class="settings-widget-panel__group settings-widget-panel__group--grid">
                  <label class="settings-widget-panel__field"><span>颜色组</span><select :value="selectedWidgetHotspot.colorGroup" @change="updateSelectedHotspotField('colorGroup', $event.target.value)"><option v-for="group in settingsStore.colorGroupOptions" :key="group.value" :value="group.value">{{ group.label }}</option></select></label>
                </div>
              </section>
              <section class="settings-widget-panel__section-block">
                <div class="settings-widget-panel__section-head"><strong>布局与位置</strong><span>支持直接输入，也支持小步进微调</span></div>
                <div class="settings-widget-panel__group settings-widget-panel__position-grid">
                  <label class="settings-widget-panel__field settings-step-field">
                    <span>X 坐标 (%)</span>
                    <div class="settings-step-field__controls">
                      <button type="button" class="settings-step-field__button" @click="nudgeSelectedHotspot('x', -Number(stepSize))">-</button>
                      <input v-model="coordinateFieldValues.x" type="number" step="0.1" inputmode="decimal" @blur="commitSelectedCoordinate('x')" @keydown.enter.prevent="commitSelectedCoordinate('x')" />
                      <button type="button" class="settings-step-field__button" @click="nudgeSelectedHotspot('x', Number(stepSize))">+</button>
                    </div>
                  </label>
                  <label class="settings-widget-panel__field settings-step-field">
                    <span>Y 坐标 (%)</span>
                    <div class="settings-step-field__controls">
                      <button type="button" class="settings-step-field__button" @click="nudgeSelectedHotspot('y', -Number(stepSize))">-</button>
                      <input v-model="coordinateFieldValues.y" type="number" step="0.1" inputmode="decimal" @blur="commitSelectedCoordinate('y')" @keydown.enter.prevent="commitSelectedCoordinate('y')" />
                      <button type="button" class="settings-step-field__button" @click="nudgeSelectedHotspot('y', Number(stepSize))">+</button>
                    </div>
                  </label>
                  <label class="settings-widget-panel__field settings-step-field settings-widget-panel__field--wide">
                    <span>旋转角度</span>
                    <div class="settings-step-field__controls">
                      <button type="button" class="settings-step-field__button" @click="nudgeSelectedRotation(-15)">-15</button>
                      <input v-model="coordinateFieldValues.rotation" type="number" step="15" inputmode="numeric" @blur="commitSelectedRotation" @keydown.enter.prevent="commitSelectedRotation" />
                      <button type="button" class="settings-step-field__button" @click="nudgeSelectedRotation(15)">+15</button>
                    </div>
                  </label>
                </div>
              </section>
              <div class="settings-widget-panel__actions"><button type="button" class="settings-inline-button" @click="openHotspotActions()">更多动作</button></div>
            </div>
            <div v-else class="settings-widget-panel__empty">
              <strong>未选中热点</strong>
              <p>点击主舞台上的热点可查看当前位置、旋转角度和绑定实体。</p>
            </div>
          </aside>
        </section>

        <section v-else class="settings-panel"><div class="system-card-list"><article v-for="item in settingsStore.notifications" :key="item.id" class="system-card"><div><strong>{{ item.label }}</strong><p>统一管理全局通知、离线提醒与自动化联动的启停状态。</p></div><div class="toggle-switch" :class="{ 'is-on': item.enabled }"><span /></div></article></div></section>
      </section>
    </main>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="hotspotEditorOpen && activeEditorHotspot" class="category-modal hotspot-editor-modal">
          <div class="category-modal__scrim" @click="closeHotspotEditor()" />
          <div class="category-modal__panel hotspot-editor-modal__panel" @click.stop>
            <header class="category-modal__header hotspot-editor-modal__header"><div class="category-modal__title-wrap"><div class="category-modal__icon hotspot-editor-modal__icon" /><div class="hotspot-editor-modal__title-copy"><p>ACTIONS</p><h2>{{ activeEditorHotspot.label }}</h2></div><span class="category-modal__count">{{ settingsStore.roomOptions.find((room) => room.value === activeEditorHotspot.roomKey)?.label || activeEditorHotspot.roomKey }}</span></div><button type="button" class="category-modal__close" @click="closeHotspotEditor()">×</button></header>
            <div class="hotspot-editor-modal__body">
              <div class="hotspot-editor-modal__meta"><div><span>实体绑定</span><strong>{{ activeEditorHotspot.deviceId || '未绑定实体' }}</strong></div><div><span>颜色组</span><strong>{{ activeEditorHotspot.colorGroup }}</strong></div><div><span>坐标</span><strong>{{ activeEditorHotspot.x }}, {{ activeEditorHotspot.y }}</strong></div></div>
              <p class="hotspot-editor-modal__hint">主要字段请在右侧详情面板编辑，这里只保留复制、删除等辅助动作。</p>
              <div v-if="deletingHotspotId === activeEditorHotspot.id" class="hotspot-delete-confirm"><span>确认删除 {{ activeEditorHotspot.label }}？</span><div class="hotspot-delete-confirm__actions"><button type="button" class="hotspot-copy-button" @click="cancelDeleteHotspot()">取消</button><button type="button" class="hotspot-remove-button" @click="confirmDeleteHotspot(activeEditorHotspot.id)">确认删除</button></div></div>
              <div class="hotspot-nudge-panel"><span>快捷动作</span><div class="hotspot-nudge-panel__controls"><button type="button" class="settings-inline-button" @click="nudgeHotspot(activeEditorHotspot, 'x', -Number(stepSize))">左移</button><button type="button" class="settings-inline-button" @click="nudgeHotspot(activeEditorHotspot, 'x', Number(stepSize))">右移</button><button type="button" class="settings-inline-button" @click="nudgeHotspot(activeEditorHotspot, 'y', -Number(stepSize))">上移</button><button type="button" class="settings-inline-button" @click="nudgeHotspot(activeEditorHotspot, 'y', Number(stepSize))">下移</button></div></div>
              <div class="hotspot-editor-modal__footer"><button type="button" class="hotspot-copy-button" @click="duplicateHotspot(activeEditorHotspot)">复制热点</button><button type="button" class="hotspot-remove-button" @click="requestDeleteHotspot(activeEditorHotspot.id)">删除热点</button><button type="button" class="settings-action-button" @click="closeHotspotEditor()">关闭</button></div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.settings-dev-debug-layout {
  display: grid;
  gap: 1rem;
  margin-bottom: 1rem;
}

.settings-stage-execution-area {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}

.settings-dev-execution-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  justify-content: flex-end;
}

.settings-dev-execution-panel__controls {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.95rem;
}

.settings-dev-execution-panel__control,
.settings-dev-execution-panel__toggle {
  display: grid;
  gap: 0.35rem;
  padding: 0.8rem 0.85rem;
  border: 1px solid rgba(103, 122, 177, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.settings-dev-execution-panel__control span,
.settings-dev-execution-panel__toggle span {
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 700;
}

.settings-dev-execution-panel__control select {
  width: 100%;
  min-height: 2.45rem;
  border: 1px solid rgba(103, 122, 177, 0.16);
  border-radius: 12px;
  background: rgba(8, 12, 20, 0.82);
  color: var(--text-primary);
}

.settings-dev-execution-panel__toggle {
  align-content: center;
  grid-template-columns: 1fr auto;
  align-items: center;
}

.settings-dev-execution-panel__toggle input {
  width: 1rem;
  height: 1rem;
}

.settings-dev-debug-results {
  display: grid;
  gap: 0.9rem;
}

.settings-dev-debug-section {
  display: grid;
  gap: 0.7rem;
  padding: 0.95rem 1rem;
  border: 1px solid rgba(103, 122, 177, 0.12);
  border-radius: 18px;
  background: rgba(12, 17, 28, 0.72);
}

.settings-dev-debug-section__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  flex-wrap: wrap;
}

.settings-dev-debug-section__head strong {
  font-size: 0.98rem;
}

.settings-dev-debug-section__head span {
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.settings-dev-debug-section__head--spaced {
  margin-top: 0.2rem;
}

.settings-dev-debug-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.settings-dev-debug-pill-row span {
  padding: 0.35rem 0.68rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
  word-break: break-word;
}

.settings-dev-debug-list {
  display: grid;
  gap: 0.65rem;
}

.settings-dev-debug-item {
  display: grid;
  gap: 0.45rem;
  padding: 0.8rem 0.85rem;
  border: 1px solid rgba(103, 122, 177, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.settings-dev-debug-item__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.settings-dev-debug-item__meta span {
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 700;
}

.settings-dev-debug-item p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
  word-break: break-word;
}

.settings-dev-debug-pre {
  margin: 0;
  padding: 0.75rem 0.85rem;
  border-radius: 14px;
  background: rgba(8, 12, 20, 0.72);
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.settings-dev-debug-empty {
  color: var(--text-muted);
  font-size: 0.84rem;
}

.settings-dev-debug-empty--panel {
  padding: 0.95rem 1rem;
  border: 1px dashed rgba(103, 122, 177, 0.16);
  border-radius: 18px;
  background: rgba(12, 17, 28, 0.6);
}

@media (min-width: 1200px) {
  .settings-dev-debug-layout {
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
    align-items: start;
  }
}

@media (max-width: 1100px) {
  .settings-dev-execution-panel__controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .settings-dev-execution-panel__controls {
    grid-template-columns: 1fr;
  }
}
</style>




