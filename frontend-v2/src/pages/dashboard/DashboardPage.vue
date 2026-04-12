<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import AppTopBar from '../../features/topbar/AppTopBar.vue'
import BottomStatsBar from '../../features/bottom-stats/BottomStatsBar.vue'
import ClimateCategoryModal from '../../features/category-modals/ClimateCategoryModal.vue'
import DeviceCategoryModal from '../../features/category-modals/DeviceCategoryModal.vue'
import EntityToolbox from '../../features/entity-toolbox/EntityToolbox.vue'
import EventConsole from '../../features/event-console/EventConsole.vue'
import FloorplanStage from '../../features/floorplan-stage/FloorplanStage.vue'
import HotspotPropertiesPanel from '../../features/hotspot-editor/HotspotPropertiesPanel.vue'
import RightSidebar from '../../features/right-sidebar/RightSidebar.vue'
import { buildRuntimeEntityToolboxItems } from '../../domain/settings/runtimeEntityToolboxAdapters'
import {
  settingsHotspotCategoryOptions,
  settingsHotspotTypeOptions,
} from '../../domain/settings/settingsHotspotFieldOptions'
import { buildSettingsStageModel } from '../../domain/settings/settingsStageAdapters'
import { derivePanelKind } from '../../domain/scene/sceneAdapters'
import { useAuthStore } from '../../stores/auth'
import { useDashboardStore } from '../../stores/dashboard'
import { useSceneStore } from '../../stores/scene'
import { useSettingsEditorStore } from '../../stores/settingsEditor'

const authStore = useAuthStore()
const dashboardStore = useDashboardStore()
const sceneStore = useSceneStore()
const settingsStore = useSettingsEditorStore()

const selectedStageDevice = computed(() => sceneStore.getDevice(dashboardStore.selectedStageDeviceId))
const selectedPanelKind = computed(() => derivePanelKind(selectedStageDevice.value))
const isDeveloperLayoutEditMode = computed(() => settingsStore.developerLayoutEditEnabled)
const shouldUseDraftStageModel = computed(() =>
  isDeveloperLayoutEditMode.value || settingsStore.developerLayoutViewDraftEnabled,
)
const dashboardStageMode = computed(() => (isDeveloperLayoutEditMode.value ? 'edit' : 'view'))
const dashboardStageModel = computed(() =>
  shouldUseDraftStageModel.value
    ? buildSettingsStageModel(
      settingsStore.activeDraftFloor,
      settingsStore.activeDraftHotspots,
      settingsStore.roomOptions,
    )
    : sceneStore.stageModel,
)
const dashboardSelectedHotspotId = computed(() =>
  isDeveloperLayoutEditMode.value
    ? settingsStore.selectedDraftHotspotId
    : dashboardStore.selectedStageDeviceId,
)
const activeDashboardDraftHotspot = computed(
  () => settingsStore.activeDraftHotspots.find((item) => item.id === settingsStore.selectedDraftHotspotId) ?? null,
)
const dashboardRuntimeEntityLibrary = computed(() =>
  Object.values(sceneStore.devicesById || {})
    .filter((device) => device && device.id !== undefined && device.id !== null)
    .map((device) => ({
      id: String(device.id),
      name: device.name || `设备 ${device.id}`,
      category: String(device.category || 'other'),
      entityDomain: String(device.entityDomain || ''),
      deviceType: String(device.deviceType || ''),
      applianceType: String(device.applianceType || ''),
    }))
    .sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name, 'zh-CN')
      if (nameCompare !== 0) {
        return nameCompare
      }
      return a.id.localeCompare(b.id, 'en-US')
    }),
)
const dashboardEffectiveEntityLibrary = computed(() =>
  dashboardRuntimeEntityLibrary.value.length
    ? dashboardRuntimeEntityLibrary.value
    : settingsStore.draftEntityLibrary,
)
const dashboardEntityToolboxItems = computed(() =>
  buildRuntimeEntityToolboxItems(
    dashboardEffectiveEntityLibrary.value,
    settingsStore.activeDraftHotspots,
    settingsStore.roomOptions,
  ),
)
const dashboardDefaultEntityId = computed(() => dashboardEffectiveEntityLibrary.value[0]?.id ?? '')
const dashboardSelectedEntityId = computed(() => String(activeDashboardDraftHotspot.value?.deviceId ?? ''))
const dashboardCanBindFromToolbox = computed(
  () => isDeveloperLayoutEditMode.value && Boolean(activeDashboardDraftHotspot.value),
)
const hasHydratedRuntimeHotspots = ref(false)
const lastManualDraftSaveAt = ref(0)
const editToolbarStatusText = computed(() =>
  lastManualDraftSaveAt.value > 0
    ? `已手动保存 ${new Date(lastManualDraftSaveAt.value).toLocaleTimeString('zh-CN', { hour12: false })}`
    : '草稿会自动缓存，可随时手动保存。',
)

