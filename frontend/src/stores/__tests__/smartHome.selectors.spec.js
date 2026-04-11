import { describe, expect, it } from 'vitest'

import { createEntityGraph, createSmartHomeStore, seedEntityGraph } from './smartHome.test-utils'

describe('smartHome selectors', () => {
  it('builds selected room and room/device views directly from entity state', () => {
    const store = createSmartHomeStore()
    const graph = createEntityGraph()

    seedEntityGraph(store, graph, { selectedRoomId: 1 })

    const selectedRoom = store.selectedRoom
    const roomView = store.selectRoomViewById(1)
    const deviceView = store.selectDeviceViewById(101)

    expect(selectedRoom?.id).toBe(1)
    expect(store.dashboardRoomViews.map((room) => room.id)).toEqual([1, 2])
    expect(roomView).toMatchObject({
      id: 1,
      name: '客厅',
      plan_x: 20,
      plan_y: 30,
      source: 'merged',
      isSceneBacked: true,
    })
    expect(roomView?.devices.map((device) => device.id)).toEqual([101])
    expect(deviceView).toMatchObject({
      id: 101,
      room_id: 1,
      current_status: 'off',
      brightness_value: 18,
      plan_x: 88,
      plan_y: 64,
      source: 'merged',
      isSceneBacked: true,
      position: { x: 0.28, y: 0.42 },
    })
  })
})
