# Siri / 快捷指令语音接入指南

这份文档用于把 iPhone 上的 Siri / 快捷指令接到项目当前的 `POST /api/chat/` 语音入口，完成：

- 语音转文本
- 空间仲裁
- 短期意图记忆拼接
- DeepSeek 意图分析
- Home Assistant 执行
- TTS 播报

## 1. 前置条件

开始之前，请先确认：

- 前端、后端、数据库和 Home Assistant 都已经正常运行
- 已配置 `APP_CONTROL_API_KEY`
- 已配置 `HOME_ASSISTANT_ACCESS_TOKEN`
- 已配置 `DEEPSEEK_API_KEY`
- 如果需要语音播报，已配置 `HOME_ASSISTANT_TTS_ENTITY_ID` 和 `HOME_ASSISTANT_TTS_MEDIA_PLAYER`
- iPhone 能访问你的电脑或服务器

如果还没部署项目，请先看 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 2. 先选一种接入方式

当前项目支持两种接法。

### 方式 A：走前端同域代理

请求地址：

```text
http://<你的电脑或服务器地址>/api/chat/
```

特点：

- 不需要在快捷指令里手动填写 `X-API-Key`
- 前端 Nginx 会自动把 `APP_CONTROL_API_KEY` 注入到请求里
- 配置最省事

适用场景：

- 家庭局域网
- 受信任内网
- 前端入口已经被其他网关 / VPN / 登录层保护

注意：

- 当前前端代理会为所有 `/api/*` 请求自动注入控制权限
- 如果你把前端入口直接暴露在公网，这种方式并不安全

### 方式 B：直连后端

请求地址：

```text
http://<你的电脑或服务器地址>:8000/api/chat/
```

特点：

- 需要在快捷指令里手动加 `X-API-Key`
- 鉴权边界更清晰
- 更适合调试和受控接入

## 3. 当前接口字段

语音入口当前要求的请求体如下：

```json
{
  "text": "客厅有点热，把空调打开",
  "source_device": "Jack 的 iPhone",
  "user_id": "iphone-jack"
}
```

字段说明：

- `text`
  - 用户说出的自然语言
  - 例如“把客厅空调打开”
- `source_device`
  - 语音来源设备名称
  - 后端会用它做空间仲裁
- `user_id`
  - 同一个语音入口的稳定标识
  - 后端会用它关联短期意图记忆
  - 建议每台语音入口固定一个值，不要每次变化

推荐做法：

- 一台 iPhone 一个固定 `user_id`
- 一台 HomePod 一个固定 `user_id`
- `source_device` 尽量和真实设备名保持一致

## 4. `source_device` 如何影响房间判断

后端会先尝试用静态设备名映射判定房间，再在必要时回退到雷达 / 占用传感器仲裁。

当前静态映射定义在：

- [backend/app/services/spatial_service.py](../backend/app/services/spatial_service.py)

如果你希望基于设备名直接命中房间，建议让快捷指令传入的 `source_device` 尽量贴近这些名称风格，例如：

- `主卧的 HomePod`
- `客厅的 HomePod`
- `书房的 iPhone`

如果静态映射没有命中，后端会继续读取 Home Assistant 的雷达 / 占用实体，在“恰好只有一个房间有人”的情况下推断当前房间。

## 5. 在 iPhone 快捷指令中创建语音入口

### 5.1 新建快捷指令

在 iPhone 上打开“快捷指令”App，新建一个快捷指令，例如命名为：

```text
智能家居语音控制
```

### 5.2 采集用户语音

添加动作：

- `听写文本`

这个动作的输出会映射到 JSON 中的 `text`。

### 5.3 获取当前设备名称

推荐再添加动作：

- `获取设备详细信息`

配置：

- 对象：`当前设备`
- 字段：`名称`

这个输出建议映射到 JSON 中的 `source_device`。

如果你拿不到设备名，也可以先用一个固定“文本”动作临时写死，例如：

```text
Jack 的 iPhone
```

### 5.4 配置“获取 URL 内容”

添加动作：

- `获取 URL 内容`

把方法设置为：

- `POST`

把请求正文设置为：

- `JSON`

## 6. URL 和 Header 怎么填

### 6.1 如果你走方式 A：前端代理

