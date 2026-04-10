# 前端架构与响应式机制指南

本文档面向前端开发者，说明当前 Vue 3 应用的核心架构、状态流转方式、实时同步机制、错误处理策略，以及 2D / 3D 户型能力如何复用同一份响应式数据源。

当前前端的设计目标非常明确：

- 以 `Pinia` 维护单一事实源
- 以 `WebSocket` 提供设备状态的实时补丁流
- 以乐观更新提升控制交互的即时反馈
- 以全局错误处理与通知系统保护页面稳定性
- 让主面板、房间详情、2D 户型图、3D 空间视图共享同一套响应式核心

## 1. 总体结构

应用入口位于 `frontend/src/main.js`，根组件位于 `frontend/src/App.vue`，核心业务状态集中在 `frontend/src/stores/smartHome.js`。

可以把整体结构理解为下面这条链路：

```text
main.js
  -> createApp(App)
  -> createPinia()
  -> global errorHandler / unhandledrejection
  -> App.vue
     -> useSmartHomeStore()
     -> initialize()
     -> DashboardLayout
     -> FloorPlanStudio
     -> RoomView
     -> ToastContainer
```

其中最重要的事实是：页面不是让每个组件各自请求数据，而是由 `smartHome` store 持有全局业务状态，组件只负责消费和呈现。

## 2. 状态管理：`Pinia` 作为单一事实源

### 2.1 为什么 `smartHome.js` 是前端核心

`frontend/src/stores/smartHome.js` 是整个应用的主状态仓库。它集中维护了：

- `rooms`
- `spatialScene`
- `selectedRoomId`
- `connectionStatus`
- `pendingDeviceIds`
- `actionFeedback`
- `visualActivity`
- 各类加载态、错误态和重连态

其中：

- `rooms` 更偏向主面板和房间详情所需的“目录型 / 明细型”数据
- `spatialScene` 更偏向户型图和空间场景所需的“布局型 / 空间型”数据

前端并不是让这两套数据彼此割裂，而是通过 `mergeRoomContext()` 与 `mergeRoomDevices()` 把它们在需要时合成为 `selectedMergedRoom` 等派生视图。这样做有两个好处：

- 普通房间卡片可以拿到更完整的设备控制字段
- 户型图和 3D 视图又能保留 `plan_x`、`plan_y`、`plan_width`、`plan_height` 等空间坐标信息

换句话说，`Pinia` 里保存的是“真实状态”，组件里拿到的是“按场景拼装后的派生视图”。

### 2.2 房间与设备如何保持一致

`smartHome` store 在多个层面维持一致性：

- 通过 `normalizeDashboardRooms()` 统一整理房间明细
- 通过 `normalizeSpatialScene()` 统一整理空间场景
- 通过 `upsertDevice()` 更新 `rooms`
- 通过 `upsertSpatialDevice()` 更新 `spatialScene`
- 通过 `findMergedRoomById()`、`findMergedDeviceById()` 输出统一可消费结果

这意味着设备状态一旦变化，不会只更新某一个局部组件，而是直接回写到全局状态树，再由 Vue 的响应式系统自动驱动所有使用该数据的组件刷新。

### 2.3 本地缓存不是第二事实源，而是冷启动加速层

`smartHome.js` 还会把以下数据写入 `localStorage`：

- `smart-home-cache:rooms`
- `smart-home-cache:spatial-scene`
- `smart-home-cache:ui-preferences`

启动时会先执行 `hydrateFromCache()`，把上次成功加载的数据恢复出来，再继续发起真实请求。这能明显改善冷启动体验，但缓存并不是权威数据源，真正的事实源仍然是当前会话中的 `Pinia` 状态和后端返回结果。

## 3. 初始化流程

应用启动后，`App.vue` 会在 `onMounted()` 中调用 `smartHomeStore.initialize()`。初始化过程大致如下：

1. `hydrateFromCache()`
2. `fetchInitialState()`
3. `fetchSpatialScene()`
4. 如果初始化成功，调用 `connectRealtime()`

其中：

- `fetchInitialState()` 加载 `/api/rooms`
- `fetchSpatialScene()` 加载 `/api/spatial/scene`
- `connectRealtime()` 建立 `/ws/devices` 的实时连接

