function normalizeText(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

const categoryLabelMap = {
  lights: '灯光',
  climate: '温控',
  fan: '风扇',
  fans: '风扇',
  sensor: '传感',
  sensors: '传感',
  presence: '人体',
  switch: '开关',
  generic: '通用',
  other: '其他',
}

export function buildRuntimeEntityToolboxItems(
  runtimeEntityLibrary = [],
  activeDraftHotspots = [],
  roomOptions = [],
) {
  const roomLabelMap = new Map(
    (Array.isArray(roomOptions) ? roomOptions : []).map((room) => [room.value, room.label]),
  )

  return (Array.isArray(runtimeEntityLibrary) ? runtimeEntityLibrary : [])
    .map((device) => {
      const normalizedDeviceId = String(device?.id ?? '').trim()
      if (!normalizedDeviceId) {
        return null
      }

      const roomKeys = Array.from(
        new Set(
          (Array.isArray(activeDraftHotspots) ? activeDraftHotspots : [])
            .filter((hotspot) => String(hotspot?.deviceId ?? '') === normalizedDeviceId)
            .map((hotspot) => hotspot?.roomKey)
            .filter(Boolean),
        ),
      )

      const roomLabels = roomKeys.map((roomKey) => roomLabelMap.get(roomKey) ?? roomKey)
      const rawCategory = normalizeText(device?.category).toLowerCase() || 'other'
      const categoryLabel = categoryLabelMap[rawCategory] || rawCategory
      const name = normalizeText(device?.name) || normalizedDeviceId
      const subtitle = [normalizedDeviceId, roomLabels.join(' / ') || '未放置房间', categoryLabel].join(' · ')

      return {
        id: normalizedDeviceId,
        name,
        category: rawCategory,
        categoryLabel,
        roomLabels,
        subtitle,
        searchText: [
          name,
          normalizedDeviceId,
          rawCategory,
          categoryLabel,
          normalizeText(device?.entityDomain),
          normalizeText(device?.deviceType),
          normalizeText(device?.applianceType),
          ...roomLabels,
          ...roomKeys,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      }
    })
    .filter(Boolean)
}
