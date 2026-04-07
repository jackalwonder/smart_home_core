# 部署与联调指南

这份文档覆盖当前项目的配置方式、本地一体化部署、服务器模式、接口联调、语音验证和常见排障点。

## 1. 先理解配置文件怎么分工

当前仓库里有两套环境变量模板：

- 根目录 `.env.example`
  - 供 `docker compose` / `docker compose -f docker-compose.server.yml` 使用
  - 这是部署时最重要的配置入口
- `backend/.env.example`
  - 供后端单独调试时参考
  - 不是 Compose 默认读取文件

如果你准备直接用 Docker Compose 部署，请复制根目录模板：

Linux / macOS：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

## 2. 关键环境变量

### 2.1 基础服务

```dotenv
TZ=Asia/Shanghai
HOME_ASSISTANT_PORT=8123

POSTGRES_DB=smart_home
POSTGRES_USER=smart_home_user
POSTGRES_PASSWORD=change_me

BACKEND_PORT=8000
```

### 2.2 接口鉴权

```dotenv
APP_READ_API_KEY=replace_with_read_api_key
APP_CONTROL_API_KEY=replace_with_control_api_key
APP_ADMIN_API_KEY=replace_with_admin_api_key

APP_WEBHOOK_SECRET=replace_with_long_random_webhook_secret
APP_WEBHOOK_MAX_SKEW_SECONDS=300
```

说明：

- `APP_READ_API_KEY` 只读
- `APP_CONTROL_API_KEY` 读 + 控制 + 语音入口
- `APP_ADMIN_API_KEY` 读 + 控制 + 管理
- `APP_WEBHOOK_SECRET` 用于 `/api/webhook/automation` 的 HMAC-SHA256 签名

### 2.3 Home Assistant

```dotenv
HOME_ASSISTANT_WS_URL=ws://homeassistant:8123/api/websocket
HOME_ASSISTANT_REST_URL=http://homeassistant:8123/api
HOME_ASSISTANT_ACCESS_TOKEN=replace_with_long_lived_access_token
```

服务器模式下，默认值会改成通过 `host.docker.internal:8123` 访问 Home Assistant，见 [docker-compose.server.yml](../docker-compose.server.yml)。

### 2.4 TTS 与语音理解

```dotenv
HOME_ASSISTANT_TTS_ENTITY_ID=tts.google_translate_zh_cn
HOME_ASSISTANT_TTS_MEDIA_PLAYER=media_player.living_room_homepod

DEEPSEEK_API_KEY=replace_with_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 2.5 前端代理

```dotenv
VITE_API_BASE_URL=
FRONTEND_BACKEND_UPSTREAM=http://backend:8000
```

说明：

- `VITE_API_BASE_URL` 留空时，前端默认走同域 `/api` 和 `/ws`
- `FRONTEND_BACKEND_UPSTREAM` 是 Nginx 代理的后端地址
- 当前项目已经移除 `VITE_API_KEY` / `VITE_WS_URL`
- 浏览器代码不会再直接保存后端主密钥

## 3. 本地一体化部署

### 3.1 启动

```bash
docker compose up -d --build
```

### 3.2 查看运行状态

```bash
docker compose ps
```

### 3.3 访问地址

- 前端：`http://localhost`
- 后端健康检查：`http://localhost:8000/health`
- 后端 OpenAPI：`http://localhost:8000/docs`
- Home Assistant：`http://localhost:8123`

## 4. 服务器模式部署

服务器模式使用：

```bash
docker compose -f docker-compose.server.yml up -d --build
```

这一模式的默认行为：

- Home Assistant 容器使用 `host` 网络
- 后端默认通过 `host.docker.internal:8123` 访问 Home Assistant
- 前端仍然通过 `FRONTEND_BACKEND_UPSTREAM` 访问后端

如果你的 Home Assistant 不在宿主机上，请显式覆盖：

- `HOME_ASSISTANT_WS_URL`
- `HOME_ASSISTANT_REST_URL`

## 5. 当前鉴权模型与部署注意事项

### 5.1 直连后端

直接访问 `http://<host>:8000/...` 时，需要自己带：

- `X-API-Key`
- 或 `Authorization: Bearer <token>`

例如：

```bash
curl http://localhost:8000/api/rooms \
  -H "X-API-Key: ${APP_READ_API_KEY}"
```

### 5.2 通过前端入口访问

当前前端 Nginx 会给：

- `/api/*`
- `/ws/*`

自动注入：

```text
X-API-Key: ${APP_CONTROL_API_KEY}
```

这意味着：