这套顺序很重要。它确保 WebSocket 补丁流是在“已有首屏基础状态”的前提下接入，而不是让前端依赖纯实时流从零拼出完整界面。

## 4. Optimistic UI：为什么控制设备时界面会先动起来

### 4.1 核心思想

设备控制的主入口是 `runDeviceControl(deviceId, payload, optimisticUpdate)`。

这段逻辑采用了典型的 Optimistic UI 模式：

1. 先把设备标记为 pending
2. 先在本地状态里立即应用一个预测结果
3. 再异步发起真实网络请求
4. 成功后重新拉取权威状态
5. 失败时回滚到之前的快照

对应代码中的几个关键点分别是：

- `markPending(deviceId)`
- `snapshotDevice(deviceId)`
- `optimisticUpdate(device)`
- `fetchWithControlSession('/api/device/control', ...)`
- `restoreDeviceSnapshot(previousSnapshot)`

### 4.2 为什么这是好设计

例如在 `toggleDevice()` 中，前端会先调用：

```js
applyDeviceActionLocally(deviceId, 'toggle')
```

这意味着用户点击开关后，界面上的灯光状态会立刻切换，而不是傻等网络返回。这种即时反馈对智能家居面板非常关键，因为“按钮按了却没反应”的体感会比 Web 页面慢 300ms 更糟糕。

### 4.3 乐观更新如何避免脏状态

乐观更新真正成熟的地方，不是“先改 UI”，而是“先改 UI 之后还能安全回滚”。

当前实现中：

- 先用 `snapshotDevice()` 记录控制前快照
- 请求失败后调用 `restoreDeviceSnapshot(previousSnapshot)`
- 最终再通过 `fetchRoomDevices()` 和 `fetchSpatialScene()` 重新同步服务端权威状态

因此这不是粗暴的“本地瞎改”，而是一套完整的：

```text
predict -> send -> confirm / rollback -> re-sync
```

流程。

### 4.4 `pendingDeviceIds` 的作用

`pendingDeviceIds` 是这套交互体验的另一个关键状态：

- 用来避免同一设备被重复连续点击
- 用来给 2D / 3D 视图提供“设备正处于执行中”的视觉提示
- 用来驱动 `actionFeedback` 和局部加载样式

也就是说，Optimistic UI 不只是“快”，还会把“正在执行中”的语义明确表达给所有视图层。

## 5. 实时引擎：WebSocket 如何维持前端和设备状态同步

### 5.1 连接建立逻辑

实时连接入口是 `connectRealtime()`。它会：

- 通过 `resolveWebSocketUrl()` 生成 `/ws/devices` 地址
- 创建 `new WebSocket(...)`
- 监听 `open`、`message`、`close`、`error`

当前消息适配位于 `frontend/src/adapters/realtimeAdapter.js`，主要识别三类消息：

- `connection_established`
- `catalog_updated`
- `device_state_updated`

其中最重要的是 `device_state_updated`，它会被规范化成 `devicePatch`，再交给：

- `upsertDevice()`
- `upsertSpatialDevice()`

这意味着主面板和空间视图会同时收到同一条实时补丁。

### 5.2 为什么补丁流设计是合理的

WebSocket 不是反复全量推送整个房间树，而是尽量发送设备补丁。这样做的优点是：

- 网络负担更小
- 前端更新粒度更细
- 用户能更快看到单个设备状态变化

只有在收到 `catalog_updated` 或检测到设备被移动到未知房间等结构性变化时，前端才会触发补拉：

- `scheduleCatalogRefresh()`
- `fetchInitialState()`
- `fetchSpatialScene()`

这是一种“补丁优先、全量兜底”的策略。

## 6. Exponential Backoff：断线重连为什么比较稳

### 6.1 退避参数

`smartHome.js` 中定义了两个核心常量：

```js
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 30000
```

`scheduleReconnect()` 的延迟计算方式为：

```js
Math.min(
  RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempt - 1),
  RECONNECT_MAX_DELAY_MS,
)
```

因此重试节奏大致是：

- 第 1 次：`1000ms`
- 第 2 次：`2000ms`
- 第 3 次：`4000ms`
- 第 4 次：`8000ms`
- 第 5 次：`16000ms`
- 第 6 次及之后：上限 `30000ms`

这就是标准的 Exponential Backoff。

