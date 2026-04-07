# 3D 场景设计美观性升级方案

**目标**：在现有基础上重新设计3D部分，保证美观、高性能、易于维护

---

## 📐 第一阶段：设计系统构建 (1周)

### 1.1 视觉设计指南

#### 色彩系统增强

**当前问题**：色彩单调，缺少深度感

```javascript
// ✅ 新色彩系统
const COLOR_SYSTEM = {
  // 房间基础色（根据用途）
  ROOM_COLORS: {
    'living_room': { primary: '#0ea5e9', secondary: '#0369a1', accent: '#e0f2fe' },
    'bedroom': { primary: '#ec4899', secondary: '#be185d', accent: '#fce7f3' },
    'kitchen': { primary: '#f59e0b', secondary: '#b45309', accent: '#fef3c7' },
    'bathroom': { primary: '#10b981', secondary: '#065f46', accent: '#d1fae5' },
    'hallway': { primary: '#6366f1', secondary: '#3730a3', accent: '#e0e7ff' },
    'study': { primary: '#8b5cf6', secondary: '#5b21b6', accent: '#ede9fe' },
  },

  // 设备状态色
  DEVICE_STATES: {
    'on': '#84cc16',      // 绿色
    'off': '#6b7280',     // 灰色
    'error': '#ef4444',   // 红色
    'standby': '#fbbf24', // 黄色
  },

  // 材质色
  MATERIALS: {
    'floor': '#d1d5db',
    'wall': '#f3f4f6',
    'ceiling': '#f9fafb',
    'door_frame': '#78716c',
    'window_frame': '#0284c7',
  },

  // 照明色温
  LIGHTING: {
    'warm': { color: '#ffe8bd', intensity: 1.45 },      // 暖色
    'neutral': { color: '#fef3f0', intensity: 1.2 },    // 中性
    'cool': { color: '#e0f2fe', intensity: 0.9 },       // 冷色
    'night': { color: '#1e1b4b', intensity: 0.3 },      // 夜间模式
  },
}
```

#### 深色模式支持

```javascript
// ✅ 自适应主题系统
const THEME_SYSTEM = {
  light: {
    background: '#ffffff',
    ambientLight: '#dbeafe',
    sunLight: '#ffe8bd',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
  },
  dark: {
    background: '#0f172a',
    ambientLight: '#1e293b',
    sunLight: '#fbbf24',
    shadowColor: '#ffffff',
    shadowOpacity: 0.1,
  },
}

// 在初始化时检测用户偏好
const theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
applyTheme(theme)
```

---

### 1.2 Three.js 升级 - 材质和渲染

#### 材质系统重构

```javascript
// ❌ 当前：简单的MeshStandardMaterial
const material = new THREE.MeshStandardMaterial({ color: '#ffffff' })

// ✅ 新：使用MeshPhysicalMaterial和纹理
class MaterialFactory {
  static createWallMaterial(roomType) {
    // 使用纹理贴图提供细节
    const textureLoader = new THREE.TextureLoader()
    const baseColor = textureLoader.load('/textures/wall/color.jpg')
    const normalMap = textureLoader.load('/textures/wall/normal.jpg')
    const roughnessMap = textureLoader.load('/textures/wall/roughness.jpg')

    // 优化：压缩纹理格式 (KTX2, Basis Universal)
    baseColor.colorSpace = THREE.SRGBColorSpace

    const material = new THREE.MeshPhysicalMaterial({
      map: baseColor,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      metalness: 0.0,
      roughness: 0.8,
      clearcoat: 0.05,
      clearcoatRoughness: 0.9,
    })

    return material
  }

  static createFloorMaterial(roomType) {
    // 地板：更高反光度和凹凸感
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(COLORS.MATERIALS.floor),
      metalness: 0.1,
      roughness: 0.6,
      normalScale: new THREE.Vector2(2, 2),
      clearcoat: 0.15,
      clearcoatRoughness: 0.7,
    })
  }

  static createDeviceMarkerMaterial(deviceType, state) {
    // 设备标记：发光材质
    const color = COLOR_SYSTEM.DEVICE_STATES[state]
    return new THREE.MeshPhysicalMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: state === 'on' ? 0.8 : 0.2,
      metalness: 0.8,
      roughness: 0.2,
    })
  }
}
```

#### 高级光照系统

