<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import { useSmartHomeStore } from '../stores/smartHome'
import { groupDevices } from '../utils/deviceGrouping'

const props = defineProps({
  scene: {
    type: Object,
    default: () => ({ zone: null, analysis: null, rooms: [] }),
  },
  selectedRoomId: {
    type: Number,
    default: null,
  },
  showHeatLayer: {
    type: Boolean,
    default: true,
  },
  showDevices: {
    type: Boolean,
    default: true,
  },
  spatialLoading: {
    type: Boolean,
    default: false,
  },
  cameraMode: {
    type: String,
    default: 'orbit',
  },
  embedded: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select-room'])

const smartHomeStore = useSmartHomeStore()
const shellRef = ref(null)
const containerRef = ref(null)
const popupPanelRef = ref(null)
const popupGroupKey = ref('')
const popupCoordinates = ref({ left: 0, top: 0, visible: false, alignX: 'center', alignY: 'top' })
const numericDrafts = ref({})
const selectDrafts = ref({})
const showDoorLayer = ref(true)
const showWindowLayer = ref(true)
const showFurnitureLayer = ref(true)
const showGuideLayer = ref(true)
const isFullscreen = ref(false)
const detailRoomId = ref(null)

const sceneRefs = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  animationFrame: 0,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  interactiveMeshes: [],
  markerByKey: new Map(),
  roomById: new Map(),
  loader: new GLTFLoader(),
  modelRoot: null,
  modelLoadToken: 0,
}

const pressState = reactive({
  targetKind: '',
  groupKey: '',
  roomId: null,
  startX: 0,
  startY: 0,
  longPressed: false,
  timer: 0,
})

const walkState = reactive({
  yaw: 0,
  pitch: -0.08,
  draggingLook: false,
  pointerId: -1,
  lastX: 0,
  lastY: 0,
  keyForward: false,
  keyBackward: false,
  keyLeft: false,
  keyRight: false,
  moveX: 0,
  moveZ: 0,
  lookX: 0,
  lookY: 0,
})

const WORLD_SCALE = 0.022
const WALK_HEIGHT = 16
const LOOK_SENSITIVITY = 0.006
const ACTIVE_RUNTIME_STATES = new Set(['on', 'online', 'playing', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'auto'])
const sceneZone = computed(() => props.scene?.zone ?? null)
const sceneAnalysis = computed(() => props.scene?.analysis ?? null)
const sceneRooms = computed(() => props.scene?.rooms ?? [])
const semanticZones = computed(() => Array.isArray(sceneAnalysis.value?.semantic_zones) ? sceneAnalysis.value.semantic_zones : [])
const semanticOpenings = computed(() => Array.isArray(sceneAnalysis.value?.semantic_openings) ? sceneAnalysis.value.semantic_openings : [])
const windowEdges = computed(() => Array.isArray(sceneAnalysis.value?.window_edges) ? sceneAnalysis.value.window_edges : [])
const corridorPath = computed(() => Array.isArray(sceneAnalysis.value?.corridor_path) ? sceneAnalysis.value.corridor_path : [])
const planWidth = computed(() => sceneZone.value?.floor_plan_image_width ?? 1600)
const planHeight = computed(() => sceneZone.value?.floor_plan_image_height ?? 960)
const planImageUrl = computed(() => smartHomeStore.resolveAssetUrl(sceneZone.value?.floor_plan_image_path || ''))
const sceneModelUrl = computed(() => smartHomeStore.resolveAssetUrl(sceneZone.value?.three_d_model_path || ''))
const hasImportedModel = computed(() => Boolean(sceneModelUrl.value))
const isWalkMode = computed(() => props.cameraMode === 'walk')
const supportsTouchNavigation = computed(() => typeof window !== 'undefined' && 'ontouchstart' in window)

const groupedMarkers = computed(() =>
  sceneRooms.value.flatMap((room) =>
    groupDevices(room.devices).map((group) => buildMarkerGroup(room, group)),
  ),
)

const activePopupGroup = computed(() => groupedMarkers.value.find((group) => group.key === popupGroupKey.value) ?? null)
const structuralRenderMode = computed(() => resolveStructuralRenderMode(sceneAnalysis.value, sceneRooms.value))
const selectedOrbitRoom = computed(() => sceneRooms.value.find((room) => room.id === props.selectedRoomId) ?? sceneRooms.value[0] ?? null)
const activeWorkbenchRoom = computed(() => sceneRooms.value.find((room) => room.id === detailRoomId.value) ?? selectedOrbitRoom.value ?? null)
const isRoomWorkbench = computed(() => !isWalkMode.value && detailRoomId.value !== null)
const orbitRooms = computed(() => sceneRooms.value.filter((room) => Boolean(room.name)))
const semanticFocusChips = computed(() =>
  semanticZones.value.filter((zone) => ['living', 'kitchen', 'dining', 'master', 'bedroom', 'bath', 'storage', 'entry'].includes(zone.type)).slice(0, 8),
)
const miniMapRooms = computed(() => sceneRooms.value.filter((room) => room.plan_x !== null && room.plan_y !== null))
const detailRoomMarkers = computed(() => {
  if (!activeWorkbenchRoom.value) {
    return []
  }
  return groupedMarkers.value.filter((marker) => marker.room.id === activeWorkbenchRoom.value.id)
})
const detailZoom = computed(() => {
  const room = activeWorkbenchRoom.value
  if (!room) {
    return 2.2
  }
  const span = Math.max(Number(room.plan_width ?? 120), Number(room.plan_height ?? 90))
  return Math.max(1.8, Math.min(3.4, 4.2 - span / 170))
})
const miniMapBackgroundStyle = computed(() => (
  planImageUrl.value
    ? {
      backgroundImage: `linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0.12)), url(${planImageUrl.value})`,
      backgroundSize: '100% 100%',
      backgroundPosition: 'center',
    }
    : {
      backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.85), rgba(226,232,240,0.95))',
    }
))
const detailMagnifierStyle = computed(() => {
  const room = activeWorkbenchRoom.value
  if (!room || !planImageUrl.value) {
    return {
      backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.94), rgba(226,232,240,0.96))',
    }
  }

  const zoom = detailZoom.value
  const previewWidth = isFullscreen.value ? 360 : 320
  const previewHeight = isFullscreen.value ? 252 : 224
  const centerX = Number(room.plan_x ?? 0) + Number(room.plan_width ?? 120) / 2
  const centerY = Number(room.plan_y ?? 0) + Number(room.plan_height ?? 90) / 2
  return {
    backgroundImage: `linear-gradient(rgba(255,255,255,0.02), rgba(255,255,255,0.02)), url(${planImageUrl.value})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${planWidth.value * zoom}px ${planHeight.value * zoom}px`,
    backgroundPosition: `${(previewWidth / 2) - centerX * zoom}px ${(previewHeight / 2) - centerY * zoom}px`,
  }
})
const popupStyle = computed(() => {
  if (!popupCoordinates.value.visible) {
    return { display: 'none' }
  }

  const translateX = popupCoordinates.value.alignX === 'left'
    ? '0%'
    : popupCoordinates.value.alignX === 'right'
      ? '-100%'
      : '-50%'
  const translateY = popupCoordinates.value.alignY === 'bottom'
    ? '18px'
    : 'calc(-100% - 18px)'

  return {
    left: `${popupCoordinates.value.left}px`,
    top: `${popupCoordinates.value.top}px`,
    transform: `translate(${translateX}, ${translateY})`,
  }
})

const roamStats = computed(() => ({
  rooms: sceneRooms.value.length,
  semanticZones: semanticZones.value.length,
  markers: groupedMarkers.value.length,
  walls: structuralRenderMode.value === 'semantic' ? semanticZones.value.length : (sceneAnalysis.value?.wall_segments?.length ?? 0),
  openings: structuralRenderMode.value === 'semantic' ? semanticOpenings.value.length : (sceneAnalysis.value?.openings?.length ?? 0),
  windows: windowEdges.value.length,
  furniture: sceneAnalysis.value?.furniture_candidates?.length ?? 0,
}))

const structureHint = computed(() => {
  if (structuralRenderMode.value === 'walls') {
    return '当前使用识别出的墙体、门洞和家具代理体。'
  }

  if (structuralRenderMode.value === 'semantic') {
    return '当前使用针对这类住宅户型提炼出的语义空间骨架，轨道视图会更接近真实房屋分区。'
  }

  return '当前识别结果噪声较多，已自动退回到基于房间布局的稳定结构视图。'
})

const viewModeLabel = computed(() => (isWalkMode.value ? 'Walk' : 'Orbit'))
const activeMarkerCount = computed(() => groupedMarkers.value.filter((marker) => marker.active).length)
const controllableMarkerCount = computed(() => groupedMarkers.value.filter((marker) => marker.controlDevices.length > 0).length)
const orbitRoomCards = computed(() =>
  orbitRooms.value.map((room) => {
    const devices = room.devices ?? []
    const controlCount = devices.filter((device) => device.can_control).length
    const activeCount = devices.filter((device) => ACTIVE_RUNTIME_STATES.has(`${device.raw_state ?? device.current_status ?? ''}`.toLowerCase())).length

    return {
      ...room,
      deviceCount: devices.length,
      controlCount,
      sensorCount: Math.max(devices.length - controlCount, 0),
      activeCount,
    }
  }),
)
const focusedOrbitRoomCard = computed(() =>
  orbitRoomCards.value.find((room) => room.id === selectedOrbitRoom.value?.id) ?? null,
)
const sceneReadinessLabel = computed(() => {
  if (hasImportedModel.value) {
    return 'Model synced'
  }

  if (structuralRenderMode.value === 'semantic') {
    return 'Semantic shell'
  }

  if (structuralRenderMode.value === 'walls') {
    return 'Wall shell'
  }

  return 'Room shell'
})

watch(
  groupedMarkers,
  (markers) => {
    const nextNumericDrafts = {}
    const nextSelectDrafts = {}

    markers.forEach((group) => {
      group.devices.forEach((device) => {
        if (device.supports_brightness) {
          nextNumericDrafts[`brightness:${device.id}`] = device.brightness_value ?? 50
        }

        if (device.supports_color_temperature) {
          const min = device.min_color_temperature ?? 2700
          const max = device.max_color_temperature ?? 6500
          nextNumericDrafts[`color:${device.id}`] = device.color_temperature ?? Math.round((min + max) / 2)
        }

        if (device.entity_domain === 'climate' && device.target_temperature !== null && device.target_temperature !== undefined) {
          nextNumericDrafts[`number:${device.id}`] = device.target_temperature
        } else if (device.entity_domain === 'media_player' && device.media_volume_level !== null && device.media_volume_level !== undefined) {
          nextNumericDrafts[`number:${device.id}`] = device.media_volume_level
        } else if (device.control_kind === 'number') {
          nextNumericDrafts[`number:${device.id}`] = device.number_value ?? device.min_value ?? 0
        }

        if (device.entity_domain === 'climate' && device.hvac_mode) {
          nextSelectDrafts[device.id] = device.hvac_mode
        } else if (device.entity_domain === 'media_player' && device.media_source) {
          nextSelectDrafts[device.id] = device.media_source
        } else if (device.control_kind === 'select') {
          nextSelectDrafts[device.id] = device.raw_state ?? ''
        }
      })
    })

    numericDrafts.value = nextNumericDrafts
    selectDrafts.value = nextSelectDrafts

    if (popupGroupKey.value && !markers.some((marker) => marker.key === popupGroupKey.value)) {
      closePopup()
    }
  },
  { immediate: true, deep: true },
)

watch(
  () => [
    groupedMarkers.value,
    sceneAnalysis.value,
    props.showHeatLayer,
    props.showDevices,
    showDoorLayer.value,
    showWindowLayer.value,
    showFurnitureLayer.value,
    showGuideLayer.value,
  ],
  () => {
    rebuildScene()
  },
  { deep: true },
)

watch(
  () => [
    sceneModelUrl.value,
    sceneZone.value?.three_d_model_scale ?? 1,
    planWidth.value,
    planHeight.value,
  ],
  () => {
    refreshImportedModel()
  },
  { immediate: true },
)

watch(
  () => [props.selectedRoomId, props.cameraMode],
  () => {
    syncCameraMode()
  },
)

