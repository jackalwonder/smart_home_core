import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'shadow-dashboard-v2:settings'
const DEFAULT_FLOORPLAN_ASPECT_RATIO = '1200 / 789'

const roomOptions = [
  { value: 'living', label: '客餐厅' },
  { value: 'master', label: '主卧' },
  { value: 'bedroom-west', label: '西次卧' },
  { value: 'bedroom-east', label: '东次卧' },
  { value: 'bath-west', label: '西卫' },
  { value: 'bath-east', label: '东卫' },
  { value: 'hall', label: '过道' },
  { value: 'entry', label: '玄关' },
]

const colorGroupOptions = [
  { value: 'blue', label: '蓝组' },
  { value: 'gold', label: '金组' },
  { value: 'green', label: '绿组' },
  { value: 'rose', label: '红组' },
  { value: 'violet', label: '紫组' },
]

const defaultHotspots = [
  { id: 'dining-light', x: 14, y: 76, icon: 'light', active: false, label: '餐厅筒灯', category: 'lights', deviceId: 'light-1' },
  { id: 'living-light', x: 29, y: 40, icon: 'light', active: false, label: '客厅主灯', category: 'lights', deviceId: 'light-8' },
  { id: 'bath-light-west', x: 41, y: 36, icon: 'light', active: false, label: '西卫照明', category: 'lights', deviceId: 'light-9' },
  { id: 'study-fan', x: 52, y: 40, icon: 'fan', active: false, label: '次卧风扇', category: 'climate', deviceId: 'climate-2' },
  { id: 'study-climate', x: 54, y: 44, icon: 'climate', active: true, label: '次卧温控', category: 'climate', deviceId: 'climate-2' },
  { id: 'hall-climate', x: 74, y: 50, icon: 'climate', active: true, label: '过道温控', category: 'climate', deviceId: 'climate-3' },
  { id: 'bath-light-east', x: 90, y: 47, icon: 'light', active: true, label: '东卫照明', category: 'lights', deviceId: 'light-17' },
  { id: 'bedroom-light-west', x: 31, y: 78, icon: 'light', active: true, label: '西次卧灯带', category: 'lights', deviceId: 'light-10' },
  { id: 'bedroom-light-main', x: 53, y: 84, icon: 'light', active: true, label: '主卧灯带', category: 'lights', deviceId: 'light-19' },
  { id: 'bedroom-light-east', x: 82, y: 79, icon: 'light', active: true, label: '东次卧灯带', category: 'lights', deviceId: 'light-4' },
  { id: 'entry-presence', x: 39, y: 87, icon: 'presence', active: false, label: '玄关人体', category: 'climate', deviceId: 'climate-5' },
]

const roomGlows = [
  { id: 'living', x: 29, y: 66, width: 36, height: 30, tone: 'warm' },
  { id: 'study-west', x: 31, y: 80, width: 17, height: 17, tone: 'gold' },
  { id: 'master', x: 56, y: 85, width: 19, height: 17, tone: 'warm' },
  { id: 'study-east', x: 83, y: 80, width: 19, height: 18, tone: 'warm' },
  { id: 'bath-east', x: 88, y: 56, width: 12, height: 18, tone: 'cool' },
]

const roomBadges = [
  { id: 'badge-study', x: 53, y: 54, value: '20.4℃' },
  { id: 'badge-hall', x: 73, y: 45, value: '20.5℃' },
]

const roomAnchors = [
  { key: 'living', x: 23, y: 68, label: '客餐厅' },
  { key: 'master', x: 55, y: 86, label: '主卧' },
  { key: 'bedroom-west', x: 31, y: 79, label: '西次卧' },
  { key: 'bedroom-east', x: 82, y: 80, label: '东次卧' },
  { key: 'bath-west', x: 40, y: 37, label: '西卫' },
  { key: 'bath-east', x: 89, y: 47, label: '东卫' },
  { key: 'hall', x: 72, y: 54, label: '过道' },
  { key: 'entry', x: 40, y: 89, label: '玄关' },
]

const roomLayers = [
  { key: 'living', label: '客餐厅', polygon: '10% 56%, 38% 56%, 38% 86%, 8% 86%' },
  { key: 'master', label: '主卧', polygon: '45% 74%, 66% 74%, 66% 94%, 45% 94%' },
  { key: 'bedroom-west', label: '西次卧', polygon: '22% 70%, 40% 70%, 40% 92%, 22% 92%' },
  { key: 'bedroom-east', label: '东次卧', polygon: '73% 71%, 92% 71%, 92% 92%, 73% 92%' },
  { key: 'bath-west', label: '西卫', polygon: '34% 27%, 47% 27%, 47% 46%, 34% 46%' },
  { key: 'bath-east', label: '东卫', polygon: '82% 38%, 96% 38%, 96% 59%, 82% 59%' },
  { key: 'hall', label: '过道', polygon: '57% 42%, 82% 42%, 82% 66%, 57% 66%' },
  { key: 'entry', label: '玄关', polygon: '30% 83%, 49% 83%, 49% 96%, 30% 96%' },
]

