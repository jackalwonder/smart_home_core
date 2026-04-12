function normalizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

const defaultCategoryLabelMap = {
  lights: '灯光类',
  climate: '温控类',
  fans: '风扇类',
  fan: '风扇类',
  sensor: '传感类',
  sensors: '传感类',
  presence: '人体类',
}

export function buildSettingsEntityToolboxItems(
  draftEntityLibrary = [],
  activeDraftHotspots = [],
  roomOptions = [],
) {
  const roomLabelMap = new Map(
    (Array.isArray(roomOptions) ? roomOptions : []).map((room) => [room.value, room.label]),
  )

  return (Array.isArray(draftEntityLibrary) ? draftEntityLibrary : []).map((device) => {
    const roomKeys = Array.from(
      new Set(
        (Array.isArray(activeDraftHotspots) ? activeDraftHotspots : [])
          .filter((hotspot) => hotspot.deviceId === device.id)
          .map((hotspot) => hotspot.roomKey)
          .filter(Boolean),
      ),
    )

    const roomLabels = roomKeys.map((roomKey) => roomLabelMap.get(roomKey) ?? roomKey)
    const rawCategory = normalizeText(device.category)
    const categoryLabel = defaultCategoryLabelMap[rawCategory] ?? rawCategory ?? '未分类'
    const subtitle = [device.id, roomLabels.join(' / ') || '未放置房间', categoryLabel].join(' · ')

    return {
      id: device.id,
      name: normalizeText(device.name) || device.id,
      category: rawCategory || 'other',
      categoryLabel,
      roomLabels,
      subtitle,
      searchText: [
        normalizeText(device.name),
        normalizeText(device.id),
        rawCategory,
        categoryLabel,
        ...roomLabels,
        ...roomKeys,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }
  })
}
