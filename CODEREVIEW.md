# Code Review

## 架构总评 (Executive Summary)

当前架构在“高频状态同步”场景下存在一条完整的全栈脆弱链路：

`Home Assistant WS 高频事件/积压 -> 后端串行落库与错误补偿 -> 前端逐条写 Pinia -> deep watch 全量写 localStorage -> 3D 组件深监听重建场景 -> WebGL 资源释放不完整`

结果不是单点退化，而是级联崩溃：状态越积越旧，主线程越写越卡，Three.js 越渲越重，显存持续泄漏。当前系统缺少“事件合并、节流、局部更新、严格契约、完整释放”这五道防线。

## 高危风险与待办清单 (Action Items)

### P0

1. `backend/app/services/home_assistant_ws.py`
   将“数据库写失败”和“未知实体发现”从同一 `False` 分支拆开。当前实现会把 DB 抖动误判成新实体，触发自动导入风暴。

2. `backend/app/services/spatial_service.py`
   停止在请求路径中直接用瞬时 `get_states()` 做最终空间仲裁。当前算法对并发语音请求不安全，存在误判房间、误控设备风险。

3. `frontend/src/stores/smartHome.js`
   对 `device_state_updated` 引入按 `entity_id/device_id` 合并的批处理队列，禁止逐条立即写 Pinia。否则后端 WS 积压一旦追平，前端必然进入 re-render 风暴。

### P1

1. `backend/app/services/home_assistant_ws.py`
   将 WS reader 与 DB 写入解耦，改成“接收 -> 有界队列 -> worker 合并更新”。当前串行消费会导致状态同步积压。

2. `backend/app/main.py`
   移除启动期 `create_all()` 与运行时 schema 修补。Schema 变更必须迁移到显式 migration 流程，避免多副本启动竞争。

3. `backend/app/models.py`
   为 `PendingIntent` 增加“单用户唯一活跃记录”约束，并把“读取并失活”做成事务内原子操作，消除补全链路竞态。

4. `frontend/src/stores/smartHome.js`
   将两个 `deep watch` 改成节流后的快照持久化；禁止在每个细粒度 patch 后整包 `JSON.stringify` 写 `localStorage`。

5. `frontend/src/components/ImmersiveFloorPlan3D.vue`
   把设备状态变化与整场景 `rebuildScene()` 解耦。高频状态更新只能做 marker/material 局部更新，不能重建整个 scene graph。

6. `frontend/src/components/ImmersiveFloorPlan3D.vue`
   完整释放 `geometry/material/texture/renderLists`，并为模型/纹理加载增加版本令牌，防止旧资源回填与 GPU 泄漏。

7. `frontend/src/adapters/*.js`
   适配层从“吞错归一化”升级为“显式校验 + 降级兜底 + 警告日志”。缺字段时不能静默伪造合法对象。

## 核心修复代码 (Critical Patches)

### 1. Frontend: 合并 WS patch，批量写 Pinia

```js
// frontend/src/stores/smartHome.js

const realtimePatchQueue = new Map()
let realtimeFlushTimer = null

function enqueueRealtimePatch(devicePatch, options = {}) {
  const normalized = normalizeDevicePatchV2(devicePatch)
  if (!hasValue(normalized.id)) {
    scheduleCompensationRefresh(60)
    return
  }

  const previous = realtimePatchQueue.get(normalized.id) ?? {}
  realtimePatchQueue.set(normalized.id, {
    ...previous,
    ...normalized,
    id: normalized.id,
  })

  if (options.seq !== null && options.seq !== undefined) {
    if (shouldCompensateForSeq(Number(options.seq))) {
      scheduleCompensationRefresh(60)
    }
    rememberRealtimeSeq(Number(options.seq))
  }

  if (realtimeFlushTimer !== null) {
    return
  }

  realtimeFlushTimer = window.setTimeout(() => {
    realtimeFlushTimer = null
    const batch = [...realtimePatchQueue.values()]
    realtimePatchQueue.clear()

    batch.forEach((patch) => {
      const realtimeUpdate = prepareRealtimeDevicePatch(patch)
      const nextDevice = applyDeviceEntityPatch(realtimeUpdate.devicePatch)
      if (!nextDevice) {
        scheduleCompensationRefresh(60)
        return
      }

      if (
        realtimeUpdate.movedToUnknownDetailRoom
        || !hasValue(nextDevice.room_id)
        || !hasValue(roomsById.value[nextDevice.room_id])
      ) {
        scheduleCompensationRefresh(60)
      }
    })
  }, 40)
}

function handleRealtimePatchV2(message) {
  enqueueRealtimePatch(message.device ?? {}, { seq: Number(message.seq) })
}

function handleRealtimeMessage(message) {
  if (message.type === 'catalog_updated') {
    scheduleCatalogRefresh()
    return
  }

  if (message.type === 'device_state_updated' && message.devicePatch) {
    enqueueRealtimePatch(message.devicePatch)
  }
}
```

### 2. Frontend: 节流 localStorage 持久化