const roomEnvironmentSeed = {
  living: { temperature: '24.2℃', humidity: '38%', online: 12, comfort: '舒适', aqi: '38', lux: '420 lx', energyTrend: [46, 58, 62, 71, 68] },
  master: { temperature: '23.4℃', humidity: '41%', online: 8, comfort: '安静', aqi: '32', lux: '210 lx', energyTrend: [28, 36, 40, 38, 42] },
  'bedroom-west': { temperature: '22.8℃', humidity: '40%', online: 6, comfort: '适眠', aqi: '35', lux: '190 lx', energyTrend: [22, 28, 31, 29, 33] },
  'bedroom-east': { temperature: '23.0℃', humidity: '39%', online: 7, comfort: '清爽', aqi: '34', lux: '205 lx', energyTrend: [24, 29, 34, 37, 35] },
  'bath-west': { temperature: '25.1℃', humidity: '52%', online: 4, comfort: '偏湿', aqi: '29', lux: '310 lx', energyTrend: [18, 20, 24, 23, 21] },
  'bath-east': { temperature: '25.6℃', humidity: '55%', online: 5, comfort: '偏湿', aqi: '31', lux: '325 lx', energyTrend: [19, 22, 27, 29, 24] },
  hall: { temperature: '22.5℃', humidity: '35%', online: 5, comfort: '通风', aqi: '33', lux: '280 lx', energyTrend: [15, 18, 22, 20, 19] },
  entry: { temperature: '21.9℃', humidity: '33%', online: 3, comfort: '干爽', aqi: '36', lux: '160 lx', energyTrend: [9, 12, 14, 13, 11] },
}

const statsSeed = [
  { key: 'yesterday', label: '昨日用电', total: '13.5 kWh', byRoom: { living: '4.1 kWh', master: '2.4 kWh', 'bedroom-west': '1.8 kWh', 'bedroom-east': '1.6 kWh', hall: '1.2 kWh', entry: '0.4 kWh', 'bath-west': '0.9 kWh', 'bath-east': '1.1 kWh' } },
  { key: 'month', label: '本月累计', total: '364.27 kWh', byRoom: { living: '112.8 kWh', master: '69.4 kWh', 'bedroom-west': '48.2 kWh', 'bedroom-east': '44.6 kWh', hall: '23.1 kWh', entry: '8.7 kWh', 'bath-west': '28.4 kWh', 'bath-east': '29.0 kWh' } },
  { key: 'balance', label: '账户余额', total: '67.39 元', byRoom: { living: '21.06 元', master: '12.79 元', 'bedroom-west': '8.44 元', 'bedroom-east': '8.02 元', hall: '4.28 元', entry: '1.19 元', 'bath-west': '5.72 元', 'bath-east': '5.89 元' } },
  { key: 'year', label: '年度累计', total: '1170.27 kWh', byRoom: { living: '356.8 kWh', master: '228.9 kWh', 'bedroom-west': '151.7 kWh', 'bedroom-east': '144.1 kWh', hall: '73.9 kWh', entry: '25.6 kWh', 'bath-west': '93.5 kWh', 'bath-east': '95.8 kWh' } },
]

const weatherMetrics = [
  { label: '空气湿度', value: '33%', progress: 0.33, tone: 'blue' },
  { label: '降雨量', value: '0 mm', progress: 0.02, tone: 'slate' },
  { label: '空气质量 (AQI)', value: '38 优', progress: 0.22, tone: 'green' },
]

const notifications = [
  { id: 'notify-global', label: '全局通知开关', enabled: true },
  { id: 'notify-priority', label: '重要通知开关', enabled: true },
  { id: 'notify-offline', label: '设备离线通知', enabled: false },
  { id: 'notify-climate', label: '空调自适应开启', enabled: true },
]

const securityActionsSeed = [
  { id: 'security-1', label: '全局布防', subtitle: 'ARMED AWAY', enabled: true },
  { id: 'security-2', label: '门窗传感', subtitle: 'ENTRY SENSORS', enabled: true },
  { id: 'security-3', label: '人体联动', subtitle: 'PRESENCE WATCH', enabled: false },
  { id: 'security-4', label: '夜间巡检', subtitle: 'NIGHT PATROL', enabled: true },
  { id: 'security-5', label: '陌生人提醒', subtitle: 'VISITOR ALERT', enabled: false },
]

