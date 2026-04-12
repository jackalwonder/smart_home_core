export const DEFAULT_FLOORPLAN_ASPECT_RATIO = '1200 / 789'

export const settingsRoomOptions = [
  { value: 'living', label: '客餐厅' },
  { value: 'master', label: '主卧' },
  { value: 'bedroom-west', label: '西次卧' },
  { value: 'bedroom-east', label: '东次卧' },
  { value: 'bath-west', label: '西卫' },
  { value: 'bath-east', label: '东卫' },
  { value: 'hall', label: '过道' },
  { value: 'entry', label: '玄关' },
]

export const settingsColorGroupOptions = [
  { value: 'blue', label: '蓝组' },
  { value: 'gold', label: '金组' },
  { value: 'green', label: '绿组' },
  { value: 'rose', label: '红组' },
  { value: 'violet', label: '紫组' },
]

export const settingsDraftEntityLibrarySeed = [
  { id: 'light-1', name: '餐厅筒灯', category: 'lights' },
  { id: 'light-8', name: '客厅主灯', category: 'lights' },
  { id: 'light-9', name: '西卫照明', category: 'lights' },
  { id: 'light-17', name: '东卫照明', category: 'lights' },
  { id: 'light-10', name: '西次卧灯带', category: 'lights' },
  { id: 'light-19', name: '主卧灯带', category: 'lights' },
  { id: 'light-4', name: '东次卧灯带', category: 'lights' },
  { id: 'climate-2', name: '次卧空调', category: 'climate' },
  { id: 'climate-3', name: '过道温控', category: 'climate' },
  { id: 'climate-5', name: '玄关人体', category: 'sensor' },
]

export const settingsDefaultDraftHotspots = [
  { id: 'dining-light', x: 14, y: 76, icon: 'light', active: false, label: '餐厅筒灯', category: 'lights', deviceId: 'light-1', roomKey: 'living', colorGroup: 'blue' },
  { id: 'living-light', x: 29, y: 40, icon: 'light', active: false, label: '客厅主灯', category: 'lights', deviceId: 'light-8', roomKey: 'living', colorGroup: 'gold' },
  { id: 'bath-light-west', x: 41, y: 36, icon: 'light', active: false, label: '西卫照明', category: 'lights', deviceId: 'light-9', roomKey: 'bath-west', colorGroup: 'blue' },
  { id: 'study-fan', x: 52, y: 40, icon: 'fan', active: false, label: '次卧风扇', category: 'climate', deviceId: 'climate-2', roomKey: 'bedroom-east', colorGroup: 'green' },
  { id: 'study-climate', x: 54, y: 44, icon: 'climate', active: true, label: '次卧温控', category: 'climate', deviceId: 'climate-2', roomKey: 'bedroom-east', colorGroup: 'green' },
  { id: 'hall-climate', x: 74, y: 50, icon: 'climate', active: true, label: '过道温控', category: 'climate', deviceId: 'climate-3', roomKey: 'hall', colorGroup: 'violet' },
  { id: 'bath-light-east', x: 90, y: 47, icon: 'light', active: true, label: '东卫照明', category: 'lights', deviceId: 'light-17', roomKey: 'bath-east', colorGroup: 'blue' },
  { id: 'bedroom-light-west', x: 31, y: 78, icon: 'light', active: true, label: '西次卧灯带', category: 'lights', deviceId: 'light-10', roomKey: 'bedroom-west', colorGroup: 'gold' },
  { id: 'bedroom-light-main', x: 53, y: 84, icon: 'light', active: true, label: '主卧灯带', category: 'lights', deviceId: 'light-19', roomKey: 'master', colorGroup: 'gold' },
  { id: 'bedroom-light-east', x: 82, y: 79, icon: 'light', active: true, label: '东次卧灯带', category: 'lights', deviceId: 'light-4', roomKey: 'bedroom-east', colorGroup: 'gold' },
  { id: 'entry-presence', x: 39, y: 87, icon: 'presence', active: false, label: '玄关人体', category: 'sensor', deviceId: 'climate-5', roomKey: 'entry', colorGroup: 'rose' },
]

