# Production Checklist

在执行 `docker-compose -f docker-compose.server.yml up -d` 之前，请先在宿主机或部署用的 `.env` 文件中确认以下配置。

## 必填环境变量

- `POSTGRES_DB`
  PostgreSQL 数据库名。
- `POSTGRES_USER`
  PostgreSQL 用户名。
- `POSTGRES_PASSWORD`
  PostgreSQL 强密码，禁止使用默认值。
- `BACKEND_PORT`
  后端对外暴露端口，通常为 `8000`。
- `APP_READ_API_KEY`
  前台只读访问令牌，由 Nginx 反向代理注入。
- `APP_CONTROL_API_KEY`
  设备控制令牌。
- `APP_ADMIN_API_KEY`
  管理接口令牌。
- `APP_AUTH_COOKIE_SECRET`
  控制会话 Cookie 签名密钥，必须为高强度随机值。
- `APP_WEBHOOK_SECRET`
  自动化 webhook 校验密钥。
- `ALLOWED_ORIGINS`
  允许跨域访问的来源列表，使用逗号分隔。
  示例：`https://smart-home.example.com,https://admin.example.com`

## Home Assistant 集成

- `HOME_ASSISTANT_WS_URL`
  Home Assistant WebSocket API 地址。
- `HOME_ASSISTANT_REST_URL`
  Home Assistant REST API 地址。
- `HOME_ASSISTANT_ACCESS_TOKEN`
  Home Assistant 长期访问令牌。
- `HOME_ASSISTANT_TTS_ENTITY_ID`
  需要语音播报时使用的 TTS 实体。
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER`
  需要语音播报时使用的播放器实体。

## AI / 第三方服务

- `DEEPSEEK_API_KEY`
  如果启用 DeepSeek 相关能力，需要配置。
- `DEEPSEEK_BASE_URL`
  DeepSeek API 地址。
- `DEEPSEEK_MODEL`
  DeepSeek 模型名称。
- `OPENAI_API_KEY`
  如果启用 OpenAI 相关能力，需要配置。
- `OPENAI_BASE_URL`
  OpenAI 兼容接口地址；如果使用官方服务可按需留空。
- `APP_FLOOR_PLAN_ANALYSIS_PROVIDER`
  户型分析供应商配置。
- `APP_FLOOR_PLAN_VISION_MODEL`
  户型分析视觉模型名称。

## 部署前复核

- 确认 `.env` 中不再使用示例默认密码、示例 API Key 或空密钥。
- 确认 `ALLOWED_ORIGINS` 只包含真实生产域名，不包含 `*`。
- 确认宿主机 `80`、`${BACKEND_PORT}`、`8123` 等端口策略符合实际部署方案。
- 确认 PostgreSQL 数据卷、`/app/data` 挂载目录和备份策略已经就绪。
- 确认反向代理、DNS 和 TLS 证书已经配置完成。
