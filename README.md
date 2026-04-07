# smart_home_core

一个围绕 Home Assistant 构建的家庭智能管理系统，包含前端控制台、后端编排服务、实时状态同步、语音控制链路和 Siri / 快捷指令接入能力。

## 当前架构

- 前端：Vue 3 + Pinia + Tailwind CSS，构建后由 Nginx 托管
- 后端：FastAPI + SQLAlchemy 2.0，负责目录聚合、设备控制、语音编排和管理接口
- 数据库：PostgreSQL 15
- 集成层：Home Assistant REST / WebSocket
- 语音链路：空间仲裁 + 短期意图记忆 + DeepSeek 意图分析 + TTS 播报

## 核心能力

- 多房间设备总览与实时状态同步
- 设备聚合卡片视图，适配冰箱 / 空调 / 影音等多实体设备
- Home Assistant 实体自动导入与房间映射
- 受权限控制的设备控制接口、管理接口和 Webhook 自动化入口
- `POST /api/chat/` 语音入口，支持 Siri / iPhone 快捷指令接入
- 前端同域 `/api`、`/ws` 代理，浏览器不再打包后端主密钥

## 仓库结构

```text
smart_home_core/
├─ backend/
│  ├─ app/
│  │  ├─ routers/                # 前台接口、管理接口、Realtime、语音入口
│  │  ├─ services/               # HA、LLM、空间、意图、自动化、导入服务
│  │  ├─ database.py             # SQLAlchemy 基础设施与线程安全会话封装
│  │  ├─ models.py               # 数据库模型
│  │  ├─ schemas.py              # Pydantic 模型
│  │  └─ main.py                 # FastAPI 入口
│  ├─ tests/                     # 后端回归测试
│  ├─ requirements.txt
│  └─ .env.example               # 后端单独运行时可参考的环境变量模板
├─ frontend/
│  ├─ src/
│  ├─ nginx.conf.template        # 前端同域代理配置
│  └─ Dockerfile
├─ docs/
│  ├─ DEPLOYMENT.md              # 本地部署、服务器部署、联调与排障
│  └─ VOICE_CONTROL_SETUP.md     # Siri / 快捷指令语音接入指南
├─ docker-compose.yml            # 本地一体化启动
├─ docker-compose.server.yml     # 服务器模式启动
└─ .env.example                  # Docker Compose 主配置模板
```

## 快速开始

### 1. 复制 Compose 环境变量模板

Linux / macOS：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

说明：

- `docker compose` 默认读取仓库根目录 `.env`
- `backend/.env.example` 主要用于后端单独调试时参考，不是 Compose 默认读取文件

### 2. 填写关键配置

至少需要补齐这些变量：

- `APP_READ_API_KEY`
- `APP_CONTROL_API_KEY`
- `APP_ADMIN_API_KEY`
- `APP_WEBHOOK_SECRET`
- `HOME_ASSISTANT_ACCESS_TOKEN`
- `DEEPSEEK_API_KEY`

如果需要语音播报，还要补齐：

- `HOME_ASSISTANT_TTS_ENTITY_ID`
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER`

完整说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

### 3. 启动项目

```bash
docker compose up -d --build
```

### 4. 打开服务

- 前端：`http://localhost`
- 后端健康检查：`http://localhost:8000/health`
- OpenAPI：`http://localhost:8000/docs`
- Home Assistant：`http://localhost:8123`

## 鉴权与安全模型

后端按权限分级：

- `APP_READ_API_KEY`：读取房间、设备和 WebSocket 状态
- `APP_CONTROL_API_KEY`：读取并控制设备、调用语音入口
- `APP_ADMIN_API_KEY`：管理接口、导入接口

当前项目存在两种访问路径：

### 直连后端

当你直接访问 `http://<host>:8000/...` 时，需要显式携带：

- `X-API-Key: <token>`，或
- `Authorization: Bearer <token>`

### 通过前端同域代理访问

当前前端 Nginx 会把 `APP_CONTROL_API_KEY` 自动注入到：

- `/api/*`
- `/ws/*`

这让浏览器前端不需要保存后端主密钥，但也意味着：

- 前端入口默认具备控制权限
- 前端入口应只暴露在受信任内网，或放在额外的登录 / 网关保护之后
- 不要再使用 `VITE_API_KEY`、`VITE_WS_URL` 之类变量把主密钥带进浏览器 bundle

`VITE_API_BASE_URL` 现在仅用于跨域部署时显式指定后端基地址，不承载任何密钥。

## 语音控制链路

语音入口为：

- `POST /api/chat/`

当前请求体字段：

```json
{
  "text": "客厅有点热，把空调打开",
  "source_device": "Jack 的 iPhone",
  "user_id": "iphone-jack"
}
```

字段说明：

- `text`：用户的自然语言命令
- `source_device`：语音来源设备名称，用于空间仲裁
- `user_id`：同一语音入口的稳定标识，用于短期意图记忆

接口会先立即返回：

```json
{"status":"processing","reply":"收到，正在为您安排..."}
```

后台继续执行：

1. 读取并清理该 `user_id` 的待补充意图
2. 根据 `source_device` 和雷达占用推断当前房间
3. 调用 DeepSeek 输出动作 JSON
4. 转发到 Home Assistant 执行
5. 通过 TTS 播报处理结果

Siri / 快捷指令接入见 [docs/VOICE_CONTROL_SETUP.md](docs/VOICE_CONTROL_SETUP.md)。

## 常用开发与验证命令

安装后端开发依赖：

```bash
python -m pip install -r backend/requirements-dev.txt
```

后端语法检查：

```bash
python -m compileall backend/app
```

后端测试：

```bash
PYTHONPATH=backend python -m pytest backend/tests -q
```

如果你使用项目内虚拟环境，也可以：

```bash
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
```

前端构建：

```bash
npm --prefix frontend install
npm --prefix frontend run build
```

Compose 配置检查：

```bash
docker compose config
docker compose -f docker-compose.server.yml config
```

## 文档

- 部署与联调：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Siri / 快捷指令接入：[docs/VOICE_CONTROL_SETUP.md](docs/VOICE_CONTROL_SETUP.md)
