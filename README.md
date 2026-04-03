# smart_home_core

一个基于 Home Assistant 的智能家居控制面板，包含：

- `frontend`
  Vue 3 + Pinia + Vite 的房间控制面板。
- `backend`
  FastAPI 服务，负责目录管理、设备控制、自动导入和实时推送。
- `docker-compose*.yml`
  本地一体化与服务器模式的部署入口。

## 架构概览

```text
Home Assistant <-> backend(FastAPI) <-> frontend(Vue)
                     |
                     -> PostgreSQL
```

推荐的职责划分：

- `Home Assistant`
  作为唯一设备真相源，统一接 HomeKit Bridge、自动化和实体状态。
- `backend`
  提供受控 API、自动导入、实时通知和编排能力。
- `frontend`
  展示按房间聚合后的控制面板。

## 快速开始

1. 复制环境变量模板：

```bash
cp .env.example .env
```

2. 按 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 填写 `.env`。

3. 启动服务：

```bash
docker compose up -d --build
```

如果是服务器模式：

```bash
docker compose -f docker-compose.server.yml up -d --build
```

## 安全模型

当前版本的接口访问分为三类：

- `APP_READ_API_KEY`
  只读房间和设备。
- `APP_CONTROL_API_KEY`
  允许前端读取和控制设备。
- `APP_ADMIN_API_KEY`
  允许访问管理接口和手动导入。

前端构建变量 `VITE_API_KEY` 通常应配置成 `APP_CONTROL_API_KEY`。

`/api/webhook/automation` 不再使用 API Key，而是使用 `HMAC-SHA256 + 时间戳` 验签：

- `X-Smart-Home-Timestamp`
- `X-Smart-Home-Signature`

详细格式、示例代码和 `.env` 填写方式见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## Webhook 请求格式

请求地址：

```text
POST /api/webhook/automation
```

请求体示例：

```json
{
  "trigger_source": "shortcut",
  "workflow_name": "night-scene",
  "scene_entity_id": "scene.good_night",
  "actions": [],
  "metadata": {
    "source": "apple-home"
  }
}
```

如果不传 `scene_entity_id`，则至少要传一条 `actions`。

## 本地开发校验

前端：

```bash
npm --prefix frontend ci
npm --prefix frontend run build
```

后端：

```bash
python3 -m compileall backend/app
```

## HomeKit Bridge 接入建议

如果你要把设备桥接到苹果“家庭”：

- 让 `Home Assistant` 继续做唯一真相源。
- 用 `HomeKit Bridge` 将 Home Assistant 实体暴露给 Apple Home。
- 本项目保留为你的自定义控制面板和自动化入口，不要把它当成第二套设备主控。
- Webhook 只开放给你自己控制的调用方，并保留 HMAC 校验。

## 文档

- 部署和 `.env` 说明：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
