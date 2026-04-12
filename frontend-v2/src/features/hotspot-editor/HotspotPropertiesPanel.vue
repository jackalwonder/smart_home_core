<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '属性面板',
  },
  hotspot: {
    type: Object,
    default: null,
  },
  entityOptions: {
    type: Array,
    default: () => [],
  },
  typeOptions: {
    type: Array,
    default: () => [],
  },
  categoryOptions: {
    type: Array,
    default: () => [],
  },
  framed: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits([
  'update-field',
  'update-device',
  'update-coordinate',
  'update-rotation',
])

const coordinateFieldValues = ref({
  x: '',
  y: '',
  rotation: '',
})

watch(
  () => [
    props.hotspot?.id,
    props.hotspot?.x,
    props.hotspot?.y,
    props.hotspot?.rotation,
  ],
  () => {
    if (!props.hotspot) {
      coordinateFieldValues.value = {
        x: '',
        y: '',
        rotation: '',
      }
      return
    }

    coordinateFieldValues.value = {
      x: String(props.hotspot.x ?? ''),
      y: String(props.hotspot.y ?? ''),
      rotation: String(props.hotspot.rotation ?? 0),
    }
  },
  { immediate: true },
)

function emitField(field, value) {
  emit('update-field', { field, value })
}

function emitDevice(value) {
  emit('update-device', value)
}

function commitCoordinate(axis) {
  emit('update-coordinate', { axis, value: coordinateFieldValues.value[axis] })
}

function commitRotation() {
  emit('update-rotation', coordinateFieldValues.value.rotation)
}
</script>

<template>
  <section :class="[props.framed ? 'settings-widget-panel' : 'settings-widget-panel__embed', 'settings-widget-panel--minimal']">
    <div class="settings-widget-panel__head">
      <strong>{{ title }}</strong>
      <span>{{ hotspot ? '已选中热点' : '未选中热点' }}</span>
    </div>

    <div v-if="hotspot" class="settings-widget-panel__detail">
      <section class="settings-widget-panel__summary">
        <div class="settings-widget-pill">
          <span>ID</span>
          <strong>{{ hotspot.id }}</strong>
        </div>
        <div class="settings-widget-pill">
          <span>实体</span>
          <strong>{{ hotspot.deviceId || '未绑定' }}</strong>
        </div>
        <div class="settings-widget-pill">
          <span>坐标</span>
          <strong>{{ hotspot.x }}, {{ hotspot.y }}</strong>
        </div>
      </section>

      <section class="settings-widget-panel__section-block">
        <div class="settings-widget-panel__section-head">
          <strong>基础信息</strong>
          <span>名称、标签与分类</span>
        </div>
        <div class="settings-widget-panel__group settings-widget-panel__group--grid">
          <label class="settings-widget-panel__field settings-widget-panel__field--wide">
            <span>显示名称</span>
            <input :value="hotspot.label" type="text" @input="emitField('label', $event.target.value)" />
          </label>
          <label class="settings-widget-panel__field">
            <span>标签</span>
            <select :value="hotspot.icon" @change="emitField('icon', $event.target.value)">
              <option v-for="item in typeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <label class="settings-widget-panel__field">
            <span>分类</span>
            <select :value="hotspot.category" @change="emitField('category', $event.target.value)">
              <option v-for="item in categoryOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="settings-widget-panel__section-block">
        <div class="settings-widget-panel__section-head">
          <strong>绑定实体</strong>
          <span>选择当前热点关联的 deviceId</span>
        </div>
        <div class="settings-widget-panel__group settings-widget-panel__group--grid">
          <label class="settings-widget-panel__field settings-widget-panel__field--wide">
            <span>deviceId</span>
            <select :value="hotspot.deviceId || ''" @change="emitDevice($event.target.value)">
              <option value="">未绑定</option>
              <option v-for="item in entityOptions" :key="item.id" :value="item.id">{{ item.name }} · {{ item.id }}</option>
            </select>
          </label>
        </div>
      </section>

      <section class="settings-widget-panel__section-block">
        <div class="settings-widget-panel__section-head">
          <strong>位置与旋转</strong>
          <span>直接修改 draft 坐标</span>
        </div>
        <div class="settings-widget-panel__group settings-widget-panel__position-grid">
          <label class="settings-widget-panel__field settings-step-field">
            <span>X 坐标 (%)</span>
            <div class="settings-step-field__controls">
              <input v-model="coordinateFieldValues.x" type="number" step="0.1" inputmode="decimal" @blur="commitCoordinate('x')" @keydown.enter.prevent="commitCoordinate('x')" />
            </div>
          </label>
          <label class="settings-widget-panel__field settings-step-field">
            <span>Y 坐标 (%)</span>
            <div class="settings-step-field__controls">
              <input v-model="coordinateFieldValues.y" type="number" step="0.1" inputmode="decimal" @blur="commitCoordinate('y')" @keydown.enter.prevent="commitCoordinate('y')" />
            </div>
          </label>
          <label class="settings-widget-panel__field settings-step-field settings-widget-panel__field--wide">
            <span>旋转 (deg)</span>
            <div class="settings-step-field__controls">
              <input v-model="coordinateFieldValues.rotation" type="number" step="1" inputmode="decimal" @blur="commitRotation()" @keydown.enter.prevent="commitRotation()" />
            </div>
          </label>
        </div>
      </section>
    </div>

    <div v-else class="settings-widget-panel__empty">
      <strong>未选中热点</strong>
      <p>在主舞台点击一个热点后，可在这里编辑名称、分类、实体绑定与坐标。</p>
    </div>
  </section>
</template>
