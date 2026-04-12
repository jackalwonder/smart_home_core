import { buildWebSocketUrl } from '../api/client'

const HEARTBEAT_INTERVAL_MS = 25000
const RECONNECT_BASE_MS = 1200
const RECONNECT_MAX_MS = 10000

export class DeviceRealtimeClient {
  constructor(options = {}) {
    this.onMessage = options.onMessage || (() => {})
    this.onOpen = options.onOpen || (() => {})
    this.onClose = options.onClose || (() => {})
    this.onReconnect = options.onReconnect || (() => {})

    this.socket = null
    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.reconnectAttempt = 0
    this.manuallyStopped = false
    this.hasConnectedOnce = false
  }

  connect() {
    this.manuallyStopped = false

    if (this.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.socket.readyState)) {
      return
    }

    const socket = new WebSocket(buildWebSocketUrl('/ws/devices'))
    this.socket = socket

    socket.addEventListener('open', () => {
      const isReconnect = this.hasConnectedOnce
      this.hasConnectedOnce = true
      this.reconnectAttempt = 0
      this.startHeartbeat()
      this.onOpen()
      if (isReconnect) {
        this.onReconnect()
      }
    })

    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data)
        this.onMessage(payload)
      } catch {
        // ignore malformed payloads
      }
    })

    socket.addEventListener('close', () => {
      this.stopHeartbeat()
      this.onClose()
      this.socket = null

      if (!this.manuallyStopped) {
        this.scheduleReconnect()
      }
    })

    socket.addEventListener('error', () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
    })
  }

  disconnect() {
    this.manuallyStopped = true
    window.clearTimeout(this.reconnectTimer)
    this.stopHeartbeat()
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send('ping')
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  stopHeartbeat() {
    window.clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  scheduleReconnect() {
    window.clearTimeout(this.reconnectTimer)
    const delay = Math.min(RECONNECT_BASE_MS * (2 ** this.reconnectAttempt), RECONNECT_MAX_MS)
    this.reconnectAttempt += 1
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay)
  }
}
