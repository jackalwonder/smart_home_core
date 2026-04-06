# smart_home_core

一个基于 Home Assistant 的家庭智能管理系统，包含前端控制台、后端编排服务、实时状态同步和语音指令链路。

## 功能概览

- 多房间设备面板（Vue 3 + Pinia + Tailwind）
- 设备控制与自动化 Webhook（FastAPI）
- Home Assistant WebSocket 实时状态同步
- PostgreSQL 持久化设备与房间数据
- 语音控制异步入口（`/api/chat/`）
  - 空间仲裁（spatial service）
  - 短期意图记忆（pending intent）
  - LLM 意图分析（DeepSeek）
  - TTS 播报反馈（Home Assistant `tts.speak`）

## 架构

```text
Home Assistant <-> FastAPI backend <-> Vue frontend
        |                 |
        |                 -> PostgreSQL
        |
        -> HomeKit Bridge / Apple Home
```

## 仓库结构

```text
smart_home_core/
├─ backend/                     # FastAPI 服务
│  ├─ app/
│  │  ├─ routers/               # API 路由（含 /api/chat）
│  │  ├─ services/              # HA/LLM/空间/意图服务
│  │  ├─ models.py              # SQLAlchemy 模型
│  │  └─ schemas.py             # Pydantic 模型
│  └─ requirements.txt
├─ frontend/                    # Vue 3 前端
├─ docs/
│  └─ DEPLOYMENT.md             # 部署与配置详解
├─ docker-compose.yml           # 本地开发/测试
├─ docker-compose.server.yml    # 服务器部署
└─ .env.example                 # 环境变量模板
```

## 快速开始

1. 创建环境变量文件：

```bash
cp .env.example .env
```

2. 按 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 填写 `.env`。

3. 启动服务：

```bash
docker compose up -d --build
```

4. 打开页面：

- 前端：`http://localhost`
- 后端文档：`http://localhost:8000/docs`
- Home Assistant：`http://localhost:8123`

## 安全与鉴权

后端接口按权限分级：

- `APP_READ_API_KEY`：读取房间和设备
- `APP_CONTROL_API_KEY`：读取 + 控制设备（推荐给前端）
- `APP_ADMIN_API_KEY`：管理接口（导入、后台维护）

`/api/webhook/automation` 使用 `HMAC-SHA256` 请求签名，不依赖 API Key。

## 语音控制链路

`POST /api/chat/` 是异步语音入口，请求会立即返回：

```json
{"status":"processing","reply":"收到，正在为您安排..."}
```

后台任务会继续执行：

1. 合并短期上下文（PendingIntent，60 秒窗口）
2. 空间判定（静态设备映射 + 雷达占用判决）
3. 调用 DeepSeek 输出控制动作 JSON
4. 转发到 Home Assistant 执行动作
5. 通过 Home Assistant TTS 播报结果

## 开发校验

后端：

```bash
python -m compileall backend/app
```

前端：

```bash
npm --prefix frontend ci
npm --prefix frontend run build
```

Compose 配置检查：

```bash
docker compose --env-file .env.example config
docker compose --env-file .env.example -f docker-compose.server.yml config
```

## 文档

- 部署配置与联调： [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