const activeDeviceModalDevices = computed(() =>
  dashboardStore.activeCategory === 'device' && selectedStageDevice.value ? [selectedStageDevice.value] : [],
)

const activeClimateModalDevices = computed(() =>
  dashboardStore.activeCategory === 'climate' && selectedStageDevice.value ? [selectedStageDevice.value] : [],
)

const activeDeviceModalTitle = computed(() => selectedStageDevice.value?.name || '设备控制')
const activeClimateModalTitle = computed(() => selectedStageDevice.value?.name || '温控控制')

watch(
  () => authStore.isAuthenticated,
  async (isAuthenticated) => {
    if (!isAuthenticated) {
      sceneStore.disconnectRealtime()
      return
    }

    try {
      await sceneStore.loadScene()
      sceneStore.connectRealtime()
    } catch {
      sceneStore.disconnectRealtime()
    }
  },
  { immediate: true },
)

watch(
  () => dashboardRuntimeEntityLibrary.value,
  (nextLibrary) => {
    settingsStore.syncDraftEntityLibrary(nextLibrary)
  },
  { immediate: true, deep: true },
)

watch(
  [() => isDeveloperLayoutEditMode.value, () => sceneStore.lastLoadedAt],
  ([editEnabled]) => {
    if (!editEnabled || !settingsStore.activeDraftFloor) {
      return
    }

    const runtimeStageHotspots = Array.isArray(sceneStore.stageModel?.hotspots)
      ? sceneStore.stageModel.hotspots
      : []
    if (!runtimeStageHotspots.length) {
      return
    }

    const draftHotspots = Array.isArray(settingsStore.activeDraftHotspots)
      ? settingsStore.activeDraftHotspots
      : []
    const runtimeDeviceIds = new Set(runtimeStageHotspots.map((item) => String(item?.deviceId ?? '')))
    const matchedDraftCount = draftHotspots.filter((item) => runtimeDeviceIds.has(String(item?.deviceId ?? ''))).length
    const shouldHydrateDraft =
      !hasHydratedRuntimeHotspots.value
      || draftHotspots.length === 0
      || matchedDraftCount === 0
      || Math.abs(draftHotspots.length - runtimeStageHotspots.length) >= 2

    if (!shouldHydrateDraft) {
      return
    }

    settingsStore.replaceActiveDraftFloorHotspots(runtimeStageHotspots, {
      imagePath: sceneStore.stageModel?.imageUrl,
      aspectRatio: sceneStore.stageModel?.aspectRatio,
    })
    hasHydratedRuntimeHotspots.value = true
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  sceneStore.disconnectRealtime()
})

function handleStageDeviceInteract(hotspot) {
  if (isDeveloperLayoutEditMode.value) {
    return
  }

  const device = sceneStore.getDevice(hotspot.deviceId)
  dashboardStore.focusDevice(hotspot.deviceId)

  if (!device) {
    return
  }

  if (hotspot.interactionKind === 'direct') {
    sceneStore.controlDirectDevice(hotspot.deviceId).catch(() => {})
    return
  }

  const panelKind = derivePanelKind(device)
  if (panelKind) {
    dashboardStore.openCategory(panelKind, hotspot.deviceId)
  }
}

function handleDraftHotspotSelect(hotspotId) {
  if (!isDeveloperLayoutEditMode.value) {
    return
  }
  settingsStore.selectDraftHotspot(hotspotId)
}

function handleDraftHotspotMove(payload) {
  if (!isDeveloperLayoutEditMode.value || !payload?.hotspotId) {
    return
  }
  settingsStore.updateDraftHotspotPosition(payload.hotspotId, payload.x, payload.y)
}

function handleDraftHotspotCreate(position) {
  if (!isDeveloperLayoutEditMode.value || !settingsStore.activeDraftFloor) {
    return
  }

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
    deviceId: String(currentHotspot?.deviceId ?? dashboardDefaultEntityId.value ?? ''),
  })
  settingsStore.selectDraftHotspot(hotspotId)
}

function handleDraftHotspotRemove(hotspotId) {
  if (!isDeveloperLayoutEditMode.value) {
    return
  }
  settingsStore.removeDraftHotspotById(hotspotId)
}