const securityStatusCardsSeed = [
  { id: 'security-status', label: '当前状态', value: '已布防', detail: 'Away Guard', tone: 'red' },
  { id: 'security-zone', label: '重点区域', value: '3', detail: '客餐厅 / 玄关 / 过道', tone: 'blue' },
  { id: 'security-response', label: '响应策略', value: '联动中', detail: '灯光 + 推送 + 声光', tone: 'gold' },
]

const securitySensorSummarySeed = [
  { id: 'sum-door', label: '门窗传感', value: 12, state: '在线 11 / 触发 1', tone: 'blue' },
  { id: 'sum-motion', label: '人体传感', value: 5, state: '在线 5 / 告警 1', tone: 'red' },
  { id: 'sum-camera', label: '摄像头', value: 4, state: '巡检中 2', tone: 'violet' },
  { id: 'sum-arming', label: '布防分区', value: 4, state: '夜间模式已启用', tone: 'green' },
]

const securitySensorsSeed = [
  { id: 'sensor-entry-door', label: '玄关入户门', type: 'door', roomKey: 'entry', state: 'open', battery: '92%', lastSeen: '17:12:02', priority: 'high' },
  { id: 'sensor-living-window', label: '客厅落地窗', type: 'window', roomKey: 'living', state: 'closed', battery: '88%', lastSeen: '17:11:48', priority: 'medium' },
  { id: 'sensor-master-window', label: '主卧飘窗', type: 'window', roomKey: 'master', state: 'closed', battery: '73%', lastSeen: '17:09:26', priority: 'low' },
  { id: 'sensor-hall-motion', label: '过道人体雷达', type: 'motion', roomKey: 'hall', state: 'triggered', battery: 'USB', lastSeen: '17:12:31', priority: 'high' },
  { id: 'sensor-bath-east', label: '东卫门磁', type: 'door', roomKey: 'bath-east', state: 'closed', battery: '61%', lastSeen: '17:07:44', priority: 'low' },
  { id: 'sensor-west-room', label: '西次卧人体', type: 'motion', roomKey: 'bedroom-west', state: 'idle', battery: '84%', lastSeen: '17:06:12', priority: 'medium' },
]

const securityZonesSeed = [
  { id: 'zone-entry', label: '入户警戒', roomKey: 'entry', mode: '即时告警', armed: true, level: '高' },
  { id: 'zone-public', label: '公区巡检', roomKey: 'living', mode: '延时 30s', armed: true, level: '中' },
  { id: 'zone-hall', label: '过道通道', roomKey: 'hall', mode: '夜间加强', armed: true, level: '高' },
  { id: 'zone-private', label: '卧室静默', roomKey: 'master', mode: '只推送', armed: false, level: '低' },
]

const securityFeedSeed = [
  { id: 'feed-1', time: '17:12:31', title: '过道人体触发', detail: '检测到移动，联动夜灯与消息推送', level: 'alert' },
  { id: 'feed-2', time: '17:12:02', title: '玄关门磁打开', detail: '当前为已布防状态，正在等待延时确认', level: 'warning' },
  { id: 'feed-3', time: '17:11:40', title: '客厅摄像头巡检完成', detail: '未发现异常目标，录像已归档', level: 'info' },
  { id: 'feed-4', time: '17:09:05', title: '主卧窗磁心跳恢复', detail: '设备重新上线，信号强度稳定', level: 'info' },
]

const securityStageHotspotsSeed = [
  { id: 'sec-entry', x: 39, y: 88, label: '入户门磁', state: '告警', tone: 'red', icon: 'shield' },
  { id: 'sec-hall', x: 70, y: 53, label: '过道人体', state: '触发', tone: 'orange', icon: 'motion' },
  { id: 'sec-living', x: 27, y: 61, label: '客厅窗磁', state: '闭合', tone: 'blue', icon: 'window' },
  { id: 'sec-master', x: 55, y: 84, label: '主卧巡检', state: '待命', tone: 'green', icon: 'camera' },
]

const commonDeviceGroupsSeed = [
  { key: 'lights', icon: 'light', title: '智能灯光', count: 23, desc: '已在快捷控制面板中展示 23 个常用设备' },
  { key: 'climate', icon: 'climate', title: '空调温控', count: 6, desc: '已在快捷控制面板中展示 6 个常用设备' },
  { key: 'switch', icon: 'switch', title: '开关插座', count: 9, desc: '已在快捷控制面板中展示 9 个常用设备' },
  { key: 'sensor', icon: 'sensor', title: '环境传感', count: 12, desc: '已在快捷控制面板中展示 12 个常用设备' },
  { key: 'other', icon: 'search', title: '其他实体追踪', count: 0, desc: '当前没有额外常用设备' },
]

