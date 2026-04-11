<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useDashboardStore } from '../../stores/dashboard'

const dashboardStore = useDashboardStore()
const fileInput = ref(null)
const hotspotCanvas = ref(null)
const roomEditorCanvas = ref(null)
const draggingHotspotId = ref('')
const hotspotDragOrigin = ref(null)
const suppressHotspotClickId = ref('')
const activeRoomRegionKey = ref('living')
const draggingRoomAnchorKey = ref('')
const draggingRoomPoint = ref(null)
const selectedRoomPointIndex = ref(0)
const deletingHotspotId = ref('')
const deletingBatch = ref(false)
const snapEnabled = ref(true)
const stepSize = ref(1)
const selectedHotspotIds = ref([])
const selectionRect = ref(null)
const batchRoomKey = ref('living')
const batchColorGroup = ref('blue')
const hotspotEditorOpen = ref(false)
const editorSections = ref({ rooms: true, hotspots: true })

const settingsMenuLabels = { devices: '常用设备', system: '系统设置', page: '页面设置', features: '功能设置' }
const hotspotTypeOptions = [
  { value: 'light', label: '灯光' },
  { value: 'climate', label: '温控' },
  { value: 'fan', label: '风扇' },
  { value: 'presence', label: '人体' },
]

const currentSettingsMenuKey = computed(() => dashboardStore.settingsMenu.find((item) => item.active)?.key ?? 'page')
const selectedHotspots = computed(() => dashboardStore.currentFloorHotspots.filter((hotspot) => selectedHotspotIds.value.includes(hotspot.id)))
const activeEditorHotspot = computed(() => dashboardStore.currentFloorHotspots.find((item) => item.id === selectedHotspotIds.value[0]) ?? null)
const activeRoomRegion = computed(() => dashboardStore.roomLayers.find((room) => room.key === activeRoomRegionKey.value) ?? dashboardStore.roomLayers[0])
const activeRoomAnchor = computed(() => dashboardStore.roomAnchors.find((anchor) => anchor.key === activeRoomRegionKey.value))
const selectedWidgetHotspot = computed(() => activeEditorHotspot.value ?? dashboardStore.currentFloorHotspots[0] ?? null)
const selectedWidgetDevice = computed(() => dashboardStore.availableDevices.find((device) => device.id === selectedWidgetHotspot.value?.deviceId) ?? null)
const roomPointList = computed(() => activeRoomRegion.value ? parsePolygonPoints(activeRoomRegion.value.polygon) : [])
const stageSummaryCards = computed(() => [
  { id: 'widgets', label: '当前楼层控件', value: dashboardStore.currentFloorHotspots.length, detail: '舞台热点 + 标签锚点' },
  { id: 'selected', label: '已选热点', value: selectedHotspotIds.value.length, detail: selectedHotspotIds.value.length ? '支持批量编辑' : '点击点位进入编辑态' },
  { id: 'rooms', label: '房间区域', value: dashboardStore.roomLayers.length, detail: `${dashboardStore.roomLayers.reduce((sum, room) => sum + parsePolygonPoints(room.polygon).length, 0)} 个顶点` },
])
const stageAnnotations = computed(() => dashboardStore.currentFloorHotspots.slice(0, 8).map((hotspot) => ({ id: hotspot.id, label: hotspot.label, roomLabel: dashboardStore.roomOptions.find((room) => room.value === hotspot.roomKey)?.label ?? hotspot.roomKey, tone: hotspot.colorGroup })))
const roomOutlineExport = computed(() => JSON.stringify({
  floorId: dashboardStore.currentFloor?.id ?? '',
  floorName: dashboardStore.currentFloor?.name ?? '',
  rooms: dashboardStore.roomLayers.map((room) => {
    const anchor = dashboardStore.roomAnchors.find((item) => item.key === room.key)
    return { key: room.key, label: room.label, anchor: { x: Number((anchor?.x ?? 50).toFixed(1)), y: Number((anchor?.y ?? 50).toFixed(1)) }, points: parsePolygonPoints(room.polygon).map((point) => ({ x: Number(point.x.toFixed(1)), y: Number(point.y.toFixed(1)) })) }
  }),
}, null, 2))

watch(selectedHotspotIds, (ids) => {
  updateBatchDefaultsFromSelection()
  if (ids.length !== 1) {
    hotspotEditorOpen.value = false
    deletingHotspotId.value = ''
  }
})

watch(activeEditorHotspot, (hotspot) => {
  if (!hotspot) {
    hotspotEditorOpen.value = false
    deletingHotspotId.value = ''
  }
})

