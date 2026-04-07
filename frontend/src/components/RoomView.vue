<script setup>
import { computed } from 'vue'

import ApplianceCard from './ApplianceCard.vue'
import DeviceCard from './DeviceCard.vue'

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

function applianceStem(name) {
  const trimmed = name.trim()
  const withoutUploadMarker = trimmed.split(' * ')[0]
  const withoutDoubleSpaceSuffix = withoutUploadMarker.split(/\s{2,}/)[0]
  return withoutDoubleSpaceSuffix.trim()
}

function groupKey(device) {
  if (device.ha_device_id) {
    // 优先按真实 HA 设备聚合，能把同一硬件下的多个实体折叠到一张卡里。
    return `device:${device.ha_device_id}`
  }
  if (device.appliance_name) {
    return `name:${device.appliance_name}`
  }
  return `fallback:${applianceStem(device.name) || device.name}`
}

function groupTitle(devices) {
  return devices[0]?.appliance_name || applianceStem(devices[0]?.name ?? '') || devices[0]?.name || '未命名设备'
}

function groupType(devices) {
  return devices.find((device) => device.appliance_type && device.appliance_type !== 'generic')?.appliance_type
    || devices[0]?.appliance_type
    || 'generic'
}

function shouldAggregate(devices) {
  const applianceType = groupType(devices)
  const hasControl = devices.some((device) => ['toggle', 'number', 'select', 'button'].includes(device.control_kind ?? ''))
  const hasTelemetry = devices.some((device) => device.device_class === 'temperature' || device.device_class === 'humidity')
  const hasHaDeviceId = devices.some((device) => Boolean(device.ha_device_id))

  if (!hasControl) {
    return false
  }

  if (hasHaDeviceId && devices.length > 1) {
    return true
  }

  if (['fridge', 'air_conditioner', 'tv', 'media', 'purifier', 'washer', 'speaker', 'router', 'nas', 'computer', 'camera'].includes(applianceType)) {
    return true
  }

  return hasTelemetry && devices.length > 1
}

const groupedItems = computed(() => {
  if (!props.room) {
    return []
  }

  // 先按聚合键分桶，再决定是渲染家电聚合卡还是单实体卡片。
  const groups = new Map()
  props.room.devices.forEach((device) => {
    const key = groupKey(device)
    const collection = groups.get(key) ?? []
    collection.push(device)
    groups.set(key, collection)
  })

  return [...groups.entries()]
    .map(([key, devices]) => {
      const sortedDevices = [...devices].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))

      if (shouldAggregate(sortedDevices)) {
        return {
          type: 'appliance',
          key,
          title: groupTitle(sortedDevices),
          applianceType: groupType(sortedDevices),
          devices: sortedDevices,
        }
      }

      return sortedDevices.map((device) => ({
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
      <header class="hero-grid relative overflow-hidden rounded-[2.2rem] border border-white/70 bg-gradient-to-br from-white/90 via-white/82 to-amber-50/60 px-5 py-5 shadow-sm sm:px-6 sm:py-6">
        <div class="pointer-events-none absolute inset-0">
          <div class="absolute right-[-3rem] top-[-2rem] h-40 w-40 rounded-full bg-auric/20 blur-3xl" />
          <div class="absolute bottom-[-3rem] left-[20%] h-36 w-36 rounded-full bg-lagoon/10 blur-3xl" />
        </div>

        <div class="relative">
          <p class="text-xs font-semibold uppercase tracking-[0.34em] text-lagoon sm:text-sm">{{ room.zone.name }}</p>
          <div class="mt-3 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 class="font-display text-[2.5rem] leading-[0.95] text-ink sm:text-[3rem] xl:text-[3.9rem]">{{ room.name }}</h2>
              <p v-if="room.description" class="mt-3 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                {{ room.description }}
              </p>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                当前视图优先呈现真正会被日常查看和控制的实体，把复杂底层数据整理为一张更具空间感和节奏感的居家工作台。
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-3 sm:max-w-2xl">
              <div class="control-surface rounded-[1.6rem] px-4 py-4">
                <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">实体总数</p>
                <p class="mt-3 text-3xl font-semibold text-ink">{{ room.devices.length }}</p>
              </div>
              <div class="control-surface rounded-[1.6rem] px-4 py-4">
                <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">可控项目</p>
                <p class="mt-3 text-3xl font-semibold text-ink">{{ controllableCount }}</p>
              </div>
              <div class="control-surface rounded-[1.6rem] px-4 py-4">
                <p class="text-[11px] uppercase tracking-[0.24em] text-slate-500">监测项目</p>
                <p class="mt-3 text-3xl font-semibold text-ink">{{ telemetryCount }}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="glass-soft rounded-[1.8rem] px-5 py-4">
          <p class="text-[11px] uppercase tracking-[0.28em] text-slate-500">Room Narrative</p>
          <p class="mt-3 text-sm leading-7 text-slate-600">
            这里展示的是经过过滤与聚合后的家庭主面板视图。同一台家电的多种能力会尽量折叠进一张卡片，减少信息噪音，也让真实控制路径更短。
          </p>
        </div>

        <div class="glass-soft rounded-[1.8rem] px-5 py-4">
          <p class="text-[11px] uppercase tracking-[0.28em] text-slate-500">Surface Summary</p>
          <div class="mt-3 flex items-end justify-between">
            <div>
              <p class="text-sm text-slate-500">面板卡片</p>
              <p class="font-display mt-1 text-[2.4rem] leading-none text-ink">{{ cardCount }}</p>
            </div>
            <div class="rounded-full bg-ink px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/80">
              Curated
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="actionError"
        class="mt-5 rounded-[1.6rem] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700 shadow-sm"
      >
        {{ actionError }}
      </div>

      <div
        v-if="groupedItems.length > 0"
        class="mt-6 grid gap-4 md:gap-5 2xl:grid-cols-2"
      >
        <template v-for="item in groupedItems" :key="item.key">
          <ApplianceCard
            v-if="item.type === 'appliance'"
            :title="item.title"
            :appliance-type="item.applianceType"
            :devices="item.devices"
            class="2xl:col-span-2"
          />

          <DeviceCard
            v-else
            :device="item.device"
          />
        </template>
      </div>

      <div
        v-else
        class="mt-6 rounded-[2rem] border border-dashed border-slate-200 bg-white/75 px-6 py-10 text-sm leading-6 text-slate-500 shadow-sm sm:text-base"
      >
        当前房间还没有适合主面板展示的设备。你可以继续在 Home Assistant 里给设备分配房间，或启用具有控制能力的实体。
      </div>
    </template>

    <div
      v-else
      class="flex min-h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-white/75 px-6 py-10 text-center text-sm leading-6 text-slate-500 shadow-sm sm:text-base"
    >
      先从上方房间导航里选择一个房间，这里就会展示该房间的主设备和可控项。
    </div>
  </section>
</template>