const eventEntries = [
  { id: 'evt-1', roomKey: 'bath-east', text: '[触发] 17:11:56 主卫吸顶灯' },
  { id: 'evt-2', roomKey: 'bath-east', text: '[开启] 17:11:56 主卫顶灯' },
  { id: 'evt-3', roomKey: 'living', text: '[开启] 17:11:58 客厅筒灯1' },
  { id: 'evt-4', roomKey: 'living', text: '[开启] 17:11:58 客厅筒灯2' },
  { id: 'evt-5', roomKey: 'master', text: '[调节] 17:12:10 主卧灯带 65%' },
  { id: 'evt-6', roomKey: 'bedroom-west', text: '[待机] 17:12:18 西次卧空调' },
  { id: 'evt-7', roomKey: 'hall', text: '[同步] 17:12:28 过道温控 22℃' },
  { id: 'evt-8', roomKey: 'entry', text: '[检测] 17:12:33 玄关人体传感器' },
]

const quickCategoriesSeed = [
  { key: 'lights', label: '灯光', count: 9, selected: true },
  { key: 'climate', label: '温控', count: 6, selected: false },
  { key: 'battery', label: '低电量', count: 0, selected: false },
  { key: 'offline', label: '离线', count: 0, selected: false },
]

const lightDevicesSeed = [
  { id: 'light-1', name: '餐厅筒灯', active: false },
  { id: 'light-2', name: '餐厅吸顶灯', active: false },
  { id: 'light-3', name: '厨房吸顶灯', active: false },
  { id: 'light-4', name: '次卧灯', active: true },
  { id: 'light-5', name: '客厅灯带', active: false },
  { id: 'light-6', name: '客厅筒灯1', active: true },
  { id: 'light-7', name: '客厅筒灯2', active: false },
  { id: 'light-8', name: '客厅主灯', active: false },
  { id: 'light-9', name: '客卫镜灯', active: false },
  { id: 'light-10', name: '客卧灯', active: true },
  { id: 'light-11', name: '廊灯', active: false },
  { id: 'light-12', name: '书房灯', active: true },
  { id: 'light-13', name: '书柜灯组', active: false },
  { id: 'light-14', name: '小阳台灯', active: false },
  { id: 'light-15', name: '阳台灯带', active: false },
  { id: 'light-16', name: '阳台吊灯', active: false },
  { id: 'light-17', name: '主卫顶灯', active: true },
  { id: 'light-18', name: '主卫镜灯', active: false },
  { id: 'light-19', name: '主卧灯带', active: true },
  { id: 'light-20', name: '主卧筒灯', active: true },
  { id: 'light-21', name: '主卧主灯', active: true },
  { id: 'light-22', name: '过道夜灯', active: false },
]

const climateDevicesSeed = [
  { id: 'climate-1', name: '壁挂炉', power: false, targetTemp: 59, mode: 'heat' },
  { id: 'climate-2', name: '次卧空调', power: false, targetTemp: 22, mode: 'cool' },
  { id: 'climate-3', name: '客厅空调', power: false, targetTemp: 23, mode: 'cool' },
  { id: 'climate-4', name: '客卧空调', power: false, targetTemp: 23, mode: 'dry' },
  { id: 'climate-5', name: '书房空调', power: false, targetTemp: 22, mode: 'fan' },
  { id: 'climate-6', name: '主卧空调', power: false, targetTemp: 23, mode: 'cool' },
]

const settingsMenuSeed = [
  { key: 'devices', label: '常用设备', active: false },
  { key: 'system', label: '系统设置', active: false },
  { key: 'page', label: '页面设置', active: true },
  { key: 'features', label: '功能设置', active: false },
]

const floorplanAssetsSeed = [
  { id: 'asset-1', name: 'lights_off.png', preview: '/floorplans/songyue-floorplan.jpg' },
  { id: 'asset-2', name: 'lights_on.png', preview: '/floorplans/songyue-floorplan.jpg' },
  { id: 'asset-3', name: 'corridor_glow.png', preview: '/floorplans/songyue-floorplan.jpg' },
  { id: 'asset-4', name: 'master_scene.png', preview: '/floorplans/songyue-floorplan.jpg' },
]