function parsePolygonPoints(polygon) { return polygon.split(',').map((point) => { const [x, y] = point.trim().split(' '); return { x: Number.parseFloat(x), y: Number.parseFloat(y) } }) }
function serializePolygonPoints(points) { return points.map((point) => `${point.x.toFixed(1)}% ${point.y.toFixed(1)}%`).join(', ') }
function toggleEditorSection(section) { editorSections.value[section] = !editorSections.value[section] }
function triggerUpload() { fileInput.value?.click() }
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }) }
async function handleUpload(event) { const [file] = event.target.files ?? []; if (!file) return; dashboardStore.addAsset({ name: file.name, preview: await readFileAsDataUrl(file) }); event.target.value = '' }
function clampCoordinate(value) { return Math.min(100, Math.max(0, value)) }
function normalizeCoordinate(value) { const numeric = clampCoordinate(Number(value) || 0); if (!snapEnabled.value) return Number(numeric.toFixed(1)); const step = Number(stepSize.value) || 1; return Number((Math.round(numeric / step) * step).toFixed(1)) }
function updateBatchDefaultsFromSelection() { if (!selectedHotspots.value.length) return; batchRoomKey.value = selectedHotspots.value[0].roomKey; batchColorGroup.value = selectedHotspots.value[0].colorGroup }
function closeHotspotEditor() { hotspotEditorOpen.value = false; deletingHotspotId.value = '' }
function setEditorHotspot(hotspotId, options = {}) { const { openModal = true } = options; selectedHotspotIds.value = [hotspotId]; deletingHotspotId.value = ''; deletingBatch.value = false; editorSections.value.hotspots = true; if (openModal) hotspotEditorOpen.value = true }
function handleHotspotButtonClick(hotspotId) { if (suppressHotspotClickId.value === hotspotId) { suppressHotspotClickId.value = ''; return } setEditorHotspot(hotspotId) }
function createHotspotAtPoint(clientX, clientY) { if (!dashboardStore.currentFloor || !hotspotCanvas.value) return; const bounds = hotspotCanvas.value.getBoundingClientRect(); const x = normalizeCoordinate(((clientX - bounds.left) / bounds.width) * 100); const y = normalizeCoordinate(((clientY - bounds.top) / bounds.height) * 100); const hotspotId = `hotspot-${Date.now()}`; dashboardStore.addHotspot(dashboardStore.currentFloor.id, { id: hotspotId, x, y, label: `新热点 ${dashboardStore.currentFloorHotspots.length + 1}`, roomKey: batchRoomKey.value, colorGroup: batchColorGroup.value }); setEditorHotspot(hotspotId) }
function updateDraggedHotspotPosition(event) { if (!draggingHotspotId.value || !dashboardStore.currentFloor || !hotspotCanvas.value) return; if (hotspotDragOrigin.value && (Math.abs(event.clientX - hotspotDragOrigin.value.x) > 3 || Math.abs(event.clientY - hotspotDragOrigin.value.y) > 3)) suppressHotspotClickId.value = draggingHotspotId.value; const bounds = hotspotCanvas.value.getBoundingClientRect(); const x = normalizeCoordinate(((event.clientX - bounds.left) / bounds.width) * 100); const y = normalizeCoordinate(((event.clientY - bounds.top) / bounds.height) * 100); dashboardStore.updateHotspot(dashboardStore.currentFloor.id, draggingHotspotId.value, 'x', x); dashboardStore.updateHotspot(dashboardStore.currentFloor.id, draggingHotspotId.value, 'y', y) }
function stopDraggingSession() { window.removeEventListener('pointermove', updateDraggedHotspotPosition); window.removeEventListener('pointerup', stopDraggingSession); draggingHotspotId.value = ''; hotspotDragOrigin.value = null }
function startHotspotDrag(event, hotspotId) { draggingHotspotId.value = hotspotId; hotspotDragOrigin.value = { x: event.clientX, y: event.clientY }; setEditorHotspot(hotspotId, { openModal: false }); updateDraggedHotspotPosition(event); window.addEventListener('pointermove', updateDraggedHotspotPosition); window.addEventListener('pointerup', stopDraggingSession, { once: true }) }
function applySelectionRect() { if (!selectionRect.value || !hotspotCanvas.value) return; const { startX, startY, currentX, currentY } = selectionRect.value; const minX = Math.min(startX, currentX); const maxX = Math.max(startX, currentX); const minY = Math.min(startY, currentY); const maxY = Math.max(startY, currentY); selectedHotspotIds.value = dashboardStore.currentFloorHotspots.filter((hotspot) => hotspot.x >= minX && hotspot.x <= maxX && hotspot.y >= minY && hotspot.y <= maxY).map((hotspot) => hotspot.id); updateBatchDefaultsFromSelection() }
function updateSelectionBox(event) { if (!selectionRect.value || !hotspotCanvas.value) return; const bounds = hotspotCanvas.value.getBoundingClientRect(); selectionRect.value = { ...selectionRect.value, currentX: clampCoordinate(((event.clientX - bounds.left) / bounds.width) * 100), currentY: clampCoordinate(((event.clientY - bounds.top) / bounds.height) * 100) } }
function stopSelectionSession(event) { window.removeEventListener('pointermove', updateSelectionBox); window.removeEventListener('pointerup', stopSelectionSession); if (!selectionRect.value) return; const { startX, startY, currentX, currentY } = selectionRect.value; const moved = Math.abs(currentX - startX) > 1 || Math.abs(currentY - startY) > 1; if (moved) applySelectionRect(); else if (event) createHotspotAtPoint(event.clientX, event.clientY); selectionRect.value = null }
function startCanvasSelection(event) { if (!hotspotCanvas.value || event.target !== hotspotCanvas.value || draggingHotspotId.value) return; const bounds = hotspotCanvas.value.getBoundingClientRect(); const x = clampCoordinate(((event.clientX - bounds.left) / bounds.width) * 100); const y = clampCoordinate(((event.clientY - bounds.top) / bounds.height) * 100); selectionRect.value = { startX: x, startY: y, currentX: x, currentY: y }; selectedHotspotIds.value = []; deletingBatch.value = false; deletingHotspotId.value = ''; hotspotEditorOpen.value = false; window.addEventListener('pointermove', updateSelectionBox); window.addEventListener('pointerup', stopSelectionSession, { once: true }) }
function duplicateHotspot(hotspot) { if (!dashboardStore.currentFloor) return; const hotspotId = `hotspot-${Date.now()}`; dashboardStore.addHotspot(dashboardStore.currentFloor.id, { id: hotspotId, x: normalizeCoordinate(Number(hotspot.x) + (snapEnabled.value ? Number(stepSize.value) : 1.5)), y: normalizeCoordinate(Number(hotspot.y) + (snapEnabled.value ? Number(stepSize.value) : 1.5)), icon: hotspot.icon, active: hotspot.active, label: `${hotspot.label} 副本`, category: hotspot.category, deviceId: hotspot.deviceId, roomKey: hotspot.roomKey, colorGroup: hotspot.colorGroup }); setEditorHotspot(hotspotId) }
function requestDeleteHotspot(hotspotId) { deletingHotspotId.value = hotspotId }
function cancelDeleteHotspot() { deletingHotspotId.value = '' }
function confirmDeleteHotspot(hotspotId) { if (!dashboardStore.currentFloor) return; dashboardStore.removeHotspot(dashboardStore.currentFloor.id, hotspotId); selectedHotspotIds.value = selectedHotspotIds.value.filter((id) => id !== hotspotId); deletingHotspotId.value = '' }
function nudgeHotspot(hotspot, axis, delta) { if (!dashboardStore.currentFloor) return; dashboardStore.updateHotspot(dashboardStore.currentFloor.id, hotspot.id, axis, normalizeCoordinate(Number(hotspot[axis]) + delta)) }
function applyBatchField(field, value) { if (!dashboardStore.currentFloor) return; selectedHotspotIds.value.forEach((hotspotId) => dashboardStore.updateHotspot(dashboardStore.currentFloor.id, hotspotId, field, value)) }
function requestDeleteBatch() { deletingBatch.value = true }
function cancelDeleteBatch() { deletingBatch.value = false }
function confirmDeleteBatch() { if (!dashboardStore.currentFloor) return; selectedHotspotIds.value.forEach((hotspotId) => dashboardStore.removeHotspot(dashboardStore.currentFloor.id, hotspotId)); selectedHotspotIds.value = []; deletingBatch.value = false }
function setActiveRoomRegion(roomKey) { activeRoomRegionKey.value = roomKey; selectedRoomPointIndex.value = 0; editorSections.value.rooms = true }
function updateRoomAnchorFromPointer(event, roomKey) { if (!roomEditorCanvas.value) return; const bounds = roomEditorCanvas.value.getBoundingClientRect(); dashboardStore.updateRoomAnchor(roomKey, 'x', clampCoordinate(((event.clientX - bounds.left) / bounds.width) * 100).toFixed(1)); dashboardStore.updateRoomAnchor(roomKey, 'y', clampCoordinate(((event.clientY - bounds.top) / bounds.height) * 100).toFixed(1)) }
function stopRoomAnchorDrag() { window.removeEventListener('pointermove', handleRoomAnchorDrag); window.removeEventListener('pointerup', stopRoomAnchorDrag); draggingRoomAnchorKey.value = '' }
function handleRoomAnchorDrag(event) { if (draggingRoomAnchorKey.value) updateRoomAnchorFromPointer(event, draggingRoomAnchorKey.value) }
function startRoomAnchorDrag(event, roomKey) { draggingRoomAnchorKey.value = roomKey; setActiveRoomRegion(roomKey); updateRoomAnchorFromPointer(event, roomKey); window.addEventListener('pointermove', handleRoomAnchorDrag); window.addEventListener('pointerup', stopRoomAnchorDrag, { once: true }) }
function updateRoomPolygonPointFromPointer(event, roomKey, pointIndex) { if (!roomEditorCanvas.value) return; const room = dashboardStore.roomLayers.find((item) => item.key === roomKey); if (!room) return; const bounds = roomEditorCanvas.value.getBoundingClientRect(); const points = parsePolygonPoints(room.polygon); points[pointIndex] = { x: Number(clampCoordinate(((event.clientX - bounds.left) / bounds.width) * 100).toFixed(1)), y: Number(clampCoordinate(((event.clientY - bounds.top) / bounds.height) * 100).toFixed(1)) }; dashboardStore.updateRoomLayer(roomKey, 'polygon', serializePolygonPoints(points)) }
function handleRoomPointDrag(event) { if (draggingRoomPoint.value) updateRoomPolygonPointFromPointer(event, draggingRoomPoint.value.roomKey, draggingRoomPoint.value.pointIndex) }
function stopRoomPointDrag() { window.removeEventListener('pointermove', handleRoomPointDrag); window.removeEventListener('pointerup', stopRoomPointDrag); draggingRoomPoint.value = null }
function startRoomPointDrag(event, roomKey, pointIndex) { draggingRoomPoint.value = { roomKey, pointIndex }; setActiveRoomRegion(roomKey); selectedRoomPointIndex.value = pointIndex; updateRoomPolygonPointFromPointer(event, roomKey, pointIndex); window.addEventListener('pointermove', handleRoomPointDrag); window.addEventListener('pointerup', stopRoomPointDrag, { once: true }) }
function addRoomPolygonPoint() { if (!activeRoomRegion.value) return; const points = parsePolygonPoints(activeRoomRegion.value.polygon); const insertAfterIndex = Math.min(selectedRoomPointIndex.value, points.length - 1); const nextIndex = (insertAfterIndex + 1) % points.length; const currentPoint = points[insertAfterIndex]; const nextPoint = points[nextIndex]; points.splice(insertAfterIndex + 1, 0, { x: Number(((currentPoint.x + nextPoint.x) / 2).toFixed(1)), y: Number(((currentPoint.y + nextPoint.y) / 2).toFixed(1)) }); selectedRoomPointIndex.value = insertAfterIndex + 1; dashboardStore.updateRoomLayer(activeRoomRegion.value.key, 'polygon', serializePolygonPoints(points)) }
function removeRoomPolygonPoint() { if (!activeRoomRegion.value) return; const points = parsePolygonPoints(activeRoomRegion.value.polygon); if (points.length <= 3) return; const removeIndex = Math.min(selectedRoomPointIndex.value, points.length - 1); points.splice(removeIndex, 1); selectedRoomPointIndex.value = Math.max(0, Math.min(removeIndex, points.length - 1)); dashboardStore.updateRoomLayer(activeRoomRegion.value.key, 'polygon', serializePolygonPoints(points)) }

