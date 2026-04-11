import { describe, expect, it, vi } from 'vitest'

import {
  SMART_HOME_CACHE_KEYS,
  buildCatalogEntityCache,
  buildLegacyRoomsPayload,
  buildLegacySpatialScenePayload,
  buildRoomsPayload,
  buildSceneEntityCache,
  buildSpatialScenePayload,
  createEntityGraph,
  createJsonResponse,
  createSmartHomeStore,
} from './smartHome.test-utils'

describe('smartHome cache hydrate', () => {
  it('hydrates selector-backed state from entity cache and ignores legacy fallback cache', async () => {
    const graph = createEntityGraph()

    window.localStorage.setItem(
      SMART_HOME_CACHE_KEYS.catalogEntities,
      JSON.stringify(buildCatalogEntityCache(graph)),
    )
    window.localStorage.setItem(
      SMART_HOME_CACHE_KEYS.sceneEntities,
      JSON.stringify(buildSceneEntityCache(graph)),
    )
    window.localStorage.setItem(
      SMART_HOME_CACHE_KEYS.uiPreferences,
      JSON.stringify({ selectedRoomId: 1, userSelectedRoom: true }),
    )
    window.localStorage.setItem(
      SMART_HOME_CACHE_KEYS.legacyRooms,
      JSON.stringify(buildLegacyRoomsPayload()),
    )
    window.localStorage.setItem(
      SMART_HOME_CACHE_KEYS.legacySpatialScene,
      JSON.stringify(buildLegacySpatialScenePayload()),
    )

    globalThis.fetch = vi.fn((url) => {
      if (`${url}`.includes('/api/rooms')) {
        return Promise.resolve(createJsonResponse(buildRoomsPayload(graph)))
      }

      if (`${url}`.includes('/api/spatial/scene')) {
        return Promise.resolve(createJsonResponse(buildSpatialScenePayload(graph)))
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })

    const store = createSmartHomeStore()
    const initializePromise = store.initialize()

    expect(store.selectedRoom?.id).toBe(1)
    expect(store.dashboardRoomViews.map((room) => room.id)).toEqual([1, 2])
    expect(store.selectRoomViewById(1)?.devices[0]).toMatchObject({
      id: 101,
      room_id: 1,
    })
    expect(store.dashboardRoomViews.some((room) => room.id === 999)).toBe(false)

    await initializePromise
    store.disconnectRealtime()

    window.localStorage.clear()
    window.localStorage.setItem(
      SMART_HOME_CACHE_KEYS.legacyRooms,
      JSON.stringify(buildLegacyRoomsPayload()),
    )
    window.localStorage.setItem(
      SMART_HOME_CACHE_KEYS.legacySpatialScene,
      JSON.stringify(buildLegacySpatialScenePayload()),
    )

    globalThis.fetch = vi.fn(() => new Promise(() => {}))

    const legacyOnlyStore = createSmartHomeStore()
    legacyOnlyStore.initialize().catch(() => {})

    expect(legacyOnlyStore.dashboardRoomViews).toEqual([])
    expect(legacyOnlyStore.selectedRoom).toBeNull()
  })
})