watch(
  isFullscreen,
  () => {
    nextTick(() => {
      handleResize()
      if (isWalkMode.value) {
        return
      }
      if (isRoomWorkbench.value && activeWorkbenchRoom.value) {
        focusOrbitOnBox(
          activeWorkbenchRoom.value.plan_x ?? 0,
          activeWorkbenchRoom.value.plan_y ?? 0,
          activeWorkbenchRoom.value.plan_width ?? 120,
          activeWorkbenchRoom.value.plan_height ?? 90,
          { detail: true },
        )
        return
      }
      focusOverview()
    })
  },
)

onMounted(() => {
  initializeScene()
})

onBeforeUnmount(() => {
  teardownScene()
})

function buildMarkerGroup(room, group) {
  const controlDevices = group.devices.filter((device) => device.can_control)
  const sensorDevices = group.devices.filter((device) => !device.can_control)
  const primaryInteractive = controlDevices[0] ?? group.devices[0] ?? null
  const lightDevice = group.devices.find((device) => device.entity_domain === 'light' || device.device_type === 'mijia_light') ?? null
  const clickToggles = Boolean(lightDevice && primaryInteractive?.control_kind === 'toggle')
  const hasAdvancedLightControls = group.devices.some((device) => device.supports_brightness || device.supports_color_temperature)
  const shouldPopupOnClick = !clickToggles || group.isAggregate || hasAdvancedLightControls || controlDevices.length > 1
  const position = resolveGroupPosition(room, group.devices)
  const active = group.devices.some((device) => ACTIVE_RUNTIME_STATES.has(`${device.raw_state ?? device.current_status ?? ''}`.toLowerCase()))

  return {
    ...group,
    room,
    controlDevices,
    sensorDevices,
    primaryInteractive,
    lightDevice,
    clickToggles,
    hasAdvancedLightControls,
    shouldPopupOnClick,
    position,
    active,
  }
}

function resolveGroupPosition(room, devices) {
  const positioned = devices.filter((device) => device.plan_x !== null && device.plan_y !== null)
  if (positioned.length === 0) {
    return {
      x: (room.plan_x ?? 0) + ((room.plan_width ?? 120) / 2),
      y: (room.plan_y ?? 0) + ((room.plan_height ?? 90) / 2),
      z: 0.35,
    }
  }

  return {
    x: positioned.reduce((sum, device) => sum + Number(device.plan_x ?? 0), 0) / positioned.length,
    y: positioned.reduce((sum, device) => sum + Number(device.plan_y ?? 0), 0) / positioned.length,
    z: positioned.reduce((sum, device) => sum + Number(device.plan_z ?? 0.35), 0) / positioned.length,
  }
}

function initializeScene() {
  const container = containerRef.value
  if (!container) {
    return
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.className = 'absolute inset-0 h-full w-full'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#08111c')
  scene.fog = new THREE.FogExp2('#08111c', 0.012)

  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 5000)
  camera.position.set(0, 226, 264)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 8
  controls.maxDistance = 900
  controls.zoomSpeed = 1.08
  controls.enablePan = true
  controls.screenSpacePanning = true
  controls.maxPolarAngle = Math.PI * 0.49
  controls.target.set(0, 0, 0)

  const ambientLight = new THREE.AmbientLight('#dbeafe', 0.54)
  const hemiLight = new THREE.HemisphereLight('#c7f9ff', '#07111b', 0.92)
  const sunLight = new THREE.DirectionalLight('#ffe8bd', 1.45)
  sunLight.position.set(220, 320, 140)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.set(2048, 2048)
  sunLight.shadow.camera.near = 1
  sunLight.shadow.camera.far = 1100
  sunLight.shadow.camera.left = -220
  sunLight.shadow.camera.right = 220
  sunLight.shadow.camera.top = 220
  sunLight.shadow.camera.bottom = -220

  const fillLight = new THREE.DirectionalLight('#7dd3fc', 0.56)
  fillLight.position.set(-180, 180, -140)

  const rimLight = new THREE.PointLight('#34d399', 0.8, 520, 2.1)
  rimLight.position.set(-46, 82, 56)

  scene.add(ambientLight, hemiLight, sunLight, fillLight, rimLight)

  const modelRoot = new THREE.Group()
  scene.add(modelRoot)

  sceneRefs.renderer = renderer
  sceneRefs.scene = scene
  sceneRefs.camera = camera
  sceneRefs.controls = controls
  sceneRefs.modelRoot = modelRoot

  renderer.domElement.addEventListener('pointerdown', handlePointerDown)
  renderer.domElement.addEventListener('pointermove', handlePointerMove)
  renderer.domElement.addEventListener('pointerup', handlePointerUp)
  renderer.domElement.addEventListener('pointerleave', handlePointerCancel)
  renderer.domElement.addEventListener('pointercancel', handlePointerCancel)
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  rebuildScene()
  syncCameraMode()
  animate()
}

function teardownScene() {
  clearLongPressTimer()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  cancelAnimationFrame(sceneRefs.animationFrame)

  const renderer = sceneRefs.renderer
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
    renderer.domElement.removeEventListener('pointermove', handlePointerMove)
    renderer.domElement.removeEventListener('pointerup', handlePointerUp)
    renderer.domElement.removeEventListener('pointerleave', handlePointerCancel)
    renderer.domElement.removeEventListener('pointercancel', handlePointerCancel)
  }

  if (sceneRefs.controls) {
    sceneRefs.controls.dispose()
  }

  clearImportedModel()
  disposeDynamicScene()

  if (renderer?.domElement?.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement)
  }

  renderer?.dispose()
  sceneRefs.renderer = null
  sceneRefs.scene = null
  sceneRefs.camera = null
  sceneRefs.controls = null
  sceneRefs.interactiveMeshes = []
  sceneRefs.markerByKey.clear()
  sceneRefs.modelRoot = null
  sceneRefs.roomById.clear()
}

function disposeDynamicScene() {
  const scene = sceneRefs.scene
  if (!scene) {
    return
  }
  for (const child of [...scene.children]) {
    if (!child.userData?.dynamic) {
      continue
    }
    scene.remove(child)
    disposeObject(child)
  }
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.()
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => disposeMaterial(material))
    } else if (child.material) {
      disposeMaterial(child.material)
    }
  })
}

function disposeMaterial(material) {
  if (material.map) {
    material.map.dispose?.()
  }
  material.dispose?.()
}

function rebuildScene() {
  const scene = sceneRefs.scene
  if (!scene) {
    return
  }

  disposeDynamicScene()
  sceneRefs.interactiveMeshes = []
  sceneRefs.markerByKey.clear()
  sceneRefs.roomById.clear()

  const root = new THREE.Group()
  root.userData.dynamic = true

  root.add(buildFloorMesh())
  root.add(buildOrbitDatumRings())

  const analysis = sceneAnalysis.value ?? {}
  const wallSegments = Array.isArray(analysis.wall_segments) ? analysis.wall_segments : []
  const openings = Array.isArray(analysis.openings) ? analysis.openings : []
  const furnitureCandidates = Array.isArray(analysis.furniture_candidates) ? analysis.furniture_candidates : []

  if (structuralRenderMode.value === 'walls' && wallSegments.length > 0) {
    wallSegments.forEach((segment) => {
      root.add(buildWallMesh(segment))
    })
  } else if (structuralRenderMode.value === 'semantic' && semanticZones.value.length > 0) {
    semanticZones.value.forEach((zone) => {
      root.add(buildSemanticZoneShell(zone))
      root.add(buildSemanticZonePlate(zone))
    })
    if (showDoorLayer.value) {
      semanticOpenings.value.forEach((opening) => root.add(buildSemanticOpeningMesh(opening)))
    }
    if (showWindowLayer.value) {
      windowEdges.value.forEach((edge) => root.add(buildWindowEdgeMesh(edge)))
    }
    if (showGuideLayer.value) {
      const corridorMesh = buildCorridorPathMesh(corridorPath.value)
      if (corridorMesh) {
        root.add(corridorMesh)
      }
    }
  } else {
    sceneRooms.value.forEach((room) => root.add(buildRoomShell(room)))
  }

  if (structuralRenderMode.value === 'walls') {
    openings.forEach((opening) => root.add(buildOpeningMesh(opening)))
    if (showFurnitureLayer.value) {
      furnitureCandidates.forEach((item) => root.add(buildFurnitureMesh(item)))
    }
  } else if (structuralRenderMode.value === 'semantic') {
    if (showFurnitureLayer.value) {
      semanticZones.value.forEach((zone) => {
        const semanticFurniture = buildSemanticFurniture(zone)
        semanticFurniture.forEach((item) => root.add(item))
      })
    }
  }
  sceneRooms.value.forEach((room) => root.add(buildRoomPlate(room)))
  sceneRooms.value.forEach((room) => root.add(buildRoomHitArea(room)))

  if (props.showDevices) {
    groupedMarkers.value.forEach((marker) => root.add(buildMarkerMesh(marker)))
  }

  if (!isWalkMode.value && selectedOrbitRoom.value) {
    root.add(buildFocusBeacon(selectedOrbitRoom.value))
  }

  scene.add(root)
  syncCameraMode()
}

function buildFloorMesh() {
  const floorGroup = new THREE.Group()
  floorGroup.userData.dynamic = true

  const floorGeometry = new THREE.PlaneGeometry(planWidth.value * WORLD_SCALE, planHeight.value * WORLD_SCALE)
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: '#cbd5e1',
    roughness: 0.92,
    metalness: 0.12,
    clearcoat: 0.18,
    clearcoatRoughness: 0.74,
  })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  floorGroup.add(floor)

  if (planImageUrl.value) {
    new THREE.TextureLoader().load(planImageUrl.value, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4
      floorMaterial.map = texture
      floorMaterial.needsUpdate = true
    })
  }

  const grid = new THREE.GridHelper(planWidth.value * WORLD_SCALE, 22, '#7dd3fc', '#23364a')
  grid.position.y = 0.06
  grid.material.opacity = 0.22
  grid.material.transparent = true
  floorGroup.add(grid)
  return floorGroup
}

function buildOrbitDatumRings() {
  const ringGroup = new THREE.Group()
  ringGroup.userData.dynamic = true

  const maxSpan = Math.max(planWidth.value, planHeight.value) * WORLD_SCALE
  const ringSizes = [0.18, 0.34, 0.52].map((scale) => maxSpan * scale)

  ringSizes.forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(radius - 0.08, 0.2), radius, 128),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? '#67e8f9' : '#38bdf8',
        transparent: true,
        opacity: index === 0 ? 0.14 : 0.08,
        side: THREE.DoubleSide,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.08 + index * 0.015
    ringGroup.add(ring)
  })

  return ringGroup
}