function handleDraftHotspotRotate(payload) {
  const hotspotId = payload?.hotspotId
  if (!isDeveloperLayoutEditMode.value || !hotspotId) {
    return
  }

  const hotspot = settingsStore.activeDraftHotspots.find((item) => item.id === hotspotId)
  const baseRotation = Number(hotspot?.rotation ?? 0)
  settingsStore.updateDraftHotspotRotation(hotspotId, baseRotation + Number(payload?.delta || 0))
}

function handleDashboardToolboxSelectEntity(entityId) {
  if (
    !isDeveloperLayoutEditMode.value
    || !settingsStore.activeDraftFloor
    || !activeDashboardDraftHotspot.value
  ) {
    return
  }

  settingsStore.updateDraftHotspot(
    settingsStore.activeDraftFloor.id,
    activeDashboardDraftHotspot.value.id,
    'deviceId',
    String(entityId ?? ''),
  )
}

function clampCoordinate(value) {
  return Math.min(100, Math.max(0, value))
}

function handleDashboardPanelFieldUpdate(payload) {
  const hotspot = activeDashboardDraftHotspot.value
  if (
    !isDeveloperLayoutEditMode.value
    || !settingsStore.activeDraftFloor
    || !hotspot
    || !payload?.field
  ) {
    return
  }

  settingsStore.updateDraftHotspot(
    settingsStore.activeDraftFloor.id,
    hotspot.id,
    payload.field,
    payload.value,
  )
}

function handleDashboardPanelCoordinateUpdate(payload) {
  const hotspot = activeDashboardDraftHotspot.value
  if (!isDeveloperLayoutEditMode.value || !hotspot || !payload?.axis) {
    return
  }
  const numeric = clampCoordinate(Number(payload.value) || 0)
  settingsStore.updateDraftHotspotPosition(
    hotspot.id,
    payload.axis === 'x' ? numeric : Number(hotspot.x ?? 0),
    payload.axis === 'y' ? numeric : Number(hotspot.y ?? 0),
  )
}

function handleDashboardPanelRotationUpdate(value) {
  const hotspot = activeDashboardDraftHotspot.value
  if (!isDeveloperLayoutEditMode.value || !hotspot) {
    return
  }
  settingsStore.updateDraftHotspotRotation(hotspot.id, Number(value) || 0)
}

function handleDashboardPanelDeviceUpdate(deviceId) {
  if (!activeDashboardDraftHotspot.value) {
    return
  }
  handleDashboardPanelFieldUpdate({ field: 'deviceId', value: String(deviceId ?? '') })
}

function handleEditToolbarSaveDraft() {
  settingsStore.persistDraftNow()
  settingsStore.setDeveloperLayoutViewDraftEnabled(true)
  lastManualDraftSaveAt.value = Date.now()
}

function handleEditToolbarResetDraft() {
  const shouldReset = window.confirm('确认将草稿重置到安全基线吗？')
  if (!shouldReset) {
    return
  }
  settingsStore.resetDraftState()
  settingsStore.setDeveloperLayoutEditEnabled(true)
  settingsStore.setDeveloperLayoutViewDraftEnabled(false)
  settingsStore.selectDraftHotspot('')
}

function handleEditToolbarExitEdit() {
  settingsStore.setDeveloperLayoutEditEnabled(false)
}

function handleDeviceToggle(deviceId) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'toggle' }).catch(() => {})
}

function handleDevicePress(deviceId) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'press' }).catch(() => {})
}

function handleDeviceNumber(deviceId, value) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-number', value }).catch(() => {})
}

function handleDeviceOption(deviceId, option) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-option', option }).catch(() => {})
}

function handleDeviceBrightness(deviceId, value) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-brightness', value }).catch(() => {})
}

function handleDeviceColorTemperature(deviceId, value) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-color-temperature', value }).catch(() => {})
}

function handleClimateToggle(deviceId) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'toggle' }).catch(() => {})
}

function handleClimateAdjust(deviceId, delta) {
  const device = sceneStore.getDevice(deviceId)
  if (!device || device.targetTemperature == null) {
    return
  }
  sceneStore.controlDeviceByIntent(deviceId, {
    type: 'set-target-temperature',
    value: Number(device.targetTemperature) + delta,
  }).catch(() => {})
}

function handleClimateMode(deviceId, option) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-hvac-mode', option }).catch(() => {})
}

