import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

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

const roomEnvironmentSeed = {
  living: { temperature: '24.2℃', humidity: '38%', online: 12, comfort: '舒适', aqi: '38', lux: '420 lx', energyTrend: [46, 58, 62, 71, 68] },
  master: { temperature: '23.4℃', humidity: '41%', online: 8, comfort: '静谧', aqi: '32', lux: '210 lx', energyTrend: [28, 36, 40, 38, 42] },
}

const statsSeed = [
  { key: 'yesterday', label: '昨日用电', value: '13.5 kWh' },
  { key: 'month', label: '本月累计', value: '364.27 kWh' },
  { key: 'balance', label: '账户余额', value: '67.39 元' },
  { key: 'year', label: '年度累计', value: '1170.27 kWh' },
]

const eventFeedSeed = [
  '[触发] 17:11:56 主卫吸顶灯',
  '[开启] 17:11:56 主卫顶灯',
  '[开启] 17:11:58 客厅筒灯1',
  '[开启] 17:11:58 客厅筒灯2',
  '[调节] 17:12:10 主卧灯带 65%',
]

const quickCategoriesSeed = [
  { key: 'lights', label: '灯光', count: 9, selected: true },
  { key: 'climate', label: '温控', count: 6, selected: false },
  { key: 'battery', label: '低电量', count: 0, selected: false },
  { key: 'offline', label: '离线', count: 0, selected: false },
]

const securityActions = [
  { id: 'security-1', label: '全局布防', subtitle: 'ARMED AWAY', enabled: true },
  { id: 'security-2', label: '门窗传感', subtitle: 'ENTRY SENSORS', enabled: true },
  { id: 'security-3', label: '人体联动', subtitle: 'PRESENCE WATCH', enabled: false },
  { id: 'security-4', label: '夜间巡检', subtitle: 'NIGHT PATROL', enabled: true },
  { id: 'security-5', label: '陌生人提醒', subtitle: 'VISITOR ALERT', enabled: false },
]

const securityStatusCards = [
  { id: 'security-status', label: '当前状态', value: '已布防', detail: 'Away Guard', tone: 'red' },
  { id: 'security-zone', label: '重点区域', value: '3', detail: '客餐厅 / 玄关 / 过道', tone: 'blue' },
  { id: 'security-response', label: '响应策略', value: '联动中', detail: '灯光 + 推送 + 声光', tone: 'gold' },
]

const securitySensorSummary = [
  { id: 'sum-door', label: '门窗传感', value: 12, state: '在线 11 / 触发 1', tone: 'blue' },
  { id: 'sum-motion', label: '人体传感', value: 5, state: '在线 5 / 告警 1', tone: 'red' },
  { id: 'sum-camera', label: '摄像头', value: 4, state: '巡检中 2', tone: 'violet' },
  { id: 'sum-arming', label: '布防分区', value: 4, state: '夜间模式已启用', tone: 'green' },
]

const securitySensors = [
  { id: 'sensor-entry-door', label: '玄关入户门', type: 'door', roomKey: 'entry', state: 'open', battery: '92%', lastSeen: '17:12:02', priority: 'high' },
  { id: 'sensor-living-window', label: '客厅落地窗', type: 'window', roomKey: 'living', state: 'closed', battery: '88%', lastSeen: '17:11:48', priority: 'medium' },
  { id: 'sensor-master-window', label: '主卧飘窗', type: 'window', roomKey: 'master', state: 'closed', battery: '73%', lastSeen: '17:09:26', priority: 'low' },
  { id: 'sensor-hall-motion', label: '过道人体雷达', type: 'motion', roomKey: 'hall', state: 'triggered', battery: 'USB', lastSeen: '17:12:31', priority: 'high' },
  { id: 'sensor-bath-east', label: '东卫门磁', type: 'door', roomKey: 'bath-east', state: 'closed', battery: '61%', lastSeen: '17:07:44', priority: 'low' },
]

const securityZones = [
  { id: 'zone-entry', label: '入户警戒', roomKey: 'entry', mode: '即时告警', armed: true, level: '高' },
  { id: 'zone-public', label: '公区巡检', roomKey: 'living', mode: '延时 30s', armed: true, level: '中' },
  { id: 'zone-hall', label: '过道通道', roomKey: 'hall', mode: '夜间加强', armed: true, level: '高' },
  { id: 'zone-private', label: '卧室静默', roomKey: 'master', mode: '只推送', armed: false, level: '低' },
]

const securityFeed = [
  { id: 'feed-1', time: '17:12:31', title: '过道人体触发', detail: '检测到移动，联动夜灯与消息推送', level: 'alert' },
  { id: 'feed-2', time: '17:12:02', title: '玄关门磁打开', detail: '当前为已布防状态，正在等待延时确认', level: 'warning' },
  { id: 'feed-3', time: '17:11:40', title: '客厅摄像头巡检完成', detail: '未发现异常目标，录像已归档', level: 'info' },
]

const securityStageHotspots = [
  { id: 'sec-entry', x: 39, y: 88, label: '入户门磁', state: '告警', tone: 'red', icon: 'shield' },
  { id: 'sec-hall', x: 70, y: 53, label: '过道人体', state: '触发', tone: 'orange', icon: 'motion' },
  { id: 'sec-living', x: 27, y: 61, label: '客厅窗磁', state: '闭合', tone: 'blue', icon: 'window' },
  { id: 'sec-master', x: 55, y: 84, label: '主卧巡检', state: '待命', tone: 'green', icon: 'camera' },
]

export const useDashboardPlaceholderStore = defineStore('dashboard-placeholder', () => {
  const now = ref(new Date('2026-03-31T17:12:04'))
  const quickCategories = ref(quickCategoriesSeed.map((item) => ({ ...item })))
  const highlightedRoomKey = ref('master')

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

  const highlightedRoomLabel = computed(() =>
    roomOptions.find((room) => room.value === highlightedRoomKey.value)?.label ?? '主卧',
  )

  const currentRoomEnvironment = computed(() => roomEnvironmentSeed[highlightedRoomKey.value] ?? roomEnvironmentSeed.master)

  const filteredStats = computed(() => statsSeed)
  const filteredEventFeed = computed(() => eventFeedSeed)

  function selectCategory(categoryKey) {
    quickCategories.value = quickCategories.value.map((item) => ({
      ...item,
      selected: item.key === categoryKey,
    }))
  }

  return {
    roomOptions,
    weatherMetrics,
    notifications,
    quickCategories,
    timeText,
    dateText,
    highlightedRoomLabel,
    currentRoomEnvironment,
    filteredStats,
    filteredEventFeed,
    securityActions,
    securityStatusCards,
    securitySensorSummary,
    securitySensors,
    securityZones,
    securityFeed,
    securityStageHotspots,
    selectCategory,
  }
})