function buildRoomPlate(room) {
  const width = Math.max((room.plan_width ?? 120) * WORLD_SCALE, 2.4)
  const depth = Math.max((room.plan_height ?? 90) * WORLD_SCALE, 2.1)
  const geometry = new THREE.BoxGeometry(width, 0.28, depth)
  const material = new THREE.MeshStandardMaterial({
    color: roomColor(room),
    transparent: true,
    opacity: room.id === props.selectedRoomId ? 0.32 : 0.18,
    roughness: 0.85,
    metalness: 0.04,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.receiveShadow = true
  mesh.position.set(
    projectX((room.plan_x ?? 0) + ((room.plan_width ?? 120) / 2)),
    0.14,
    projectZ((room.plan_y ?? 0) + ((room.plan_height ?? 90) / 2)),
  )
  mesh.rotation.y = THREE.MathUtils.degToRad(room.plan_rotation ?? 0)
  return mesh
}

function buildRoomHitArea(room) {
  const width = Math.max((room.plan_width ?? 120) * WORLD_SCALE, 2.5)
  const depth = Math.max((room.plan_height ?? 90) * WORLD_SCALE, 2.2)
  const geometry = new THREE.BoxGeometry(width, 0.45, depth)
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.01,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.userData.interactiveKind = 'room'
  mesh.userData.roomId = room.id
  mesh.position.set(
    projectX((room.plan_x ?? 0) + ((room.plan_width ?? 120) / 2)),
    0.26,
    projectZ((room.plan_y ?? 0) + ((room.plan_height ?? 90) / 2)),
  )
  sceneRefs.interactiveMeshes.push(mesh)
  sceneRefs.roomById.set(room.id, mesh)
  return mesh
}

function buildRoomShell(room) {
  const width = Math.max((room.plan_width ?? 120) * WORLD_SCALE, 2.4)
  const depth = Math.max((room.plan_height ?? 90) * WORLD_SCALE, 2.1)
  const geometry = new THREE.BoxGeometry(width, 5.4, depth)
  const material = new THREE.MeshStandardMaterial({
    color: roomColor(room),
    transparent: true,
    opacity: room.id === props.selectedRoomId ? 0.26 : 0.14,
    roughness: 0.76,
    metalness: 0.03,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.position.set(
    projectX((room.plan_x ?? 0) + ((room.plan_width ?? 120) / 2)),
    2.7,
    projectZ((room.plan_y ?? 0) + ((room.plan_height ?? 90) / 2)),
  )
  mesh.rotation.y = THREE.MathUtils.degToRad(room.plan_rotation ?? 0)
  return mesh
}

function buildSemanticZonePlate(zone) {
  const width = Math.max(Number(zone.width ?? 120) * WORLD_SCALE, 1.8)
  const depth = Math.max(Number(zone.height ?? 90) * WORLD_SCALE, 1.6)
  const geometry = new THREE.BoxGeometry(width, 0.2, depth)
  const material = new THREE.MeshStandardMaterial({
    color: semanticZoneColor(zone.type),
    transparent: true,
    opacity: 0.12,
    roughness: 0.86,
    metalness: 0.02,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.receiveShadow = true
  mesh.position.set(
    projectX((Number(zone.x ?? 0) + Number(zone.width ?? 120) / 2)),
    0.1,
    projectZ((Number(zone.y ?? 0) + Number(zone.height ?? 90) / 2)),
  )
  return mesh
}

function buildSemanticZoneShell(zone) {
  const width = Math.max(Number(zone.width ?? 120) * WORLD_SCALE, 1.8)
  const depth = Math.max(Number(zone.height ?? 90) * WORLD_SCALE, 1.6)
  const geometry = new THREE.BoxGeometry(width, 4.8, depth)
  const material = new THREE.MeshStandardMaterial({
    color: semanticZoneColor(zone.type),
    transparent: true,
    opacity: 0.18,
    roughness: 0.74,
    metalness: 0.03,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.position.set(
    projectX((Number(zone.x ?? 0) + Number(zone.width ?? 120) / 2)),
    2.4,
    projectZ((Number(zone.y ?? 0) + Number(zone.height ?? 90) / 2)),
  )
  return mesh
}

function buildSemanticOpeningMesh(opening) {
  const isVertical = opening.orientation === 'vertical'
  const width = Math.max(Number(opening.width ?? 28) * WORLD_SCALE, 0.32)
  const depth = Math.max(Number(opening.height ?? 22) * WORLD_SCALE, 0.22)
  const group = new THREE.Group()
  group.userData.dynamic = true
  group.position.set(projectX(opening.x), 0, projectZ(opening.y))

  const frameGeometry = isVertical
    ? new THREE.BoxGeometry(depth, 3.9, width)
    : new THREE.BoxGeometry(width, 3.9, depth)
  const frame = new THREE.Mesh(
    frameGeometry,
    new THREE.MeshStandardMaterial({
      color: opening.kind === 'swing_door' ? '#af7e57' : '#c08457',
      transparent: true,
      opacity: opening.kind === 'swing_door' ? 0.56 : 0.42,
      roughness: 0.42,
      metalness: 0.04,
    }),
  )
  frame.position.y = 1.95
  frame.castShadow = true
  frame.receiveShadow = true
  group.add(frame)

  if (opening.door_leaf) {
    const doorLeaf = buildDoorLeafMesh(opening, width, depth, isVertical)
    if (doorLeaf) {
      group.add(doorLeaf)
    }
    const swingArc = buildDoorSwingArc(opening, width, isVertical)
    if (swingArc) {
      group.add(swingArc)
    }
  }

  return group
}

function buildDoorLeafMesh(opening, span, thickness, isVertical) {
  const hingeAnchor = opening.hinge_anchor === 'end' ? 'end' : 'start'
  const swingSign = Number(opening.swing_sign ?? 1) >= 0 ? 1 : -1
  const angle = THREE.MathUtils.degToRad(Number(opening.leaf_angle_deg ?? 64)) * swingSign
  const leafLength = Math.max(span * 0.9, 0.24)
  const leafThickness = Math.max(thickness * 0.22, 0.08)
  const pivot = new THREE.Group()
  const doorHeight = 3.18
  const leaf = new THREE.Mesh(
    isVertical
      ? new THREE.BoxGeometry(leafThickness, doorHeight, leafLength)
      : new THREE.BoxGeometry(leafLength, doorHeight, leafThickness),
    new THREE.MeshStandardMaterial({
      color: opening.door_family === 'bath' ? '#cbd5e1' : '#f3e8cf',
      roughness: 0.54,
      metalness: 0.03,
    }),
  )

  if (isVertical) {
    pivot.position.set(0, 0.2, hingeAnchor === 'start' ? -span / 2 : span / 2)
    leaf.position.set(0, doorHeight / 2, hingeAnchor === 'start' ? leafLength / 2 : -leafLength / 2)
  } else {
    pivot.position.set(hingeAnchor === 'start' ? -span / 2 : span / 2, 0.2, 0)
    leaf.position.set(hingeAnchor === 'start' ? leafLength / 2 : -leafLength / 2, doorHeight / 2, 0)
  }

  pivot.rotation.y = angle
  pivot.add(leaf)
  leaf.castShadow = true
  leaf.receiveShadow = true

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 10),
    new THREE.MeshStandardMaterial({
      color: '#8b5e34',
      roughness: 0.34,
      metalness: 0.26,
    }),
  )
  handle.position.set(
    isVertical ? 0 : (hingeAnchor === 'start' ? leafLength * 0.36 : -leafLength * 0.36),
    doorHeight * 0.52,
    isVertical ? (hingeAnchor === 'start' ? leafLength * 0.36 : -leafLength * 0.36) : 0,
  )
  leaf.add(handle)

  return pivot
}

function buildDoorSwingArc(opening, span, isVertical) {
  const hingeAnchor = opening.hinge_anchor === 'end' ? 'end' : 'start'
  const swingSign = Number(opening.swing_sign ?? 1) >= 0 ? 1 : -1
  const angle = THREE.MathUtils.degToRad(Number(opening.leaf_angle_deg ?? 64))
  const closedAngle = hingeAnchor === 'start' ? 0 : Math.PI
  const openAngle = closedAngle + angle * swingSign
  const curve = new THREE.EllipseCurve(0, 0, span * 0.9, span * 0.9, closedAngle, openAngle, swingSign < 0, 0)
  const points = curve.getPoints(20).map((point) => (
    isVertical
      ? new THREE.Vector3(point.x, 0.12, (hingeAnchor === 'start' ? -span / 2 : span / 2) + point.y)
      : new THREE.Vector3((hingeAnchor === 'start' ? -span / 2 : span / 2) + point.x, 0.12, point.y)
  ))
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({
    color: '#f59e0b',
    transparent: true,
    opacity: 0.68,
  })
  return new THREE.Line(geometry, material)
}

function buildWindowEdgeMesh(edge) {
  const width = Math.max(Number(edge.width ?? 60) * WORLD_SCALE, 0.4)
  const depth = Math.max(Number(edge.depth ?? 14) * WORLD_SCALE, 0.12)
  const geometry = new THREE.BoxGeometry(width, 2.4, depth)
  const material = new THREE.MeshStandardMaterial({
    color: '#93c5fd',
    transparent: true,
    opacity: 0.35,
    roughness: 0.22,
    metalness: 0.08,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.position.set(
    projectX(Number(edge.x ?? 0) + Number(edge.width ?? 60) / 2),
    3.3,
    projectZ(edge.y),
  )
  return mesh
}

function buildCorridorPathMesh(path) {
  if (!Array.isArray(path) || path.length < 2) {
    return null
  }

  const points = path.map((point) => new THREE.Vector3(projectX(point.x), 0.11, projectZ(point.y)))
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  const geometry = new THREE.TubeGeometry(curve, 32, 0.14, 10, false)
  const material = new THREE.MeshStandardMaterial({
    color: '#f6d365',
    transparent: true,
    opacity: 0.5,
    roughness: 0.4,
    metalness: 0.03,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.receiveShadow = true
  return mesh
}

function buildWallMesh(segment) {
  const isHorizontal = segment.orientation === 'horizontal'
  const length = Math.max(
    isHorizontal
      ? Math.abs(projectX(segment.x2) - projectX(segment.x1))
      : Math.abs(projectZ(segment.y2) - projectZ(segment.y1)),
    0.3,
  )
  const thickness = Math.max(Number(segment.thickness ?? 10) * WORLD_SCALE, 0.15)
  const height = hasImportedModel.value ? 8.8 : 10.4
  const geometry = isHorizontal
    ? new THREE.BoxGeometry(length, height, thickness)
    : new THREE.BoxGeometry(thickness, height, length)

  const material = new THREE.MeshStandardMaterial({
    color: '#d7ddd3',
    roughness: 0.82,
    metalness: 0.06,
    transparent: true,
    opacity: hasImportedModel.value ? 0.42 : 0.92,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.position.set(
    projectX((Number(segment.x1) + Number(segment.x2)) / 2),
    height / 2,
    projectZ((Number(segment.y1) + Number(segment.y2)) / 2),
  )
  return mesh
}

function buildOpeningMesh(opening) {
  const width = Math.max(Number(opening.width ?? 12) * WORLD_SCALE, 0.25)
  const depth = Math.max(Number(opening.height ?? 12) * WORLD_SCALE, 0.25)
  const geometry = new THREE.BoxGeometry(width, 3.2, depth)
  const material = new THREE.MeshStandardMaterial({
    color: '#f59e0b',
    transparent: true,
    opacity: 0.24,
    roughness: 0.4,
    metalness: 0.02,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.position.set(projectX(opening.x), 1.6, projectZ(opening.y))
  return mesh
}

function buildFurnitureMesh(item) {
  const width = Math.max(Number(item.width ?? 28) * WORLD_SCALE, 0.22)
  const depth = Math.max(Number(item.height ?? 18) * WORLD_SCALE, 0.22)
  const height = 1.2 + Math.min(Number(item.confidence ?? 0.5), 1) * 1.8
  const geometry = new THREE.BoxGeometry(width, height, depth)
  const material = new THREE.MeshStandardMaterial({
    color: furnitureColor(item.label),
    transparent: true,
    opacity: 0.75,
    roughness: 0.55,
    metalness: 0.04,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.position.set(
    projectX((Number(item.x) + Number(item.width) / 2)),
    height / 2,
    projectZ((Number(item.y) + Number(item.height) / 2)),
  )
  return mesh
}

function buildSemanticFurniture(zone) {
  const fixtures = []
  const centerX = Number(zone.x ?? 0) + Number(zone.width ?? 120) / 2
  const centerY = Number(zone.y ?? 0) + Number(zone.height ?? 90) / 2
  const width = Number(zone.width ?? 120)
  const height = Number(zone.height ?? 90)

  if (zone.type === 'living') {
    fixtures.push(buildSemanticBlock(centerX - width * 0.12, centerY + height * 0.08, width * 0.22, height * 0.12, '#8b7355', 1.25))
    fixtures.push(buildSemanticBlock(centerX + width * 0.06, centerY - height * 0.02, width * 0.18, height * 0.14, '#d6c5a4', 0.85))
  } else if (zone.type === 'dining') {
    fixtures.push(buildSemanticBlock(centerX, centerY, width * 0.18, height * 0.18, '#d1b58b', 0.88))
  } else if (zone.type === 'kitchen') {
    fixtures.push(buildSemanticBlock(centerX - width * 0.18, centerY, width * 0.22, height * 0.56, '#aab5bf', 1.4))
  } else if (zone.type === 'master' || zone.type === 'bedroom') {
    fixtures.push(buildSemanticBlock(centerX, centerY, width * 0.42, height * 0.34, '#b08968', 0.92))
  } else if (zone.type === 'storage') {
    fixtures.push(buildSemanticBlock(centerX, centerY, width * 0.72, height * 0.22, '#8b7e74', 1.55))
  } else if (zone.type === 'entry') {
    fixtures.push(buildSemanticBlock(centerX, centerY, width * 0.48, height * 0.18, '#9ca3af', 1.15))
  } else if (zone.type === 'bath' || zone.type === 'master_bath') {
    fixtures.push(buildSemanticBlock(centerX, centerY, width * 0.22, height * 0.32, '#dbeafe', 0.78))
  }

  return fixtures
}

function buildSemanticBlock(planX, planY, planWidthValue, planHeightValue, color, boxHeight) {
  const geometry = new THREE.BoxGeometry(
    Math.max(planWidthValue * WORLD_SCALE, 0.28),
    boxHeight,
    Math.max(planHeightValue * WORLD_SCALE, 0.28),
  )
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.82,
    roughness: 0.58,
    metalness: 0.04,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.dynamic = true
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.position.set(projectX(planX), boxHeight / 2, projectZ(planY))
  return mesh
}

function buildMarkerMesh(marker) {
  const markerGroup = new THREE.Group()
  markerGroup.userData.dynamic = true
  markerGroup.userData.groupKey = marker.key

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.65, 2.2, 24),
    new THREE.MeshStandardMaterial({
      color: marker.active ? '#0f766e' : markerColor(marker),
      emissive: marker.active ? '#0f766e' : '#111827',
      emissiveIntensity: marker.active ? 0.46 : 0.08,
      roughness: 0.4,
      metalness: 0.15,
    }),
  )
  base.castShadow = true
  base.receiveShadow = true

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(marker.lightDevice ? 1.95 : 1.65, 20, 20),
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: marker.active ? '#fde68a' : markerColor(marker),
      emissiveIntensity: marker.active ? 0.95 : 0.22,
      roughness: 0.15,
      metalness: 0.03,
    }),
  )
  orb.position.y = 2.1
  orb.castShadow = true

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 3.5, 40),
    new THREE.MeshBasicMaterial({
      color: marker.active ? '#fbbf24' : markerColor(marker),
      transparent: true,
      opacity: marker.active ? 0.45 : 0.18,
      side: THREE.DoubleSide,
    }),
  )
  halo.rotation.x = -Math.PI / 2
  halo.position.y = 0.15

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.42, marker.active ? 8.5 : 6.2, 18),
    new THREE.MeshBasicMaterial({
      color: marker.active ? '#5eead4' : '#60a5fa',
      transparent: true,
      opacity: marker.active ? 0.18 : 0.09,
    }),
  )
  beam.position.y = 4.1

  const cap = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.88, 32),
    new THREE.MeshBasicMaterial({
      color: marker.active ? '#fef08a' : '#7dd3fc',
      transparent: true,
      opacity: marker.active ? 0.6 : 0.24,
      side: THREE.DoubleSide,
    }),
  )
  cap.rotation.x = -Math.PI / 2
  cap.position.y = marker.active ? 8.2 : 6.2

  markerGroup.add(base, orb, halo, beam, cap)
  base.userData.interactiveKind = 'marker'
  base.userData.groupKey = marker.key
  orb.userData.interactiveKind = 'marker'
  orb.userData.groupKey = marker.key
  markerGroup.position.set(
    projectX(marker.position.x),
    6.6 + marker.position.z * 9,
    projectZ(marker.position.y),
  )

  sceneRefs.interactiveMeshes.push(base, orb)
  sceneRefs.markerByKey.set(marker.key, markerGroup)
  return markerGroup
}

function buildFocusBeacon(room) {
  const width = Math.max((room.plan_width ?? 120) * WORLD_SCALE, 2.4)
  const depth = Math.max((room.plan_height ?? 90) * WORLD_SCALE, 2.1)
  const maxRadius = Math.max(width, depth) * 0.8
  const centerX = projectX((room.plan_x ?? 0) + ((room.plan_width ?? 120) / 2))
  const centerZ = projectZ((room.plan_y ?? 0) + ((room.plan_height ?? 90) / 2))
  const group = new THREE.Group()
  group.userData.dynamic = true
  group.position.set(centerX, 0.18, centerZ)

  const floorRing = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(maxRadius - 0.16, 0.4), maxRadius, 96),
    new THREE.MeshBasicMaterial({
      color: '#67e8f9',
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    }),
  )
  floorRing.rotation.x = -Math.PI / 2

  const pulseRing = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(maxRadius + 0.12, 0.46), maxRadius + 0.28, 96),
    new THREE.MeshBasicMaterial({
      color: '#fef08a',
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    }),
  )
  pulseRing.rotation.x = -Math.PI / 2
  pulseRing.position.y = 0.02

  group.add(floorRing, pulseRing)
  return group
}

function refreshImportedModel() {
  const root = sceneRefs.modelRoot
  if (!root) {
    return
  }

  clearImportedModel()
  if (!sceneModelUrl.value) {
    return
  }

  sceneRefs.modelLoadToken += 1
  const modelLoadToken = sceneRefs.modelLoadToken
  sceneRefs.loader.load(
    sceneModelUrl.value,
    (gltf) => {
      if (modelLoadToken !== sceneRefs.modelLoadToken) {
        disposeObject(gltf.scene)
        return
      }

      const model = gltf.scene
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const fitScale = Math.min(
        (planWidth.value * WORLD_SCALE) / Math.max(size.x, 1),
        (planHeight.value * WORLD_SCALE) / Math.max(size.z || size.y, 1),
      )
      const extraScale = Number(sceneZone.value?.three_d_model_scale ?? 1)
      model.scale.setScalar(fitScale * extraScale)

      const fittedBox = new THREE.Box3().setFromObject(model)
      const center = fittedBox.getCenter(new THREE.Vector3())
      model.position.set(-center.x, -fittedBox.min.y, -center.z)
      root.add(model)
    },
    undefined,
    (error) => {
      console.error('Failed to load imported 3D model.', error)
    },
  )
}

function clearImportedModel() {
  const root = sceneRefs.modelRoot
  if (!root) {
    return
  }

  for (const child of [...root.children]) {
    root.remove(child)
    disposeObject(child)
  }
}

function syncCameraMode() {
  const camera = sceneRefs.camera
  const controls = sceneRefs.controls
  if (!camera || !controls) {
    return
  }

  controls.enabled = !isWalkMode.value
  if (isWalkMode.value) {
    resetWalkCamera()
    return
  }

  const currentRoom = activeWorkbenchRoom.value ?? sceneRooms.value.find((room) => room.id === props.selectedRoomId) ?? sceneRooms.value[0] ?? null
  if (!currentRoom) {
    return
  }

  focusOrbitOnBox(
    currentRoom.plan_x ?? 0,
    currentRoom.plan_y ?? 0,
    currentRoom.plan_width ?? 120,
    currentRoom.plan_height ?? 90,
    { detail: isRoomWorkbench.value },
  )
}

function resetWalkCamera() {
  const camera = sceneRefs.camera
  if (!camera) {
    return
  }

  const room = sceneRooms.value.find((item) => item.id === props.selectedRoomId) ?? sceneRooms.value[0] ?? null
  if (!room) {
    return
  }

  const centerX = projectX((room.plan_x ?? 0) + ((room.plan_width ?? 120) / 2))
  const centerZ = projectZ((room.plan_y ?? 0) + ((room.plan_height ?? 90) / 2))
  walkState.yaw = 0
  walkState.pitch = -0.08
  camera.position.set(centerX, WALK_HEIGHT, centerZ + 18)
  updateWalkCameraDirection()
}

function animate() {
  const renderer = sceneRefs.renderer
  const scene = sceneRefs.scene
  const camera = sceneRefs.camera

  if (!renderer || !scene || !camera) {
    return
  }

  sceneRefs.animationFrame = requestAnimationFrame(animate)

  if (isWalkMode.value) {
    updateWalkMovement()
  } else {
    sceneRefs.controls?.update()
  }

  renderer.render(scene, camera)
  updatePopupScreenPosition()
}

function updateWalkMovement() {
  const camera = sceneRefs.camera
  if (!camera) {
    return
  }

  const forward = (walkState.keyForward ? 1 : 0) - (walkState.keyBackward ? 1 : 0) + (-walkState.moveZ)
  const right = (walkState.keyRight ? 1 : 0) - (walkState.keyLeft ? 1 : 0) + walkState.moveX
  const normalizedLength = Math.hypot(forward, right) || 1
  const speed = supportsTouchNavigation.value ? 0.52 : 0.72
  const motionForward = forward / normalizedLength
  const motionRight = right / normalizedLength

  if (Math.abs(forward) > 0.02 || Math.abs(right) > 0.02) {
    camera.position.x += (Math.sin(walkState.yaw) * motionForward + Math.cos(walkState.yaw) * motionRight) * speed
    camera.position.z += (Math.cos(walkState.yaw) * motionForward - Math.sin(walkState.yaw) * motionRight) * speed
  }

  if (Math.abs(walkState.lookX) > 0.01 || Math.abs(walkState.lookY) > 0.01) {
    walkState.yaw -= walkState.lookX * 0.05
    walkState.pitch = THREE.MathUtils.clamp(walkState.pitch - walkState.lookY * 0.04, -0.6, 0.45)
  }

  const minX = projectX(0) + 6
  const maxX = projectX(planWidth.value) - 6
  const minZ = projectZ(0) + 6
  const maxZ = projectZ(planHeight.value) - 6
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, minX, maxX)
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, minZ, maxZ)
  camera.position.y = WALK_HEIGHT
  updateWalkCameraDirection()
}