onBeforeUnmount(() => { window.removeEventListener('pointermove', updateDraggedHotspotPosition); window.removeEventListener('pointermove', updateSelectionBox); window.removeEventListener('pointerup', stopDraggingSession); window.removeEventListener('pointerup', stopSelectionSession); window.removeEventListener('pointermove', handleRoomAnchorDrag); window.removeEventListener('pointerup', stopRoomAnchorDrag); window.removeEventListener('pointermove', handleRoomPointDrag); window.removeEventListener('pointerup', stopRoomPointDrag) })
</script>

<template>
  <div class="settings-page">
    <header class="topbar settings-topbar">
      <div class="topbar__brand"><span class="brand-name">Shadow</span><span class="brand-status">HA Connected</span></div>
      <nav class="topbar__nav"><RouterLink class="topbar__tab" to="/dashboard">总览</RouterLink><RouterLink class="topbar__tab" to="/security">安防</RouterLink><RouterLink class="topbar__tab" to="/media">影视</RouterLink></nav>
      <div class="topbar__actions"><button class="icon-button icon-button--ghost" type="button" aria-label="settings"><span class="icon-settings" /></button></div>
    </header>

    <main class="settings-shell">
      <aside class="settings-sidebar">
        <div class="settings-sidebar__head"><p>SETTINGS</p><h1>可配置中台</h1></div>
        <div class="settings-sidebar__menu"><button v-for="item in dashboardStore.settingsMenu" :key="item.key" type="button" class="settings-menu-item" :class="{ 'is-active': item.active }" @click="dashboardStore.selectSettingsMenu(item.key)">{{ settingsMenuLabels[item.key] || item.label }}</button></div>
        <button type="button" class="settings-save-button">保存全部配置</button>
      </aside>

      <section class="settings-content">
        <header class="settings-content__head">
          <h2>{{ currentSettingsMenuKey === 'devices' ? '常用设备库' : currentSettingsMenuKey === 'page' ? '中台页面设置' : currentSettingsMenuKey === 'system' ? '系统设置' : '功能扩展设置' }}</h2>
          <p>{{ currentSettingsMenuKey === 'devices' ? '整理主舞台和快捷控制最常出现的实体卡片，保证设备库与落点布局一致。' : currentSettingsMenuKey === 'page' ? '围绕参考图继续补齐中间舞台和右侧参数面板，保留现有热区编辑、房间编辑和素材切换能力。' : currentSettingsMenuKey === 'system' ? '统一管理通知策略、系统开关和自动化联动入口。' : '汇总扩展能力、后续可接入更多自定义模块与专属页面。' }}</p>
        </header>

        <section v-if="currentSettingsMenuKey === 'devices'" class="settings-panel">
          <div class="device-library-list"><article v-for="group in dashboardStore.commonDeviceGroups" :key="group.key" class="device-library-card"><div class="device-library-card__icon" :class="`is-${group.icon}`" /><div class="device-library-card__body"><strong>{{ group.title }}</strong><p>{{ group.desc }}</p></div><div class="device-library-card__meta">{{ group.count }} 个常用设备</div><button type="button" class="device-library-card__action" @click="dashboardStore.selectSettingsMenu('page')">进入配置</button></article></div>
        </section>

        <section v-else-if="currentSettingsMenuKey === 'page'" class="settings-stage-layout">
          <aside class="settings-toolbox">
            <div class="settings-toolbox__head"><strong>Entity Toolbox</strong><input type="text" placeholder="Search entities..." /></div>
            <div class="settings-toolbox__chips"><button type="button" class="settings-toolbox__chip is-active">all</button><button type="button" class="settings-toolbox__chip">light</button><button type="button" class="settings-toolbox__chip">climate</button><button type="button" class="settings-toolbox__chip">sensor</button></div>
            <section class="settings-toolbox__section"><div class="settings-section-head"><strong>楼层管理</strong><button type="button" class="settings-inline-button" @click="dashboardStore.addFloor()">新增楼层</button></div><div class="settings-floor-list"><article v-for="floor in dashboardStore.floors" :key="floor.id" class="settings-floor-card settings-floor-card--compact" :class="{ 'is-selected': dashboardStore.selectedFloorId === floor.id }" @click="dashboardStore.selectFloor(floor.id)"><div class="settings-floor-card__title"><span>{{ floor.code }}</span><strong>{{ floor.name }}</strong></div><div class="settings-floor-card__stats"><span>{{ floor.hotspots.length }} 个热点</span><span>{{ floor.aspectRatio }}</span></div></article></div></section>
            <section class="settings-toolbox__section"><div class="settings-section-head"><strong>素材资源</strong><button type="button" class="settings-inline-button" @click="triggerUpload()">上传素材</button></div><input ref="fileInput" class="settings-hidden-input" type="file" accept="image/*" @change="handleUpload" /><div class="settings-asset-strip"><button v-for="asset in dashboardStore.floorplanAssets" :key="asset.id" type="button" class="settings-asset-pill" :class="{ 'is-active': asset.preview === dashboardStore.currentFloor?.imagePath }" @click="dashboardStore.applyAssetToCurrentFloor(asset.id)">{{ asset.name }}</button></div></section>
            <section class="settings-toolbox__section"><div class="settings-section-head"><strong>设备库卡片</strong><span class="settings-section-meta">{{ dashboardStore.availableDevices.length }} 个实体</span></div><div class="settings-toolbox__list settings-toolbox__list--dense"><article v-for="group in dashboardStore.commonDeviceGroups" :key="group.key" class="settings-toolbox__item"><div><strong>{{ group.title }}</strong><p>{{ group.key }}</p></div><span>{{ group.count }}</span></article><article v-for="device in dashboardStore.availableDevices.slice(0, 10)" :key="device.id" class="settings-toolbox__item settings-toolbox__item--entity"><div><strong>{{ device.name }}</strong><p>{{ device.id }}</p></div><span>{{ device.category }}</span></article></div></section>
          </aside>

          <section class="settings-stage-center">
            <div class="settings-stage-center__toolbar"><button type="button" class="settings-action-button">保存布局</button><button type="button" class="settings-chip-button" @click="editorSections.rooms = true; editorSections.hotspots = true">展开全部编辑器</button><span class="settings-stage-center__hint">当前楼层：{{ dashboardStore.currentFloor?.name || '未命名楼层' }}</span></div>
            <div class="settings-stage-stats"><article v-for="card in stageSummaryCards" :key="card.id" class="settings-stage-stat"><span>{{ card.label }}</span><strong>{{ card.value }}</strong><p>{{ card.detail }}</p></article></div>
            <div class="settings-stage-preview settings-stage-preview--rich" :style="{ aspectRatio: dashboardStore.currentFloor?.aspectRatio || '1200 / 789' }"><img class="settings-stage-preview__image" :src="dashboardStore.currentFloor?.imagePath" :alt="dashboardStore.currentFloor?.name" /><div class="settings-stage-preview__veil" /><button v-for="room in dashboardStore.roomLayers" :key="room.key" type="button" class="settings-stage-preview__room" :class="{ 'is-active': activeRoomRegionKey === room.key }" :style="{ clipPath: `polygon(${room.polygon})` }" @click="setActiveRoomRegion(room.key)" /><span v-for="room in dashboardStore.roomLayers" :key="`${room.key}-label`" class="settings-stage-preview__label" :style="{ left: `${dashboardStore.roomAnchors.find((anchor) => anchor.key === room.key)?.x ?? 50}%`, top: `${dashboardStore.roomAnchors.find((anchor) => anchor.key === room.key)?.y ?? 50}%` }">{{ room.label }}</span><button v-for="hotspot in dashboardStore.currentFloorHotspots" :key="hotspot.id" type="button" class="settings-stage-preview__hotspot settings-stage-preview__hotspot--detailed" :class="[`is-group-${hotspot.colorGroup}`, { 'is-selected': selectedHotspotIds.includes(hotspot.id) }]" :style="{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }" @click.stop="handleHotspotButtonClick(hotspot.id)"><span class="settings-stage-preview__hotspot-dot" /><span class="settings-stage-preview__hotspot-text">{{ hotspot.label }}</span></button><aside class="settings-stage-preview__legend"><div class="settings-stage-preview__legend-head"><strong>舞台标签</strong><span>{{ stageAnnotations.length }} 项</span></div><div class="settings-stage-preview__legend-list"><div v-for="item in stageAnnotations" :key="item.id" class="settings-stage-preview__legend-item" :class="`is-${item.tone}`"><strong>{{ item.label }}</strong><span>{{ item.roomLabel }}</span></div></div></aside></div>
            <div class="settings-stage-info-bar"><div><strong>编辑态信息</strong><span>已同步主舞台显示、房间热区与楼层素材应用状态</span></div><div class="settings-stage-info-bar__meta"><span>网格吸附 {{ snapEnabled ? '开启' : '关闭' }}</span><span>步进 {{ stepSize }}%</span></div></div>
            <div class="editor-fold">
              <button type="button" class="editor-fold__toggle" @click="toggleEditorSection('hotspots')">
                <div>
                  <strong>热点编辑器</strong>
                  <span>点击空白创建、拖拽、框选、批量编辑、复制、删除与步进微调。</span>
                </div>
                <span class="editor-fold__state">{{ editorSections.hotspots ? '收起' : '展开' }}</span>
              </button>
              <div v-if="editorSections.hotspots" class="editor-fold__content">
                <div class="hotspot-editor-toolbar">
                  <label class="hotspot-stepper">
                    <input v-model="snapEnabled" type="checkbox" />
                    <span>启用网格吸附</span>
                  </label>
                  <label class="hotspot-stepper">
                    <span>步进</span>
                    <select v-model="stepSize">
                      <option :value="0.5">0.5%</option>
                      <option :value="1">1%</option>
                      <option :value="2">2%</option>
                      <option :value="5">5%</option>
                    </select>
                  </label>
                  <label class="hotspot-stepper">
                    <span>默认房间</span>
                    <select v-model="batchRoomKey">
                      <option v-for="room in dashboardStore.roomOptions" :key="room.value" :value="room.value">{{ room.label }}</option>
                    </select>
                  </label>
                  <label class="hotspot-stepper">
                    <span>默认颜色组</span>
                    <select v-model="batchColorGroup">
                      <option v-for="group in dashboardStore.colorGroupOptions" :key="group.value" :value="group.value">{{ group.label }}</option>
                    </select>
                  </label>
                </div>
                <div ref="hotspotCanvas" class="hotspot-canvas" :class="{ 'is-snap-enabled': snapEnabled }" :style="{ aspectRatio: dashboardStore.currentFloor?.aspectRatio || '1200 / 789' }" @pointerdown="startCanvasSelection">
                  <img class="hotspot-canvas__image" :src="dashboardStore.currentFloor?.imagePath" :alt="dashboardStore.currentFloor?.name" />
                  <div class="hotspot-canvas__veil" />
                  <button v-for="hotspot in dashboardStore.currentFloorHotspots" :key="hotspot.id" type="button" class="hotspot-canvas__marker" :class="[`is-${hotspot.icon}`, `is-group-${hotspot.colorGroup}`, { 'is-active': hotspot.active, 'is-selected': selectedHotspotIds.includes(hotspot.id), 'is-dragging': draggingHotspotId === hotspot.id }]" :style="{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }" @pointerdown.stop="startHotspotDrag($event, hotspot.id)" @click.stop="handleHotspotButtonClick(hotspot.id)">
                    <span class="hotspot-canvas__marker-icon" />
                    <span class="hotspot-canvas__marker-label">{{ hotspot.label }}</span>
                  </button>
                  <div v-if="selectionRect" class="hotspot-selection-box" :style="{ left: `${Math.min(selectionRect.startX, selectionRect.currentX)}%`, top: `${Math.min(selectionRect.startY, selectionRect.currentY)}%`, width: `${Math.abs(selectionRect.currentX - selectionRect.startX)}%`, height: `${Math.abs(selectionRect.currentY - selectionRect.startY)}%` }" />
                </div>
                <p class="hotspot-editor-hint">点击热点或右侧点位列表可直接弹出编辑弹窗，框选仍用于批量调整。</p>
                <div v-if="selectedHotspotIds.length > 1" class="hotspot-batch-bar">
                  <strong>批量编辑 {{ selectedHotspotIds.length }} 个热点</strong>
                  <label>
                    <span>房间</span>
                    <select :value="batchRoomKey" @change="applyBatchField('roomKey', $event.target.value)">
                      <option v-for="room in dashboardStore.roomOptions" :key="room.value" :value="room.value">{{ room.label }}</option>
                    </select>
                  </label>
                  <label>
                    <span>颜色组</span>
                    <select :value="batchColorGroup" @change="applyBatchField('colorGroup', $event.target.value)">
                      <option v-for="group in dashboardStore.colorGroupOptions" :key="group.value" :value="group.value">{{ group.label }}</option>
                    </select>
                  </label>
                  <button type="button" class="hotspot-copy-button" @click="requestDeleteBatch()">批量删除</button>
                </div>
                <div v-if="deletingBatch" class="hotspot-delete-confirm">
                  <span>确认删除当前选中的 {{ selectedHotspotIds.length }} 个热点？</span>
                  <div class="hotspot-delete-confirm__actions">
                    <button type="button" class="hotspot-copy-button" @click="cancelDeleteBatch()">取消</button>
                    <button type="button" class="hotspot-remove-button" @click="confirmDeleteBatch()">确认删除</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="editor-fold"><button type="button" class="editor-fold__toggle" @click="toggleEditorSection('rooms')"><div><strong>房间区域编辑器</strong><span>拖动标签、拖动 polygon 顶点、增删顶点，并导出标准化 JSON。</span></div><span class="editor-fold__state">{{ editorSections.rooms ? '收起' : '展开' }}</span></button><div v-if="editorSections.rooms" class="editor-fold__content"><div ref="roomEditorCanvas" class="room-region-canvas" :style="{ aspectRatio: dashboardStore.currentFloor?.aspectRatio || '1200 / 789' }"><img class="room-region-canvas__image" :src="dashboardStore.currentFloor?.imagePath" :alt="dashboardStore.currentFloor?.name" /><div class="room-region-canvas__veil" /><button v-for="room in dashboardStore.roomLayers" :key="room.key" type="button" class="room-region-canvas__layer" :class="{ 'is-active': activeRoomRegionKey === room.key }" :style="{ clipPath: `polygon(${room.polygon})` }" @click="setActiveRoomRegion(room.key)" /><button v-for="anchor in dashboardStore.roomAnchors" :key="anchor.key" type="button" class="room-region-canvas__anchor" :style="{ left: `${anchor.x}%`, top: `${anchor.y}%` }" @pointerdown.stop="startRoomAnchorDrag($event, anchor.key)">{{ dashboardStore.roomLayers.find((room) => room.key === anchor.key)?.label || anchor.key }}</button><button v-for="(point, index) in roomPointList" :key="`${activeRoomRegion?.key || 'room'}-${index}`" type="button" class="room-region-canvas__point" :class="{ 'is-selected': selectedRoomPointIndex === index }" :style="{ left: `${point.x}%`, top: `${point.y}%` }" @pointerdown.stop="startRoomPointDrag($event, activeRoomRegion.key, index)" @click.stop="selectedRoomPointIndex = index"><span>{{ index + 1 }}</span></button></div><div class="room-region-toolbar"><button type="button" class="settings-inline-button" @click="addRoomPolygonPoint()">新增顶点</button><button type="button" class="settings-inline-button" @click="removeRoomPolygonPoint()">删除顶点</button><span class="room-region-toolbar__hint">当前房间 {{ activeRoomRegion?.label }}，共 {{ roomPointList.length }} 个点</span></div><div class="room-region-list"><article v-for="room in dashboardStore.roomLayers" :key="room.key" class="room-region-card" :class="{ 'is-selected': activeRoomRegionKey === room.key }"><div class="room-region-card__header"><div><strong>{{ room.label }}</strong><span>{{ room.key }}</span></div><button type="button" class="settings-inline-button" @click="setActiveRoomRegion(room.key)">设为当前</button></div><div class="room-region-grid"><label><span>房间名称</span><input :value="room.label" type="text" @input="dashboardStore.updateRoomLayer(room.key, 'label', $event.target.value)" /></label><label><span>锚点</span><input :value="`${dashboardStore.roomAnchors.find((anchor) => anchor.key === room.key)?.x ?? 50}, ${dashboardStore.roomAnchors.find((anchor) => anchor.key === room.key)?.y ?? 50}`" type="text" readonly /></label><label class="room-region-grid__wide"><span>Polygon</span><input :value="room.polygon" type="text" @input="dashboardStore.updateRoomLayer(room.key, 'polygon', $event.target.value)" /></label></div></article></div><div class="room-json-export"><div class="room-json-export__head"><strong>标准化 JSON</strong><span>{{ activeRoomAnchor ? `${activeRoomAnchor.x}, ${activeRoomAnchor.y}` : '未选择锚点' }}</span></div><textarea class="room-json-export__textarea" :value="roomOutlineExport" readonly /></div></div></div>
          </section>

          <aside class="settings-widget-panel settings-widget-panel--rich">
            <div class="settings-widget-panel__head">
              <strong>Widget Settings</strong>
              <span>{{ selectedWidgetHotspot?.label || activeRoomRegion?.label || '当前组件' }}</span>
            </div>
            <section class="settings-widget-panel__summary">
              <div class="settings-widget-pill">
                <span>绑定实体</span>
                <strong>{{ selectedWidgetDevice?.name || selectedWidgetHotspot?.deviceId || '未绑定' }}</strong>
              </div>
              <div class="settings-widget-pill">
                <span>房间</span>
                <strong>{{ dashboardStore.roomOptions.find((room) => room.value === selectedWidgetHotspot?.roomKey)?.label || activeRoomRegion?.label || '未设置' }}</strong>
              </div>
              <div class="settings-widget-pill">
                <span>编辑状态</span>
                <strong>{{ selectedHotspotIds.length > 1 ? `批量 ${selectedHotspotIds.length}` : hotspotEditorOpen && activeEditorHotspot ? '弹窗编辑' : '单点编辑' }}</strong>
              </div>
            </section>
            <div class="settings-widget-panel__group">
              <label><span>Entity ID</span><input :value="selectedWidgetHotspot?.deviceId || 'light.living_main'" type="text" readonly /></label>
              <label><span>Widget Type</span><input :value="selectedWidgetHotspot?.icon || 'light'" type="text" readonly /></label>
              <label><span>Overlay Image URL</span><input :value="dashboardStore.currentFloor?.imagePath || '/floorplans/songyue-floorplan.jpg'" type="text" readonly /></label>
            </div>
            <div class="settings-widget-panel__slider"><div class="panel-title-row"><h3>Icon Scale (%)</h3><span>55%</span></div><div class="settings-widget-panel__track"><span /></div></div>
            <div class="settings-widget-panel__group settings-widget-panel__group--grid">
              <label><span>X 坐标 (%)</span><input :value="selectedWidgetHotspot?.x ?? 46.8" type="text" readonly /></label>
              <label><span>Y 坐标 (%)</span><input :value="selectedWidgetHotspot?.y ?? 48.3" type="text" readonly /></label>
              <label><span>颜色组</span><input :value="selectedWidgetHotspot?.colorGroup || 'blue'" type="text" readonly /></label>
              <label><span>分类</span><input :value="selectedWidgetHotspot?.category || 'lights'" type="text" readonly /></label>
            </div>
            <section class="settings-widget-panel__section">
              <div class="settings-section-head"><strong>点位标签列表</strong><span class="settings-section-meta">{{ dashboardStore.currentFloorHotspots.length }} 项</span></div>
              <div class="settings-selection-list">
                <button v-for="hotspot in dashboardStore.currentFloorHotspots" :key="`${hotspot.id}-panel`" type="button" class="settings-selection-item" :class="{ 'is-selected': selectedHotspotIds.includes(hotspot.id) }" @click="setEditorHotspot(hotspot.id)">
                  <div><strong>{{ hotspot.label }}</strong><span>{{ hotspot.deviceId }}</span></div>
                  <em>{{ hotspot.roomKey }}</em>
                </button>
              </div>
            </section>
            <section class="settings-widget-panel__section">
              <div class="settings-section-head"><strong>房间编辑摘要</strong><span class="settings-section-meta">{{ activeRoomRegion?.key }}</span></div>
              <div class="settings-widget-panel__room-meta">
                <div><span>当前房间</span><strong>{{ activeRoomRegion?.label }}</strong></div>
                <div><span>标签锚点</span><strong>{{ activeRoomAnchor?.x ?? 50 }}, {{ activeRoomAnchor?.y ?? 50 }}</strong></div>
                <div><span>顶点数量</span><strong>{{ roomPointList.length }}</strong></div>
                <div><span>预览图层</span><strong>已同步</strong></div>
              </div>
            </section>
            <button type="button" class="settings-widget-panel__danger">Delete Widget</button>
          </aside>
        </section>

        <section v-else class="settings-panel"><div class="system-card-list"><article v-for="item in dashboardStore.notifications" :key="item.id" class="system-card"><div><strong>{{ item.label }}</strong><p>统一管理全局通知、离线提醒与自动化联动的启停状态。</p></div><div class="toggle-switch" :class="{ 'is-on': item.enabled }"><span /></div></article></div></section>
      </section>
    </main>

    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="hotspotEditorOpen && activeEditorHotspot" class="category-modal hotspot-editor-modal">
          <div class="category-modal__scrim" @click="closeHotspotEditor()" />
          <div class="category-modal__panel hotspot-editor-modal__panel" @click.stop>
            <header class="category-modal__header hotspot-editor-modal__header">
              <div class="category-modal__title-wrap">
                <div class="category-modal__icon hotspot-editor-modal__icon" />
                <div class="hotspot-editor-modal__title-copy">
                  <p>HOTSPOT EDITOR</p>
                  <h2>{{ activeEditorHotspot.label }}</h2>
                </div>
                <span class="category-modal__count">{{ dashboardStore.roomOptions.find((room) => room.value === activeEditorHotspot.roomKey)?.label || activeEditorHotspot.roomKey }}</span>
              </div>
              <button type="button" class="category-modal__close" @click="closeHotspotEditor()">×</button>
            </header>
            <div class="hotspot-editor-modal__body">
              <div class="hotspot-editor-modal__meta">
                <div><span>实体绑定</span><strong>{{ activeEditorHotspot.deviceId || '未绑定实体' }}</strong></div>
                <div><span>颜色组</span><strong>{{ activeEditorHotspot.colorGroup }}</strong></div>
                <div><span>坐标</span><strong>{{ activeEditorHotspot.x }}, {{ activeEditorHotspot.y }}</strong></div>
              </div>
              <div v-if="deletingHotspotId === activeEditorHotspot.id" class="hotspot-delete-confirm">
                <span>确认删除 {{ activeEditorHotspot.label }}？</span>
                <div class="hotspot-delete-confirm__actions">
                  <button type="button" class="hotspot-copy-button" @click="cancelDeleteHotspot()">取消</button>
                  <button type="button" class="hotspot-remove-button" @click="confirmDeleteHotspot(activeEditorHotspot.id)">确认删除</button>
                </div>
              </div>
              <div class="hotspot-editor-grid">
                <label class="hotspot-editor-grid__wide">
                  <span>显示名称</span>
                  <input :value="activeEditorHotspot.label" type="text" @input="dashboardStore.updateHotspot(dashboardStore.currentFloor.id, activeEditorHotspot.id, 'label', $event.target.value)" />
                </label>
                <label>
                  <span>实体绑定</span>
                  <select :value="activeEditorHotspot.deviceId" @change="dashboardStore.updateHotspot(dashboardStore.currentFloor.id, activeEditorHotspot.id, 'deviceId', $event.target.value)">
                    <option v-for="device in dashboardStore.availableDevices" :key="device.id" :value="device.id">{{ device.name }} / {{ device.id }}</option>
                  </select>
                </label>
                <label>
                  <span>控件类型</span>
                  <select :value="activeEditorHotspot.icon" @change="dashboardStore.updateHotspot(dashboardStore.currentFloor.id, activeEditorHotspot.id, 'icon', $event.target.value)">
                    <option v-for="type in hotspotTypeOptions" :key="type.value" :value="type.value">{{ type.label }}</option>
                  </select>
                </label>
                <label>
                  <span>所属房间</span>
                  <select :value="activeEditorHotspot.roomKey" @change="dashboardStore.updateHotspot(dashboardStore.currentFloor.id, activeEditorHotspot.id, 'roomKey', $event.target.value)">
                    <option v-for="room in dashboardStore.roomOptions" :key="room.value" :value="room.value">{{ room.label }}</option>
                  </select>
                </label>
                <label>
                  <span>颜色组</span>
                  <select :value="activeEditorHotspot.colorGroup" @change="dashboardStore.updateHotspot(dashboardStore.currentFloor.id, activeEditorHotspot.id, 'colorGroup', $event.target.value)">
                    <option v-for="group in dashboardStore.colorGroupOptions" :key="group.value" :value="group.value">{{ group.label }}</option>
                  </select>
                </label>
                <label>
                  <span>X 坐标 (%)</span>
                  <input :value="activeEditorHotspot.x" type="number" step="0.1" @input="dashboardStore.updateHotspot(dashboardStore.currentFloor.id, activeEditorHotspot.id, 'x', normalizeCoordinate($event.target.value))" />
                </label>
                <label>
                  <span>Y 坐标 (%)</span>
                  <input :value="activeEditorHotspot.y" type="number" step="0.1" @input="dashboardStore.updateHotspot(dashboardStore.currentFloor.id, activeEditorHotspot.id, 'y', normalizeCoordinate($event.target.value))" />
                </label>
              </div>
              <div class="hotspot-nudge-panel">
                <span>步进微调</span>
                <div class="hotspot-nudge-panel__controls">
                  <button type="button" class="settings-inline-button" @click="nudgeHotspot(activeEditorHotspot, 'x', -Number(stepSize))">左</button>
                  <button type="button" class="settings-inline-button" @click="nudgeHotspot(activeEditorHotspot, 'x', Number(stepSize))">右</button>
                  <button type="button" class="settings-inline-button" @click="nudgeHotspot(activeEditorHotspot, 'y', -Number(stepSize))">上</button>
                  <button type="button" class="settings-inline-button" @click="nudgeHotspot(activeEditorHotspot, 'y', Number(stepSize))">下</button>
                </div>
              </div>
              <div class="hotspot-editor-modal__footer">
                <button type="button" class="hotspot-copy-button" @click="duplicateHotspot(activeEditorHotspot)">复制热点</button>
                <button type="button" class="hotspot-remove-button" @click="requestDeleteHotspot(activeEditorHotspot.id)">删除热点</button>
                <button type="button" class="settings-action-button" @click="closeHotspotEditor()">完成编辑</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

