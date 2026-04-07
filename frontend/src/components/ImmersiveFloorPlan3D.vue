<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
})

const emit = defineEmits(['select-room'])

const smartHomeStore = useSmartHomeStore()
const containerRef = ref(null)
const popupGroupKey = ref('')
const popupCoordinates = ref({ left: 0, top: 0, visible: false })
const numericDrafts = ref({})
const selectDrafts = ref({})

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
  loader: new GLTFLoader(),
  loadToken: 0,
}

const pressState = reactive({
  groupKey: '',
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
const sceneZone = computed(() => props.scene?.zone ?? null)
const sceneAnalysis = computed(() => props.scene?.analysis ?? null)
const sceneRooms = computed(() => props.scene?.rooms ?? [])
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
const popupStyle = computed(() => {
  if (!popupCoordinates.value.visible) {
    return { display: 'none' }
  }

  return {
    left: `${popupCoordinates.value.left}px`,
    top: `${popupCoordinates.value.top}px`,
    transform: 'translate(-50%, calc(-100% - 18px))',
  }
})

const roamStats = computed(() => ({
  rooms: sceneRooms.value.length,
  markers: groupedMarkers.value.length,
  walls: sceneAnalysis.value?.wall_segments?.length ?? 0,
  openings: sceneAnalysis.value?.openings?.length ?? 0,
  furniture: sceneAnalysis.value?.furniture_candidates?.length ?? 0,
}))

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
  () => [groupedMarkers.value, sceneAnalysis.value, sceneModelUrl.value, props.showHeatLayer, props.showDevices],
  () => {
    rebuildScene()
  },
  { deep: true },
)

watch(
  () => [props.selectedRoomId, props.cameraMode],
  () => {
    syncCameraMode()
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
  const active = group.devices.some((device) => ['on', 'online', 'playing', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only', 'auto'].includes(`${device.raw_state ?? device.current_status ?? ''}`.toLowerCase()))

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
  renderer.domElement.className = 'absolute inset-0 h-full w-full'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#edf1ec')

  const camera = new THREE.PerspectiveCamera(54, container.clientWidth / container.clientHeight, 0.1, 5000)
  camera.position.set(0, 240, 280)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 90
  controls.maxDistance = 780
  controls.maxPolarAngle = Math.PI * 0.49
  controls.target.set(0, 0, 0)

  const ambientLight = new THREE.AmbientLight('#ffffff', 1.2)
  const sunLight = new THREE.DirectionalLight('#fff8dc', 1.05)
  sunLight.position.set(280, 360, 180)
  const fillLight = new THREE.DirectionalLight('#dbeafe', 0.45)
  fillLight.position.set(-180, 180, -140)
  scene.add(ambientLight, sunLight, fillLight)

  sceneRefs.renderer = renderer
  sceneRefs.scene = scene
  sceneRefs.camera = camera
  sceneRefs.controls = controls

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

  sceneRefs.loadToken += 1
  disposeDynamicScene()
  sceneRefs.interactiveMeshes = []
  sceneRefs.markerByKey.clear()

  const root = new THREE.Group()
  root.userData.dynamic = true

  root.add(buildFloorMesh())

  const analysis = sceneAnalysis.value ?? {}
  const wallSegments = Array.isArray(analysis.wall_segments) ? analysis.wall_segments : []
  const openings = Array.isArray(analysis.openings) ? analysis.openings : []
  const furnitureCandidates = Array.isArray(analysis.furniture_candidates) ? analysis.furniture_candidates : []

  if (wallSegments.length > 0) {
    wallSegments.forEach((segment) => {
      root.add(buildWallMesh(segment))
    })
  } else {
    sceneRooms.value.forEach((room) => root.add(buildRoomShell(room)))
  }

  openings.forEach((opening) => root.add(buildOpeningMesh(opening)))
  furnitureCandidates.forEach((item) => root.add(buildFurnitureMesh(item)))
  sceneRooms.value.forEach((room) => root.add(buildRoomPlate(room)))

  if (props.showDevices) {
    groupedMarkers.value.forEach((marker) => root.add(buildMarkerMesh(marker)))
  }

  scene.add(root)
  loadImportedModel(root, sceneRefs.loadToken)
  syncCameraMode()
}

function buildFloorMesh() {
  const floorGroup = new THREE.Group()
  floorGroup.userData.dynamic = true

  const floorGeometry = new THREE.PlaneGeometry(planWidth.value * WORLD_SCALE, planHeight.value * WORLD_SCALE)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: '#f9f5ee',
    roughness: 0.96,
    metalness: 0.02,
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

  const grid = new THREE.GridHelper(planWidth.value * WORLD_SCALE, 18, '#94a3b8', '#d6ddd7')
  grid.position.y = 0.06
  grid.material.opacity = 0.28
  grid.material.transparent = true
  floorGroup.add(grid)
  return floorGroup
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
  mesh.position.set(
    projectX((room.plan_x ?? 0) + ((room.plan_width ?? 120) / 2)),
    0.14,
    projectZ((room.plan_y ?? 0) + ((room.plan_height ?? 90) / 2)),
  )
  mesh.rotation.y = THREE.MathUtils.degToRad(room.plan_rotation ?? 0)
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
  mesh.position.set(
    projectX((room.plan_x ?? 0) + ((room.plan_width ?? 120) / 2)),
    2.7,
    projectZ((room.plan_y ?? 0) + ((room.plan_height ?? 90) / 2)),
  )
  mesh.rotation.y = THREE.MathUtils.degToRad(room.plan_rotation ?? 0)
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

  markerGroup.add(base, orb, halo)
  markerGroup.position.set(
    projectX(marker.position.x),
    6.6 + marker.position.z * 9,
    projectZ(marker.position.y),
  )

  sceneRefs.interactiveMeshes.push(base, orb)
  sceneRefs.markerByKey.set(marker.key, markerGroup)
  return markerGroup
}

function loadImportedModel(root, loadToken) {
  if (!sceneModelUrl.value) {
    return
  }

  sceneRefs.loader.load(
    sceneModelUrl.value,
    (gltf) => {
      if (loadToken !== sceneRefs.loadToken) {
        disposeObject(gltf.scene)
        return
      }

      const model = gltf.scene
      model.userData.dynamic = true

      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const fitScale = Math.min(
        (planWidth.value * WORLD_SCALE) / Math.max(size.x, 1),
        (planHeight.value * WORLD_SCALE) / Math.max(size.z || size.y, 1),
      )
      const extraScale = Number(sceneZone.value?.three_d_model_scale ?? 1)
      const appliedScale = fitScale * extraScale
      model.scale.setScalar(appliedScale)

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

  const currentRoom = sceneRooms.value.find((room) => room.id === props.selectedRoomId) ?? sceneRooms.value[0] ?? null
  if (!currentRoom) {
    return
  }

  const targetX = projectX((currentRoom.plan_x ?? 0) + ((currentRoom.plan_width ?? 120) / 2))
  const targetZ = projectZ((currentRoom.plan_y ?? 0) + ((currentRoom.plan_height ?? 90) / 2))
  controls.target.set(targetX, 0, targetZ)
  camera.position.set(targetX + 110, 240, targetZ + 160)
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

  popupCoordinates.value = {
    left: Math.min(Math.max(left, 154), container.clientWidth - 154),
    top: Math.min(Math.max(top, 128), container.clientHeight - 24),
    visible,
  }
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

function pickMarker(event) {
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
  const root = intersections[0]?.object?.parent
  if (!root?.userData?.groupKey) {
    return null
  }
  return groupedMarkers.value.find((group) => group.key === root.userData.groupKey) ?? null
}

function handlePointerDown(event) {
  const group = pickMarker(event)
  if (group) {
    pressState.groupKey = group.key
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

  closePopup()
  clearLongPressTimer()
  pressState.groupKey = ''

  if (!isWalkMode.value) {
    return
  }

  walkState.draggingLook = true
  walkState.pointerId = event.pointerId
  walkState.lastX = event.clientX
  walkState.lastY = event.clientY
}

function handlePointerMove(event) {
  if (pressState.groupKey) {
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
  const group = pickMarker(event)
  const sameTarget = group && group.key === pressState.groupKey
  const didLongPress = pressState.longPressed
  clearLongPressTimer()

  if (sameTarget && !didLongPress) {
    handlePrimaryMarkerAction(group)
  }

  pressState.groupKey = ''
  pressState.longPressed = false

  if (walkState.pointerId === event.pointerId) {
    walkState.draggingLook = false
    walkState.pointerId = -1
  }
}

function handlePointerCancel(event) {
  clearLongPressTimer()
  pressState.groupKey = ''
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
  emit('select-room', group.room.id)
}

function closePopup() {
  popupGroupKey.value = ''
}

async function handlePrimaryMarkerAction(group) {
  emit('select-room', group.room.id)

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
  if (!isWalkMode.value) {
    return
  }

  const code = event.code.toLowerCase()
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
  <section class="glass-soft rounded-[1.7rem] p-4 sm:p-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-[11px] uppercase tracking-[0.28em] text-lagoon">Immersive Spatial UI</p>
        <h3 class="font-display mt-3 text-[1.8rem] leading-none text-ink sm:text-[2.15rem]">
          {{ isWalkMode ? '第一人称 3D 漫游' : '真 3D 轨道视图' }}
        </h3>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
          {{ hasImportedModel ? '当前已叠加导入的 3D 模型，可在模型与结构层上继续控制设备。' : '当前先使用户型结构层生成墙体、门洞和家具代理体，后续导入 GLB/GLTF 模型会自动叠加。' }}
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-4">
        <div class="rounded-[1.2rem] border border-slate-200 bg-white/82 px-4 py-3">
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">房间</p>
          <p class="mt-2 text-xl font-semibold text-ink">{{ roamStats.rooms }}</p>
        </div>
        <div class="rounded-[1.2rem] border border-slate-200 bg-white/82 px-4 py-3">
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">墙体</p>
          <p class="mt-2 text-xl font-semibold text-ink">{{ roamStats.walls }}</p>
        </div>
        <div class="rounded-[1.2rem] border border-slate-200 bg-white/82 px-4 py-3">
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">门洞</p>
          <p class="mt-2 text-xl font-semibold text-ink">{{ roamStats.openings }}</p>
        </div>
        <div class="rounded-[1.2rem] border border-slate-200 bg-white/82 px-4 py-3">
          <p class="text-[10px] uppercase tracking-[0.18em] text-slate-400">设备节点</p>
          <p class="mt-2 text-xl font-semibold text-ink">{{ roamStats.markers }}</p>
        </div>
      </div>
    </div>

    <div
      ref="containerRef"
      class="relative mt-5 h-[33rem] overflow-hidden rounded-[1.8rem] border border-white/70 bg-[#eef2ef] shadow-inner sm:h-[39rem] xl:h-[42rem]"
    >
      <div class="pointer-events-none absolute left-3 top-3 z-10 max-w-sm rounded-[1.1rem] border border-white/70 bg-white/84 px-4 py-3 text-xs leading-6 text-slate-600 shadow-sm sm:left-4 sm:top-4 sm:text-sm">
        <p>{{ isWalkMode ? '桌面端可用 WASD / 方向键移动，拖拽空白区域转头；手机和平板可直接使用底部触控摇杆。' : '拖拽旋转、双指或滚轮缩放。点灯默认开关，长按灯光弹出亮度与色温。' }}</p>
      </div>

      <div class="pointer-events-none absolute right-3 top-3 z-10 rounded-[1.1rem] border border-white/70 bg-white/84 px-4 py-3 text-xs leading-6 text-slate-600 shadow-sm sm:right-4 sm:top-4 sm:text-sm">
        <p>结构层：墙体 / 门洞 / 家具候选</p>
        <p>模型层：{{ hasImportedModel ? '已导入 3D 资产' : '等待导入 GLB / GLTF' }}</p>
        <p>设备层：点按直控，长按展开高级控制</p>
      </div>

      <div
        v-if="spatialLoading"
        class="absolute inset-0 z-30 flex items-center justify-center bg-white/42 backdrop-blur-sm"
      >
        <div class="rounded-full border border-white/80 bg-white/88 px-4 py-2 text-sm text-slate-600 shadow-sm">
          正在同步沉浸式空间…
        </div>
      </div>

      <div
        v-if="activePopupGroup"
        class="absolute z-40 w-[19rem] max-w-[calc(100%-1rem)] rounded-[1.45rem] border border-white/80 bg-white/92 p-4 shadow-[0_30px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl sm:w-[21rem]"
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
                class="rounded-[1rem] border border-slate-200 bg-slate-50/90 px-3 py-3"
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
.touch-pad {
  position: relative;
  height: 5.5rem;
  width: 5.5rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.62));
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
}

.touch-pad::before {
  content: '';
  position: absolute;
  inset: 1rem;
  border-radius: 9999px;
  border: 1px dashed rgba(51, 65, 85, 0.22);
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

@media (min-width: 640px) {
  .touch-pad {
    height: 6.5rem;
    width: 6.5rem;
  }
}
</style>
