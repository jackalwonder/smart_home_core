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

  if (['fridge', 'air_conditioner', 'tv', 'media', 'purifier', 'washer', 'speaker', 'router'].includes(applianceType)) {
    return true
  }

  return hasTelemetry && devices.length > 1
}

const groupedItems = computed(() => {
  if (!props.room) {
    return []
  }

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
</script>

<template>
  <section class="h-full px-4 py-4 sm:px-5 sm:py-5 xl:px-8 xl:py-8">
    <template v-if="room">
      <header class="border-b border-slate-200 pb-5 sm:pb-6">
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-tide sm:text-sm">{{ room.zone.name }}</p>
        <div class="mt-3 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 class="text-2xl font-semibold tracking-tight text-ink sm:text-3xl xl:text-4xl">{{ room.name }}</h2>
            <p v-if="room.description" class="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
              {{ room.description }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:max-w-sm">
            <div class="rounded-[1.5rem] bg-mist px-4 py-4">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500">原始实体</p>
              <p class="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{{ room.devices.length }}</p>
            </div>
            <div class="rounded-[1.5rem] bg-slate-100 px-4 py-4">
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-500">面板卡片</p>
              <p class="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{{ cardCount }}</p>
            </div>
          </div>
        </div>
      </header>

      <div
        v-if="actionError"
        class="mt-5 rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
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
        class="mt-6 rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-sm leading-6 text-slate-500 sm:text-base"
      >
        当前房间还没有适合主面板展示的设备。你可以继续在 Home Assistant 里给设备分配房间，或启用具有控制能力的实体。
      </div>
    </template>

    <div
      v-else
      class="flex min-h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm leading-6 text-slate-500 sm:text-base"
    >
      先从上方房间导航里选择一个房间，这里就会展示该房间的主设备和可控项。
    </div>
  </section>
</template>
