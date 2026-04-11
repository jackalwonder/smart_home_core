# smartHome Store README

## smartHome Store Contract

`smartHome` store 采用的是 `entity + selector` 架构：
实体层负责存真值，selector 负责组装 UI 读取模型，组件不直接拼树、不维护第二份事实源。

## 核心原则

### 1. 单一事实源

当前前端真值层只有 6 个核心结构：

- `roomsById`
- `devicesById`
- `roomDeviceIdsByRoomId`
- `sceneMeta`
- `sceneLayoutByRoomId`
- `sceneDeviceLayoutByDeviceId`

这些结构是 store 内唯一允许长期持有的业务真值。

### 2. Selector 是唯一读取入口

当前主读取层是：

- `selectedRoom`
- `selectRoomViewById()`
- `selectDeviceViewById()`
- `dashboardRoomViews`
- `spatialRoomViews`

UI 必须通过这些 selector 读取 room/device view，而不是在组件里自行 merge。

### 3. Realtime 是单向流

当前 realtime 主链是：

`websocket patch -> entity 写入 -> selector 派生 -> UI 更新`

realtime patch 不直接驱动组件，也不再写旧的 room tree / spatial scene tree。

### 4. Spatial 与 Device 解耦

房间/设备的“业务状态”和“空间布局”是分开的：

- 业务状态放在 `roomsById` / `devicesById`
- 空间布局放在 `sceneLayoutByRoomId` / `sceneDeviceLayoutByDeviceId`

selector 负责在读取时把它们拼成 room/device view。

### 5. Draft 只是 Overlay

spatial 编辑链路里，`draft` 只是前端 overlay，不是 persisted truth。

不要把 draft 回写成新的常驻事实源。

## 数据结构说明

### Entity 层

#### `roomsById`

房间实体真值，存放房间基础信息与非派生字段。

#### `devicesById`

设备实体真值，设备状态更新的主写入目标。  
设备状态、控制能力、实时 patch 合并都应收口到这里。

#### `roomDeviceIdsByRoomId`

房间与设备的归属索引。  
它定义“某房间当前有哪些设备”，而不是 selector 从设备表里临时扫出来的结果。

### Spatial 层

#### `sceneMeta`

空间场景元信息，例如 `zone`、`analysis`。

#### `sceneLayoutByRoomId`

房间布局真值，例如 `plan_x`、`plan_y`、`plan_width`、`plan_height`、`plan_rotation`。

#### `sceneDeviceLayoutByDeviceId`

设备空间布局真值，例如 `plan_x`、`plan_y`、`plan_z`、`plan_rotation`、`position`。

### Selector 层

selector 负责把 entity 与 layout 合成为最终 UI view：

```js
roomView = roomEntity + roomSceneLayout + deviceViews[]
deviceView = deviceEntity + deviceSceneLayout + resolvedRoomId
```

这里的 room/device view 是读取模型，不是新的常驻事实源。

## 已删除的兼容层

以下兼容 mirror 已经删除，禁止恢复：

- `rooms`
- `spatialScene`
- `syncLegacyDetailRoomDevice()`
- `syncLegacySpatialDevice()`
- `syncLegacyDeviceViews()`
- legacy `rooms` / `spatial-scene` cache fallback

### 为什么要去掉 mirror

因为 mirror 会制造第二份可写树，带来：

- 状态不同步
- patch 写多处
- 组件读取路径分裂
- 修改时很难判断谁才是真值

当前架构已经明确收口到 entity + selector，不应再回退。

## UI 读取规则

以下组件主读取已切到 selector-backed 数据：

- `App.vue`
- `FloorPlanStudio.vue`
- `RoomView.vue`
- `RoomControlDrawer.vue`

规则只有一条：组件拿 view，不拿半成品。

不要在组件里再做这类事情：

- 用 `roomsById` 手动拼 `devicesById`
- 用 `devicesById` 自己扫出某房间设备
- 在组件里拼接 spatial layout
- 为了“方便渲染”重新生成一棵局部 room tree 并长期保存

### 为什么 selector 不能下沉到组件

因为 selector 是架构边界的一部分。  
如果组件自己 merge，读取逻辑会重新分散，最终又回到“多事实源 + 多套读取口径”。

