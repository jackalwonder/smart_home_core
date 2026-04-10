# iOS Siri 快捷指令语音接入指南

本文档面向 iPhone / iPad 用户，说明如何在 Apple iOS 的“快捷指令”中创建一个可直接调用 `POST /api/chat/` 的语音入口。配置完成后，你可以对 Siri 说一句自然语言指令，由快捷指令完成：

- 听写语音
- 识别当前说话设备
- 向 `FastAPI /api/chat/` 发送 `POST` 请求
- 读取接口返回的 `reply`
- 通过系统语音朗读结果

## 1. 前置条件

开始之前，请先确认以下条件已经满足：

- 后端服务已经可访问
- 你知道服务器地址，例如 `192.168.1.20`
- 你已经为系统配置好了 `APP_CONTROL_API_KEY`
- 你的 iPhone 与服务器之间网络可达

推荐先用浏览器或终端确认接口地址可访问，再开始配置快捷指令。

## 2. 一个必须先说清楚的兼容性说明

本教程按你要求的最终接入地址编写：

```text
http://<your-server-ip>/api/chat/
```

但是，当前仓库默认前端 Nginx 会把 `/api/*` 请求中的 `X-API-Key` 统一改写成 `APP_READ_API_KEY`。而 `POST /api/chat/` 需要的是控制权限，因此如果你直接复用当前默认代理配置，这条请求会因为权限不足而失败。

因此，下面两种方式二选一即可：

- 如果你已经为 `/api/chat/` 单独提供了可透传控制级 `X-API-Key` 的入口，就直接使用本文中的 `http://<your-server-ip>/api/chat/`
- 如果你还没有调整代理，请先把同样的快捷指令 URL 临时改成 `http://<your-server-ip>:8000/api/chat/` 进行验证

下面的步骤仍然以目标地址 `http://<your-server-ip>/api/chat/` 为例，因为这是你希望最终暴露给 Siri 快捷指令的入口形式。

## 3. 你最终要得到的快捷指令流程

整条快捷指令推荐按下面顺序排列：

1. `Dictate Text`（听写文本）
2. `Get Device Details`（获取设备详细信息）
3. `Get Contents of URL`（获取 URL 内容）
4. 读取返回 JSON 中的 `reply`
5. `Speak Text`（朗读文本）

如果你的 iOS 语言是中文，动作名称会显示为中文；如果是英文系统，则通常显示为上面的英文名称。不同 iOS 版本界面文案可能略有差异，但核心动作和参数是一致的。

## 4. Step 1: 添加 `Dictate Text`（听写文本）

1. 打开 iPhone 上的“快捷指令”App。
2. 新建一个快捷指令，例如命名为“智能家居语音控制”。
3. 点击“添加操作”。
4. 搜索并添加 `Dictate Text`（听写文本）。

建议配置：

- 语言：选择你日常发出家居指令的语言，例如“中文”
- 停止听写：保留默认即可

这个动作的输出，就是后面请求体中的 `text` 字段。

也就是说，当你说出：

```text
把客厅空调打开
```

快捷指令最终会把这段文本作为：

```json
{
  "text": "把客厅空调打开"
}
```

中的 `text` 值发送出去。

## 5. Step 2: 添加 `Get Device Details`（获取设备详细信息）

为了让后端知道这句话是从哪台设备说出来的，你需要继续添加设备上下文。

操作步骤：

1. 在 `Dictate Text` 后面继续点击“添加操作”。
2. 搜索并添加 `Get Device Details`（获取设备详细信息）。
3. 将读取的字段设置为 `Device Name`（设备名称）。

这个动作的输出，就是后面请求体中的 `source_device` 字段。

例如，这一步的输出可能是：

```text
Jack 的 iPhone
```

那么发送到后端时就会变成：

```json
{
  "source_device": "Jack 的 iPhone"
}
```

这样后端就可以根据设备名称做空间仲裁，判断当前说话者更可能位于哪个房间。

## 6. Step 3: 添加 `Get Contents of URL`（获取 URL 内容）

这是最关键的一步。你需要把前面两个动作的输出，组装成一个 `POST` 请求发给后端。

### 6.1 添加动作

1. 在 `Get Device Details` 后面点击“添加操作”。
2. 搜索并添加 `Get Contents of URL`（获取 URL 内容）。

### 6.2 配置 URL

将 URL 设置为：

```text
http://<your-server-ip>/api/chat/
```