function updateWalkCameraDirection() {
  const camera = sceneRefs.camera
  if (!camera) {
    return
  }

  const target = new THREE.Vector3(
    camera.position.x + Math.sin(walkState.yaw) * Math.cos(walkState.pitch) * 20,
    camera.position.y + Math.sin(walkState.pitch) * 18,
    camera.position.z + Math.cos(walkState.yaw) * Math.cos(walkState.pitch) * 20,
  )
  camera.lookAt(target)
}

function updatePopupScreenPosition() {
  const currentGroup = activePopupGroup.value
  const markerMesh = currentGroup ? sceneRefs.markerByKey.get(currentGroup.key) : null
  const camera = sceneRefs.camera
  const container = containerRef.value
  if (!currentGroup || !markerMesh || !camera || !container) {
    popupCoordinates.value = { left: 0, top: 0, visible: false }
    return
  }

  const vector = markerMesh.position.clone()
  vector.project(camera)

  const left = ((vector.x + 1) / 2) * container.clientWidth
  const top = ((-vector.y + 1) / 2) * container.clientHeight
  const visible = vector.z < 1
  const popupWidth = Math.min(336, Math.max(container.clientWidth - 16, 240))
  const popupHeight = Math.min(popupPanelRef.value?.offsetHeight ?? 320, container.clientHeight - 20)
  const margin = 10
  let alignX = 'center'
  let alignY = 'top'
  let clampedLeft = left
  let clampedTop = top

  if (left + popupWidth / 2 > container.clientWidth - margin) {
    alignX = 'right'
    clampedLeft = Math.min(left + popupWidth / 2, container.clientWidth - margin)
  } else if (left - popupWidth / 2 < margin) {
    alignX = 'left'
    clampedLeft = Math.max(left - popupWidth / 2, margin)
  }

  if (top - popupHeight - 18 < margin) {
    alignY = 'bottom'
    clampedTop = Math.min(top, container.clientHeight - popupHeight - 18 - margin)
  } else {
    clampedTop = Math.max(top, popupHeight + 18 + margin)
  }

  popupCoordinates.value = {
    left: Math.round(clampedLeft),
    top: Math.round(clampedTop),
    visible,
    alignX,
    alignY,
  }
}

function resolveStructuralRenderMode(analysis, rooms) {
  const wallSegments = Array.isArray(analysis?.wall_segments) ? analysis.wall_segments : []
  const openings = Array.isArray(analysis?.openings) ? analysis.openings : []
  const roomCandidates = Array.isArray(analysis?.room_candidates) ? analysis.room_candidates : []
  const semanticZones = Array.isArray(analysis?.semantic_zones) ? analysis.semantic_zones : []
  const roomCount = rooms?.length ?? 0

  if (semanticZones.length >= 6) {
    return 'semantic'
  }

  if (wallSegments.length === 0) {
    return 'rooms'
  }

  if (roomCount === 0) {
    return 'walls'
  }

  const longWalls = wallSegments.filter((segment) => {
    const x1 = Number(segment.x1 ?? 0)
    const x2 = Number(segment.x2 ?? 0)
    const y1 = Number(segment.y1 ?? 0)
    const y2 = Number(segment.y2 ?? 0)
    return Math.abs(x2 - x1) + Math.abs(y2 - y1) >= Math.min(planWidth.value, planHeight.value) * 0.08
  }).length

  const excessiveCandidateDrift = roomCandidates.length > roomCount * 2 + 2
  const excessiveWallCount = wallSegments.length > Math.max(36, roomCount * 18)
  const insufficientLongWalls = longWalls < Math.max(6, roomCount * 3)
  const excessiveOpeningCount = openings.length > Math.max(12, roomCount * 4)

  if (excessiveCandidateDrift || excessiveWallCount || insufficientLongWalls || excessiveOpeningCount) {
    return 'rooms'
  }

  return 'walls'
}

