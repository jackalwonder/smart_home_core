<script setup>
const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    required: true,
  },
  count: {
    type: Number,
    default: 0,
  },
  icon: {
    type: String,
    default: 'light',
  },
  devices: {
    type: Array,
    default: () => [],
  },
  selectedDeviceId: {
    type: [String, Number],
    default: '',
  },
  pendingDeviceIds: {
    type: Object,
    default: () => ({}),
  },
})

defineEmits(['close', 'toggle', 'press', 'set-number', 'set-option', 'set-brightness', 'set-color-temperature', 'focus'])
</script>

<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="props.open" class="category-modal">
        <div class="category-modal__scrim" @pointerdown.stop.prevent @click.stop="$emit('close')" />

        <section class="category-modal__panel" @pointerdown.stop @click.stop>
          <header class="category-modal__header">
            <div class="category-modal__title-wrap">
              <div class="category-modal__icon" :class="`is-${props.icon}`" />
              <h2>{{ props.title }}</h2>
              <span class="category-modal__count">{{ props.count }}</span>
            </div>

            <button type="button" class="category-modal__close" @pointerdown.stop @click.stop="$emit('close')">
              ×
            </button>
          </header>

          <div class="category-modal__grid category-modal__grid--single-device">
            <article
              v-for="device in props.devices"
              :key="device.id"
              class="light-device-card light-device-card--detailed"
              :class="{
                'is-active': device.active,
                'is-selected': props.selectedDeviceId === device.id,
                'is-pending': props.pendingDeviceIds[device.id],
              }"
              @mouseenter="$emit('focus', device.id)"
            >
              <div class="light-device-card__top">
                <div class="light-device-card__icon" />
                <div class="light-device-card__meta">
                  <strong>{{ device.name }}</strong>
                  <span>{{ device.active ? 'ON' : 'OFF' }}</span>
                </div>
              </div>

              <div v-if="device.capabilities?.canToggle || device.capabilities?.canPress" class="device-control-row">
                <button
                  v-if="device.capabilities?.canToggle"
                  type="button"
                  class="settings-inline-button"
                  @click.stop="$emit('toggle', device.id)"
                >
                  开关切换
                </button>
                <button
                  v-if="device.capabilities?.canPress"
                  type="button"
                  class="settings-inline-button"
                  @click.stop="$emit('press', device.id)"
                >
                  执行动作
                </button>
              </div>

              <div v-if="device.capabilities?.hasNumberControl" class="device-slider-block">
                <div class="panel-title-row"><h3>数值控制</h3><span>{{ device.numberValue ?? '--' }}{{ device.unitOfMeasurement }}</span></div>
                <input
                  class="device-slider"
                  type="range"
                  :min="device.minValue ?? 0"
                  :max="device.maxValue ?? 100"
                  :step="device.step ?? 1"
                  :value="device.numberValue ?? device.minValue ?? 0"
                  @input="$emit('set-number', device.id, Number($event.target.value))"
                >
              </div>

              <div v-if="device.capabilities?.hasBrightness" class="device-slider-block">
                <div class="panel-title-row"><h3>亮度</h3><span>{{ device.brightnessValue ?? 0 }}%</span></div>
                <input
                  class="device-slider"
                  type="range"
                  :min="device.brightnessMin ?? 1"
                  :max="device.brightnessMax ?? 100"
                  step="1"
                  :value="device.brightnessValue ?? 0"
                  @input="$emit('set-brightness', device.id, Number($event.target.value))"
                >
              </div>

              <div v-if="device.capabilities?.hasColorTemperature" class="device-slider-block">
                <div class="panel-title-row"><h3>色温</h3><span>{{ device.colorTemperature ?? '--' }}</span></div>
                <input
                  class="device-slider"
                  type="range"
                  :min="device.minColorTemperature ?? 1500"
                  :max="device.maxColorTemperature ?? 9000"
                  step="50"
                  :value="device.colorTemperature ?? device.minColorTemperature ?? 1500"
                  @input="$emit('set-color-temperature', device.id, Number($event.target.value))"
                >
              </div>

              <div v-if="device.capabilities?.controlOptions?.length" class="climate-card__modes">
                <button
                  v-for="option in device.capabilities.controlOptions"
                  :key="option"
                  type="button"
                  class="climate-mode"
                  @click.stop="$emit('set-option', device.id, option)"
                >
                  {{ option }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>
