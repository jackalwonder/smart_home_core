# smart_home_core

一个基于 Home Assistant 的家庭智能管理系统，包含前端控制台、后端编排服务、实时状态同步、语音控制链路和 Apple Siri 接入能力。

## 功能概览

- 多房间设备看板：Vue 3 + Pinia + Tailwind CSS
- 后端控制与自动化接口：FastAPI + Pydantic
- 设备与房间数据持久化：SQLAlchemy 2.0 + PostgreSQL
- Home Assistant REST / WebSocket 双通道同步
- 语音控制入口：`POST /api/chat/`
- 空间仲裁、短期意图记忆、DeepSeek 意图分析、TTS 反馈

## 技术栈

- Backend：FastAPI、SQLAlchemy 2.0、Pydantic、websockets、Loguru
- Database：PostgreSQL 15
- Frontend：Vue 3、Pinia、Tailwind CSS、Nginx
- AI / Integration：DeepSeek API、Home Assistant

## 仓库结构

```text
smart_home_core/
├─ backend/
│  ├─ app/
│  │  ├─ routers/                # REST、Webhook、Chat、Realtime 路由
│  │  ├─ services/               # HA、LLM、空间、意图、导入服务
│  │  ├─ models.py               # SQLAlchemy 模型
│  │  ├─ schemas.py              # Pydantic 模型
│  │  └─ main.py                 # FastAPI 入口
│  ├─ tests/                     # 单元测试
│  ├─ requirements.txt
│  └─ .env.example               # 后端环境变量模板
├─ frontend/
├─ docs/
│  ├─ DEPLOYMENT.md              # 部署、联调与排障
│  └─ VOICE_CONTROL_SETUP.md     # iOS Siri 快捷指令接入指南
├─ docker-compose.yml
└─ docker-compose.server.yml
```

## 快速开始

1. 创建后端环境变量文件

```bash
cp backend/.env.example backend/.env
```

Windows PowerShell：

```powershell
Copy-Item backend/.env.example backend/.env
```

2. 根据 [docs/DEPLOYMENT.md](D:/Documents/New%20project/smart_home_core_repo/docs/DEPLOYMENT.md) 填写 `backend/.env`
3. 启动服务

```bash
docker compose up -d --build
```

4. 打开服务

- 前端：`http://localhost`
- 后端 OpenAPI：`http://localhost:8000/docs`
- Home Assistant：`http://localhost:8123`

## 鉴权说明

后端接口按权限分级：

- `APP_READ_API_KEY`：读取房间和设备状态
- `APP_CONTROL_API_KEY`：读取并控制设备、调用语音入口
- `APP_ADMIN_API_KEY`：导入、管理和维护接口

`/api/webhook/automation` 额外使用 HMAC-SHA256 请求签名。

前端默认通过同域 Nginx 反向代理访问后端，`APP_CONTROL_API_KEY` 只保留在前端容器环境变量中，由代理层注入到 `/api/*` 和 `/ws/*` 请求。
不要再使用 `VITE_API_KEY` 之类的前端构建变量承载后端主密钥。

## 语音控制链路

`POST /api/chat/` 会立即返回：

```json
{"status":"processing","reply":"收到，正在为您安排..."}
```

后台会继续执行以下流程：

1. 检查短期意图记忆
2. 根据 `source_device` 和雷达占用做空间仲裁
3. 调用 DeepSeek 输出动作 JSON
4. 转发到 Home Assistant 执行
5. 通过 TTS 播报处理结果

## 开发校验

后端语法检查：

```bash
python -m compileall backend/app
```

单元测试：

```bash
PYTHONPATH=backend python -m pytest backend/tests -q
```

前端构建：

```bash
npm --prefix frontend ci
npm --prefix frontend run build
```

Compose 配置检查：

```bash
docker compose config
docker compose -f docker-compose.server.yml config
```

## 文档

- 部署与联调：[docs/DEPLOYMENT.md](D:/Documents/New%20project/smart_home_core_repo/docs/DEPLOYMENT.md)
- Siri 语音接入：[docs/VOICE_CONTROL_SETUP.md](D:/Documents/New%20project/smart_home_core_repo/docs/VOICE_CONTROL_SETUP.md)