export const settingsCommonDeviceGroupsSeed = [
  { key: 'lights', icon: 'light', title: '智能灯光', count: 23, desc: '已在快捷控制面板中展示 23 个常用设备' },
  { key: 'climate', icon: 'climate', title: '空调温控', count: 6, desc: '已在快捷控制面板中展示 6 个常用设备' },
  { key: 'switch', icon: 'switch', title: '开关插座', count: 9, desc: '已在快捷控制面板中展示 9 个常用设备' },
  { key: 'sensor', icon: 'sensor', title: '环境传感', count: 12, desc: '已在快捷控制面板中展示 12 个常用设备' },
  { key: 'other', icon: 'search', title: '其他实体追踪', count: 0, desc: '当前没有额外常用设备' },
]

export const settingsNotificationsSeed = [
  { id: 'notify-global', label: '全局通知开关', enabled: true },
  { id: 'notify-priority', label: '重要通知开关', enabled: true },
  { id: 'notify-offline', label: '设备离线通知', enabled: false },
  { id: 'notify-climate', label: '空调自适应开启', enabled: true },
]

export const settingsMenuSeed = [
  { key: 'devices', label: '常用设备', active: false },
  { key: 'system', label: '系统设置', active: false },
  { key: 'page', label: '页面设置', active: true },
  { key: 'features', label: '功能设置', active: false },
]

export const settingsDraftAssetSeed = [
  {
    id: 'asset-1',
    name: 'lights_off.png',
    preview: '/floorplans/songyue-floorplan.jpg',
    sourceType: 'builtin',
    fileName: null,
    mimeType: null,
    fileSize: null,
    imageWidth: 1200,
    imageHeight: 789,
    fileRefToken: null,
  },
  {
    id: 'asset-2',
    name: 'lights_on.png',
    preview: '/floorplans/songyue-floorplan.jpg',
    sourceType: 'builtin',
    fileName: null,
    mimeType: null,
    fileSize: null,
    imageWidth: 1200,
    imageHeight: 789,
    fileRefToken: null,
  },
  {
    id: 'asset-3',
    name: 'corridor_glow.png',
    preview: '/floorplans/songyue-floorplan.jpg',
    sourceType: 'builtin',
    fileName: null,
    mimeType: null,
    fileSize: null,
    imageWidth: 1200,
    imageHeight: 789,
    fileRefToken: null,
  },
  {
    id: 'asset-4',
    name: 'master_scene.png',
    preview: '/floorplans/songyue-floorplan.jpg',
    sourceType: 'builtin',
    fileName: null,
    mimeType: null,
    fileSize: null,
    imageWidth: 1200,
    imageHeight: 789,
    fileRefToken: null,
  },
]

export const settingsDraftFloorSeed = [
  {
    id: 'floor-1',
    code: 'or-1',
    name: '主楼层',
    imagePath: '/floorplans/songyue-floorplan.jpg',
    floorplanAssetId: 'asset-1',
    aspectRatio: DEFAULT_FLOORPLAN_ASPECT_RATIO,
    hotspots: settingsDefaultDraftHotspots,
  },
]

export function createDefaultSettingsDraft() {
  return {
    developerLayoutEditEnabled: false,
    developerLayoutViewDraftEnabled: false,
    settingsMenu: settingsMenuSeed.map((item) => ({ ...item })),
    draftAssets: settingsDraftAssetSeed.map((item) => ({ ...item })),
    draftFloors: settingsDraftFloorSeed.map((item) => ({
      ...item,
      hotspots: item.hotspots.map((hotspot) => ({ ...hotspot })),
    })),
    activeDraftFloorId: settingsDraftFloorSeed[0].id,
  }
}