function focusOverview() {
  if (isWalkMode.value) {
    return
  }

  detailRoomId.value = null
  const camera = sceneRefs.camera
  const controls = sceneRefs.controls
  if (!camera || !controls) {
    return
  }

  const spanWorld = Math.max(planWidth.value, planHeight.value, 120) * WORLD_SCALE
  controls.target.set(0, 0, 0)
  controls.minDistance = 10
  controls.maxDistance = Math.max(spanWorld * 4.8, 220)
  camera.position.set(0, spanWorld * 1.3 + 26, spanWorld * 1.15 + 34)
  controls.update()
}

function focusSelectedRoom() {
  const room = selectedOrbitRoom.value
  if (!room || isWalkMode.value) {
    return
  }

  activateRoomWorkbench(room)
}

function focusOrbitRoom(room) {
  if (isWalkMode.value) {
    return
  }

  activateRoomWorkbench(room)
}

function focusSemanticZone(zone) {
  if (!zone || isWalkMode.value) {
    return
  }

  detailRoomId.value = null
  focusOrbitOnBox(zone.x ?? 0, zone.y ?? 0, zone.width ?? 120, zone.height ?? 90, { detail: false })
}

function activateRoomWorkbench(room) {
  if (!room) {
    return
  }
  detailRoomId.value = room.id
  emit('select-room', room.id)
  focusOrbitOnBox(room.plan_x ?? 0, room.plan_y ?? 0, room.plan_width ?? 120, room.plan_height ?? 90, { detail: true })
}

function exitRoomWorkbench() {
  detailRoomId.value = null
  closePopup()
  focusOverview()
}

function focusOrbitOnBox(planX, planY, width, height, options = {}) {
  const camera = sceneRefs.camera
  const controls = sceneRefs.controls
  if (!camera || !controls) {
    return
  }

  const targetX = projectX(Number(planX) + Number(width) / 2)
  const targetZ = projectZ(Number(planY) + Number(height) / 2)
  const container = containerRef.value
  const span = Math.max(Number(width), Number(height), 120) * WORLD_SCALE
  const detail = Boolean(options.detail)
  const aspectBias = container ? THREE.MathUtils.clamp(container.clientHeight / Math.max(container.clientWidth, 1), 0.55, 1.2) : 0.82
  const distance = detail
    ? THREE.MathUtils.clamp(span * (0.72 + aspectBias * 0.18), 8, 28)
    : THREE.MathUtils.clamp(span * (1.18 + aspectBias * 0.38), 16, 74)
  const elevation = detail
    ? THREE.MathUtils.clamp(span * (0.44 + aspectBias * 0.14) + 5, 6, 26)
    : THREE.MathUtils.clamp(span * (0.96 + aspectBias * 0.32) + 12, 16, 76)
  const lateral = detail
    ? THREE.MathUtils.clamp(span * 0.14, 0.8, 5.2)
    : THREE.MathUtils.clamp(span * 0.5, 4, 22)
  controls.target.set(targetX, 0, targetZ)
  controls.minDistance = detail ? Math.max(distance * 0.5, 4) : Math.max(distance * 0.42, 8)
  controls.maxDistance = detail ? Math.max(distance * 2.8, 42) : Math.max(distance * 4.8, 180)
  camera.position.set(targetX + lateral, elevation, targetZ + distance)
  controls.update()
}

function handleResize() {
  const container = containerRef.value
  const renderer = sceneRefs.renderer
  const camera = sceneRefs.camera
  if (!container || !renderer || !camera) {
    return
  }

  renderer.setSize(container.clientWidth, container.clientHeight)
  camera.aspect = container.clientWidth / container.clientHeight
  camera.updateProjectionMatrix()
}

function pickSceneTarget(event) {
  const renderer = sceneRefs.renderer
  const camera = sceneRefs.camera
  if (!renderer || !camera) {
    return null
  }

  const rect = renderer.domElement.getBoundingClientRect()
  sceneRefs.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  sceneRefs.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  sceneRefs.raycaster.setFromCamera(sceneRefs.pointer, camera)
  const intersections = sceneRefs.raycaster.intersectObjects(sceneRefs.interactiveMeshes, false)
  const object = intersections[0]?.object
  const interactiveKind = object?.userData?.interactiveKind

  if (interactiveKind === 'marker') {
    const groupKey = object.userData.groupKey
    const group = groupedMarkers.value.find((item) => item.key === groupKey) ?? null
    return group ? { kind: 'marker', group } : null
  }

  if (interactiveKind === 'room') {
    const room = sceneRooms.value.find((item) => item.id === object.userData.roomId) ?? null
    return room ? { kind: 'room', room } : null
  }

  const root = object?.parent
  if (!root?.userData?.groupKey) {
    return null
  }
  const group = groupedMarkers.value.find((item) => item.key === root.userData.groupKey) ?? null
  return group ? { kind: 'marker', group } : null
}

function handlePointerDown(event) {
  const target = pickSceneTarget(event)
  if (target?.kind === 'marker') {
    const group = target.group
    pressState.targetKind = 'marker'
    pressState.groupKey = group.key
    pressState.roomId = null
    pressState.startX = event.clientX
    pressState.startY = event.clientY
    pressState.longPressed = false
    clearLongPressTimer()
    pressState.timer = window.setTimeout(() => {
      if (group.shouldPopupOnClick || group.hasAdvancedLightControls) {
        openPopup(group)
        pressState.longPressed = true
      }
    }, 420)
    return
  }

  if (target?.kind === 'room' && !isWalkMode.value) {
    pressState.targetKind = 'room'
    pressState.groupKey = ''
    pressState.roomId = target.room.id
    pressState.startX = event.clientX
    pressState.startY = event.clientY
    pressState.longPressed = false
    clearLongPressTimer()
    return
  }

  closePopup()
  clearLongPressTimer()
  pressState.targetKind = ''
  pressState.groupKey = ''
  pressState.roomId = null

  if (!isWalkMode.value) {
    return
  }

  walkState.draggingLook = true
  walkState.pointerId = event.pointerId
  walkState.lastX = event.clientX
  walkState.lastY = event.clientY
}

function handlePointerMove(event) {
  if (pressState.groupKey || pressState.roomId !== null) {
    const distance = Math.hypot(event.clientX - pressState.startX, event.clientY - pressState.startY)
    if (distance > 8) {
      clearLongPressTimer()
    }
  }

  if (!isWalkMode.value || !walkState.draggingLook || walkState.pointerId !== event.pointerId) {
    return
  }

  const deltaX = event.clientX - walkState.lastX
  const deltaY = event.clientY - walkState.lastY
  walkState.lastX = event.clientX
  walkState.lastY = event.clientY
  walkState.yaw -= deltaX * LOOK_SENSITIVITY
  walkState.pitch = THREE.MathUtils.clamp(walkState.pitch - deltaY * LOOK_SENSITIVITY, -0.6, 0.45)
}

function handlePointerUp(event) {
  const target = pickSceneTarget(event)
  const group = target?.kind === 'marker' ? target.group : null
  const room = target?.kind === 'room' ? target.room : null
  const sameMarkerTarget = group && group.key === pressState.groupKey
  const sameRoomTarget = room && room.id === pressState.roomId
  const didLongPress = pressState.longPressed
  clearLongPressTimer()

  if (sameMarkerTarget && !didLongPress) {
    handlePrimaryMarkerAction(group)
  } else if (sameRoomTarget && !didLongPress) {
    activateRoomWorkbench(room)
  }

  pressState.targetKind = ''
  pressState.groupKey = ''
  pressState.roomId = null
  pressState.longPressed = false

  if (walkState.pointerId === event.pointerId) {
    walkState.draggingLook = false
    walkState.pointerId = -1
  }
}

function handlePointerCancel(event) {
  clearLongPressTimer()
  pressState.targetKind = ''
  pressState.groupKey = ''
  pressState.roomId = null
  pressState.longPressed = false

  if (!event || walkState.pointerId === event.pointerId) {
    walkState.draggingLook = false
    walkState.pointerId = -1
  }
}

function clearLongPressTimer() {
  if (pressState.timer) {
    window.clearTimeout(pressState.timer)
    pressState.timer = 0
  }
}

function openPopup(group) {
  popupGroupKey.value = group.key
  if (!isWalkMode.value) {
    activateRoomWorkbench(group.room)
    return
  }
  emit('select-room', group.room.id)
}

function closePopup() {
  popupGroupKey.value = ''
}

async function handlePrimaryMarkerAction(group) {
  if (!isWalkMode.value) {
    activateRoomWorkbench(group.room)
  } else {
    emit('select-room', group.room.id)
  }

  if (group.clickToggles && group.primaryInteractive) {
    try {
      await smartHomeStore.toggleDevice(group.primaryInteractive.id)
    } catch (error) {
      console.error('Failed to toggle marker device.', error)
    }
    return
  }

  openPopup(group)
}

function handleKeyDown(event) {
  const code = event.code.toLowerCase()
  if (code === 'escape') {
    if (popupGroupKey.value) {
      closePopup()
      return
    }
    if (isRoomWorkbench.value) {
      exitRoomWorkbench()
      return
    }
    if (isFullscreen.value) {
      setFullscreenMode(false)
      return
    }
  }

  if (!isWalkMode.value) {
    return
  }

  if (code === 'keyw' || code === 'arrowup') {
    walkState.keyForward = true
  } else if (code === 'keys' || code === 'arrowdown') {
    walkState.keyBackward = true
  } else if (code === 'keya' || code === 'arrowleft') {
    walkState.keyLeft = true
  } else if (code === 'keyd' || code === 'arrowright') {
    walkState.keyRight = true
  }
}

function handleKeyUp(event) {
  const code = event.code.toLowerCase()
  if (code === 'keyw' || code === 'arrowup') {
    walkState.keyForward = false
  } else if (code === 'keys' || code === 'arrowdown') {
    walkState.keyBackward = false
  } else if (code === 'keya' || code === 'arrowleft') {
    walkState.keyLeft = false
  } else if (code === 'keyd' || code === 'arrowright') {
    walkState.keyRight = false
  }
}

function updatePad(kind, event) {
  const rect = event.currentTarget.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const normalizedX = THREE.MathUtils.clamp((event.clientX - centerX) / (rect.width / 2), -1, 1)
  const normalizedY = THREE.MathUtils.clamp((event.clientY - centerY) / (rect.height / 2), -1, 1)

  if (kind === 'move') {
    walkState.moveX = normalizedX
    walkState.moveZ = normalizedY
    return
  }

  walkState.lookX = normalizedX
  walkState.lookY = normalizedY
}

function resetPad(kind) {
  if (kind === 'move') {
    walkState.moveX = 0
    walkState.moveZ = 0
    return
  }

  walkState.lookX = 0
  walkState.lookY = 0
}

function projectX(planX) {
  return (planX - planWidth.value / 2) * WORLD_SCALE
}

function projectZ(planY) {
  return (planY - planHeight.value / 2) * WORLD_SCALE
}

function roomColor(room) {
  if (!props.showHeatLayer) {
    return room.id === props.selectedRoomId ? '#475569' : '#94a3b8'
  }

  const temperature = Number(room.ambient_temperature ?? 24)
  const occupied = ['occupied', 'present', 'on', 'detected'].includes(`${room.occupancy_status ?? ''}`.toLowerCase())
  if (temperature >= 28) {
    return occupied ? '#f97316' : '#fb923c'
  }
  if (temperature <= 19) {
    return occupied ? '#2563eb' : '#38bdf8'
  }
  if (occupied) {
    return '#f59e0b'
  }
  return '#94a3b8'
}

function furnitureColor(label) {
  if (label === 'bed') {
    return '#f59e0b'
  }
  if (label === 'sofa') {
    return '#a16207'
  }
  if (label === 'wardrobe') {
    return '#6b7280'
  }
  if (label === 'table') {
    return '#0f766e'
  }
  return '#475569'
}