const floorsSeed = [
  {
    id: 'floor-1',
    code: 'or-1',
    name: '主楼层',
    imagePath: '/floorplans/songyue-floorplan.jpg',
    aspectRatio: DEFAULT_FLOORPLAN_ASPECT_RATIO,
    hotspots: defaultHotspots,
  },
]

function readSettingsStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSettingsStorage(payload) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota failures
  }
}

function normalizeHotspot(hotspot, index = 0) {
  const icon = hotspot.icon ?? 'light'
  return {
    id: hotspot.id ?? `hotspot-${Date.now()}-${index}`,
    x: Number(hotspot.x ?? 50),
    y: Number(hotspot.y ?? 50),
    icon,
    active: Boolean(hotspot.active),
    label: hotspot.label ?? '未命名热点',
    category: hotspot.category ?? (icon === 'light' ? 'lights' : 'climate'),
    deviceId: hotspot.deviceId ?? '',
    roomKey: hotspot.roomKey ?? 'living',
    colorGroup: hotspot.colorGroup ?? 'blue',
  }
}

function normalizeFloor(floor, index = 0) {
  return {
    id: floor.id ?? `floor-${Date.now()}-${index}`,
    code: floor.code ?? `or-${index + 1}`,
    name: floor.name ?? `楼层 ${index + 1}`,
    imagePath: floor.imagePath ?? '/floorplans/songyue-floorplan.jpg',
    aspectRatio: (!floor.aspectRatio || floor.aspectRatio === '1556 / 1313') ? DEFAULT_FLOORPLAN_ASPECT_RATIO : floor.aspectRatio,
    hotspots: Array.isArray(floor.hotspots)
      ? floor.hotspots.map((item, hotspotIndex) => normalizeHotspot(item, hotspotIndex))
      : defaultHotspots.map((item, hotspotIndex) => normalizeHotspot(item, hotspotIndex)),
  }
}