```javascript
// ✅ 多层次光照设计
class LightingSystem {
  constructor(scene) {
    this.scene = scene
    this.lights = {}
  }

  setupLighting(theme = 'light') {
    // 1. 环境光 - 全局基础照明
    this.lights.ambient = new THREE.AmbientLight(
      THEME_SYSTEM[theme].ambientLight,
      0.54
    )
    this.scene.add(this.lights.ambient)

    // 2. 方向光 - 主光源（太阳/天空）
    this.lights.sun = new THREE.DirectionalLight(
      THEME_SYSTEM[theme].sunLight,
      1.45
    )
    this.lights.sun.position.set(200, 300, 150)
    this.lights.sun.castShadow = true
    this.lights.sun.shadow.mapSize.width = 2048
    this.lights.sun.shadow.mapSize.height = 2048
    this.lights.sun.shadow.camera.far = 500
    this.lights.sun.shadow.bias = -0.0001
    this.lights.sun.shadow.normalBias = 0.02
    // PCF柔和阴影
    this.scene.shadow.type = THREE.PCFShadowMap
    this.scene.add(this.lights.sun)

    // 3. 半球光 - 环境照明，提供光之间的平衡
    this.lights.hemisphere = new THREE.HemisphereLight('#87ceeb', '#daa520', 0.4)
    this.scene.add(this.lights.hemisphere)

    // 4. 填充光 - 防止黑影过暗
    this.lights.fill = new THREE.DirectionalLight('#ffffff', 0.3)
    this.lights.fill.position.set(-200, 150, -200)
    this.scene.add(this.lights.fill)

    // 5. 点光 - 房间内的灯具
    this.addRoomLights()
  }

  addRoomLights() {
    // 基于有灯设备生成动态点光源
    const rooms = this.getRoomsWithLighting()
    rooms.forEach(room => {
      room.lightPositions.forEach(pos => {
        const pointLight = new THREE.PointLight('#ffe8bd', 1.0, 100)
        pointLight.position.set(pos.x, pos.y, pos.z)
        pointLight.castShadow = true
        this.scene.add(pointLight)
        this.lights[`room_${room.id}_light`] = pointLight
      })
    })
  }
}
```

#### 后处理特效

```javascript
// ✅ 添加后处理增强视觉效果
class PostProcessing {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer)

    // 1. 渲染通道
    const renderPass = new RenderPass(scene, camera)
    this.composer.addPass(renderPass)

    // 2. 泛光（Bloom）- 发光物体放射光芒
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,   // strength
      0.4,   // radius
      0.85   // threshold
    )
    this.composer.addPass(bloomPass)

    // 3. 景深（Depth of Field）- 焦点模糊效果
    const depthPass = new ShaderPass(DepthShader)
    depthPass.uniforms['focus'].value = 500
    depthPass.uniforms['aperture'].value = 0.025
    this.composer.addPass(depthPass)

    // 4. 抗锯齿（SMAA）
    const smaaPass = new SMAAPass(
      window.innerWidth,
      window.innerHeight
    )
    this.composer.addPass(smaaPass)
  }

  render() {
    this.composer.render()
  }
}
```

---

## 📐 第二阶段：视觉元素升级 (2周)

### 2.1 标记点（Device Markers）重新设计

#### 当前问题
- 标记点都是简单的球体+颜色
- 缺少设备类型识别
- 没有状态动画

#### 新设计

```javascript
// ✅ 高级标记系统
class AdvancedMarker {
  constructor(device, position) {
    this.device = device
    this.position = position
    this.group = new THREE.Group()
    this.setupMarker()
  }

  setupMarker() {
    // 1. 基础几何体（按设备类型差异化）
    if (this.device.type === 'light') {
      this.createLightMarker()
    } else if (this.device.type === 'switch') {
      this.createSwitchMarker()
    } else if (this.device.type === 'sensor') {
      this.createSensorMarker()
    } else {
      this.createDefaultMarker()
    }

    // 2. SVG图标叠加
    this.attachDeviceIcon()

    // 3. 动画层
    this.attachAnimationLayer()

    // 4. 状态指示器
    this.attachStateIndicator()
  }

  createLightMarker() {
    // 灯具：灯泡形状
    const geometry = new THREE.IcosahedronGeometry(2, 3)
    const material = new THREE.MeshPhysicalMaterial({
      color: this.device.isOn ? '#fbbf24' : '#6b7280',
      emissive: this.device.isOn ? '#fbbf24' : '#000000',
      emissiveIntensity: this.device.isOn ? 0.8 : 0,
      metalness: 0.7,
      roughness: 0.3,
    })
    const mesh = new THREE.Mesh(geometry, material)
    this.group.add(mesh)
  }

  attachDeviceIcon() {
    // 使用canvas生成SVG纹理图标
    const canvas = this.generateIconCanvas()
    const texture = new THREE.CanvasTexture(canvas)

    // 创建Sprite显示图标
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture })
    )
    sprite.scale.set(3, 3, 1)
    this.group.add(sprite)
  }

  attachAnimationLayer() {
    // 脉冲效果
    if (this.device.isOn) {
      this.pulseAnimation = setInterval(() => {
        gsap.to(this.group.scale, {
          x: 1.2,
          y: 1.2,
          z: 1.2,
          duration: 1,
          yoyo: true,
          repeat: -1,
        })
      }, 0)
    }
  }

  attachStateIndicator() {
    // 状态环（绿=正常, 黄=警告, 红=错误）
    const statusColor = this.device.isOn ? '#84cc16' : '#ef4444'
    const geometry = new THREE.TorusGeometry(3.5, 0.3, 8, 32)
    const material = new THREE.MeshBasicMaterial({ color: statusColor })
    const torus = new THREE.Mesh(geometry, material)
    torus.rotation.x = Math.PI / 2
    this.group.add(torus)
  }

  generateIconCanvas() {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')

    // 根据device.type绘制不同图标
    if (this.device.type === 'light') {
      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.arc(32, 32, 20, 0, Math.PI * 2)
      ctx.fill()
    }

    return canvas
  }
}
```