function markerColor(marker) {
  if (marker.lightDevice) {
    return '#f59e0b'
  }
  if (marker.applianceType === 'air_conditioner') {
    return '#0ea5e9'
  }
  if (marker.applianceType === 'fridge') {
    return '#22c55e'
  }
  if (marker.applianceType === 'camera') {
    return '#8b5cf6'
  }
  return '#334155'
}

function semanticZoneColor(type) {
  if (type === 'living') {
    return '#d2b48c'
  }
  if (type === 'dining') {
    return '#c99742'
  }
  if (type === 'kitchen') {
    return '#94a3b8'
  }
  if (type === 'master') {
    return '#b07d62'
  }
  if (type === 'bedroom') {
    return '#9b7f68'
  }
  if (type === 'bath' || type === 'master_bath') {
    return '#7dd3fc'
  }
  if (type === 'storage') {
    return '#8b7355'
  }
  if (type === 'entry' || type === 'hall') {
    return '#cbd5e1'
  }
  return '#94a3b8'
}

function sceneStructureLabel() {
  if (structuralRenderMode.value === 'walls') {
    return '识别墙体结构'
  }
  if (structuralRenderMode.value === 'semantic') {
    return '语义骨架结构'
  }
  return '稳定布局结构'
}

function setFullscreenMode(nextValue) {
  if (isFullscreen.value === nextValue) {
    return
  }
  isFullscreen.value = nextValue
}

function toggleFullscreenMode() {
  setFullscreenMode(!isFullscreen.value)
}

function layerToggleClass(active) {
  return active
    ? 'border-teal-300/35 bg-teal-400/15 text-teal-50 shadow-[0_16px_34px_rgba(20,184,166,0.18)]'
    : 'border-white/12 bg-white/[0.05] text-slate-300 hover:border-white/18 hover:bg-white/[0.09]'
}

function orbitRoomChipClass(active) {
  return active
    ? 'border-teal-300/40 bg-teal-400/18 text-teal-50 shadow-[0_16px_34px_rgba(20,184,166,0.18)]'
    : 'border-white/12 bg-white/[0.06] text-slate-200 hover:border-white/20 hover:bg-white/[0.12]'
}

function focusChipClass() {
  return 'border-white/12 bg-white/[0.06] text-slate-100 hover:border-teal-200/30 hover:bg-white/[0.12]'
}

function miniMapRoomStyle(room) {
  const left = (Number(room.plan_x ?? 0) / Math.max(planWidth.value, 1)) * 100
  const top = (Number(room.plan_y ?? 0) / Math.max(planHeight.value, 1)) * 100
  const width = (Number(room.plan_width ?? 120) / Math.max(planWidth.value, 1)) * 100
  const height = (Number(room.plan_height ?? 90) / Math.max(planHeight.value, 1)) * 100
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  }
}

function miniMapMarkerStyle(marker) {
  return {
    left: `${(Number(marker.position.x ?? 0) / Math.max(planWidth.value, 1)) * 100}%`,
    top: `${(Number(marker.position.y ?? 0) / Math.max(planHeight.value, 1)) * 100}%`,
  }
}

function magnifierMarkerStyle(marker) {
  const room = activeWorkbenchRoom.value
  if (!room) {
    return {}
  }
  const roomWidth = Math.max(Number(room.plan_width ?? 120), 1)
  const roomHeight = Math.max(Number(room.plan_height ?? 90), 1)
  const relativeX = ((Number(marker.position.x ?? 0) - Number(room.plan_x ?? 0)) / roomWidth) * 100
  const relativeY = ((Number(marker.position.y ?? 0) - Number(room.plan_y ?? 0)) / roomHeight) * 100
  return {
    left: `${Math.max(4, Math.min(96, relativeX))}%`,
    top: `${Math.max(4, Math.min(96, relativeY))}%`,
  }
}

function controlTitle(device) {
  return device.appliance_name || device.name
}

function telemetryLabel(device) {
  if (device.device_class === 'temperature') {
    return '温度'
  }
  if (device.device_class === 'humidity' || device.device_class === 'moisture') {
    return '湿度'
  }
  return device.name
}

function telemetryValue(device) {
  if (device.raw_state === null || device.raw_state === undefined || device.raw_state === '') {
    return '--'
  }
  return `${device.raw_state}${device.unit_of_measurement ?? ''}`
}

function brightnessValue(device) {
  return device.brightness_value ?? 50
}

function colorTemperatureValue(device) {
  if (device.color_temperature !== null && device.color_temperature !== undefined) {
    return device.color_temperature
  }
  const min = device.min_color_temperature ?? 2700
  const max = device.max_color_temperature ?? 6500
  return Math.round((min + max) / 2)
}

function numberKey(device) {
  return `number:${device.id}`
}

function brightnessKey(device) {
  return `brightness:${device.id}`
}

function colorKey(device) {
  return `color:${device.id}`
}

function selectOptions(device) {
  if (device.entity_domain === 'climate') {
    return device.hvac_modes ?? []
  }
  if (device.entity_domain === 'media_player') {
    return device.media_source_options ?? []
  }
  return device.control_options ?? []
}

function isPending(deviceId) {
  return smartHomeStore.isDevicePending(deviceId)
}

async function handleToggle(device) {
  try {
    await smartHomeStore.toggleDevice(device.id)
  } catch (error) {
    console.error('Failed to toggle popup device.', error)
  }
}

async function handleNumberChange(device, event) {
  const nextValue = Number(event.target.value)
  numericDrafts.value = { ...numericDrafts.value, [numberKey(device)]: nextValue }
  try {
    await smartHomeStore.setDeviceNumber(device.id, nextValue)
  } catch (error) {
    console.error('Failed to set numeric value.', error)
  }
}

async function handleBrightnessChange(device, event) {
  const nextValue = Number(event.target.value)
  numericDrafts.value = { ...numericDrafts.value, [brightnessKey(device)]: nextValue }
  try {
    await smartHomeStore.setDeviceBrightness(device.id, nextValue)
  } catch (error) {
    console.error('Failed to set brightness.', error)
  }
}

async function handleColorTemperatureChange(device, event) {
  const nextValue = Number(event.target.value)
  numericDrafts.value = { ...numericDrafts.value, [colorKey(device)]: nextValue }
  try {
    await smartHomeStore.setDeviceColorTemperature(device.id, nextValue)
  } catch (error) {
    console.error('Failed to set color temperature.', error)
  }
}

async function handleSelectChange(device, event) {
  const nextValue = event.target.value
  selectDrafts.value = { ...selectDrafts.value, [device.id]: nextValue }
  try {
    await smartHomeStore.selectDeviceOption(device.id, nextValue)
  } catch (error) {
    console.error('Failed to set select option.', error)
  }
}

async function handleButtonPress(device) {
  try {
    await smartHomeStore.pressDeviceButton(device.id)
  } catch (error) {
    console.error('Failed to press device button.', error)
  }
}
</script>

