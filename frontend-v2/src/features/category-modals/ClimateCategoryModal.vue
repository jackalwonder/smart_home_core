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

defineEmits(['close', 'toggle-power', 'adjust-temp', 'set-mode', 'set-option', 'focus'])
</script>

<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="props.open" class="category-modal">
        <div class="category-modal__scrim" @pointerdown.stop.prevent @click.stop="$emit('close')" />

        <section
          class="category-modal__panel"
          :class="{ 'category-modal__panel--single-climate': props.devices.length === 1 }"
          @pointerdown.stop
          @click.stop
        >
          <header class="category-modal__header">
            <div class="category-modal__title-wrap">
              <div class="category-modal__icon is-climate" />
              <h2>{{ props.title }}</h2>
              <span class="category-modal__count">{{ props.count }}</span>
            </div>

            <button type="button" class="category-modal__close" @pointerdown.stop @click.stop="$emit('close')">
              ×
            </button>
          </header>

          <div class="climate-grid" :class="{ 'climate-grid--single': props.devices.length === 1 }">
            <article
              v-for="device in props.devices"
              :key="device.id"
              class="climate-card"
              :class="{
                'is-selected': props.selectedDeviceId === device.id,
                'is-pending': props.pendingDeviceIds[device.id],
              }"
              @mouseenter="$emit('focus', device.id)"
            >
              <header class="climate-card__header">
                <div class="climate-card__badge" />
                <div class="climate-card__header-actions">
                  <span class="climate-card__pill">{{ device.active ? 'ON' : 'OFF' }}</span>
                  <button
                    v-if="device.capabilities?.canToggle"
                    type="button"
                    class="climate-card__power"
                    @click.stop="$emit('toggle-power', device.id)"
                  >
                    ⏻
                  </button>
                </div>
              </header>

              <h3>{{ device.name }}</h3>

              <div v-if="device.capabilities?.hasTargetTemperature" class="climate-card__temp">
                <button type="button" @click.stop="$emit('adjust-temp', device.id, -1)">−</button>
                <strong>{{ device.targetTemperature ?? '--' }}°</strong>
                <button type="button" @click.stop="$emit('adjust-temp', device.id, 1)">+</button>
              </div>

              <div v-if="device.capabilities?.hvacModes?.length" class="climate-card__modes">
                <button
                  v-for="mode in device.capabilities.hvacModes"
                  :key="mode"
                  type="button"
                  class="climate-mode"
                  :class="{ 'is-active': device.hvacMode === mode }"
                  @click.stop="$emit('set-mode', device.id, mode)"
                >
                  {{ String(mode).toUpperCase() }}
                </button>
              </div>

              <div v-else-if="device.capabilities?.controlOptions?.length" class="climate-card__modes">
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

              <div
                v-if="device.capabilities?.hasNumberControl && !device.capabilities?.hasTargetTemperature"
                class="device-slider-block"
              >
                <div class="panel-title-row">
                  <h3>数值控制</h3>
                  <span>{{ device.numberValue ?? '--' }}{{ device.unitOfMeasurement }}</span>
                </div>
                <input
                  class="device-slider"
                  type="range"
                  :min="device.minValue ?? 0"
                  :max="device.maxValue ?? 100"
                  :step="device.step ?? 1"
                  :value="device.numberValue ?? device.minValue ?? 0"
                  @input="$emit('adjust-temp', device.id, Number($event.target.value) - Number(device.numberValue ?? 0))"
                >
              </div>
            </article>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>