```js
// frontend/src/stores/smartHome.js

function throttle(fn, wait = 300) {
  let timer = null
  let pendingArgs = null

  return (...args) => {
    pendingArgs = args
    if (timer) return

    timer = window.setTimeout(() => {
      timer = null
      fn(...pendingArgs)
      pendingArgs = null
    }, wait)
  }
}

const persistCatalogCache = throttle(() => {
  const cache = buildCatalogEntityCache()
  if (hasCatalogEntityCache(cache)) {
    writeCache(CACHE_KEYS.catalogEntities, cache)
  } else {
    removeCache(CACHE_KEYS.catalogEntities)
  }
}, 400)

const persistSceneCache = throttle(() => {
  const cache = buildSceneEntityCache()
  if (hasSceneEntityCache(cache)) {
    writeCache(CACHE_KEYS.sceneEntities, cache)
  } else {
    removeCache(CACHE_KEYS.sceneEntities)
  }
}, 400)

watch([roomsById, devicesById, roomDeviceIdsByRoomId], persistCatalogCache, { deep: true })
watch([sceneMeta, sceneLayoutByRoomId, sceneDeviceLayoutByDeviceId], persistSceneCache, { deep: true })
```

### 3. Frontend: 完整释放 Three.js 纹理与渲染器资源

```js
// frontend/src/components/ImmersiveFloorPlan3D.vue

const MATERIAL_MAP_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
]

function disposeMaterial(material) {
  MATERIAL_MAP_KEYS.forEach((key) => {
    const texture = material?.[key]
    if (texture?.dispose) {
      texture.dispose()
      material[key] = null
    }
  })
  material?.dispose?.()
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

  sceneRefs.controls?.dispose()
  clearImportedModel()
  disposeDynamicScene()

  renderer?.renderLists?.dispose?.()
  renderer?.dispose()
  renderer?.forceContextLoss?.()

  if (renderer?.domElement?.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement)
  }
}
```

### 4. Frontend: 给纹理/模型加载加版本令牌

```js
// frontend/src/components/ImmersiveFloorPlan3D.vue

sceneRefs.planTextureToken = 0

function loadPlanTexture(url, onApply) {
  const loader = new THREE.TextureLoader()
  sceneRefs.planTextureToken += 1
  const token = sceneRefs.planTextureToken

  loader.load(url, (texture) => {
    if (token !== sceneRefs.planTextureToken) {
      texture.dispose()
      return
    }
    onApply(texture)
  })
}

function clearImportedModel() {
  sceneRefs.modelLoadToken += 1
  sceneRefs.planTextureToken += 1

  const root = sceneRefs.modelRoot
  if (!root) return

  for (const child of [...root.children]) {
    root.remove(child)
    disposeObject(child)
  }
}
```

### 5. Backend: 区分 `missing` 与 `failed`，阻断错误自动导入

```python
# backend/app/services/home_assistant_ws.py

from enum import Enum


class DeviceUpdateResult(str, Enum):
    UPDATED = "updated"
    MISSING = "missing"
    FAILED = "failed"


def _update_device_state(self, entity_id: str, status: DeviceStatus, raw_state: str) -> DeviceUpdateResult:
    session = SessionLocal()
    try:
        device = session.scalar(select(Device).where(Device.ha_entity_id == entity_id))
        if device is None:
            return DeviceUpdateResult.MISSING

        device.current_status = status
        session.commit()
        session.refresh(device)
        device_realtime_hub.publish_threadsafe(build_device_update_event(device, raw_state=raw_state))
        return DeviceUpdateResult.UPDATED
    except Exception:
        session.rollback()
        logger.exception("Failed to update device state for entity %s.", entity_id)
        return DeviceUpdateResult.FAILED
    finally:
        session.close()


async def _handle_state_changed(self, data: dict[str, Any]) -> None:
    entity_id = data.get("entity_id")
    new_state = data.get("new_state") or {}
    raw_state = new_state.get("state")
    if not entity_id or raw_state is None:
        return

    mapped_status = self._map_home_assistant_state(raw_state)
    result = await asyncio.to_thread(self._update_device_state, entity_id, mapped_status, raw_state)

    if result is DeviceUpdateResult.UPDATED:
        return
    if result is DeviceUpdateResult.FAILED:
        return

    await self._attempt_auto_import(entity_id, mapped_status)
```

### 6. Backend: 用 presence 快照锁做空间仲裁

```python
# backend/app/services/spatial_service.py

import asyncio
import time

_presence_lock = asyncio.Lock()
_presence_snapshot: dict[str, tuple[str, float]] = {}
PRESENCE_TTL_SECONDS = 8.0


async def remember_presence(entity_id: str, room_name: str) -> None:
    async with _presence_lock:
        _presence_snapshot[entity_id] = (room_name, time.monotonic())


async def get_contextual_room(source_device: str) -> str:
    source_device_name = source_device.strip()

    mapped_room = STATIC_DEVICE_ROOM_MAP.get(source_device_name)
    if mapped_room is not None:
        return mapped_room

    now = time.monotonic()
    async with _presence_lock:
        active_rooms = [
            room_name
            for room_name, seen_at in _presence_snapshot.values()
            if now - seen_at <= PRESENCE_TTL_SECONDS
        ]

    distinct_rooms = sorted(set(active_rooms))
    if len(distinct_rooms) != 1:
        return AMBIGUOUS_ROOM

    return distinct_rooms[0]
```

### 7. Backend: 为 `PendingIntent` 增加唯一活跃约束

```python
# backend/app/models.py

from sqlalchemy import Index
from sqlalchemy.sql import expression


class PendingIntent(Base):
    __tablename__ = "pending_intents"
    __table_args__ = (
        Index(
            "uq_pending_intents_active_user",
            "user_id",
            unique=True,
            postgresql_where=expression.column("is_active").is_(True),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), index=True)
    original_command: Mapped[str] = mapped_column(Text())
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=func.now())
```

## 结论

当前系统最危险的不是单个 bug，而是“后端补偿失真 + 前端逐条响应 + 渲染层全量重建”共同组成的放大器。修复顺序必须先切断 P0 链路，再治理 P1 的持久化、渲染和契约问题。