<template>
  <section
    ref="shellRef"
    :class="isFullscreen
      ? 'fixed inset-0 z-[120] overflow-hidden bg-[#e6ece7]'
      : props.embedded
        ? 'h-full overflow-hidden'
        : 'orbit-shell glass-soft overflow-hidden rounded-[2rem] p-4 sm:p-5 lg:p-6'"
  >
    <div
      v-if="!isFullscreen && !props.embedded"
      class="grid gap-4 2xl:grid-cols-[minmax(0,1.18fr)_minmax(20rem,0.82fr)] 2xl:items-end"
    >
      <div class="min-w-0">
        <p class="text-[11px] uppercase tracking-[0.28em] text-lagoon">Immersive Spatial UI</p>
        <h3 class="font-display mt-3 text-[1.8rem] leading-none text-ink sm:text-[2.15rem]">
          {{ isWalkMode ? '第一人称 3D 漫游' : '真 3D 轨道视图' }}
        </h3>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          {{ hasImportedModel ? '当前已叠加导入的 3D 模型，可在模型与结构层上继续控制设备。' : '当前先使用户型结构层生成墙体、门洞和家具代理体，后续导入 GLB/GLTF 模型会自动叠加。' }}
        </p>
        <div class="mt-4 flex flex-wrap gap-2.5">
          <span class="orbit-legend-chip">
            <span class="orbit-legend-chip__label">Mode</span>
            <span class="orbit-legend-chip__value">{{ viewModeLabel }}</span>
          </span>
          <span class="orbit-legend-chip">
            <span class="orbit-legend-chip__label">Markers</span>
            <span class="orbit-legend-chip__value">{{ roamStats.markers }} total / {{ activeMarkerCount }} active</span>
          </span>
          <span class="orbit-legend-chip">
            <span class="orbit-legend-chip__label">Control</span>
            <span class="orbit-legend-chip__value">{{ controllableMarkerCount }} controllable nodes</span>
          </span>
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <span class="rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-xs font-medium text-slate-600">
            结构层：{{ sceneStructureLabel() }}
          </span>
          <span class="rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-xs font-medium text-slate-600">
            模型层：{{ hasImportedModel ? '已叠加 3D 资产' : '等待导入模型' }}
          </span>
          <span class="rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-xs font-medium text-slate-600">
            设备交互：点按直控，长按展开高级控制
          </span>
        </div>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <div class="orbit-summary-card">
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">房间</p>
          <p class="mt-2 text-xl font-semibold text-ink">{{ roamStats.rooms }}</p>
        </div>
        <div class="orbit-summary-card">
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">{{ structuralRenderMode === 'semantic' ? '语义区' : '墙体' }}</p>
          <p class="mt-2 text-xl font-semibold text-ink">{{ roamStats.walls }}</p>
        </div>
        <div class="orbit-summary-card">
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">门 / 窗</p>
          <p class="mt-2 text-xl font-semibold text-ink">{{ roamStats.openings }} / {{ roamStats.windows }}</p>
        </div>
        <div class="orbit-summary-card">
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">设备节点</p>
          <p class="mt-2 text-xl font-semibold text-ink">{{ roamStats.markers }}</p>
        </div>
      </div>
    </div>

    <div
      ref="containerRef"
      :class="isFullscreen
        ? 'relative h-[100dvh] overflow-hidden bg-[#eef2ef]'
        : props.embedded
          ? 'orbit-canvas-shell relative h-[38rem] overflow-hidden rounded-[2rem] border border-white/8 bg-[#eef2ef] shadow-inner sm:h-[43rem] xl:h-[46rem]'
          : 'orbit-canvas-shell relative mt-5 h-[38rem] overflow-hidden rounded-[2rem] border border-white/70 bg-[#eef2ef] shadow-inner sm:h-[43rem] xl:h-[46rem]'"
    >
      <div class="orbit-atmosphere orbit-atmosphere--aurora" />
      <div class="orbit-atmosphere orbit-atmosphere--grid" />
      <div class="orbit-atmosphere orbit-atmosphere--vignette" />
      <div class="orbit-frame-corner orbit-frame-corner--tl" />
      <div class="orbit-frame-corner orbit-frame-corner--tr" />
      <div class="orbit-frame-corner orbit-frame-corner--bl" />
      <div class="orbit-frame-corner orbit-frame-corner--br" />

      <div v-if="!isWalkMode" class="orbit-reticle" aria-hidden="true">
        <span />
      </div>

      <div class="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
        <div class="pointer-events-auto orbit-hud-panel w-[17rem] max-w-[calc(100%-5rem)] p-3 sm:w-[18.5rem]">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">轨道工作台</p>
              <p class="mt-2 text-sm font-semibold text-slate-50 sm:text-base">
                {{ selectedOrbitRoom ? `${selectedOrbitRoom.name} · ${selectedOrbitRoom.devices?.length ?? 0} 个设备` : '当前暂无房间聚焦' }}
              </p>
              <p class="mt-1 text-xs leading-5 text-slate-300/80 sm:text-sm">{{ structureHint }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="!isWalkMode"
                type="button"
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm"
                :class="orbitRoomChipClass(false)"
                @click="focusOverview"
              >
                全屋视角
              </button>
              <button
                v-if="!isWalkMode"
                type="button"
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm"
                :class="orbitRoomChipClass(Boolean(selectedOrbitRoom))"
                @click="focusSelectedRoom"
              >
                当前房间
              </button>
              <button
                type="button"
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm"
                :class="orbitRoomChipClass(isFullscreen)"
                @click="toggleFullscreenMode"
              >
                {{ isFullscreen ? '退出全屏' : '全屏沉浸' }}
              </button>
            </div>
          </div>

          <div v-if="isRoomWorkbench" class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-full border border-white/70 bg-white/84 px-3 py-1.5 text-xs font-medium text-slate-600 transition sm:text-sm"
              @click="exitRoomWorkbench"
            >
              退出近景
            </button>
            <span class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 sm:text-sm">
              房间工作模式
            </span>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="rounded-[1rem] border px-3 py-2 text-left text-xs font-medium transition sm:text-sm"
              :class="layerToggleClass(showDoorLayer)"
              @click="showDoorLayer = !showDoorLayer"
            >
              <span class="block text-[10px] uppercase tracking-[0.18em] opacity-70">门扇层</span>
              <span class="mt-1 block">{{ showDoorLayer ? '显示卧室 / 卫浴门扇' : '隐藏门扇效果' }}</span>
            </button>
            <button
              type="button"
              class="rounded-[1rem] border px-3 py-2 text-left text-xs font-medium transition sm:text-sm"
              :class="layerToggleClass(showWindowLayer)"
              @click="showWindowLayer = !showWindowLayer"
            >
              <span class="block text-[10px] uppercase tracking-[0.18em] opacity-70">窗边层</span>
              <span class="mt-1 block">{{ showWindowLayer ? '显示采光立面' : '隐藏窗边' }}</span>
            </button>
            <button
              type="button"
              class="rounded-[1rem] border px-3 py-2 text-left text-xs font-medium transition sm:text-sm"
              :class="layerToggleClass(showFurnitureLayer)"
              @click="showFurnitureLayer = !showFurnitureLayer"
            >
              <span class="block text-[10px] uppercase tracking-[0.18em] opacity-70">家具层</span>
              <span class="mt-1 block">{{ showFurnitureLayer ? '显示家具代理体' : '隐藏家具代理体' }}</span>
            </button>
            <button
              type="button"
              class="rounded-[1rem] border px-3 py-2 text-left text-xs font-medium transition sm:text-sm"
              :class="layerToggleClass(showGuideLayer)"
              @click="showGuideLayer = !showGuideLayer"
            >
              <span class="block text-[10px] uppercase tracking-[0.18em] opacity-70">动线层</span>
              <span class="mt-1 block">{{ showGuideLayer ? '显示走廊引导线' : '隐藏走廊引导' }}</span>
            </button>
          </div>
        </div>

        <div class="pointer-events-auto orbit-side-panel hidden w-[15rem] p-3 lg:block">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-[11px] uppercase tracking-[0.2em] text-slate-400">场景态势</p>
              <p class="mt-2 text-sm font-semibold text-slate-50 sm:text-base">{{ sceneStructureLabel() }}</p>
            </div>
            <div class="orbit-mode-badge rounded-full px-3 py-1 text-xs">
              {{ isWalkMode ? 'Walk' : 'Orbit' }}
            </div>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:text-sm">
            <div class="orbit-mini-stat px-3 py-2">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">语义区</p>
              <p class="mt-1 font-semibold text-slate-50">{{ roamStats.semanticZones }}</p>
            </div>
            <div class="orbit-mini-stat px-3 py-2">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">门洞</p>
              <p class="mt-1 font-semibold text-slate-50">{{ roamStats.openings }}</p>
            </div>
            <div class="orbit-mini-stat px-3 py-2">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">窗边</p>
              <p class="mt-1 font-semibold text-slate-50">{{ roamStats.windows }}</p>
            </div>
            <div class="orbit-mini-stat px-3 py-2">
              <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">设备</p>
              <p class="mt-1 font-semibold text-slate-50">{{ roamStats.markers }}</p>
            </div>
          </div>

          <div v-if="!isWalkMode && semanticFocusChips.length" class="mt-4">
            <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">语义热点</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="zone in semanticFocusChips.slice(0, 6)"
                :key="`semantic-chip-${zone.label}`"
                type="button"
                class="rounded-full border px-3 py-1.5 text-xs font-medium transition sm:text-sm"
                :class="focusChipClass()"
                @click="focusSemanticZone(zone)"
              >
                {{ zone.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="!isWalkMode && (isRoomWorkbench || isFullscreen)"
        class="pointer-events-none absolute right-3 top-[8.5rem] z-20 flex flex-col gap-3 sm:right-4 sm:top-[9.25rem]"
      >
        <div
          v-if="activeWorkbenchRoom && isRoomWorkbench"
          class="pointer-events-auto w-[18.5rem] rounded-[1.25rem] border border-white/70 bg-white/76 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.1)] backdrop-blur-xl"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">局部放大镜</p>
              <p class="mt-1 text-sm font-semibold text-ink">{{ activeWorkbenchRoom.name }}</p>
            </div>
            <div class="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
              ×{{ detailZoom.toFixed(1) }}
            </div>
          </div>

          <div class="relative mt-3 h-56 overflow-hidden rounded-[1rem] border border-white/75 bg-slate-100/80" :style="detailMagnifierStyle">
            <div class="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-slate-900/6" />
            <div
              v-for="marker in detailRoomMarkers"
              :key="`detail-marker-${marker.key}`"
              class="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.18)]"
              :style="{ ...magnifierMarkerStyle(marker), backgroundColor: markerColor(marker) }"
            />
            <div class="absolute inset-x-3 bottom-3 rounded-[0.85rem] border border-white/60 bg-white/72 px-3 py-2 text-[11px] leading-5 text-slate-600 backdrop-blur">
              进入近景后会保持贴近相机视角，适合继续点设备、调灯光和观察局部结构。
            </div>
          </div>
        </div>

        <div class="pointer-events-auto w-[11.5rem] rounded-[1.2rem] border border-white/70 bg-white/76 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.1)] backdrop-blur-xl">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-[11px] uppercase tracking-[0.18em] text-slate-400">小地图</p>
              <p class="mt-1 text-xs font-medium text-slate-500">{{ isRoomWorkbench ? '已锁定近景房间' : '全屋总览' }}</p>
            </div>
            <button
              v-if="isRoomWorkbench"
              type="button"
              class="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500"
              @click="focusOverview"
            >
              复位
            </button>
          </div>

          <div class="relative mt-3 h-36 overflow-hidden rounded-[0.95rem] border border-white/75 bg-slate-100/90" :style="miniMapBackgroundStyle">
            <button
              v-for="room in miniMapRooms"
              :key="`mini-room-${room.id}`"
              type="button"
              class="absolute rounded-[0.55rem] border text-[10px] text-transparent transition"
              :class="room.id === activeWorkbenchRoom?.id ? 'border-ink bg-ink/12 shadow-[0_10px_20px_rgba(15,23,42,0.18)]' : 'border-white/70 bg-white/14 hover:bg-white/24'"
              :style="miniMapRoomStyle(room)"
              @click="focusOrbitRoom(room)"
            >
              {{ room.name }}
            </button>
            <div
              v-for="marker in groupedMarkers"
              :key="`mini-marker-${marker.key}`"
              class="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80"
              :style="{ ...miniMapMarkerStyle(marker), backgroundColor: markerColor(marker) }"
            />
          </div>
        </div>
      </div>

      <div
        v-if="spatialLoading"
        class="absolute inset-0 z-30 flex items-center justify-center bg-white/42 backdrop-blur-sm"
      >
        <div class="orbit-loading-pill">
          正在同步沉浸式空间…
        </div>
      </div>

      <div
        v-if="!isWalkMode && focusedOrbitRoomCard"
        class="pointer-events-none absolute left-3 bottom-[9.8rem] z-20 sm:left-4 sm:bottom-[10.2rem]"
      >
        <div class="pointer-events-auto orbit-focus-panel w-[13.5rem] p-3">
          <p class="text-[10px] uppercase tracking-[0.22em] text-slate-400">Focus lock</p>
          <p class="mt-2 text-sm font-semibold text-slate-50">{{ focusedOrbitRoomCard.name }}</p>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <div class="orbit-focus-metric">
              <span class="orbit-focus-metric__label">Devices</span>
              <span class="orbit-focus-metric__value">{{ focusedOrbitRoomCard.deviceCount }}</span>
            </div>
            <div class="orbit-focus-metric">
              <span class="orbit-focus-metric__label">Ctrl</span>
              <span class="orbit-focus-metric__value">{{ focusedOrbitRoomCard.controlCount }}</span>
            </div>
            <div class="orbit-focus-metric">
              <span class="orbit-focus-metric__label">State</span>
              <span class="orbit-focus-metric__value">{{ focusedOrbitRoomCard.activeCount }}</span>
            </div>
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-300/80">
            <span>{{ sceneReadinessLabel }}</span>
            <span>{{ roamStats.markers }} nodes</span>
          </div>
        </div>
      </div>

      <div
        v-if="!isWalkMode && orbitRoomCards.length"
        class="pointer-events-none absolute inset-x-3 bottom-[4.9rem] z-20 flex justify-center sm:inset-x-4 sm:bottom-[5.2rem]"
      >
        <div class="pointer-events-auto orbit-room-rail max-w-[calc(100%-1rem)] px-1 py-1">
          <button
            v-for="room in orbitRoomCards"
            :key="`orbit-room-${room.id}`"
            type="button"
            class="orbit-room-pill shrink-0 text-xs font-medium transition sm:text-sm"
            :class="orbitRoomChipClass(room.id === selectedRoomId)"
            @click="focusOrbitRoom(room)"
          >
            <span class="truncate">{{ room.name }}</span>
            <span class="ml-2 text-[11px] text-slate-300/90">{{ room.controlCount }} ctrl</span>
            <span class="ml-2 text-[11px] text-slate-400">{{ room.activeCount }} active</span>
          </button>
        </div>
      </div>

      <div
        v-if="!isWalkMode"
        class="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center sm:inset-x-4 sm:bottom-4"
      >
        <div class="pointer-events-auto orbit-floating-note w-full max-w-[56rem] text-xs leading-6 sm:text-sm">
          <p>拖拽旋转，滚轮或双指缩放；点灯默认开关，长按灯光打开高级面板。</p>
          <p class="text-slate-300/80">{{ selectedOrbitRoom ? `当前聚焦 ${selectedOrbitRoom.name}` : '可在上方房间条中快速切换聚焦' }}</p>
        </div>
      </div>

      <div
        v-if="activePopupGroup"
        ref="popupPanelRef"
        class="orbit-popup-panel absolute z-40 w-[19rem] max-w-[calc(100%-1rem)] p-4 sm:w-[21rem]"
        :style="popupStyle"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-base font-semibold text-ink">{{ activePopupGroup.title }}</p>
            <p class="mt-1 text-sm text-slate-500">{{ activePopupGroup.room.name }}</p>
          </div>
          <button type="button" class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500" @click="closePopup">
            关闭
          </button>
        </div>

        <div class="mt-4 max-h-[22rem] space-y-4 overflow-y-auto pr-1">
          <div v-if="activePopupGroup.sensorDevices.length" class="space-y-2">
            <p class="text-[11px] uppercase tracking-[0.22em] text-slate-400">环境读数</p>
            <div class="grid grid-cols-2 gap-2">
              <div
                v-for="device in activePopupGroup.sensorDevices.slice(0, 4)"
                :key="`sensor-${device.id}`"
                class="orbit-popup-card px-3 py-3"
              >
                <p class="text-xs text-slate-500">{{ telemetryLabel(device) }}</p>
                <p class="mt-2 text-sm font-semibold text-ink">{{ telemetryValue(device) }}</p>
              </div>
            </div>
          </div>

          <div
            v-for="device in activePopupGroup.controlDevices"
            :key="`control-${device.id}`"
            class="rounded-[1.15rem] border border-slate-200 bg-white px-3 py-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-ink">{{ controlTitle(device) }}</p>
                <p class="mt-1 truncate text-xs uppercase tracking-[0.16em] text-slate-400">{{ device.ha_entity_id }}</p>
              </div>
              <button
                v-if="device.control_kind === 'toggle'"
                type="button"
                class="rounded-full px-3 py-1 text-xs font-semibold"
                :class="device.raw_state === 'on' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                :disabled="isPending(device.id)"
                @click="handleToggle(device)"
              >
                {{ device.raw_state === 'on' ? '关闭' : '开启' }}
              </button>
            </div>

            <div v-if="device.supports_brightness" class="mt-3">
              <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
                <span>亮度</span>
                <span class="font-medium text-ink">{{ numericDrafts[brightnessKey(device)] ?? brightnessValue(device) }}%</span>
              </div>
              <input
                :value="numericDrafts[brightnessKey(device)] ?? brightnessValue(device)"
                type="range"
                min="1"
                max="100"
                step="1"
                class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
                :disabled="isPending(device.id)"
                @input="numericDrafts = { ...numericDrafts, [brightnessKey(device)]: Number($event.target.value) }"
                @change="handleBrightnessChange(device, $event)"
              >
            </div>

            <div v-if="device.supports_color_temperature" class="mt-3">
              <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
                <span>色温</span>
                <span class="font-medium text-ink">{{ numericDrafts[colorKey(device)] ?? colorTemperatureValue(device) }}K</span>
              </div>
              <input
                :value="numericDrafts[colorKey(device)] ?? colorTemperatureValue(device)"
                type="range"
                :min="device.min_color_temperature ?? 2700"
                :max="device.max_color_temperature ?? 6500"
                step="50"
                class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
                :disabled="isPending(device.id)"
                @input="numericDrafts = { ...numericDrafts, [colorKey(device)]: Number($event.target.value) }"
                @change="handleColorTemperatureChange(device, $event)"
              >
            </div>

            <div
              v-if="device.control_kind === 'number' || (device.entity_domain === 'climate' && device.target_temperature !== null && device.target_temperature !== undefined)"
              class="mt-3"
            >
              <div class="mb-2 flex items-center justify-between text-sm text-slate-500">
                <span>{{ device.entity_domain === 'climate' ? '目标温度' : '数值控制' }}</span>
                <span class="font-medium text-ink">
                  {{ numericDrafts[numberKey(device)] ?? device.target_temperature ?? device.number_value }}
                  {{ device.unit_of_measurement ?? '' }}
                </span>
              </div>
              <input
                :value="numericDrafts[numberKey(device)] ?? device.target_temperature ?? device.number_value"
                type="range"
                :min="device.min_value ?? 0"
                :max="device.max_value ?? 100"
                :step="device.step ?? 1"
                class="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
                :disabled="isPending(device.id)"
                @input="numericDrafts = { ...numericDrafts, [numberKey(device)]: Number($event.target.value) }"
                @change="handleNumberChange(device, $event)"
              >
            </div>

            <div v-if="selectOptions(device).length" class="mt-3">
              <p class="mb-2 text-sm text-slate-500">模式 / 来源</p>
              <select
                :value="selectDrafts[device.id]"
                class="w-full rounded-[1rem] border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none"
                :disabled="isPending(device.id)"
                @change="handleSelectChange(device, $event)"
              >
                <option v-for="option in selectOptions(device)" :key="option" :value="option">
                  {{ option }}
                </option>
              </select>
            </div>

            <button
              v-if="device.control_kind === 'button'"
              type="button"
              class="mt-3 w-full rounded-[1rem] bg-ink px-4 py-2.5 text-sm font-semibold text-white"
              :disabled="isPending(device.id)"
              @click="handleButtonPress(device)"
            >
              执行动作
            </button>
          </div>
        </div>
      </div>

      <div v-if="isWalkMode && supportsTouchNavigation" class="absolute inset-x-0 bottom-3 z-20 flex items-end justify-between gap-3 px-3 sm:px-4">
        <div
          class="touch-pad"
          @pointerdown.prevent="updatePad('move', $event)"
          @pointermove.prevent="updatePad('move', $event)"
          @pointerup.prevent="resetPad('move')"
          @pointercancel.prevent="resetPad('move')"
        >
          <div class="touch-pad__core" :style="{ transform: `translate(${walkState.moveX * 24}px, ${walkState.moveZ * 24}px)` }" />
        </div>

        <div
          class="touch-pad"
          @pointerdown.prevent="updatePad('look', $event)"
          @pointermove.prevent="updatePad('look', $event)"
          @pointerup.prevent="resetPad('look')"
          @pointercancel.prevent="resetPad('look')"
        >
          <div class="touch-pad__core" :style="{ transform: `translate(${walkState.lookX * 24}px, ${walkState.lookY * 24}px)` }" />
        </div>
      </div>

      <div v-else-if="isWalkMode" class="pointer-events-none absolute bottom-3 left-3 z-20 rounded-[1rem] border border-white/70 bg-white/84 px-4 py-3 text-xs leading-6 text-slate-600 shadow-sm sm:bottom-4 sm:left-4 sm:text-sm">
        <p>`WASD` 或方向键移动</p>
        <p>拖拽空白区域转动视角</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.orbit-shell {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(250, 245, 238, 0.7)),
    radial-gradient(circle at 14% 18%, rgba(255, 244, 214, 0.46), transparent 26%),
    radial-gradient(circle at 86% 12%, rgba(12, 110, 115, 0.16), transparent 22%);
}

.orbit-summary-card {
  border-radius: 1.45rem;
  border: 1px solid rgba(255, 255, 255, 0.84);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(252, 248, 241, 0.74));
  padding: 1rem 1rem 1.05rem;
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.08);
}

