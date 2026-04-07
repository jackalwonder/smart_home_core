# 部署与联调指南

这份文档覆盖本项目的本地部署、服务器部署、语音链路配置和常见联调方法。

## 1. 前置准备

在开始之前，请确认：

- 已安装 Docker 与 Docker Compose
- 已有可访问的 Home Assistant 实例
- 已生成 Home Assistant Long-Lived Access Token
- 如果要启用语音意图分析，已申请 DeepSeek API Key

## 2. 复制后端环境模板

Linux / macOS：

```bash
cp backend/.env.example backend/.env
```

Windows PowerShell：

```powershell
Copy-Item backend/.env.example backend/.env
```

## 3. 关键环境变量

### 3.1 基础服务

```dotenv
TZ=Asia/Shanghai
BACKEND_PORT=8000

POSTGRES_DB=smart_home
POSTGRES_USER=smart_home_user
POSTGRES_PASSWORD=replace_with_strong_password
DATABASE_URL=postgresql+psycopg://smart_home_user:replace_with_strong_password@postgres:5432/smart_home
```

### 3.2 API 鉴权

```dotenv
APP_READ_API_KEY=replace_with_read_key
APP_CONTROL_API_KEY=replace_with_control_key
APP_ADMIN_API_KEY=replace_with_admin_key
APP_WEBHOOK_SECRET=replace_with_random_secret
APP_WEBHOOK_MAX_SKEW_SECONDS=300
```

前端安全约束：

- 浏览器侧不要配置 `VITE_API_KEY`
- 默认让前端走同域 `/api` 和 `/ws`，由前端容器内的 Nginx 代发 `X-API-Key`
- `docker-compose*.yml` 已将前端容器的 `APP_CONTROL_API_KEY` 传给 Nginx 模板，不会进入浏览器 bundle

### 3.3 Home Assistant 连接

```dotenv
HOME_ASSISTANT_WS_URL=ws://homeassistant:8123/api/websocket
HOME_ASSISTANT_REST_URL=http://homeassistant:8123/api
HOME_ASSISTANT_ACCESS_TOKEN=replace_with_home_assistant_long_lived_token
```

### 3.4 TTS 与 LLM

```dotenv
HOME_ASSISTANT_TTS_ENTITY_ID=tts.google_translate_zh_cn
HOME_ASSISTANT_TTS_MEDIA_PLAYER=media_player.living_room_homepod

DEEPSEEK_API_KEY=replace_with_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

说明：

- `HOME_ASSISTANT_TTS_ENTITY_ID` 必须是 Home Assistant 中真实可用的 `tts.*`
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER` 建议填写真实 `media_player.*`，临时兜底可用 `all`
- `DEEPSEEK_BASE_URL` 默认使用官方兼容地址

## 4. 启动方式

### 4.1 本地一体化启动

```bash
docker compose up -d --build
```

### 4.2 服务器模式

```bash
docker compose -f docker-compose.server.yml up -d --build
```

## 5. 健康检查

启动后请检查：

- 前端：`http://localhost`
- 后端健康检查：`http://localhost:8000/health`
- OpenAPI：`http://localhost:8000/docs`
- Home Assistant：`http://localhost:8123`

命令行快速验证：

```bash
curl http://localhost:8000/health
```

## 6. 语音链路快速验证

### 6.1 Linux / macOS

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

完整步骤请查看：

- [docs/VOICE_CONTROL_SETUP.md](D:/Documents/New%20project/smart_home_core_repo/docs/VOICE_CONTROL_SETUP.md)

## 8. 自动化 Webhook 签名

`POST /api/webhook/automation` 需要以下请求头：

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

### 9.1 `/api/rooms` 返回 401 / 403

如果你是通过前端页面访问，通常是前端容器没有拿到 `APP_CONTROL_API_KEY`。
如果你是直接调用后端接口，通常是没有带 `X-API-Key`，或者值与后端配置不一致。

### 9.2 `/api/chat/` 无法执行动作

优先检查：

- `DEEPSEEK_API_KEY` 和 `DEEPSEEK_BASE_URL` 是否有效
- `HOME_ASSISTANT_ACCESS_TOKEN` 是否有效
- Home Assistant 中目标实体是否真实存在
- 设备是否已经导入数据库

### 9.3 TTS 没有播报

优先检查：

- `HOME_ASSISTANT_TTS_ENTITY_ID` 是否为有效的 `tts.*`
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER` 是否为有效的 `media_player.*`
- 对应播放器当前是否在线

## 10. 安全建议

- 不要把 `backend/.env` 提交到 GitHub
- 定期轮换 `HOME_ASSISTANT_ACCESS_TOKEN` 和 `DEEPSEEK_API_KEY`
- 生产环境优先使用反向代理和 HTTPS
- `APP_ADMIN_API_KEY` 只用于受信任的内网终端
- 不要把任何后端主密钥放进 `VITE_*` 前端环境变量
