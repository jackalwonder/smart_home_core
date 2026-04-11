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
    type: String,
    default: '',
  },
})

defineEmits(['close', 'toggle', 'focus'])
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

          <div class="category-modal__grid">
            <button
              v-for="device in props.devices"
              :key="device.id"
              type="button"
              class="light-device-card"
              :class="{ 'is-active': device.active, 'is-selected': props.selectedDeviceId === device.id }"
              @mouseenter="$emit('focus', device.id)"
              @focus="$emit('focus', device.id)"
              @click.stop="$emit('toggle', device.id)"
            >
              <div class="light-device-card__icon" />
              <div class="light-device-card__meta">
                <strong>{{ device.name }}</strong>
                <span>{{ device.active ? 'ON' : 'OFF' }}</span>
              </div>
            </button>
          </div>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

