# iOS Siri 语音控制接入指南

这份文档用于把 iPhone 上的 Siri 快捷指令接到智能家居后端的 `/api/chat/` 接口，完成语音输入、房间判定、LLM 意图分析、Home Assistant 执行和 TTS 播报这一整条链路。

## 前置条件

开始之前，请先确认：

- Home Assistant、FastAPI 后端和数据库已经正常运行
- 后端已经配置好 `APP_CONTROL_API_KEY`
- 后端已经配置好 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_BASE_URL`
- 如果要让系统播报结果，已经配置好 `HOME_ASSISTANT_TTS_ENTITY_ID`
- iPhone 可以访问运行后端的电脑或服务器地址

推荐先在后端环境变量里补齐以下配置：

```dotenv
APP_CONTROL_API_KEY=replace_with_control_api_key
DEEPSEEK_API_KEY=replace_with_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
HOME_ASSISTANT_TTS_ENTITY_ID=replace_with_tts_entity_id
HOME_ASSISTANT_TTS_MEDIA_PLAYER=replace_with_media_player_entity_id_or_all
```

## 接口信息

Siri 快捷指令需要调用的接口如下：

- 方法：`POST`
- URL：`http://<你的电脑或服务器IP>:8000/api/chat/`

请求体示例：

```json
{
  "text": "客厅有点热，把空调打开",
  "source_device": "Jack 的 iPhone",
  "user_id": "iphone-jack"
}
```

## 在快捷指令中创建 Siri 语音入口

### 1. 新建快捷指令

在 iPhone 上打开“快捷指令”App，新建一个快捷指令，例如命名为“智能家居语音控制”。

### 2. 获取用户语音内容

添加动作：

- `听写文本`

这个动作会把你说的话保存成一个变量，后面用于映射到 JSON 里的 `text` 字段。

如果你更喜欢每次手动输入，也可以使用：

- `询问输入`

但用于 Siri 时，通常更推荐 `听写文本`。

### 3. 获取当前设备名称

添加动作：

- `获取设备详细信息`

配置方式：

- 对象选择：`当前设备`
- 字段选择：`名称`

这个动作的输出用来映射到 JSON 里的 `source_device` 字段。

建议让这个设备名称和后端 [spatial_service.py](D:/Documents/New%20project/smart_home_core_repo/backend/app/services/spatial_service.py) 里的静态映射名称尽量一致，例如：

- `主卧的 HomePod`
- `客厅的 HomePod`
- `书房的 iPhone`

如果暂时取不到设备名动作，也可以先用一个“文本”动作手动写死，例如：

```text
Jack 的 iPhone
```

### 4. 配置 “获取 URL 内容”

添加动作：

- `获取 URL 内容`

按下面方式设置：

- URL：`http://<你的电脑或服务器IP>:8000/api/chat/`
- 方法：`POST`
- 请求正文：`JSON`

### 5. 配置 Headers

在“获取 URL 内容”动作里展开 Headers，添加以下两项：

```text
Content-Type: application/json
X-API-Key: <你的 APP_CONTROL_API_KEY>
```

说明：

- `Content-Type` 固定为 `application/json`
- `X-API-Key` 必须填写后端配置中的 `APP_CONTROL_API_KEY`

### 6. 配置 JSON Body

在“获取 URL 内容”的 JSON Body 里添加 3 个字段：

```json
{
  "text": "听写文本的结果",
  "source_device": "当前设备名称",
  "user_id": "iphone-jack"
}
```

实际映射建议如下：

- `text`
  - 绑定到动作 `听写文本` 的输出
  - 也就是 Siri 听到的自然语言命令
- `source_device`
  - 绑定到动作 `获取设备详细信息 -> 名称` 的输出
  - 用于后端做空间仲裁
- `user_id`
  - 建议填写一个固定字符串，不要每次变化
  - 例如：`iphone-jack`

推荐结构：

```json
{
  "text": "[Dictated Text]",
  "source_device": "[Device Name]",
  "user_id": "iphone-jack"
}
```

## Siri 调用后的预期行为

当快捷指令调用成功后，后端会立即返回：

```json
{"status":"processing","reply":"收到，正在为您安排..."}
```

这样设计是为了避免 Siri 因等待过久而超时。真正的执行流程会在后台继续进行：

1. 根据 `source_device` 判断用户所在房间
2. 结合短期记忆拼接上下文
3. 调用 DeepSeek 分析意图
4. 转发控制到 Home Assistant
5. 通过 TTS 播报处理结果

## Windows / Linux 终端模拟 Siri 测试

### Windows PowerShell

```powershell
curl.exe -X POST "http://localhost:8000/api/chat/" `
  -H "Content-Type: application/json" `
  -H "X-API-Key: your_app_control_api_key" `
  -d "{\"text\":\"客厅有点热，把空调打开\",\"source_device\":\"Jack 的 iPhone\",\"user_id\":\"iphone-jack\"}"
```

### Linux / macOS

```bash
curl -X POST "http://localhost:8000/api/chat/" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_app_control_api_key" \
  -d '{"text":"客厅有点热，把空调打开","source_device":"Jack 的 iPhone","user_id":"iphone-jack"}'
```

如果是从另一台设备测试，把 `localhost` 替换为后端服务所在主机的局域网 IP。

理想返回值：

```json
{"status":"processing","reply":"收到，正在为您安排..."}
```

## 常见问题

### 返回 401 或 403

通常是 `X-API-Key` 没带或填写错误。请确认：

- Header 名称是 `X-API-Key`
- 值与后端 `.env` 里的 `APP_CONTROL_API_KEY` 完全一致

### 返回 422

通常是 JSON Body 字段不完整。请确认以下字段都存在：

- `text`
- `source_device`
- `user_id`

### Siri 说了但没有执行

请按顺序排查：

- DeepSeek 配置是否正确
- Home Assistant token 是否有效
- `source_device` 是否能被空间仲裁正确识别
- 目标设备是否已经同步进数据库

### 没有播报声音

请确认：

- `HOME_ASSISTANT_TTS_ENTITY_ID` 已配置
- `HOME_ASSISTANT_TTS_MEDIA_PLAYER` 已配置为有效的 `media_player.*`
- Home Assistant 中对应的 TTS 服务和播放设备可用