## 开发约束

### 明确禁止

- 禁止重新引入 `rooms[]` / `spatialScene[]` 作为常驻业务状态
- 禁止在组件内自行 merge room/device/layout 数据
- 禁止 patch “猜字段后多处写入”
- 禁止多路径写 device 真值
- 禁止把 selector 结果回存为新的真值层
- 禁止恢复 legacy cache fallback

### 明确要求

- UI 必须通过 selector 取数
- 设备状态变化必须优先写 `devicesById`
- 房间设备归属必须通过 `roomDeviceIdsByRoomId` 维护
- 空间布局必须写 `sceneLayoutByRoomId` / `sceneDeviceLayoutByDeviceId`
- hydrate 只能依赖 entity cache 与 scene cache

## 关键函数 / 契约说明

### `setRoomDeviceIds(roomId, devices)`

这是一个“完整列表写入”契约。

调用方必须把该房间当前完整设备列表传进来，而不是增量片段。  
store 会按“这个列表就是该房间的当前全集”去刷新归属索引。

如果未来后端接口改成“只返回增量”，这里不能直接复用，必须先调整契约。

### Realtime patch 只能写 entity

当前 realtime patch 的正确路径是：

```txt
device_state_updated v2
-> normalize patch
-> merge 到 devicesById
-> selector 自动反映到 room/device view
```

不要在 realtime 里直接改 selector 结果，也不要重建旧树。

### `hydrateFromCache()`

`hydrateFromCache()` 只恢复：

- `catalogEntities`
- `sceneEntities`
- `uiPreferences`

它不再依赖 legacy `rooms` / `spatial-scene` cache fallback。  
如果缓存恢复后 UI 读不到数据，应检查 entity cache 是否正确，而不是加回旧 cache。

## Spatial 分层说明

当前 spatial 结构是：

- `persisted`
- `derived`
- `effective_layout`
- `draft overlay`

维护要求：

- `persisted` 是持久化来源
- `derived` 是由已有事实推导出的数据
- `effective_layout` 是当前渲染应采用的结果
- `draft overlay` 只服务编辑态，不应变成新的真值层

## 新功能应该改哪里

### 新增设备状态字段

优先改这些位置：

- `deviceAdapter`
- `devicesById` 写入路径
- `selectDeviceViewById()`
- 必要时补对应测试

### 新增房间字段

优先改这些位置：

- `roomAdapter`
- `roomsById`
- `selectRoomViewById()`

### 新增空间布局字段

优先改这些位置：

- `extractRoomSceneLayout()` 或 `extractSceneDeviceLayout()`
- `sceneLayoutByRoomId` 或 `sceneDeviceLayoutByDeviceId`
- selector 读取逻辑

### 不应该碰的地方

- 不要恢复 mirror
- 不要让组件自行拼 view
- 不要让 realtime 写多份状态
- 不要引入第二份 cache schema 作为兼容长期保留

## 测试护栏

当前最重要的 3 个测试是：

- `frontend/src/stores/__tests__/smartHome.selectors.spec.js`
- `frontend/src/stores/__tests__/smartHome.realtime-v2.spec.js`
- `frontend/src/stores/__tests__/smartHome.cache-hydrate.spec.js`

它们分别护住：

- `entity -> selector`
- `realtime patch -> entity -> selector`
- `entity cache hydrate -> selector`

如果改动 touching `smartHome.js`，优先确认这 3 条主链没有被破坏。

## 给未来开发者的 Checklist

- 改数据结构前，先判断这是 entity、layout 还是 selector 问题
- 如果是设备状态变化，只改 `devicesById` 主链
- 如果是房间设备归属变化，同时确认 `roomDeviceIdsByRoomId`
- 如果是空间位置变化，只改 layout 层
- 不要在组件里拼 room/device/layout
- 改完后至少运行：

```bash
npm run test
npm run build
```

## 相关文件

- `frontend/src/stores/smartHome.js`
- `frontend/src/stores/__tests__/smartHome.selectors.spec.js`
- `frontend/src/stores/__tests__/smartHome.realtime-v2.spec.js`
- `frontend/src/stores/__tests__/smartHome.cache-hydrate.spec.js`
