import { computed, onBeforeUnmount, reactive, unref, watch } from 'vue'

import { ROOM_TRANSITION_ORCHESTRATION } from '../config/floorMapConfig'

function clearRoomTimer(record) {
  if (record?.timer) {
    window.clearTimeout(record.timer)
    record.timer = 0
  }
}

export function useRoomTransitionOrchestration(roomModelsRef, roomPriorityByIdRef, devicePriorityByIdRef, visualActivityRef) {
  const timelineByRoomId = reactive({})

  function ensureRecord(roomId, mode = 'calm') {
    if (!timelineByRoomId[roomId]) {
      timelineByRoomId[roomId] = {
        phase: 'idle',
        mode,
        lastActivityTimestamp: 0,
        active: false,
        timer: 0,
      }
    }

    if (mode) {
      timelineByRoomId[roomId].mode = mode
    }

    return timelineByRoomId[roomId]
  }

  function schedulePhase(roomId, nextPhase, delay) {
    const record = ensureRecord(roomId)
    clearRoomTimer(record)
    record.timer = window.setTimeout(() => {
      record.phase = nextPhase
      record.timer = 0
    }, delay)
  }

  watch(
    () => {
      const rooms = unref(roomModelsRef) ?? []
      const roomPriorityById = unref(roomPriorityByIdRef) ?? {}
      const visualActivity = unref(visualActivityRef) ?? []
      return {
        rooms: rooms.map((room) => room.id),
        priorities: Object.fromEntries(Object.entries(roomPriorityById).map(([roomId, value]) => [roomId, value.roomMode])),
        activitySignature: visualActivity.map((entry) => `${entry.roomId}:${entry.deviceId}:${entry.status}:${entry.timestamp}`).join('|'),
      }
    },
    () => {
      const rooms = unref(roomModelsRef) ?? []
      const roomPriorityById = unref(roomPriorityByIdRef) ?? {}
      const visualActivity = unref(visualActivityRef) ?? []
      const cutoff = Date.now() - 3000
      const recentActivity = visualActivity.filter((entry) => entry.timestamp >= cutoff)
      const roomIds = new Set(rooms.map((room) => room.id))

      Object.keys(timelineByRoomId).forEach((roomId) => {
        if (!roomIds.has(Number(roomId)) && !roomIds.has(roomId)) {
          clearRoomTimer(timelineByRoomId[roomId])
          delete timelineByRoomId[roomId]
        }
      })

      rooms.forEach((room) => {
        const priority = roomPriorityById[room.id] ?? { roomMode: 'calm' }
        const record = ensureRecord(room.id, priority.roomMode)
        const roomActivity = recentActivity.filter((entry) => entry.roomId === room.id)
        const latestTimestamp = roomActivity.reduce((latest, entry) => Math.max(latest, entry.timestamp), 0)

        if (roomActivity.length > 0) {
          if (!record.active || latestTimestamp > record.lastActivityTimestamp) {
            record.active = true
            record.lastActivityTimestamp = latestTimestamp
            record.phase = 'entering'
            schedulePhase(room.id, 'steady', ROOM_TRANSITION_ORCHESTRATION.enteringWindowMs)
          }
          return
        }

        if (record.active) {
          record.active = false
          record.phase = 'exiting'
          schedulePhase(room.id, 'idle', ROOM_TRANSITION_ORCHESTRATION.exitingWindowMs)
        }
      })
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    Object.values(timelineByRoomId).forEach((record) => clearRoomTimer(record))
  })

  const roomTransitionById = computed(() => {
    const roomPriorityById = unref(roomPriorityByIdRef) ?? {}

    return Object.fromEntries(Object.entries(timelineByRoomId).map(([roomId, record]) => {
      const roomMode = roomPriorityById[roomId]?.roomMode ?? record.mode ?? 'calm'
      const config = ROOM_TRANSITION_ORCHESTRATION.roomModes[roomMode] ?? ROOM_TRANSITION_ORCHESTRATION.roomModes.calm
      const entering = record.phase === 'entering'
      const exiting = record.phase === 'exiting'

      return [
        roomId,
        {
          roomMode,
          phase: record.phase,
          ambientDuration: config.ambientDuration,
          motionDuration: config.motionDuration,
          feedbackDuration: config.feedbackDuration,
          ambientDelay: entering ? config.ambientEnterDelay : exiting ? config.ambientExitDelay : 0,
          primaryDelay: entering ? config.primaryEnterDelay : exiting ? config.primaryExitDelay : 0,
          secondaryDelay: entering ? config.secondaryEnterDelay : exiting ? config.secondaryExitDelay : 0,
          feedbackDelay: entering ? config.feedbackEnterDelay : exiting ? config.feedbackExitDelay : 0,
        },
      ]
    }))
  })

  const deviceTransitionById = computed(() => {
    const roomTransitionByIdValue = roomTransitionById.value
    const devicePriorityById = unref(devicePriorityByIdRef) ?? {}

    return Object.fromEntries(Object.entries(devicePriorityById).map(([deviceId, priority]) => {
      const roomTransition = roomTransitionByIdValue[priority.roomId] ?? {
        phase: 'idle',
        primaryDelay: 0,
        secondaryDelay: 0,
        feedbackDelay: 0,
        motionDuration: 200,
        feedbackDuration: 180,
      }

      const motionDelay = priority.tier === 'primary'
        ? roomTransition.primaryDelay
        : roomTransition.secondaryDelay

      return [
        deviceId,
        {
          phase: roomTransition.phase,
          motionDelay,
          motionDuration: roomTransition.motionDuration,
          feedbackDelay: roomTransition.feedbackDelay,
          feedbackDuration: roomTransition.feedbackDuration,
        },
      ]
    }))
  })

  return {
    roomTransitionById,
    deviceTransitionById,
    config: ROOM_TRANSITION_ORCHESTRATION,
  }
}