- 浏览器前端可以直接工作，不需要把密钥写入前端代码
- 任何能访问前端入口的人，也能访问带控制权限的 `/api/*`

因此推荐：

- 只在受信任内网中暴露前端入口
- 或者在外层再加一层登录、VPN、网关白名单或反向代理鉴权

## 6. 基础联调检查

### 6.1 健康检查

```bash
curl http://localhost:8000/health
```

预期：

```json
{"status":"正常"}
```

### 6.2 前端代理是否正常

如果你走前端入口，可以直接请求：

```bash
curl http://localhost/api/rooms
```

这条请求会由 Nginx 转发到后端并自动补上 `X-API-Key`。

### 6.3 直连接口是否正常

```bash
curl http://localhost:8000/api/rooms \
  -H "X-API-Key: ${APP_READ_API_KEY}"
```

### 6.4 WebSocket 是否正常

前端默认连接：

```text
ws://<host>/ws/devices
```

如果你自己写客户端直连后端，也可以用：

```text
ws://<host>:8000/ws/devices
```

但这时要自己传读权限 token。

## 7. 设备控制与语音快速验证

### 7.1 直连后端控制设备

```bash
curl -X POST http://localhost:8000/api/device/control \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${APP_CONTROL_API_KEY}" \
  -d '{"device_id":1,"control_kind":"toggle","action":"toggle"}'
```

### 7.2 通过前端代理控制设备

```bash
curl -X POST http://localhost/api/device/control \
  -H "Content-Type: application/json" \
  -d '{"device_id":1,"control_kind":"toggle","action":"toggle"}'
```

### 7.3 直连后端验证语音入口

```bash
curl -X POST http://localhost:8000/api/chat/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${APP_CONTROL_API_KEY}" \
  -d '{"text":"客厅有点热，把空调打开","source_device":"Jack 的 iPhone","user_id":"iphone-jack"}'
```

### 7.4 通过前端代理验证语音入口

```bash
curl -X POST http://localhost/api/chat/ \
  -H "Content-Type: application/json" \
  -d '{"text":"客厅有点热，把空调打开","source_device":"Jack 的 iPhone","user_id":"iphone-jack"}'
```

预期立即返回：

```json
{"status":"processing","reply":"收到，正在为您安排..."}
```

语音接入的完整配置步骤见 [VOICE_CONTROL_SETUP.md](VOICE_CONTROL_SETUP.md)。

## 8. 自动化 Webhook 签名

接口：

- `POST /api/webhook/automation`

必须携带请求头：

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

如果签名缺失、时间漂移过大或密钥不一致，接口会返回 `401`。

## 9. 常见问题

### 9.1 明明改了 `backend/.env`，Compose 还是没生效

因为 `docker compose` 默认读取的是仓库根目录 `.env`。

请确认你修改的是：

- `/smart_home_core/.env`

而不是只改了：

- `/smart_home_core/backend/.env`

### 9.2 页面能打开，但 `/api/rooms` 报错

优先检查：

- 前端容器是否拿到了 `APP_CONTROL_API_KEY`
- `FRONTEND_BACKEND_UPSTREAM` 是否能连通后端
- 后端是否正常启动

排查命令：

```bash
docker compose ps
docker logs smart-home-frontend
docker logs smart-home-backend
```

### 9.3 直连后端返回 401 / 403

通常是：

- 没带 `X-API-Key`
- token 值不对
- 只读 token 调用了控制接口

### 9.4 WebSocket 连不上

优先检查：

- 访问的是 `/ws/devices`
- 如果是直连后端，是否自己传了读权限 token
- 如果是前端页面，前端代理是否已经正常工作

### 9.5 `/api/chat/` 返回成功但没有实际动作

优先检查：

- `DEEPSEEK_API_KEY`
- `HOME_ASSISTANT_ACCESS_TOKEN`
- `source_device` 是否能帮助空间仲裁识别房间
- 目标设备是否已经导入数据库

### 9.6 TTS 没有播报

优先检查：

- `HOME_ASSISTANT_TTS_ENTITY_ID` 是否为有效的 `tts.*`
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER` 是否为有效的 `media_player.*`
- 对应播放器当前是否在线

## 10. 安全建议

- 不要提交 `.env`
- 不要把任何后端主密钥放进 `VITE_*` 前端构建变量
- 如果前端入口可被外网访问，务必再加一层登录、VPN 或反向代理鉴权
- 定期轮换 `HOME_ASSISTANT_ACCESS_TOKEN`、`DEEPSEEK_API_KEY` 和各级 API key