如果你当前仍在使用仓库默认的前端代理，尚未为 `/api/chat/` 开通控制权限透传，请先临时改成：

```text
http://<your-server-ip>:8000/api/chat/
```

### 6.3 配置 Method

将请求方法设置为：

```text
POST
```

### 6.4 配置 Headers

在 Headers 中手动添加以下键值：

```text
Content-Type: application/json
X-API-Key: <your APP_CONTROL_API_KEY>
```

这里要特别注意：

- Header 名称必须是 `X-API-Key`
- Header 值必须是你真实的 `APP_CONTROL_API_KEY` 内容
- 不要把值写成字面量 `APP_CONTROL_API_KEY`

### 6.5 配置 Request Body（JSON）

将请求正文设置为 `JSON`，然后添加以下三个字段：

```json
{
  "text": "[Dictated Text]",
  "source_device": "[Device Name]",
  "user_id": "jackal"
}
```

字段映射方式如下：

- `text`
  - 绑定到 `Dictate Text`（听写文本）的输出
- `source_device`
  - 绑定到 `Get Device Details`（获取设备详细信息）中 `Device Name`（设备名称）的输出
- `user_id`
  - 写成一个固定字符串，例如 `jackal`

`user_id` 必须是稳定值，不要每次运行都变化。因为后端会用它来关联短期上下文和补充指令。如果你今天传 `jackal`，明天又传 `jackal-2`，多轮补充语义就无法连续工作。

## 7. Step 4: 读取返回的 `reply` 并交给 `Speak Text`（朗读文本）

`POST /api/chat/` 在请求成功时，会先立即返回一个 JSON 对象，格式类似下面这样：

```json
{
  "status": "processing",
  "reply": "收到，正在为您安排..."
}
```

因此，快捷指令接下来的任务就是把这个响应里的 `reply` 字段取出来，再交给系统语音朗读。

操作步骤：

1. 在 `Get Contents of URL` 后面继续添加一个用于读取 JSON 字段的动作。
2. 将输入设置为上一步 URL 请求返回的字典对象。
3. 将要读取的 Key 设置为：

```text
reply
```

4. 再添加 `Speak Text`（朗读文本）。
5. 将 `Speak Text` 的输入绑定到刚刚取出的 `reply` 值。

如果你的快捷指令界面里显示的动作名称不是完全一致，也没有关系。关键点只有两个：

- 先把 URL 请求返回结果当作 JSON / Dictionary 处理
- 再从中取出 `reply`

最终效果是：

- Siri 负责采集你的原始语音
- 后端立即返回 `reply`
- iPhone 直接把 `reply` 念出来

这一步读到的通常是即时确认语，例如“收到，正在为您安排...”。真正的设备执行与后续播报，仍会在后端后台流程中继续进行。

## 8. 完整请求示例

如果全部配置正确，快捷指令发出去的请求应当等价于下面这个 JSON：

```json
{
  "text": "把客厅空调打开",
  "source_device": "Jack 的 iPhone",
  "user_id": "jackal"
}
```

并且携带下面这个关键 Header：

```text
X-API-Key: <your APP_CONTROL_API_KEY>
```

## 9. 排查建议

如果快捷指令已经能运行，但没有成功控制设备，优先检查下面几项：

- URL 是否真的指向可访问的 `POST /api/chat/`
- `X-API-Key` 是否填写为真实的 `APP_CONTROL_API_KEY`
- `user_id` 是否保持固定
- `source_device` 是否确实取到了当前设备名
- 你是否仍然走在默认前端代理上，导致控制级 Header 被改写成了只读 Key

如果你是第一次联调，建议优先在终端里用 `curl` 测通，再回到手机上配置快捷指令，这样排错速度会快很多。

## 10. Bonus: 用 `curl` 直接测试 `/api/chat/`

Linux / macOS：

```bash
curl -X POST "http://<your-server-ip>/api/chat/" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your APP_CONTROL_API_KEY>" \
  -d '{"text":"把客厅空调打开","source_device":"Jack 的 iPhone","user_id":"jackal"}'
```

Windows PowerShell：

```powershell
curl.exe -X POST "http://<your-server-ip>/api/chat/" `
  -H "Content-Type: application/json" `
  -H "X-API-Key: <your APP_CONTROL_API_KEY>" `
  -d "{\"text\":\"把客厅空调打开\",\"source_device\":\"Jack 的 iPhone\",\"user_id\":\"jackal\"}"
```