### 6.2 为什么这比固定轮询更好

如果网络瞬时波动，快速重试能尽快恢复。

如果后端正在重启、代理暂时不可达，指数退避又能避免浏览器疯狂重连，减少：

- 无意义的日志噪音
- 服务端握手压力
- 用户浏览器的空耗

### 6.3 与浏览器后台标签页的关系

代码里没有显式监听 `visibilitychange`，也没有手写“切后台时暂停、切前台时恢复”的专用分支。它采用的是更通用的一条路径：

- 浏览器进入后台后，WebSocket 或计时器可能被系统暂停、延迟或断开
- 一旦连接真正 `close`，前端就进入 `scheduleReconnect()`
- 重连成功后，如果这是一次重连而不是首次连接，会调用 `scheduleCatalogRefresh(60)`

这一步非常关键。它的意义是：

- 即使后台期间漏掉了部分实时补丁
- 前端在重新连上后也会主动补拉一次目录和空间场景
- 从而把状态重新校正到服务端权威版本

因此，这套实现不是“专门为后台标签页写的分支逻辑”，而是通过“断线重连 + 重连后补拉”自然吸收后台挂起带来的不确定性。这种做法工程上更朴素，也更稳。

### 6.4 手动断开与自动断开的区别

`disconnectRealtime()` 会把 `manualDisconnect` 设为 `true`。这样在组件卸载时关闭 WebSocket，不会继续触发自动重连。

这避免了页面已经离开、连接却还在后台偷偷重试的资源泄漏问题。

## 7. 实时补丁和全量刷新如何配合

当前前端并不是只依赖一种同步方式，而是把两种机制组合起来：

- 高频路径：`device_state_updated` 走增量 patch
- 兜底路径：`catalog_updated`、重连成功、结构不确定时走全量 refresh

对应策略可以概括为：

```text
normal state change -> patch locally
structural change or missed patch risk -> refresh catalog + spatial scene
```

这使得前端同时具备：

- 补丁更新的轻量实时性
- 全量同步的收敛能力

## 8. 错误处理：为什么页面不会轻易“白掉”

### 8.1 `main.js` 中的全局错误兜底

应用入口 `frontend/src/main.js` 注册了：

- `app.config.errorHandler`
- `window.addEventListener('unhandledrejection', ...)`

两者分别覆盖两类问题：

- Vue 组件渲染 / 更新阶段的异常
- 未捕获的 Promise rejection

对应处理不是简单 `console.error` 就结束，而是同步推送用户可见的错误通知。例如：

- `界面出现异常，已尝试保护当前页面。请刷新后重试。`
- `后台请求未完成，请稍后再试。`

这意味着即使局部组件发生异常，用户也更可能看到“可理解的退化提示”，而不是无声失败。

### 8.2 Store 内部的请求级错误处理

`smartHome.js` 还封装了：

- `buildRequestFailureMessage()`
- `createHttpError()`
- `notifyRequestFailure()`

这样不同请求路径可以统一生成面向用户的错误语义，例如：

- 网络不可用
- 401 需要重新认证
- 403 权限不足
- 404 资源不存在
- 5xx 服务暂时不可用

这让错误文案不再分散在各个组件里拼装，而是由 store 层统一归口。

## 9. 通知系统：`notificationStore` 为什么很顺手

### 9.1 自定义 Pinia 通知仓库

通知系统位于 `frontend/src/stores/notification.js`。它提供了四个核心方法：

- `pushToast()`
- `updateToast()`
- `removeToast()`
- `clearToasts()`

其内部状态只有一份：

```js
const toasts = ref([])
```

并通过一个模块级 `toastTimers` `Map` 管理自动消失计时器。

### 9.2 这套实现为什么优雅

很多项目的 Toast 系统只有“新增一条通知”，导致加载、成功、失败会连续弹出三条不同消息，界面会显得很吵。

当前实现的亮点是它不仅能 `push`，还能 `update`。这直接带来了一个非常好的交互模式。

## 10. In-Place Toast Update：同一个 Toast 原地变身

设备控制时，`runDeviceControl()` 会先创建一条 loading toast：

```js
const commandToastId = notificationStore.pushToast({
  type: 'loading',
  message: '指令下发中...',
  duration: 0,
})
```

