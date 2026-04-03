# 部署说明

本文档面向本项目的 Docker Compose 部署，重点解释 `.env` 应该怎么填写，以及在接入 Home Assistant / HomeKit Bridge 时的推荐做法。

## 1. 复制环境变量模板

在项目根目录执行：

```bash
cp .env.example .env
```

然后按下面的说明修改 `.env`。

## 2. `.env` 推荐填写方式

### 基础运行

```dotenv
TZ=Asia/Shanghai
HOME_ASSISTANT_PORT=8123

POSTGRES_DB=smart_home
POSTGRES_USER=smart_home_user
POSTGRES_PASSWORD=请替换成强密码

BACKEND_PORT=8000
```

- `TZ`
  建议保持 `Asia/Shanghai`。
- `HOME_ASSISTANT_PORT`
  如果你用默认的 Home Assistant 端口，保持 `8123` 即可。
- `POSTGRES_*`
  这是后端本地数据库，不建议继续使用 `change_me`。
- `BACKEND_PORT`
  如果前面没有别的服务占用 `8000`，保持默认即可。

### 鉴权

```dotenv
APP_READ_API_KEY=请填一个只读密钥
APP_CONTROL_API_KEY=请填一个控制面密钥
APP_ADMIN_API_KEY=请填一个管理面密钥
APP_WEBHOOK_SECRET=请填一个长随机字符串
APP_WEBHOOK_MAX_SKEW_SECONDS=300

VITE_API_BASE_URL=
VITE_API_KEY=与 APP_CONTROL_API_KEY 保持一致
VITE_WS_URL=
```

- `APP_READ_API_KEY`
  只允许读取房间和设备列表。
- `APP_CONTROL_API_KEY`
  允许前端读取和控制设备。
- `APP_ADMIN_API_KEY`
  允许访问 `/zones`、`/rooms`、`/devices` 和手动导入接口。
- `APP_WEBHOOK_SECRET`
  专门用于 `/api/webhook/automation` 的 HMAC 签名，不再使用 API Key。
- `APP_WEBHOOK_MAX_SKEW_SECONDS`
  Webhook 允许的最大时间偏差，默认 `300` 秒。
- `VITE_API_KEY`
  浏览器前端发起读写请求时使用。通常直接填成 `APP_CONTROL_API_KEY`。
- `VITE_API_BASE_URL`
  如果前端和后端都通过同一 nginx 域名访问，留空即可。
  如果前端要请求一个独立后端地址，例如 `https://smart-home.example.com`，则填完整 URL。
- `VITE_WS_URL`
  通常留空即可，前端会自动根据当前站点地址推导 `/ws/devices`。

### Home Assistant

```dotenv
HOME_ASSISTANT_WS_URL=ws://homeassistant:8123/api/websocket
HOME_ASSISTANT_REST_URL=http://homeassistant:8123/api
HOME_ASSISTANT_ACCESS_TOKEN=填入 Home Assistant 的 Long-Lived Access Token
```

- `HOME_ASSISTANT_ACCESS_TOKEN`
  在 Home Assistant 用户资料页创建 `Long-Lived Access Token` 后填入。
- `HOME_ASSISTANT_WS_URL`
  本地 compose 方案下保持默认即可。
- `HOME_ASSISTANT_REST_URL`
  本地 compose 方案下保持默认即可。

如果你使用的是 `docker-compose.server.yml`，后端默认会通过 `host.docker.internal` 访问宿主机上的 Home Assistant，无需把这里改成公网地址。

## 3. 推荐的 `.env` 示例

下面是一份更接近可部署状态的示例：

```dotenv
TZ=Asia/Shanghai
HOME_ASSISTANT_PORT=8123

POSTGRES_DB=smart_home
POSTGRES_USER=smart_home_user
POSTGRES_PASSWORD=replace_with_a_strong_database_password

BACKEND_PORT=8000
APP_READ_API_KEY=replace_with_read_key
APP_CONTROL_API_KEY=replace_with_control_key
APP_ADMIN_API_KEY=replace_with_admin_key
APP_WEBHOOK_SECRET=replace_with_a_long_random_secret
APP_WEBHOOK_MAX_SKEW_SECONDS=300

VITE_API_BASE_URL=
VITE_API_KEY=replace_with_control_key
VITE_WS_URL=

HOME_ASSISTANT_WS_URL=ws://homeassistant:8123/api/websocket
HOME_ASSISTANT_REST_URL=http://homeassistant:8123/api
HOME_ASSISTANT_ACCESS_TOKEN=replace_with_home_assistant_long_lived_token
```

## 4. 启动方式

本机一体化启动：

```bash
docker compose up -d --build
```

服务器模式启动：

```bash
docker compose -f docker-compose.server.yml up -d --build
```

## 5. Webhook 签名规则

`POST /api/webhook/automation` 现在需要以下两个请求头：

```text
X-Smart-Home-Timestamp: <Unix 秒级时间戳>
X-Smart-Home-Signature: sha256=<十六进制签名>
```

签名原文规则：

```text
<timestamp>.<raw_request_body>
```

签名算法：

```text
HMAC-SHA256
```

Python 示例：

```python
import hashlib
import hmac
import json
import time

secret = b"replace_with_a_long_random_secret"
payload = {
    "trigger_source": "shortcut",
    "workflow_name": "night-scene",
    "scene_entity_id": "scene.good_night",
    "actions": [],
    "metadata": {"source": "apple-home"},
}

body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
timestamp = str(int(time.time()))
message = timestamp.encode("utf-8") + b"." + body
signature = hmac.new(secret, message, hashlib.sha256).hexdigest()

headers = {
    "Content-Type": "application/json",
    "X-Smart-Home-Timestamp": timestamp,
    "X-Smart-Home-Signature": f"sha256={signature}",
}
```

注意：

- 时间戳必须和服务端时间接近，超出 `APP_WEBHOOK_MAX_SKEW_SECONDS` 会被拒绝。
- 签名必须针对“实际发出的原始请求体”计算，所以 JSON 序列化方式要固定。
- 不建议再把 webhook 暴露给公网匿名访问；即使有签名，仍建议加反向代理限流和来源限制。

## 6. Home Assistant / HomeKit Bridge 建议

- `Home Assistant` 继续作为唯一真相源。
- `HomeKit Bridge` 直接桥接 Home Assistant 实体到苹果“家庭”。
- 本项目主要承担房间面板、补充控制、自动化入口和状态展示。
- 不建议把管理员密钥放进前端。
- 如果只是给自己家庭使用，建议：
  - 前端走 `APP_CONTROL_API_KEY`
  - 管理接口只在内网访问
  - Webhook 只给受控调用方，使用 HMAC 签名