function handleClimateOption(deviceId, option) {
  sceneStore.controlDeviceByIntent(deviceId, { type: 'set-option', option }).catch(() => {})
}
</script>

<template>
  <div class="dashboard-page">
    <AppTopBar />

    <main class="dashboard-main">
      <section class="dashboard-stage-wrap" :class="{ 'dashboard-stage-wrap--edit': isDeveloperLayoutEditMode }">
        <aside v-if="isDeveloperLayoutEditMode" class="dashboard-edit-toolbox">
          <EntityToolbox
            title="实体工具箱"
            :entities="dashboardEntityToolboxItems"
            :selected-entity-id="dashboardSelectedEntityId"
            :can-bind="dashboardCanBindFromToolbox"
            @select-entity="handleDashboardToolboxSelectEntity"
          />
        </aside>

        <div class="dashboard-stage-surface">
          <div v-if="isDeveloperLayoutEditMode" class="dashboard-edit-toolbar">
            <div class="dashboard-edit-toolbar__meta">
              <strong>布局编辑（Draft）</strong>
              <span>{{ editToolbarStatusText }}</span>
            </div>
            <div class="dashboard-edit-toolbar__actions">
              <button type="button" class="settings-action-button" @click="handleEditToolbarSaveDraft()">保存草稿</button>
              <button type="button" class="settings-inline-button" @click="handleEditToolbarResetDraft()">重置草稿</button>
              <button type="button" class="settings-inline-button" @click="handleEditToolbarExitEdit()">退出编辑</button>
            </div>
          </div>

          <FloorplanStage
            :stage-model="dashboardStageModel"
            :mode="dashboardStageMode"
            :selected-hotspot-id="dashboardSelectedHotspotId"
            :pending-device-ids="sceneStore.pendingDeviceIds"
            :loading="sceneStore.loading"
            :error="sceneStore.error"
            @device-interact="handleStageDeviceInteract"
            @hotspot-select="handleDraftHotspotSelect"
            @hotspot-position-change="handleDraftHotspotMove"
            @hotspot-create="handleDraftHotspotCreate"
            @hotspot-remove="handleDraftHotspotRemove"
            @hotspot-rotate="handleDraftHotspotRotate"
          />

          <div class="dashboard-stage-console">
            <EventConsole />
          </div>
        </div>
      </section>

      <aside class="dashboard-sidebar">
        <HotspotPropertiesPanel
          v-if="isDeveloperLayoutEditMode"
          title="热点属性"
          :hotspot="activeDashboardDraftHotspot"
          :entity-options="dashboardEntityToolboxItems"
          :type-options="settingsHotspotTypeOptions"
          :category-options="settingsHotspotCategoryOptions"
          @update-field="handleDashboardPanelFieldUpdate"
          @update-coordinate="handleDashboardPanelCoordinateUpdate"
          @update-rotation="handleDashboardPanelRotationUpdate"
          @update-device="handleDashboardPanelDeviceUpdate"
        />
        <RightSidebar v-else />
      </aside>
    </main>

    <div class="dashboard-bottom-shell dashboard-bottom-shell--stats-only">
      <BottomStatsBar />
    </div>

    <DeviceCategoryModal
      :open="dashboardStore.activeCategory === 'device'"
      :title="activeDeviceModalTitle"
      icon="light"
      :count="activeDeviceModalDevices.length"
      :devices="activeDeviceModalDevices"
      :selected-device-id="dashboardStore.selectedStageDeviceId"
      :pending-device-ids="sceneStore.pendingDeviceIds"
      @close="dashboardStore.closeCategoryModal()"
      @focus="dashboardStore.focusDevice($event)"
      @toggle="handleDeviceToggle"
      @press="handleDevicePress"
      @set-number="handleDeviceNumber"
      @set-option="handleDeviceOption"
      @set-brightness="handleDeviceBrightness"
      @set-color-temperature="handleDeviceColorTemperature"
    />

    <ClimateCategoryModal
      :open="dashboardStore.activeCategory === 'climate'"
      :title="activeClimateModalTitle"
      :count="activeClimateModalDevices.length"
      :devices="activeClimateModalDevices"
      :selected-device-id="dashboardStore.selectedStageDeviceId"
      :pending-device-ids="sceneStore.pendingDeviceIds"
      @close="dashboardStore.closeCategoryModal()"
      @focus="dashboardStore.focusDevice($event)"
      @toggle-power="handleClimateToggle"
      @adjust-temp="handleClimateAdjust"
      @set-mode="handleClimateMode"
      @set-option="handleClimateOption"
    />
  </div>
</template>
