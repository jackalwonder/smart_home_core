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
    type: String,
    default: '',
  },
})

const modes = [
  { key: 'auto', label: 'AUTO' },
  { key: 'cool', label: 'COOL' },
  { key: 'dry', label: 'DRY' },
  { key: 'fan', label: 'FAN' },
  { key: 'heat', label: 'HEAT' },
]

defineEmits(['close', 'toggle-power', 'adjust-temp', 'set-mode', 'focus'])
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
              :class="{ 'is-selected': props.selectedDeviceId === device.id }"
              @mouseenter="$emit('focus', device.id)"
            >
              <header class="climate-card__header">
                <div class="climate-card__badge" />
                <div class="climate-card__header-actions">
                  <span class="climate-card__pill">{{ device.power ? 'ON' : 'OFF' }}</span>
                  <button type="button" class="climate-card__power" @click.stop="$emit('toggle-power', device.id)">⏻</button>
                </div>
              </header>

              <h3>{{ device.name }}</h3>

              <div class="climate-card__temp">
                <button type="button" @click.stop="$emit('adjust-temp', device.id, -1)">−</button>
                <strong>{{ device.targetTemp }}°</strong>
                <button type="button" @click.stop="$emit('adjust-temp', device.id, 1)">+</button>
              </div>

              <div class="climate-card__modes">
                <button
                  v-for="mode in modes"
                  :key="mode.key"
                  type="button"
                  class="climate-mode"
                  :class="{ 'is-active': device.mode === mode.key }"
                  @click.stop="$emit('set-mode', device.id, mode.key)"
                >
                  {{ mode.label }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