这里的重点不是“有个 loading 提示”，而是这条提示返回了一个稳定的 `id`。

后续如果控制成功，并不会新建另一条 success toast，而是直接：

```js
notificationStore.updateToast(commandToastId, {
  type: 'success',
  message: '指令执行成功',
  duration: 3000,
})
```

失败时也是同理：

```js
notificationStore.updateToast(commandToastId, {
  type: 'error',
  message: buildRequestFailureMessage('执行设备控制', controlError),
  duration: 4200,
})
```

这就是非常漂亮的 In-Place Toast Update 机制。

它带来的用户体验优势非常明显：

- 不会出现“加载中 / 成功 / 失败”三连弹窗
- 同一条消息在视觉上连续演化，状态语义更清晰
- 计时器也会跟着新的 `duration` 被重置
- 用户的注意力始终集中在同一个通知实体上

这类细节通常最能体现前端交互设计是否成熟。

## 11. `ToastContainer` 只是视图层，状态仍在 Store

`frontend/src/components/ToastContainer.vue` 本身非常薄，只负责：

- 从 `notificationStore` 读取 `toasts`
- 根据 `type` 映射样式
- 渲染 `TransitionGroup`
- 提供关闭按钮

它不负责业务判断，也不负责通知生命周期管理。所有真正的状态变更都在 `notificationStore` 中完成。

这是非常健康的职责划分：

- store 负责状态
- component 负责呈现

## 12. 2D / 3D 户型能力为什么能自然接入

项目里已经包含相当高级的空间 UI 能力，包括：

- `FloorPlanStudio.vue`
- `FloorMapCanvas.vue`
- `ImmersiveFloorPlan3D.vue`

这些组件并没有各自维护一套独立设备状态，而是继续消费 `smartHome` store 中的：

- `spatialScene`
- `pendingDeviceIds`
- `actionFeedback`
- 合并后的房间 / 设备视图

因此：

- 2D 户型图能显示设备位置和执行态
- 3D 视图能显示空间结构、设备节点和控制反馈
- 普通房间详情和沉浸式空间视图始终围绕同一份响应式数据工作

这也是当前前端架构最有延展性的地方之一。空间视图不是“额外拼出来的炫技层”，而是建立在统一状态模型之上的另一种表现形式。

## 13. 一个值得注意的设计取向

当前前端整体上贯彻的是一种很成熟的思路：

- 首屏走明确的 HTTP 初始化
- 日常状态变化走 WebSocket patch
- 关键控制走 Optimistic UI
- 请求失败能回滚
- 实时断线能指数退避重连
- 重连成功后主动补拉，修正漏消息
- 全局异常能兜底成用户可见提示
- 通知系统支持同一条消息原地更新
- 2D / 3D 空间视图复用同一响应式核心

这让整个应用在体验上既“快”，又“不飘”。它不是靠单一技巧取胜，而是靠状态管理、同步策略、错误兜底和交互反馈共同形成闭环。

## 14. 给后续维护者的阅读顺序建议

如果你是第一次接手这个前端，推荐按下面顺序阅读源码：

1. `frontend/src/main.js`
2. `frontend/src/App.vue`
3. `frontend/src/stores/smartHome.js`
4. `frontend/src/stores/notification.js`
5. `frontend/src/adapters/realtimeAdapter.js`
6. `frontend/src/components/FloorPlanStudio.vue`
7. `frontend/src/components/ImmersiveFloorPlan3D.vue`

按这个顺序看，会最容易理解：

- 应用如何启动
- 状态如何集中
- 实时消息如何落到本地
- 控制操作如何乐观更新
- 空间视图如何复用同一套状态

## 15. 总结

这个 Vue 3 前端的核心优势，并不只是组件写得多，而是它已经形成了一套清晰的响应式工程体系：

- `Pinia` 维护单一事实源
- `WebSocket` 负责实时补丁
- Exponential Backoff 保证断线恢复节奏可控
- Optimistic UI 保证控制体验即时
- 全局错误处理和通知仓库保证异常可见、可理解
- In-Place Toast Update 让反馈流畅而不打扰
- 2D / 3D 户型能力建立在同一份响应式状态之上

如果后续还要继续扩展更多面板、更多设备类型或更多空间能力，这套架构是具备继续演进基础的。