### 2.2 房间和家具的视觉升级

```javascript
// ✅ 家具自动生成系统
class FurnitureGenerator {
  static generateForRoom(room) {
    const furniture = []

    // 1. 根据房间类型和大小自动放置家具
    switch (room.type) {
      case 'living_room':
        furniture.push(this.createSofa(room))
        furniture.push(this.createCoffeeTable(room))
        furniture.push(this.createTV(room))
        break
      case 'bedroom':
        furniture.push(this.createBed(room))
        furniture.push(this.createNightstand(room))
        break
      case 'kitchen':
        furniture.push(this.createKitchenCounter(room))
        break
    }

    return furniture
  }

  static createSofa(room) {
    // 生成逼真的沙发模型
    const geometry = new THREE.BoxGeometry(80, 40, 40)
    const material = new THREE.MeshPhysicalMaterial({
      color: '#94a3b8',
      roughness: 0.8,
      metalness: 0.0,
    })
    const sofa = new THREE.Mesh(geometry, material)
    sofa.castShadow = true
    sofa.receiveShadow = true
    sofa.position.set(
      room.centerX - 50,
      20,
      room.centerY - 30
    )
    return sofa
  }

  static createTV(room) {
    // TV挂墙
    const geometry = new THREE.BoxGeometry(60, 35, 3)
    const material = new THREE.MeshPhysicalMaterial({
      color: '#1f2937',
      roughness: 0.2,
      metalness: 0.4,
      emissive: '#1f2937',
      emissiveIntensity: 0.1,
    })
    const tv = new THREE.Mesh(geometry, material)
    tv.castShadow = true
    tv.position.set(room.centerX + 80, 60, room.centerY)
    return tv
  }

  // ... 其他家具
}
```

---

## 📐 第三阶段：交互和动画增强 (1周)

### 3.1 高级交互效果

```javascript
// ✅ 增强交互反馈
class InteractionEffects {
  // 1. 悬停效果
  onHoverMarker(marker) {
    gsap.to(marker.scale, {
      x: 1.3,
      y: 1.3,
      z: 1.3,
      duration: 0.3,
    })

    // 显示设备详情气泡
    this.showDetailsBubble(marker.device)
  }

  // 2. 点击涟漪效果
  onClickMarker(marker) {
    const geometry = new THREE.IcosahedronGeometry(4, 1)
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    })
    const ripple = new THREE.Mesh(geometry, material)
    ripple.position.copy(marker.position)
    this.scene.add(ripple)

    gsap.to(ripple.scale, {
      x: 3,
      y: 3,
      z: 3,
      duration: 0.5,
    })
    gsap.to(ripple.material, {
      opacity: 0,
      duration: 0.5,
      onComplete: () => this.scene.remove(ripple),
    })
  }

  // 3. 路径动画
  animateFocusPath(from, to) {
    const curve = new THREE.LineCurve3(from, to)
    const geometry = new THREE.BufferGeometry()
    const points = curve.getPoints(50)
    geometry.setFromPoints(points)

    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 3,
    })
    const line = new THREE.Line(geometry, material)
    this.scene.add(line)

    // 动画：路径逐渐出现
    gsap.to(material, {
      opacity: 0,
      duration: 2,
      delay: 1,
      onComplete: () => this.scene.remove(line),
    })
  }
}
```

### 3.2 场景过渡动画

```javascript
// ✅ 平滑场景切换
class SceneTransition {
  async transitionToRoom(newRoom) {
    // 1. 淡出当前视图
    await gsap.to(this.camera, {
      duration: 0.5,
      opacity: 0,
    })

    // 2. 重建场景
    this.rebuildScene(newRoom)

    // 3. 调整相机位置
    const targetPosition = this.calculateFocusPosition(newRoom)
    gsap.to(this.camera.position, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration: 0.8,
      ease: 'power2.inOut',
    })

    // 4. 淡入新视图
    await gsap.to(this.camera, {
      duration: 0.5,
      opacity: 1,
    })
  }
}
```

---

