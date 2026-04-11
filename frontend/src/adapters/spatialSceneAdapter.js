import { normalizeRoomStateRead } from './roomAdapter'

export function normalizeSceneMeta(raw = {}) {
  return {
    zone: raw?.zone ?? null,
    analysis: raw?.analysis ?? null,
  }
}

export function normalizeSpatialSceneRead(raw = {}) {
  return {
    ...normalizeSceneMeta(raw),
    rooms: Array.isArray(raw?.rooms) ? raw.rooms.map((room) => normalizeRoomStateRead(room)) : [],
  }
}
