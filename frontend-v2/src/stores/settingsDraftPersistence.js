const DRAFT_STORAGE_KEY = 'shadow-dashboard-v2:settings-draft'
const LEGACY_STORAGE_KEY = 'shadow-dashboard-v2:settings'
const LEGACY_EXTRA_KEYS = [
  'shadow-dashboard-v2:floors',
  'shadow-dashboard-v2:floorplanAssets',
  'shadow-dashboard-v2:roomLayers',
  'shadow-dashboard-v2:roomAnchors',
  'shadow-dashboard-v2:defaultHotspots',
]

function safeParse(raw) {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function cloneSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot))
}

function readStorage(key) {
  try {
    return safeParse(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

function writeStorage(key, payload) {
  try {
    window.localStorage.setItem(key, JSON.stringify(payload))
  } catch {
    // ignore quota failures
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore remove failures
  }
}

function sanitizePersistedAsset(asset) {
  if (!asset || typeof asset !== 'object') {
    return asset
  }

  return {
    ...asset,
    objectUrl: null,
  }
}

function sanitizePersistedFloor(floor) {
  if (!floor || typeof floor !== 'object') {
    return floor
  }

  return {
    ...floor,
    hotspots: Array.isArray(floor.hotspots) ? floor.hotspots.map((hotspot) => ({ ...hotspot })) : floor.hotspots,
  }
}

function sanitizeDraftForStorage(payload) {
  return {
    developerLayoutEditEnabled: Boolean(payload?.developerLayoutEditEnabled),
    developerLayoutViewDraftEnabled: Boolean(payload?.developerLayoutViewDraftEnabled),
    settingsMenu: Array.isArray(payload?.settingsMenu) ? payload.settingsMenu.map((item) => ({ ...item })) : [],
    draftAssets: Array.isArray(payload?.draftAssets) ? payload.draftAssets.map(sanitizePersistedAsset) : [],
    draftFloors: Array.isArray(payload?.draftFloors) ? payload.draftFloors.map(sanitizePersistedFloor) : [],
    activeDraftFloorId: payload?.activeDraftFloorId ?? null,
  }
}

export function migrateLegacyDraft(defaultDraft) {
  const fallback = cloneSnapshot(defaultDraft)
  const legacyRoot = readStorage(LEGACY_STORAGE_KEY) ?? {}
  const legacyFloors = readStorage('shadow-dashboard-v2:floors')
  const legacyAssets = readStorage('shadow-dashboard-v2:floorplanAssets')

  const migrated = sanitizeDraftForStorage({
    developerLayoutEditEnabled: legacyRoot.developerLayoutEditEnabled ?? fallback.developerLayoutEditEnabled,
    developerLayoutViewDraftEnabled:
      legacyRoot.developerLayoutViewDraftEnabled ?? fallback.developerLayoutViewDraftEnabled,
    settingsMenu: Array.isArray(legacyRoot.settingsMenu) ? legacyRoot.settingsMenu : fallback.settingsMenu,
    draftAssets: Array.isArray(legacyRoot.draftAssets)
      ? legacyRoot.draftAssets
      : Array.isArray(legacyRoot.floorplanAssets)
        ? legacyRoot.floorplanAssets
        : Array.isArray(legacyAssets)
          ? legacyAssets
          : fallback.draftAssets,
    draftFloors: Array.isArray(legacyRoot.draftFloors)
      ? legacyRoot.draftFloors
      : Array.isArray(legacyRoot.floors)
        ? legacyRoot.floors
        : Array.isArray(legacyFloors)
          ? legacyFloors
          : fallback.draftFloors,
    activeDraftFloorId:
      legacyRoot.activeDraftFloorId ?? legacyRoot.selectedFloorId ?? fallback.activeDraftFloorId,
  })

  const hasLegacyData =
    Array.isArray(legacyRoot.settingsMenu) ||
    Array.isArray(legacyRoot.floorplanAssets) ||
    Array.isArray(legacyRoot.floors) ||
    Array.isArray(legacyAssets) ||
    Array.isArray(legacyFloors) ||
    typeof legacyRoot.selectedFloorId !== 'undefined'

  return {
    draft: migrated,
    didMigrate: hasLegacyData,
  }
}

export function loadDraft(defaultDraft) {
  const fallback = cloneSnapshot(defaultDraft)
  const currentDraft = readStorage(DRAFT_STORAGE_KEY)

  if (currentDraft) {
    return {
      draft: sanitizeDraftForStorage({
        developerLayoutEditEnabled: currentDraft.developerLayoutEditEnabled ?? fallback.developerLayoutEditEnabled,
        developerLayoutViewDraftEnabled:
          currentDraft.developerLayoutViewDraftEnabled ?? fallback.developerLayoutViewDraftEnabled,
        settingsMenu: Array.isArray(currentDraft.settingsMenu) ? currentDraft.settingsMenu : fallback.settingsMenu,
        draftAssets: Array.isArray(currentDraft.draftAssets) ? currentDraft.draftAssets : fallback.draftAssets,
        draftFloors: Array.isArray(currentDraft.draftFloors) ? currentDraft.draftFloors : fallback.draftFloors,
        activeDraftFloorId: currentDraft.activeDraftFloorId ?? fallback.activeDraftFloorId,
      }),
      source: 'draft',
    }
  }

  const migrated = migrateLegacyDraft(fallback)
  if (migrated.didMigrate) {
    saveDraft(migrated.draft)
    return {
      draft: migrated.draft,
      source: 'legacy',
    }
  }

  return {
    draft: sanitizeDraftForStorage(fallback),
    source: 'default',
  }
}

export function saveDraft(payload) {
  writeStorage(DRAFT_STORAGE_KEY, sanitizeDraftForStorage(payload))
}

export function resetDraft(defaultDraft) {
  const nextDraft = sanitizeDraftForStorage(cloneSnapshot(defaultDraft))
  removeStorage(DRAFT_STORAGE_KEY)
  saveDraft(nextDraft)
  return nextDraft
}

export function clearLegacyDraftCache() {
  removeStorage(LEGACY_STORAGE_KEY)
  LEGACY_EXTRA_KEYS.forEach(removeStorage)
}

export const settingsDraftStorageKeys = {
  DRAFT_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  LEGACY_EXTRA_KEYS,
}
