<script setup>
import { computed } from 'vue'

import ApplianceCard from './ApplianceCard.vue'
import DeviceCard from './DeviceCard.vue'
import { groupDevices } from '../utils/deviceGrouping'

const props = defineProps({
  room: {
    type: Object,
    default: null,
  },
  actionError: {
    type: String,
    default: '',
  },
})

const groupedItems = computed(() => {
  if (!props.room) {
    return []
  }

  return groupDevices(props.room.devices)
    .map((group) => {
      if (group.isAggregate) {
        return {
          type: 'appliance',
          key: group.key,
          title: group.title,
          applianceType: group.applianceType,
          devices: group.devices,
        }
      }

      return group.devices.map((device) => ({
        type: 'device',
        key: `device-${device.id}`,
        device,
      }))
    })
    .flat()
})

const cardCount = computed(() => groupedItems.value.length)
const controllableCount = computed(() => props.room?.devices.filter((device) => device.can_control).length ?? 0)
const telemetryCount = computed(() =>
  props.room?.devices.filter((device) => !device.can_control && ['temperature', 'humidity', 'moisture'].includes(device.device_class ?? '')).length ?? 0,
)
</script>

<template>
  <section class="h-full px-4 py-4 sm:px-5 sm:py-5 xl:px-8 xl:py-8">
    <template v-if="room">
      <header class="hero-grid shell-surface relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6">
        <div class="pointer-events-none absolute inset-0">
          <div class="absolute right-[-3rem] top-[-2rem] h-40 w-40 rounded-full bg-auric/20 blur-3xl" />
          <div class="absolute bottom-[-3rem] left-[20%] h-36 w-36 rounded-full bg-lagoon/10 blur-3xl" />
        </div>

        <div class="relative">
          <p class="shell-kicker sm:text-sm">{{ room.zone?.name ?? '开发态模板' }}</p>
          <div class="mt-3 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 class="shell-title-hero text-[2.3rem] sm:text-[2.8rem] xl:text-[3.1rem]">{{ room.name }}</h2>
              <p v-if="room.description" class="shell-copy mt-3 max-w-3xl text-sm sm:text-base">
                {{ room.description }}
              </p>
              <p class="shell-copy mt-3 max-w-2xl text-sm">
                这个房间页优先展示真正会被频繁查看和控制的实体，保证多设备情况下也能快速扫视与操作。
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-3 xl:min-w-[480px]">
              <div class="shell-card px-4 py-4">
                <p class="shell-meta uppercase tracking-[0.24em]">实体总数</p>
                <p class="mt-2 text-2xl font-semibold text-ink">{{ room.devices.length }}</p>
              </div>
              <div class="shell-card px-4 py-4">
                <p class="shell-meta uppercase tracking-[0.24em]">可控项目</p>
                <p class="mt-2 text-2xl font-semibold text-ink">{{ controllableCount }}</p>
              </div>
              <div class="shell-card px-4 py-4">
                <p class="shell-meta uppercase tracking-[0.24em]">监测项目</p>
                <p class="mt-2 text-2xl font-semibold text-ink">{{ telemetryCount }}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <div class="shell-chip">
          面板卡片 {{ cardCount }}
        </div>
        <div class="shell-chip">
          已做设备聚合
        </div>
        <div class="shell-chip">
          适合多设备浏览
        </div>
      </div>

      <div
        v-if="actionError"
        class="shell-state-surface shell-state-surface--error mt-5 text-sm"
      >
        {{ actionError }}
      </div>

      <div
        v-if="groupedItems.length > 0"
        class="mt-6 grid auto-rows-fr gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))] md:gap-5"
      >
        <template v-for="item in groupedItems" :key="item.key">
          <ApplianceCard
            v-if="item.type === 'appliance'"
            :title="item.title"
            :appliance-type="item.applianceType"
            :devices="item.devices"
          />

          <DeviceCard
            v-else
            :device="item.device"
          />
        </template>
      </div>

      <div
        v-else
        class="shell-empty-state mt-6 px-6 py-10 text-sm leading-6 sm:text-base"
      >
        当前房间还没有适合主面板展示的设备。你可以继续在 Home Assistant 里给设备分配房间，或启用具有控制能力的实体。
      </div>
    </template>

    <div
      v-else
      class="shell-empty-state flex min-h-[420px] items-center justify-center px-6 py-10 text-center text-sm leading-6 sm:text-base"
    >
      先从上方房间导航里选择一个房间，这里就会展示该房间的主设备和可控项。
    </div>
  </section>
</template>
