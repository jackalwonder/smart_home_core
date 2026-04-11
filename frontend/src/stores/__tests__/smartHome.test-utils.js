import { createPinia, setActivePinia } from 'pinia'

import { useSmartHomeStore } from '../smartHome'

export const SMART_HOME_CACHE_KEYS = {
  catalogEntities: 'smart-home-cache:catalog-entities',
  sceneEntities: 'smart-home-cache:scene-entities',
  uiPreferences: 'smart-home-cache:ui-preferences',
  legacyRooms: 'smart-home-cache:rooms',
  legacySpatialScene: 'smart-home-cache:spatial-scene',
}

export function createSmartHomeStore() {
  setActivePinia(createPinia())
  return useSmartHomeStore()
}

export function createEntityGraph(options = {}) {
  const {
    livingLightState = 'off',
    livingLightBrightness = 18,
  } = options

  return {
    roomsById: {
      1: {
        id: 1,
        zone_id: 10,
        name: '客厅',
        description: '',
        plan_x: null,
        plan_y: null,
        plan_width: null,
        plan_height: null,
        plan_rotation: null,
        ambient_temperature: 24,
        ambient_humidity: 48,
        occupancy_status: 'occupied',
        active_device_count: 1,
      },
      2: {
        id: 2,
        zone_id: 10,
        name: '卧室',
        description: '',
        plan_x: null,
        plan_y: null,
        plan_width: null,
        plan_height: null,
        plan_rotation: null,
        ambient_temperature: 23,
        ambient_humidity: 44,
        occupancy_status: 'idle',
        active_device_count: 1,
      },
    },
    devicesById: {
      101: {
        id: 101,
        room_id: 1,
        name: '客厅主灯',
        entity_id: 'light.living_main',
        ha_entity_id: 'light.living_main',
        entity_domain: 'light',
        type: 'light',
        device_type: 'light',
        current_status: livingLightState,
        raw_state: livingLightState,
        state: livingLightState,
        online: true,
        can_control: true,
        control_kind: 'toggle',
        brightness_value: livingLightBrightness,
      },
      201: {
        id: 201,
        room_id: 2,
        name: '卧室温度',
        entity_id: 'sensor.bedroom_temperature',
        ha_entity_id: 'sensor.bedroom_temperature',
        entity_domain: 'sensor',
        type: 'sensor',
        device_type: 'sensor',
        current_status: '23',
        raw_state: '23',
        state: '23',
        online: true,
        can_control: false,
        device_class: 'temperature',
        unit_of_measurement: '掳C',
      },
    },
    roomDeviceIdsByRoomId: {
      1: [101],
      2: [201],
    },
    sceneMeta: {
      zone: {
        id: 10,
        name: '全屋',
        description: '',
      },
      analysis: {
        source: 'test',
      },
    },
    sceneLayoutByRoomId: {
      1: {
        plan_x: 20,
        plan_y: 30,
        plan_width: 320,
        plan_height: 200,
        plan_rotation: 0,
      },
      2: {
        plan_x: 380,
        plan_y: 30,
        plan_width: 220,
        plan_height: 180,
        plan_rotation: 0,
      },
    },
    sceneDeviceLayoutByDeviceId: {
      101: {
        plan_x: 88,
        plan_y: 64,
        plan_z: 0,
        plan_rotation: 15,
        position: { x: 0.28, y: 0.42 },
      },
      201: {
        plan_x: 420,
        plan_y: 72,
        plan_z: 0,
        plan_rotation: 0,
        position: { x: 0.52, y: 0.36 },
      },
    },
  }
}

export function seedEntityGraph(store, graph, options = {}) {
  store.roomsById = graph.roomsById
  store.devicesById = graph.devicesById
  store.roomDeviceIdsByRoomId = graph.roomDeviceIdsByRoomId
  store.sceneMeta = graph.sceneMeta
  store.sceneLayoutByRoomId = graph.sceneLayoutByRoomId
  store.sceneDeviceLayoutByDeviceId = graph.sceneDeviceLayoutByDeviceId

  if (options.selectedRoomId !== undefined) {
    store.selectedRoomId = options.selectedRoomId
  }

  return store
}

export function buildCatalogEntityCache(graph) {
  return {
    roomsById: graph.roomsById,
    devicesById: graph.devicesById,
    roomDeviceIdsByRoomId: graph.roomDeviceIdsByRoomId,
  }
}

export function buildSceneEntityCache(graph) {
  return {
    sceneMeta: graph.sceneMeta,
    sceneLayoutByRoomId: graph.sceneLayoutByRoomId,
    sceneDeviceLayoutByDeviceId: graph.sceneDeviceLayoutByDeviceId,
  }
}

function buildRoomSnapshot(graph, roomId) {
  const room = graph.roomsById[roomId]
  const sceneLayout = graph.sceneLayoutByRoomId[roomId] ?? {}
  const deviceIds = graph.roomDeviceIdsByRoomId[roomId] ?? []

  return {
    ...room,
    ...sceneLayout,
    zone: graph.sceneMeta.zone,
    devices: deviceIds
      .map((deviceId) => graph.devicesById[deviceId])
      .filter(Boolean)
      .map((device) => ({
        ...device,
        room_id: device.room_id ?? roomId,
      })),
  }
}

export function buildRoomsPayload(graph) {
  return Object.keys(graph.roomsById)
    .map((roomId) => buildRoomSnapshot(graph, roomId))
}

export function buildSpatialScenePayload(graph) {
  return {
    zone: graph.sceneMeta.zone,
    analysis: graph.sceneMeta.analysis,
    rooms: buildRoomsPayload(graph).map((room) => ({
      ...room,
      devices: room.devices.map((device) => ({
        ...device,
        ...(graph.sceneDeviceLayoutByDeviceId[device.id] ?? {}),
      })),
    })),
  }
}

export function createJsonResponse(payload, options = {}) {
  const {
    ok = true,
    status = 200,
  } = options

  return {
    ok,
    status,
    async json() {
      return payload
    },
    async text() {
      return JSON.stringify(payload)
    },
  }
}

export function buildLegacyRoomsPayload() {
  return [
    {
      id: 999,
      zone_id: 99,
      name: 'Legacy room',
      description: '',
      devices: [
        {
          id: 9991,
          room_id: 999,
          name: 'Legacy light',
          entity_id: 'light.legacy_main',
          ha_entity_id: 'light.legacy_main',
          entity_domain: 'light',
          type: 'light',
          device_type: 'light',
          current_status: 'on',
          raw_state: 'on',
          can_control: true,
          control_kind: 'toggle',
        },
      ],
    },
  ]
}

export function buildLegacySpatialScenePayload() {
  return {
    zone: {
      id: 99,
      name: 'Legacy zone',
      description: '',
    },
    analysis: null,
    rooms: buildLegacyRoomsPayload(),
  }
}