.orbit-canvas-shell {
  background:
    radial-gradient(circle at 18% 18%, rgba(28, 42, 63, 0.78), transparent 28%),
    radial-gradient(circle at 82% 16%, rgba(9, 91, 97, 0.42), transparent 22%),
    linear-gradient(180deg, #0f1723 0%, #111d2b 36%, #1f2d38 100%);
}

.orbit-atmosphere {
  pointer-events: none;
  position: absolute;
  inset: 0;
}

.orbit-atmosphere--aurora {
  background:
    radial-gradient(circle at 24% 24%, rgba(103, 232, 249, 0.14), transparent 16%),
    radial-gradient(circle at 78% 18%, rgba(253, 224, 71, 0.1), transparent 18%),
    radial-gradient(circle at 50% 82%, rgba(244, 114, 182, 0.08), transparent 22%);
  animation: orbit-drift 12s ease-in-out infinite alternate;
}

.orbit-atmosphere--grid {
  opacity: 0.18;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.15) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.9), transparent 82%);
}

.orbit-atmosphere--vignette {
  background:
    linear-gradient(180deg, rgba(2, 6, 23, 0.18), rgba(2, 6, 23, 0.04) 30%, rgba(2, 6, 23, 0.42)),
    radial-gradient(circle at 50% 50%, transparent 54%, rgba(2, 6, 23, 0.48) 100%);
}

.orbit-hud-panel,
.orbit-side-panel,
.orbit-popup-panel,
.orbit-focus-panel {
  border-radius: 1.45rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background:
    linear-gradient(180deg, rgba(7, 14, 24, 0.82), rgba(11, 22, 35, 0.74));
  box-shadow: 0 26px 60px rgba(2, 6, 23, 0.28);
  backdrop-filter: blur(20px);
}

.orbit-frame-corner {
  position: absolute;
  z-index: 5;
  height: 2.8rem;
  width: 2.8rem;
  border-color: rgba(125, 211, 252, 0.35);
  opacity: 0.9;
}

.orbit-frame-corner--tl {
  left: 1rem;
  top: 1rem;
  border-left: 1px solid rgba(125, 211, 252, 0.35);
  border-top: 1px solid rgba(125, 211, 252, 0.35);
  border-top-left-radius: 1rem;
}

.orbit-frame-corner--tr {
  right: 1rem;
  top: 1rem;
  border-right: 1px solid rgba(125, 211, 252, 0.35);
  border-top: 1px solid rgba(125, 211, 252, 0.35);
  border-top-right-radius: 1rem;
}

.orbit-frame-corner--bl {
  bottom: 1rem;
  left: 1rem;
  border-left: 1px solid rgba(125, 211, 252, 0.35);
  border-bottom: 1px solid rgba(125, 211, 252, 0.35);
  border-bottom-left-radius: 1rem;
}

.orbit-frame-corner--br {
  bottom: 1rem;
  right: 1rem;
  border-right: 1px solid rgba(125, 211, 252, 0.35);
  border-bottom: 1px solid rgba(125, 211, 252, 0.35);
  border-bottom-right-radius: 1rem;
}

.orbit-reticle {
  pointer-events: none;
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 6;
  height: 7rem;
  width: 7rem;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  border: 1px solid rgba(125, 211, 252, 0.12);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 0 40px rgba(34, 211, 238, 0.08);
}

.orbit-reticle::before,
.orbit-reticle::after,
.orbit-reticle span::before,
.orbit-reticle span::after {
  content: '';
  position: absolute;
  background: rgba(125, 211, 252, 0.44);
}

.orbit-reticle::before,
.orbit-reticle::after {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.orbit-reticle::before {
  height: 1px;
  width: 7.8rem;
}

.orbit-reticle::after {
  height: 7.8rem;
  width: 1px;
}

.orbit-reticle span::before {
  inset: 0.55rem;
  border-radius: 999px;
  border: 1px dashed rgba(250, 204, 21, 0.26);
  background: transparent;
}

.orbit-reticle span::after {
  left: 50%;
  top: 50%;
  height: 0.7rem;
  width: 0.7rem;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  background: rgba(250, 204, 21, 0.85);
  box-shadow: 0 0 22px rgba(250, 204, 21, 0.42);
}

.orbit-legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.72);
  padding: 0.58rem 0.9rem;
  color: rgb(71 85 105);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(16px);
}

.orbit-legend-chip__label {
  font-size: 0.65rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(100 116 139);
}

.orbit-legend-chip__value {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgb(15 23 42);
}

.orbit-room-rail {
  display: flex;
  gap: 0.85rem;
  overflow-x: auto;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(180deg, rgba(7, 14, 24, 0.82), rgba(10, 18, 31, 0.72));
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.24);
  backdrop-filter: blur(18px);
}

.orbit-room-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border-width: 1px;
  padding: 0.65rem 1rem;
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.22);
  backdrop-filter: blur(16px);
}

.orbit-mode-badge {
  border: 1px solid rgba(94, 234, 212, 0.22);
  background: rgba(15, 118, 110, 0.14);
  color: rgba(204, 251, 241, 0.92);
}

.orbit-mini-stat,
.orbit-focus-metric {
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.orbit-focus-metric {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.65rem 0.55rem;
}

.orbit-focus-metric__label {
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}

.orbit-focus-metric__value {
  font-size: 0.92rem;
  font-weight: 700;
  color: rgba(248, 250, 252, 0.96);
}

.orbit-floating-note {
  border-radius: 1.2rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background:
    linear-gradient(180deg, rgba(8, 15, 26, 0.84), rgba(10, 18, 31, 0.76));
  color: rgba(226, 232, 240, 0.92);
  padding: 0.9rem 1rem;
  box-shadow: 0 20px 44px rgba(2, 6, 23, 0.24);
  backdrop-filter: blur(18px);
}

.orbit-loading-pill {
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(7, 14, 24, 0.88);
  color: white;
  font-size: 0.86rem;
  font-weight: 600;
  padding: 0.75rem 1.15rem;
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.22);
}

.orbit-popup-panel {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 249, 251, 0.92));
}

.orbit-popup-card {
  border-radius: 1rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(248, 250, 252, 0.84);
}

.touch-pad {
  position: relative;
  height: 5.5rem;
  width: 5.5rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background:
    radial-gradient(circle at 30% 30%, rgba(15, 23, 42, 0.92), rgba(15, 23, 42, 0.66));
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 44px rgba(2, 6, 23, 0.34);
}

.touch-pad::before {
  content: '';
  position: absolute;
  inset: 1rem;
  border-radius: 9999px;
  border: 1px dashed rgba(125, 211, 252, 0.22);
}

.touch-pad__core {
  position: absolute;
  left: 50%;
  top: 50%;
  height: 2rem;
  width: 2rem;
  border-radius: 9999px;
  background: linear-gradient(180deg, rgba(12, 110, 115, 0.94), rgba(15, 23, 42, 0.9));
  transform: translate(-50%, -50%);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.28);
}

@keyframes orbit-drift {
  from {
    transform: translate3d(-1.5%, -1%, 0) scale(1);
  }

  to {
    transform: translate3d(1.8%, 1.2%, 0) scale(1.04);
  }
}

@media (min-width: 640px) {
  .touch-pad {
    height: 6.5rem;
    width: 6.5rem;
  }
}
</style>