export const useDashboardStore = defineStore('dashboard', () => {
  const persisted = readSettingsStorage()
  const now = ref(new Date('2026-03-31T17:12:04'))
  const activeCategory = ref('')
  const activeCategoryScope = ref('category')
  const activeRoomKey = ref('')
  const previewRoomKey = ref('')
  const selectedStageDeviceId = ref('')
  const modalCloseGuardUntil = ref(0)
  const selectedFloorId = ref(persisted?.selectedFloorId ?? floorsSeed[0].id)
  const quickCategories = ref(quickCategoriesSeed.map((item) => ({ ...item })))
  const lightDevices = ref(lightDevicesSeed.map((item) => ({ ...item })))
  const climateDevices = ref(climateDevicesSeed.map((item) => ({ ...item })))
  const settingsMenu = ref((persisted?.settingsMenu ?? settingsMenuSeed).map((item) => ({ ...item })))
  const floorplanAssets = ref((persisted?.floorplanAssets ?? floorplanAssetsSeed).map((item) => ({ ...item })))
  const floors = ref((persisted?.floors ?? floorsSeed).map((item, index) => normalizeFloor(item, index)))
  const roomLayersConfig = ref((persisted?.roomLayers ?? roomLayers).map((item) => ({ ...item })))
  const roomAnchorsConfig = ref((persisted?.roomAnchors ?? roomAnchors).map((item) => ({ ...item })))

  const timeText = computed(() =>
    now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  )

  const dateText = computed(() =>
    now.value.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }),
  )

  const currentFloor = computed(() =>
    floors.value.find((floor) => floor.id === selectedFloorId.value) ?? floors.value[0] ?? null,
  )

  const currentFloorHotspots = computed(() => currentFloor.value?.hotspots ?? [])
  const currentStageImage = computed(() => currentFloor.value?.imagePath || '/floorplans/songyue-floorplan.jpg')

  const availableDevices = computed(() => [
    ...lightDevices.value.map((device) => ({ id: device.id, name: device.name, category: 'lights' })),
    ...climateDevices.value.map((device) => ({ id: device.id, name: device.name, category: 'climate' })),
  ])

  const roomFilters = computed(() =>
    roomLayersConfig.value.map((room) => ({
      ...room,
      count: currentFloorHotspots.value.filter((hotspot) => hotspot.roomKey === room.key).length,
      active: (previewRoomKey.value || activeRoomKey.value) === room.key,
    })),
  )

  const effectiveRoomKey = computed(() => previewRoomKey.value || activeRoomKey.value)

  function getDeviceMeta(deviceId) {
    const light = lightDevices.value.find((device) => device.id === deviceId)
    if (light) {
      return {
        category: 'lights',
        active: light.active,
      }
    }

    const climate = climateDevices.value.find((device) => device.id === deviceId)
    if (climate) {
      return {
        category: 'climate',
        active: climate.power,
      }
    }

    return null
  }

  const stageHotspots = computed(() =>
    currentFloorHotspots.value.map((item) => ({
      ...item,
      active: getDeviceMeta(item.deviceId)?.active ?? item.active,
      category: getDeviceMeta(item.deviceId)?.category ?? item.category,
      selected: item.deviceId === selectedStageDeviceId.value,
      roomMatched: effectiveRoomKey.value ? item.roomKey === effectiveRoomKey.value : true,
    })),
  )

  const visibleStageHotspots = computed(() =>
    stageHotspots.value.filter((item) => !effectiveRoomKey.value || item.roomKey === effectiveRoomKey.value),
  )

  const highlightedRoomLabel = computed(() =>
    roomOptions.find((room) => room.value === effectiveRoomKey.value)?.label ?? '全部房间',
  )

  function getDeviceIdsByRoom(roomKey, categoryKey = '') {
    const ids = currentFloorHotspots.value
      .filter((hotspot) => hotspot.roomKey === roomKey && (!categoryKey || hotspot.category === categoryKey))
      .map((hotspot) => hotspot.deviceId)

    return [...new Set(ids)]
  }

  const filteredLightDevices = computed(() => {
    if (!effectiveRoomKey.value) {
      return lightDevices.value
    }

    const deviceIds = getDeviceIdsByRoom(effectiveRoomKey.value, 'lights')
    return lightDevices.value.filter((device) => deviceIds.includes(device.id))
  })

  const filteredClimateDevices = computed(() => {
    if (!effectiveRoomKey.value) {
      return climateDevices.value
    }

    const deviceIds = getDeviceIdsByRoom(effectiveRoomKey.value, 'climate')
    return climateDevices.value.filter((device) => deviceIds.includes(device.id))
  })

  const filteredStats = computed(() =>
    statsSeed.map((item) => ({
      ...item,
      value: activeRoomKey.value ? (item.byRoom[activeRoomKey.value] ?? item.total) : item.total,
    })),
  )

  const filteredEventFeed = computed(() =>
    eventEntries
      .filter((entry) => !effectiveRoomKey.value || entry.roomKey === effectiveRoomKey.value)
      .map((entry) => entry.text),
  )

  const currentRoomEnvironment = computed(() => {
    const roomKey = effectiveRoomKey.value || 'living'
    return roomEnvironmentSeed[roomKey]
  })

  const activeStageDeviceMeta = computed(() => {
    const light = lightDevices.value.find((device) => device.id === selectedStageDeviceId.value)
    if (light) {
      return { ...light, category: 'lights' }
    }
    const climate = climateDevices.value.find((device) => device.id === selectedStageDeviceId.value)
    if (climate) {
      return { ...climate, category: 'climate' }
    }
    return null
  })

  const activeLightModalDevices = computed(() => {
    if (activeCategoryScope.value === 'device' && selectedStageDeviceId.value) {
      return lightDevices.value.filter((device) => device.id === selectedStageDeviceId.value)
    }
    return filteredLightDevices.value
  })

  const activeClimateModalDevices = computed(() => {
    if (activeCategoryScope.value === 'device' && selectedStageDeviceId.value) {
      return climateDevices.value.filter((device) => device.id === selectedStageDeviceId.value)
    }
    return filteredClimateDevices.value
  })

  const activeLightModalTitle = computed(() =>
    activeCategoryScope.value === 'device' && activeStageDeviceMeta.value?.category === 'lights'
      ? activeStageDeviceMeta.value.name
      : '灯光控制',
  )

  const activeClimateModalTitle = computed(() =>
    activeCategoryScope.value === 'device' && activeStageDeviceMeta.value?.category === 'climate'
      ? activeStageDeviceMeta.value.name
      : '温控控制',
  )

  watch(
    [settingsMenu, floorplanAssets, floors, roomLayersConfig, roomAnchorsConfig, selectedFloorId],
    () => {
      writeSettingsStorage({
        settingsMenu: settingsMenu.value,
        floorplanAssets: floorplanAssets.value,
        floors: floors.value,
        roomLayers: roomLayersConfig.value,
        roomAnchors: roomAnchorsConfig.value,
        selectedFloorId: selectedFloorId.value,
      })
    },
    { deep: true },
  )

  function selectCategory(categoryKey) {
    if (!categoryKey) {
      return
    }
    if (Date.now() < modalCloseGuardUntil.value && !activeCategory.value) {
      return
    }
    quickCategories.value = quickCategories.value.map((item) => ({
      ...item,
      selected: item.key === categoryKey,
    }))
    activeCategoryScope.value = 'category'
    activeCategory.value = categoryKey
  }

  function selectRoom(roomKey) {
    activeRoomKey.value = activeRoomKey.value === roomKey ? '' : roomKey
    previewRoomKey.value = ''
  }

  function clearRoomFilter() {
    activeRoomKey.value = ''
    previewRoomKey.value = ''
  }

  function previewRoom(roomKey) {
    if (!activeRoomKey.value) {
      previewRoomKey.value = roomKey
    }
  }

  function clearPreviewRoom() {
    if (!activeRoomKey.value) {
      previewRoomKey.value = ''
    }
  }

  function openCategoryFromStage(categoryKey, deviceId = '') {
    if (!categoryKey) {
      return
    }
    if (Date.now() < modalCloseGuardUntil.value) {
      return
    }
    selectedStageDeviceId.value = deviceId
    if (categoryKey === 'lights') {
      toggleLightDevice(deviceId)
      activeCategory.value = ''
      activeCategoryScope.value = 'category'
      return
    }
    activeCategoryScope.value = 'device'
    activeCategory.value = categoryKey
  }

  function closeCategoryModal() {
    modalCloseGuardUntil.value = Date.now() + 320
    activeCategory.value = ''
    activeCategoryScope.value = 'category'
    selectedStageDeviceId.value = ''
  }

  function focusDevice(deviceId) {
    selectedStageDeviceId.value = deviceId
  }

  function toggleLightDevice(deviceId) {
    selectedStageDeviceId.value = deviceId
    lightDevices.value = lightDevices.value.map((device) =>
      device.id === deviceId ? { ...device, active: !device.active } : device,
    )
  }

  function toggleClimatePower(deviceId) {
    selectedStageDeviceId.value = deviceId
    climateDevices.value = climateDevices.value.map((device) =>
      device.id === deviceId ? { ...device, power: !device.power } : device,
    )
  }

  function adjustClimateTemp(deviceId, delta) {
    selectedStageDeviceId.value = deviceId
    climateDevices.value = climateDevices.value.map((device) => {
      if (device.id !== deviceId) {
        return device
      }
      return { ...device, targetTemp: Math.min(60, Math.max(16, device.targetTemp + delta)) }
    })
  }

  function setClimateMode(deviceId, mode) {
    selectedStageDeviceId.value = deviceId
    climateDevices.value = climateDevices.value.map((device) =>
      device.id === deviceId ? { ...device, mode } : device,
    )
  }

  function selectSettingsMenu(menuKey) {
    settingsMenu.value = settingsMenu.value.map((item) => ({
      ...item,
      active: item.key === menuKey,
    }))
  }

  function renameAsset(assetId, name) {
    floorplanAssets.value = floorplanAssets.value.map((item) =>
      item.id === assetId ? { ...item, name } : item,
    )
  }

  function addAsset(filePayload) {
    floorplanAssets.value = [
      {
        id: `asset-${Date.now()}`,
        name: filePayload.name,
        preview: filePayload.preview,
      },
      ...floorplanAssets.value,
    ]
  }

  function applyAssetToCurrentFloor(assetId) {
    const asset = floorplanAssets.value.find((item) => item.id === assetId)
    if (!asset || !currentFloor.value) {
      return
    }
    updateFloor(currentFloor.value.id, 'imagePath', asset.preview)
  }

  function updateFloor(floorId, field, value) {
    floors.value = floors.value.map((floor) =>
      floor.id === floorId ? { ...floor, [field]: value } : floor,
    )
  }

  function updateRoomLayer(roomKey, field, value) {
    roomLayersConfig.value = roomLayersConfig.value.map((room) =>
      room.key === roomKey ? { ...room, [field]: value } : room,
    )
  }

  function updateRoomAnchor(roomKey, axis, value) {
    roomAnchorsConfig.value = roomAnchorsConfig.value.map((anchor) =>
      anchor.key === roomKey ? { ...anchor, [axis]: Number(value) } : anchor,
    )
  }

  function addFloor() {
    const nextFloor = normalizeFloor({
      id: `floor-${Date.now()}`,
      code: `or-${floors.value.length + 1}`,
      name: `楼层 ${floors.value.length + 1}`,
      imagePath: currentStageImage.value,
      aspectRatio: DEFAULT_FLOORPLAN_ASPECT_RATIO,
      hotspots: currentFloorHotspots.value,
    })
    floors.value = [...floors.value, nextFloor]
    selectedFloorId.value = nextFloor.id
  }

  function selectFloor(floorId) {
    selectedFloorId.value = floorId
  }

  function updateHotspot(floorId, hotspotId, field, value) {
    floors.value = floors.value.map((floor) => {
      if (floor.id !== floorId) {
        return floor
      }

      const nextHotspots = floor.hotspots.map((hotspot) => {
        if (hotspot.id !== hotspotId) {
          return hotspot
        }

        const nextIcon = field === 'icon' ? value : hotspot.icon
        const nextDeviceMeta = field === 'deviceId' ? getDeviceMeta(value) : getDeviceMeta(hotspot.deviceId)
        const nextCategory = field === 'category'
          ? value
          : field === 'deviceId' && nextDeviceMeta?.category
            ? nextDeviceMeta.category
          : field === 'icon'
            ? (value === 'light' ? 'lights' : 'climate')
            : hotspot.category

        return {
          ...hotspot,
          [field]: field === 'x' || field === 'y'
            ? Number(value)
            : value,
          icon: nextIcon,
          category: nextCategory,
        }
      })

      return {
        ...floor,
        hotspots: nextHotspots,
      }
    })
  }

  function addHotspot(floorId, initialHotspot = {}) {
    floors.value = floors.value.map((floor) => {
      if (floor.id !== floorId) {
        return floor
      }

      const nextIndex = floor.hotspots.length + 1

      return {
        ...floor,
        hotspots: [
          ...floor.hotspots,
          normalizeHotspot({
            id: initialHotspot.id ?? `hotspot-${Date.now()}`,
            x: initialHotspot.x ?? 50,
            y: initialHotspot.y ?? 50,
            icon: initialHotspot.icon ?? 'light',
            active: initialHotspot.active ?? false,
            label: initialHotspot.label ?? `新热点 ${nextIndex}`,
            category: initialHotspot.category ?? 'lights',
            deviceId: initialHotspot.deviceId ?? 'light-1',
            roomKey: initialHotspot.roomKey ?? 'living',
            colorGroup: initialHotspot.colorGroup ?? 'blue',
          }),
        ],
      }
    })
  }

  function removeHotspot(floorId, hotspotId) {
    const removedHotspot = floors.value
      .find((floor) => floor.id === floorId)
      ?.hotspots.find((hotspot) => hotspot.id === hotspotId)

    floors.value = floors.value.map((floor) => {
      if (floor.id !== floorId) {
        return floor
      }

      return {
        ...floor,
        hotspots: floor.hotspots.filter((hotspot) => hotspot.id !== hotspotId),
      }
    })

    if (selectedStageDeviceId.value === removedHotspot?.deviceId) {
      selectedStageDeviceId.value = ''
    }
  }

  return {
    roomGlows,
    roomBadges,
    roomAnchors: roomAnchorsConfig,
    roomLayers: roomLayersConfig,
    weatherMetrics,
    notifications,
    securityActions: securityActionsSeed,
    securityStatusCards: securityStatusCardsSeed,
    securitySensorSummary: securitySensorSummarySeed,
    securitySensors: securitySensorsSeed,
    securityZones: securityZonesSeed,
    securityFeed: securityFeedSeed,
    securityStageHotspots: securityStageHotspotsSeed,
    commonDeviceGroups: commonDeviceGroupsSeed,
    quickCategories,
    lightDevices,
    climateDevices,
    settingsMenu,
    floorplanAssets,
    floors,
    roomOptions,
    colorGroupOptions,
    activeCategory,
    activeRoomKey,
    previewRoomKey,
    selectedStageDeviceId,
    selectedFloorId,
    currentFloor,
    currentFloorHotspots,
    currentStageImage,
    availableDevices,
    roomFilters,
    visibleStageHotspots,
    highlightedRoomLabel,
    currentRoomEnvironment,
    filteredLightDevices,
    filteredClimateDevices,
    activeLightModalDevices,
    activeClimateModalDevices,
    activeLightModalTitle,
    activeClimateModalTitle,
    filteredStats,
    filteredEventFeed,
    stageHotspots,
    timeText,
    dateText,
    selectCategory,
    selectRoom,
    clearRoomFilter,
    previewRoom,
    clearPreviewRoom,
    openCategoryFromStage,
    closeCategoryModal,
    focusDevice,
    toggleLightDevice,
    toggleClimatePower,
    adjustClimateTemp,
    setClimateMode,
    selectSettingsMenu,
    renameAsset,
    addAsset,
    applyAssetToCurrentFloor,
    updateFloor,
    updateRoomLayer,
    updateRoomAnchor,
    addFloor,
    selectFloor,
    updateHotspot,
    addHotspot,
    removeHotspot,
  }
})





