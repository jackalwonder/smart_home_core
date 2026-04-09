import { normalizeRoomStateRead } from './roomAdapter'

export function normalizeSpatialSceneRead(raw = {}) {
  return {
    zone: raw?.zone ?? null,
    analysis: raw?.analysis ?? null,
    rooms: Array.isArray(raw?.rooms) ? raw.rooms.map((room) => normalizeRoomStateRead(room)) : [],
  }
}