URL：

```text
http://<你的电脑或服务器地址>/api/chat/
```

Headers 只需要：

```text
Content-Type: application/json
```

### 6.2 如果你走方式 B：直连后端

URL：

```text
http://<你的电脑或服务器地址>:8000/api/chat/
```

Headers 需要：

```text
Content-Type: application/json
X-API-Key: <你的 APP_CONTROL_API_KEY>
```

## 7. JSON Body 怎么填

在快捷指令的 JSON Body 里添加这 3 个字段：

```json
{
  "text": "[Dictated Text]",
  "source_device": "[Device Name]",
  "user_id": "iphone-jack"
}
```

推荐映射：

- `text`
  - 绑定到“听写文本”的输出
- `source_device`
  - 绑定到“获取设备详细信息 -> 名称”的输出
  - 如果没有，就填一个固定文本
- `user_id`
  - 固定写死，例如 `iphone-jack`

不要把 `user_id` 做成随机值，否则短期意图记忆就无法连续工作。

## 8. 预期响应与后台行为

调用成功后，接口会先立刻返回：

```json
{"status":"processing","reply":"收到，正在为您安排..."}
```

这是异步设计，目的是避免 Siri / 快捷指令等待太久而超时。

真正的执行流程会在后台继续完成：

1. 读取该 `user_id` 之前未完成的补充意图
2. 根据 `source_device` 与雷达状态推断房间
3. 调用 DeepSeek 生成动作 JSON
4. 转发动作到 Home Assistant
5. 通过 TTS 播报结果

## 9. 终端模拟测试

### 9.1 通过前端代理测试

Linux / macOS：

```bash
curl -X POST "http://localhost/api/chat/" \
  -H "Content-Type: application/json" \
  -d '{"text":"客厅有点热，把空调打开","source_device":"Jack 的 iPhone","user_id":"iphone-jack"}'
```

Windows PowerShell：

```powershell
curl.exe -X POST "http://localhost/api/chat/" `
  -H "Content-Type: application/json" `
  -d "{\"text\":\"客厅有点热，把空调打开\",\"source_device\":\"Jack 的 iPhone\",\"user_id\":\"iphone-jack\"}"
```

### 9.2 直连后端测试

Linux / macOS：

```bash
curl -X POST "http://localhost:8000/api/chat/" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_app_control_api_key" \
  -d '{"text":"客厅有点热，把空调打开","source_device":"Jack 的 iPhone","user_id":"iphone-jack"}'
```

Windows PowerShell：

```powershell
curl.exe -X POST "http://localhost:8000/api/chat/" `
  -H "Content-Type: application/json" `
  -H "X-API-Key: your_app_control_api_key" `
  -d "{\"text\":\"客厅有点热，把空调打开\",\"source_device\":\"Jack 的 iPhone\",\"user_id\":\"iphone-jack\"}"
```

## 10. 常见问题

### 10.1 返回 401 / 403

如果你走方式 B 直连后端，请确认：

- Header 名称是 `X-API-Key`
- 值与 `APP_CONTROL_API_KEY` 完全一致

如果你走方式 A 前端代理，请优先检查：

- 前端容器是否拿到了 `APP_CONTROL_API_KEY`
- 前端代理是否正常转发到了后端

### 10.2 返回 422

通常是 JSON 字段不完整。当前接口至少需要：

- `text`
- `user_id`

`source_device` 当前是可选字段，但强烈建议传，这样房间仲裁会更稳定。

### 10.3 说了命令但没有执行

优先检查：

- `DEEPSEEK_API_KEY` 是否有效
- `HOME_ASSISTANT_ACCESS_TOKEN` 是否有效
- `source_device` 是否足够帮助定位房间
- 目标实体是否已经同步进数据库

### 10.4 没有播报声音

请确认：

- `HOME_ASSISTANT_TTS_ENTITY_ID` 已配置
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER` 已配置为有效 `media_player.*`
- 对应播放器在线

### 10.5 快捷指令能触发，但房间总是判断不准

优先检查：

- `source_device` 是否稳定
- 是否与 [backend/app/services/spatial_service.py](../backend/app/services/spatial_service.py) 中的命名习惯接近
- Home Assistant 中是否存在可用的雷达 / 占用类实体