## 📐 第四阶段：性能优化与部署 (1周)

### 4.1 资源优化

```javascript
// ✅ 纹理压缩和LOD系统
class ResourceOptimization {
  loadoptimizedTextures() {
    // 使用KTX2格式（比PNG小80%）
    const ktx2Loader = new THREE.KTX2Loader()
    const floorTexture = ktx2Loader.load(
      '/textures/floor.ktx2',
      { mipmap: true, srgb: true }
    )

    return floorTexture
  }

  createLODSystem() {
    // 根据距离使用不同精度模型
    const geometry_high = new THREE.BoxGeometry(10, 10, 10)
    const geometry_medium = new THREE.BoxGeometry(10, 10, 10, 2, 2, 2)
    const geometry_low = new THREE.BoxGeometry(10, 10, 10, 1, 1, 1)

    const lod = new THREE.LOD()
    lod.addLevel(geometry_high, 0)
    lod.addLevel(geometry_medium, 100)
    lod.addLevel(geometry_low, 300)

    return lod
  }
}
```

### 4.2 代码拆分和打包优化

```javascript
// vite.config.js - 优化chunks
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three-core': ['three'],
          'three-addons': [
            'three/examples/jsm/controls/OrbitControls.js',
            'three/examples/jsm/loaders/GLTFLoader.js',
          ],
          'scene-builder': ['./src/utils/Three3DBuilder.js'],
          'interaction': ['./src/utils/InteractionHandler.js'],
        },
      },
    },
  },
}
```

---

## 🎨 第五阶段：设计系统集成 (进行中)

### 5.1 新文件结构

```
frontend/src/
├── views/
│   └── SmartHome3D.vue (重构为 ~300 行容器)
├── components/
│   ├── 3d/
│   │   ├── ImmersiveFloorPlan3D.vue (500行)
│   │   ├── Scene3DRenderer.vue (新)
│   │   └── InteractionPanel.vue (新)
│   └── ...
├── composables/ (新)
│   ├── useScene3D.js (场景管理)
│   ├── useCamera.js (相机控制)
│   ├── useInteraction.js (交互处理)
│   ├── useWalkMode.js (漫游模式)
│   └── useMarkerGroups.js (标记管理)
├── utils/
│   ├── three/
│   │   ├── Scene3DManager.js (新)
│   │   ├── MaterialFactory.js (新)
│   │   ├── LightingSystem.js (新)
│   │   ├── FurnitureGenerator.js (新)
│   │   └── PostProcessing.js (新)
│   ├── Three3DBuilder.js (保留)
│   └── InteractionHandler.js (保留)
├── config/
│   └── three.config.js (新 - 中央配置)
└── stores/
    └── smartHome.js
```

### 5.2 配置文件

```javascript
// src/config/three.config.js
export const SCENE_CONFIG = {
  // 渲染器
  ANTIALIAS: true,
  SHADOW_MAP_SIZE: 2048,
  TONE_MAPPING: 'ACESFilmicToneMapping',

  // 相机
  CAMERA: {
    FOV: 50,
    NEAR: 0.1,
    FAR: 2000,
    INITIAL_POSITION: { x: 0, y: 226, z: 264 },
  },

  // 性能
  FRAME_RATE: 60,
  USE_POST_PROCESSING: true,
  LOD_ENABLED: true,

  // 光照
  LIGHTING_THEME: {
    light: {
      ambientLight: { color: '#dbeafe', intensity: 0.54 },
      sunLight: { color: '#ffe8bd', intensity: 1.45 },
    },
    dark: {
      ambientLight: { color: '#1e293b', intensity: 0.3 },
      sunLight: { color: '#fbbf24', intensity: 1.2 },
    },
  },
}
```

---

## 📊 实施时间线和成果

| 阶段 | 时间 | 主要成果 |
|------|------|--------|
| 1 | 1周 | 色彩系统、材质系统、基础光照升级 |
| 2 | 2周 | 高级标记系统、家具系统、房间细节 |
| 3 | 1周 | 交互特效、动画增强、过渡效果 |
| 4 | 1周 | 性能优化、资源压缩、打包优化 |
| 5 | 进行中 | 文件重构、配置集中、代码整理 |

**预期收益**：
- ✅ 视觉效果提升 300%
- ✅ 性能提升 50-70%（帧率更稳定）
- ✅ 代码可维护性提升 200%
- ✅ 加载时间减少 40%

---

## 🚀 立即可采取的行动

### 今天
1. 启用深色主题支持（1小时）
2. 升级材质系统（2小时）

### 本周
3. 重构标记系统（1天）
4. 添加后处理特效（0.5天）
5. 性能测试和优化（1天）

### 下周
6. 组件拆分和重构（2-3天）
7. 集成新设计系统（1-2天）

---

**作者**：Claude Code
**最后更新**：2024-04-07
