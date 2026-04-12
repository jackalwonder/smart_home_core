<script setup>
import { computed, ref } from 'vue'

import { useStageEditorInteractions } from './useStageEditorInteractions'

const props = defineProps({
  stageModel: {
    type: Object,
    default: () => ({
      imageUrl: '/floorplans/songyue-floorplan.jpg',
      aspectRatio: '1200 / 789',
      rooms: [],
      hotspots: [],
    }),
  },
  mode: {
    type: String,
    default: 'view',
    validator: (value) => ['view', 'edit'].includes(value),
  },
  selectedHotspotId: {
    type: [String, Number],
    default: '',
  },
  pendingDeviceIds: {
    type: Object,
    default: () => ({}),
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
  showSummary: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits([
  'device-interact',
  'hotspot-select',
  'hotspot-position-change',
  'hotspot-create',
  'hotspot-remove',
  'hotspot-rotate',
])

const stageCanvasRef = ref(null)

const stageHotspots = computed(() => props.stageModel?.hotspots || [])
const activeLightCount = computed(() => stageHotspots.value.filter((item) => item.icon === 'light' && item.active).length)
const isEditMode = computed(() => props.mode === 'edit')

const stageEditorInteractions = useStageEditorInteractions({
  stageCanvasRef,
  onSelect: (hotspotId) => emit('hotspot-select', hotspotId),
  onMove: (hotspotId, position) => emit('hotspot-position-change', { hotspotId, ...position }),
  onCreate: (position) => emit('hotspot-create', position),
  onRotate: (hotspotId, delta) => emit('hotspot-rotate', { hotspotId, delta }),
})

function handleHotspotClick(hotspot) {
  if (isEditMode.value) {
    stageEditorInteractions.handleHotspotClick(hotspot.id)
    return
  }
  emit('device-interact', hotspot)
}

function handleHotspotPointerDown(event, hotspot) {
  if (!isEditMode.value) {
    return
  }
  event.preventDefault()
  stageEditorInteractions.startDrag(event, hotspot.id)
}

function handleHotspotWheel(event, hotspot) {
  if (!isEditMode.value) {
    return
  }
  event.preventDefault()
  const delta = event.deltaY > 0 ? 15 : -15
  stageEditorInteractions.handleRotate(hotspot.id, delta)
}

function handleCanvasPointerDown(event) {
  if (!isEditMode.value) {
    return
  }
  stageEditorInteractions.handleCanvasPointerDown(event)
}

function handleCanvasPointerUp(event) {
  if (!isEditMode.value) {
    return
  }
  stageEditorInteractions.handleCanvasPointerUp(event)
}

function handleRemoveHotspot(event, hotspotId) {
  event.stopPropagation()
  if (!isEditMode.value) {
    return
  }
  emit('hotspot-remove', hotspotId)
}
</script>

<template>
  <section class="stage" :class="{ 'stage--edit': isEditMode }">
    <div
      ref="stageCanvasRef"
      class="stage__canvas"
      :style="{ aspectRatio: stageModel.aspectRatio || '1200 / 789' }"
      @pointerdown="handleCanvasPointerDown"
      @pointerup="handleCanvasPointerUp"
    >
      <div class="stage__frame">
        <img
          class="stage__floorplan"
          :src="stageModel.imageUrl"
          alt="当前主舞台户型图"
        >
      </div>

      <div class="stage__backdrop-mask" />
      <div class="stage__edge-shadow stage__edge-shadow--left" />
      <div class="stage__edge-shadow stage__edge-shadow--right" />
      <div class="stage__edge-shadow stage__edge-shadow--bottom" />

      <button
        v-for="hotspot in stageHotspots"
        :key="hotspot.id"
        type="button"
        class="stage-hotspot"
        :class="[
          `is-${hotspot.icon}`,
          hotspot.colorGroup ? `is-group-${hotspot.colorGroup}` : '',
          hotspot.category ? `is-category-${hotspot.category}` : '',
          {
            'is-active': hotspot.active,
            'is-selected': String(selectedHotspotId) === String(hotspot.id),
            'is-pending': !isEditMode && pendingDeviceIds[hotspot.deviceId],
            'is-editable': isEditMode,
          },
        ]"
        :style="{
          left: `${hotspot.x}%`,
          top: `${hotspot.y}%`,
          transform: `translate(-50%, -50%) rotate(${hotspot.rotation || 0}deg)`,
        }"
        :aria-label="hotspot.label"
        @pointerdown="handleHotspotPointerDown($event, hotspot)"
        @wheel="handleHotspotWheel($event, hotspot)"
        @click="handleHotspotClick(hotspot)"
      >
        <span class="stage-hotspot__icon" />
        <span v-if="isEditMode" class="stage-hotspot__label">{{ hotspot.label }}</span>
        <span
          v-if="isEditMode && String(selectedHotspotId) === String(hotspot.id)"
          class="stage-hotspot__remove"
          @click="handleRemoveHotspot($event, hotspot.id)"
        >
          ×
        </span>
      </button>

      <div v-if="loading && !stageHotspots.length" class="stage__status stage__status--loading">
        正在加载主舞台...
      </div>

      <div v-else-if="error && !stageHotspots.length" class="stage__status stage__status--error">
        {{ error }}
      </div>
    </div>

    <div v-if="showSummary" class="stage__summary">
      <div class="stage-chip">
        <span class="stage-chip__label">热点</span>
        <strong>{{ stageHotspots.length }}</strong>
      </div>
      <div class="stage-chip stage-chip--active">
        <span class="stage-chip__label">灯光</span>
        <strong>{{ activeLightCount }}</strong>
      </div>
      <div class="stage-chip">
        <span class="stage-chip__label">模式</span>
        <strong>{{ isEditMode ? '编辑' : '查看' }}</strong>
      </div>
    </div>
  </section>
</template>

