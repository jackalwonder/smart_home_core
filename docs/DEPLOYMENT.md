# 部署指南

本文档用于本项目的本地部署、服务器部署、语音链路配置和联调验证。

## 1. 前置准备

- 已安装 Docker / Docker Compose
- 已有可访问的 Home Assistant（本地或内网）
- 已生成 Home Assistant Long-Lived Access Token
- 如启用语音意图分析：已申请 DeepSeek API Key

## 2. 复制配置模板

```bash
cp .env.example .env
```

Windows PowerShell 可用：

```powershell
Copy-Item .env.example .env
```

## 3. `.env` 配置说明

### 3.1 基础服务

```dotenv
TZ=Asia/Shanghai
HOME_ASSISTANT_PORT=8123
POSTGRES_DB=smart_home
POSTGRES_USER=smart_home_user
POSTGRES_PASSWORD=replace_with_strong_password
BACKEND_PORT=8000
```

### 3.2 API 鉴权

```dotenv
APP_READ_API_KEY=replace_with_read_key
APP_CONTROL_API_KEY=replace_with_control_key
APP_ADMIN_API_KEY=replace_with_admin_key
APP_WEBHOOK_SECRET=replace_with_random_secret
APP_WEBHOOK_MAX_SKEW_SECONDS=300
```

前端建议使用控制级密钥：

```dotenv
VITE_API_BASE_URL=
VITE_API_KEY=replace_with_control_key
VITE_WS_URL=
```

### 3.3 Home Assistant 连接

```dotenv
HOME_ASSISTANT_WS_URL=ws://homeassistant:8123/api/websocket
HOME_ASSISTANT_REST_URL=http://homeassistant:8123/api
HOME_ASSISTANT_ACCESS_TOKEN=replace_with_home_assistant_long_lived_token
```

### 3.4 TTS 与 LLM（语音链路）

```dotenv
HOME_ASSISTANT_TTS_ENTITY_ID=tts.google_translate_zh_cn
HOME_ASSISTANT_TTS_MEDIA_PLAYER=media_player.living_room_homepod

DEEPSEEK_API_KEY=replace_with_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

说明：

- `HOME_ASSISTANT_TTS_ENTITY_ID` 必须是 HA 中可用的 `tts.*` 实体。
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER` 建议填具体 `media_player.*`；若临时未知可填 `all`。
- `DEEPSEEK_BASE_URL` 默认使用官方兼容地址。

## 4. 启动方式

### 4.1 本地一体化（Windows / Linux / macOS）

```bash
docker compose up -d --build
```

### 4.2 服务器模式

```bash
docker compose -f docker-compose.server.yml up -d --build
```

## 5. 健康检查

启动后检查：

- 前端：`http://localhost`
- 后端健康：`http://localhost:8000/health`
- OpenAPI：`http://localhost:8000/docs`
- Home Assistant：`http://localhost:8123`

终端验证：

```bash
curl http://localhost:8000/health
```

## 6. 语音链路快速验证

### 6.1 Linux/macOS

```bash
curl -X POST "http://localhost:8000/api/chat/" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <APP_CONTROL_API_KEY>" \
  -d '{"text":"客厅有点热，把空调打开","source_device":"Jack 的 iPhone","user_id":"iphone-jack"}'
```

### 6.2 Windows PowerShell

```powershell
curl.exe -X POST "http://localhost:8000/api/chat/" `
  -H "Content-Type: application/json" `
  -H "X-API-Key: <APP_CONTROL_API_KEY>" `
  -d "{\"text\":\"客厅有点热，把空调打开\",\"source_device\":\"Jack 的 iPhone\",\"user_id\":\"iphone-jack\"}"
```

预期响应：

```json
{"status":"processing","reply":"收到，正在为您安排..."}
```

## 7. iOS Siri 快捷指令接入

### 7.1 快捷指令动作编排

1. 新建快捷指令，添加“听写文本”或“询问输入”，得到变量 `语音文本`。
2. 添加“获取设备详细信息”，对象选“当前设备”，字段选“名称”，得到变量 `设备名`。
3. 添加“获取 URL 内容”，按下述参数配置：
   - URL：`http://<你的局域网IP>:8000/api/chat/`
   - 方法：`POST`
   - 请求体：`JSON`
4. Headers 中添加：
   - `Content-Type: application/json`
   - `X-API-Key: <APP_CONTROL_API_KEY>`
5. Body JSON：

```json
{
  "text": "<语音文本变量>",
  "source_device": "<设备名变量>",
  "user_id": "iphone-jack"
}
```

建议：

- `user_id` 对同一设备保持固定，便于短期意图记忆生效。
- `source_device` 尽量和后端静态映射名称一致，以提升房间判定准确性。

## 8. Webhook 签名（自动化入口）

`POST /api/webhook/automation` 要求：

- `X-Smart-Home-Timestamp: <unix_timestamp>`
- `X-Smart-Home-Signature: sha256=<hex_signature>`

签名原文：

```text
<timestamp>.<raw_request_body>
```

算法：

```text
HMAC-SHA256
```

## 9. 常见问题

### 9.1 `/api/rooms` 返回 503

通常是未配置 API Key。检查 `APP_READ_API_KEY / APP_CONTROL_API_KEY / APP_ADMIN_API_KEY`。

### 9.2 `/api/chat/` 无法执行动作

优先检查：

- `DEEPSEEK_API_KEY` 与 `DEEPSEEK_BASE_URL` 是否有效
- `HOME_ASSISTANT_ACCESS_TOKEN` 是否有效
- Home Assistant 里目标实体是否存在

### 9.3 TTS 未播报

优先检查：

- `HOME_ASSISTANT_TTS_ENTITY_ID` 是否为真实 `tts.*`
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER` 是否为真实 `media_player.*`
- 对应播放器是否在线

## 10. 安全建议

- 不要把 `.env` 提交到 GitHub。
- 定期轮换 `HOME_ASSISTANT_ACCESS_TOKEN` 和 `DEEPSEEK_API_KEY`。
- 生产环境优先使用反向代理 + HTTPS。
- `APP_ADMIN_API_KEY` 仅限内网和可信终端使用。
