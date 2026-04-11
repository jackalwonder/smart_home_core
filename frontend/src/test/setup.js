import { beforeEach, vi } from 'vitest'

function createLocalStorage() {
  const storage = new Map()

  return {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null
    },
    setItem(key, value) {
      storage.set(key, String(value))
    },
    removeItem(key) {
      storage.delete(key)
    },
    clear() {
      storage.clear()
    },
  }
}

class PassiveWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.readyState = PassiveWebSocket.CONNECTING
  }

  addEventListener() {}

  removeEventListener() {}

  close() {
    this.readyState = PassiveWebSocket.CLOSED
  }
}

const localStorage = createLocalStorage()
const windowMock = {
  localStorage,
  location: {
    protocol: 'http:',
    host: 'localhost:5173',
  },
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  prompt: vi.fn(() => 'test-control-token'),
}

globalThis.window = windowMock
globalThis.localStorage = localStorage

beforeEach(() => {
  localStorage.clear()
  windowMock.prompt = vi.fn(() => 'test-control-token')
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('Unhandled fetch mock.')))
  globalThis.WebSocket = PassiveWebSocket
})
