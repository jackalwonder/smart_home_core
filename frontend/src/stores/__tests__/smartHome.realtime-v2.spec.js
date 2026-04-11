import { afterEach, describe, expect, it } from 'vitest'

import { createEntityGraph, createSmartHomeStore, seedEntityGraph } from './smartHome.test-utils'

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = FakeWebSocket.CONNECTING
    this.listeners = new Map()
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type, handler) {
    const collection = this.listeners.get(type) ?? []
    collection.push(handler)
    this.listeners.set(type, collection)
  }

  removeEventListener(type, handler) {
    const collection = this.listeners.get(type) ?? []
    this.listeners.set(type, collection.filter((item) => item !== handler))
  }

  emit(type, event = {}) {
    if (type === 'open') {
      this.readyState = FakeWebSocket.OPEN
    }
    if (type === 'close') {
      this.readyState = FakeWebSocket.CLOSED
    }

    for (const handler of this.listeners.get(type) ?? []) {
      handler(event)
    }
  }

  close() {
    this.emit('close')
  }
}

afterEach(() => {
  FakeWebSocket.instances = []
})

describe('smartHome realtime v2', () => {
  it('applies v2 patches through the entity-to-selector chain', () => {
    globalThis.WebSocket = FakeWebSocket

    const store = createSmartHomeStore()
    const graph = createEntityGraph()
    seedEntityGraph(store, graph, { selectedRoomId: 1 })

    store.connectRealtime()

    const socket = FakeWebSocket.instances[0]
    socket.emit('open')
    socket.emit('message', {
      data: JSON.stringify({
        type: 'device_state_updated',
        protocol_version: 2,
        seq: 1,
        device: {
          id: 101,
          current_status: 'on',
          raw_state: 'on',
          brightness_value: 88,
        },
      }),
    })

    expect(store.devicesById[101]).toMatchObject({
      id: 101,
      current_status: 'on',
      raw_state: 'on',
      brightness_value: 88,
    })
    expect(store.selectDeviceViewById(101)).toMatchObject({
      id: 101,
      current_status: 'on',
      brightness_value: 88,
      room_id: 1,
    })
    expect(store.selectRoomViewById(1)?.devices[0]).toMatchObject({
      id: 101,
      current_status: 'on',
      brightness_value: 88,
    })

    store.disconnectRealtime()
  })
})
