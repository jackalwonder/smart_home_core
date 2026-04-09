<script setup>
import { computed, ref } from 'vue'

import {
  MATERIAL_TONES,
  ROOM_AMBIENT_PRESETS,
  ROOM_SPATIAL_PRESETS,
} from '../config/floorMapConfig'
import { getControlFeedbackPresentation } from '../utils/controlFeedback'

const props = defineProps({
  selectedRoom: {
    type: Object,
    default: null,
  },
  selectedRoomVisualConfig: {
    type: Object,
    default: null,
  },
  selectedRoomDevices: {
    type: Array,
    default: () => [],
  },
  selectedDevice: {
    type: Object,
    default: null,
  },
  selectedOpeningIndex: {
    type: Number,
    default: null,
  },
  selectedOpening: {
    type: Object,
    default: null,
  },
  exportStatus: {
    type: Object,
    default: () => ({
      tone: 'idle',
      message: '',
    }),
  },
  exportJson: {
    type: String,
    default: '',
  },
  hasDraftChanges: {
    type: Boolean,
    default: false,
  },
  canRestoreImportSnapshot: {
    type: Boolean,
    default: false,
  },
  lastImportMeta: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits([
  'select-room',
  'select-device',
  'select-opening',
  'update-room-frame',
  'update-room-visual',
  'add-opening',
  'update-opening',
  'remove-opening',
  'reset-selected-room',
  'reset-selected-device',
  'reset-all',
  'import-json',
  'import-file',
  'restore-import-snapshot',
  'copy-export',
  'download-export',
])

const ambientPresetOptions = Object.keys(ROOM_AMBIENT_PRESETS)
const materialToneOptions = Object.keys(MATERIAL_TONES)
const spatialPresetOptions = Object.keys(ROOM_SPATIAL_PRESETS)
const edgeOptions = ['left', 'right', 'top', 'bottom']
const openingTypeOptions = ['window', 'door', 'balcony']
const daylightDirectionOptions = ['left', 'right', 'top', 'bottom']

const exportStatusClass = computed(() =>
  getControlFeedbackPresentation(props.exportStatus?.tone ?? 'idle').surfaceClass,
)
const importText = ref('')

function updateFrame(key, event) {
  emit('update-room-frame', { [key]: Number(event.target.value) })
}

function updateVisual(key, event) {
  emit('update-room-visual', { [key]: event.target.value })
}

function updateVisualNumber(key, event) {
  emit('update-room-visual', { [key]: Number(event.target.value) })
}

function updateOpening(key, event) {
  emit('update-opening', props.selectedOpeningIndex, { [key]: event.target.value })
}

function updateOpeningNumber(key, event) {
  emit('update-opening', props.selectedOpeningIndex, { [key]: Number(event.target.value) })
}

function submitImport() {
  emit('import-json', importText.value)
}

function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (file) {
    emit('import-file', file)
  }

  event.target.value = ''
}
</script>

<template>
  <section class="shell-surface-muted p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="shell-kicker">Dev Editor</p>
        <h3 class="shell-title-section mt-3">配置标注模式</h3>
        <p class="shell-copy mt-3 text-sm">
          这里修改的是开发草稿，不会直接改生产数据源。主舞台会即时反映改动，最后导出 JSON 片段即可。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="shell-chip shell-chip--interactive"
          :disabled="!canRestoreImportSnapshot"
          @click="emit('restore-import-snapshot')"
        >
          恢复导入前
        </button>
        <button type="button" class="shell-chip shell-chip--interactive" @click="emit('copy-export')">复制 JSON</button>
        <button type="button" class="shell-chip shell-chip--interactive" @click="emit('download-export')">下载 JSON</button>
        <button type="button" class="shell-chip shell-chip--interactive" :disabled="!hasDraftChanges" @click="emit('reset-all')">恢复默认</button>
      </div>
    </div>

    <div class="mt-4 p-4 text-sm" :class="exportStatusClass">
      {{ exportStatus.message }}
    </div>

    <div class="mt-5 shell-card p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="shell-heading">导入 editor JSON</p>
          <p class="shell-meta mt-1">支持直接粘贴 JSON 或上传导出的 JSON 文件。导入成功后会立即热加载到当前主舞台。</p>
        </div>
        <label class="shell-chip shell-chip--interactive cursor-pointer">
          上传 JSON
          <input class="hidden" type="file" accept="application/json,.json" @change="handleFileChange">
        </label>
      </div>

      <textarea
        v-model="importText"
        class="floor-map-editor__input mt-4 min-h-[160px] resize-y font-mono text-xs leading-6"
        placeholder="把之前导出的 editor JSON 粘贴到这里，然后点击“导入并热加载”。"
      />

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" class="shell-chip shell-chip--interactive" @click="submitImport">导入并热加载</button>
        <button type="button" class="shell-chip shell-chip--interactive" @click="importText = ''">清空粘贴区</button>
      </div>

      <div v-if="lastImportMeta" class="mt-4 shell-state-surface shell-state-surface--idle text-sm">
        最近一次导入来自 {{ lastImportMeta.sourceLabel }}，包含 {{ lastImportMeta.roomCount }} 个房间草稿 / {{ lastImportMeta.deviceCount }} 个设备草稿，
        当前场景命中 {{ lastImportMeta.matchedRoomCount }} 个房间 / {{ lastImportMeta.matchedDeviceCount }} 个设备。
      </div>
    </div>

    <div v-if="selectedRoom" class="mt-5 space-y-5">
      <div class="shell-card p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="shell-heading">{{ selectedRoom.name }}</p>
            <p class="shell-meta mt-1">房间框体与空间预设</p>
          </div>
          <button type="button" class="shell-chip shell-chip--interactive" @click="emit('reset-selected-room')">恢复房间默认</button>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label class="space-y-2">
            <span class="shell-meta">frame.x</span>
            <input class="floor-map-editor__input" :value="selectedRoom.frame.x" type="number" step="1" @input="updateFrame('x', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">frame.y</span>
            <input class="floor-map-editor__input" :value="selectedRoom.frame.y" type="number" step="1" @input="updateFrame('y', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">frame.width</span>
            <input class="floor-map-editor__input" :value="selectedRoom.frame.width" type="number" step="1" @input="updateFrame('width', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">frame.height</span>
            <input class="floor-map-editor__input" :value="selectedRoom.frame.height" type="number" step="1" @input="updateFrame('height', $event)">
          </label>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label class="space-y-2">
            <span class="shell-meta">ambientPreset</span>
            <select class="floor-map-editor__input" :value="selectedRoomVisualConfig?.ambientPreset" @change="updateVisual('ambientPreset', $event)">
              <option v-for="option in ambientPresetOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label class="space-y-2">
            <span class="shell-meta">materialTone</span>
            <select class="floor-map-editor__input" :value="selectedRoomVisualConfig?.materialTone" @change="updateVisual('materialTone', $event)">
              <option v-for="option in materialToneOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label class="space-y-2">
            <span class="shell-meta">spatialPreset</span>
            <select class="floor-map-editor__input" :value="selectedRoomVisualConfig?.spatialPreset" @change="updateVisual('spatialPreset', $event)">
              <option v-for="option in spatialPresetOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label class="space-y-2">
            <span class="shell-meta">daylightDirection</span>
            <select class="floor-map-editor__input" :value="selectedRoomVisualConfig?.daylightDirection" @change="updateVisual('daylightDirection', $event)">
              <option v-for="option in daylightDirectionOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label class="space-y-2">
            <span class="shell-meta">baseTone</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.baseTone" type="text" @input="updateVisual('baseTone', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">daylightStrength</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.daylightStrength" type="number" step="0.05" @input="updateVisualNumber('daylightStrength', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">artificialLightGain</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.artificialLightGain" type="number" step="0.05" @input="updateVisualNumber('artificialLightGain', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">climateInfluence</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.climateInfluence" type="number" step="0.05" @input="updateVisualNumber('climateInfluence', $event)">
          </label>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label class="space-y-2">
            <span class="shell-meta">activityInfluence</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.activityInfluence" type="number" step="0.05" @input="updateVisualNumber('activityInfluence', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">elevationShiftX</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.elevationShiftX" type="number" step="1" @input="updateVisualNumber('elevationShiftX', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">elevationShiftY</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.elevationShiftY" type="number" step="1" @input="updateVisualNumber('elevationShiftY', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">floorInset</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.floorInset" type="number" step="1" @input="updateVisualNumber('floorInset', $event)">
          </label>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="space-y-2">
            <span class="shell-meta">wallHighlight</span>
            <input class="floor-map-editor__input" :value="selectedRoomVisualConfig?.wallHighlight" type="number" step="0.05" @input="updateVisualNumber('wallHighlight', $event)">
          </label>
        </div>
      </div>

      <div class="shell-card p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="shell-heading">Devices</p>
            <p class="shell-meta mt-1">在主舞台里直接拖动点位，或在这里切换当前设备。</p>
          </div>
          <button type="button" class="shell-chip shell-chip--interactive" :disabled="!selectedDevice" @click="emit('reset-selected-device')">恢复当前设备</button>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="device in selectedRoomDevices"
            :key="device.id"
            type="button"
            class="shell-chip shell-chip--interactive"
            :class="device.id === selectedDevice?.id ? 'border-[#c9dfdb] bg-[#f1f7f6] text-[#2d6660]' : ''"
            @click="emit('select-device', device.id)"
          >
            {{ device.name }}
          </button>
        </div>

        <div v-if="selectedDevice" class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="space-y-2">
            <span class="shell-meta">position.x</span>
            <input class="floor-map-editor__input" :value="selectedDevice.position.x" type="number" step="1" @input="emit('update-device-position', selectedDevice.id, { x: Number($event.target.value), y: selectedDevice.position.y })">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">position.y</span>
            <input class="floor-map-editor__input" :value="selectedDevice.position.y" type="number" step="1" @input="emit('update-device-position', selectedDevice.id, { x: selectedDevice.position.x, y: Number($event.target.value) })">
          </label>
        </div>
      </div>

      <div class="shell-card p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="shell-heading">Openings</p>
            <p class="shell-meta mt-1">支持窗、门、阳台开口。可在主舞台拖 start / end 把手，也可在这里精调。</p>
          </div>
          <button type="button" class="shell-chip shell-chip--interactive" @click="emit('add-opening')">新增 opening</button>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="(opening, index) in selectedRoomVisualConfig?.openings ?? []"
            :key="`${opening.type}-${index}`"
            type="button"
            class="shell-chip shell-chip--interactive"
            :class="index === selectedOpeningIndex ? 'border-[#d8c59f] bg-[#faf4e8] text-[#915f18]' : ''"
            @click="emit('select-opening', index)"
          >
            {{ opening.type }} {{ index + 1 }}
          </button>
        </div>

        <div v-if="selectedOpening" class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label class="space-y-2">
            <span class="shell-meta">type</span>
            <select class="floor-map-editor__input" :value="selectedOpening.type" @change="updateOpening('type', $event)">
              <option v-for="option in openingTypeOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label class="space-y-2">
            <span class="shell-meta">edge</span>
            <select class="floor-map-editor__input" :value="selectedOpening.edge" @change="updateOpening('edge', $event)">
              <option v-for="option in edgeOptions" :key="option" :value="option">{{ option }}</option>
            </select>
          </label>
          <label class="space-y-2">
            <span class="shell-meta">tint</span>
            <input class="floor-map-editor__input" :value="selectedOpening.tint" type="text" @input="updateOpening('tint', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">start</span>
            <input class="floor-map-editor__input" :value="selectedOpening.start" type="number" min="0" max="1" step="0.01" @input="updateOpeningNumber('start', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">end</span>
            <input class="floor-map-editor__input" :value="selectedOpening.end" type="number" min="0" max="1" step="0.01" @input="updateOpeningNumber('end', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">strength</span>
            <input class="floor-map-editor__input" :value="selectedOpening.strength" type="number" min="0" max="1.4" step="0.05" @input="updateOpeningNumber('strength', $event)">
          </label>
          <label class="space-y-2">
            <span class="shell-meta">softness</span>
            <input class="floor-map-editor__input" :value="selectedOpening.softness" type="number" min="0.1" max="1" step="0.05" @input="updateOpeningNumber('softness', $event)">
          </label>
        </div>

        <div v-if="selectedOpening" class="mt-4">
          <button type="button" class="shell-chip shell-chip--interactive" @click="emit('remove-opening', selectedOpeningIndex)">删除当前 opening</button>
        </div>
      </div>

      <details class="shell-card p-4">
        <summary class="cursor-pointer list-none shell-heading">导出预览</summary>
        <pre class="mt-4 overflow-auto rounded-[1.2rem] bg-[#f6f1e8] p-4 text-xs leading-6 text-slate-700">{{ exportJson }}</pre>
      </details>
    </div>
  </section>
</template>

<style scoped>
.floor-map-editor__input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(203, 213, 225, 0.9);
  background: rgba(255, 255, 255, 0.94);
  color: #15202f;
  padding: 0.78rem 0.92rem;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.floor-map-editor__input:focus {
  border-color: rgba(45, 102, 96, 0.62);
  box-shadow: 0 0 0 3px rgba(45, 102, 96, 0.12);
}
</style>
