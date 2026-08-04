# MiniMax 视频生成 API 文档

## 支持的模型与能力

| 模型名称 | 类型 | 说明 |
|----------|------|------|
| MiniMax-Hailuo-2.3 | 文生视频 / 图生视频 | 海螺 2.3，支持运镜指令，768P/1080P，6s 或 10s |
| MiniMax-Hailuo-02 | 文生视频 / 图生视频 / 首尾帧 | 海螺 02，支持运镜；文生/图生支持 512P/768P/1080P；首尾帧仅 768P/1080P |

## 模式判定

同一接口，由参数自动识别：

1. **若传入尾帧** (`last_frame_image` / `last_frame_url` / `end_frame_image`) → **首尾帧生成视频**，仅支持 `MiniMax-Hailuo-02`，分辨率仅 `768P/1080P`。
2. **否则若传入首帧** (`first_frame_image` / `image_url` / `first_frame_url`) → **图生视频**。
3. **否则** → **文生视频**，必填 `prompt`。

---

## 请求格式

### 请求参数

| 参数名 | 类型 | 必填 | 说明 | 取值范围/格式 |
|--------|------|------|------|----------------|
| model | string | 是 | 模型名称 | 见上方「支持的模型」；首尾帧仅支持 `MiniMax-Hailuo-02` |
| prompt | string | 文生必填 | 视频的文本描述 | 最大 2000 字符；图生/首尾帧可选；支持 `[指令]` 运镜语法，见下方 |
| first_frame_image | string | 图生必填 | 首帧图片（图生视频） | 公网 URL 或 Base64 Data URL；可与 `image_url` / `first_frame_url` 二选一 |
| image_url | string | 图生必填* | 同 `first_frame_image` | 与 `first_frame_image` / `first_frame_url` 二选一 |
| first_frame_url | string | 图生必填* | 同 `first_frame_image` | 与 `first_frame_image` / `image_url` 二选一 |
| last_frame_image | string | 首尾帧必填 | 尾帧图片（首尾帧生成） | 公网 URL 或 Base64 Data URL；可与 `last_frame_url` / `end_frame_image` 二选一 |
| last_frame_url | string | 首尾帧必填* | 同 `last_frame_image` | 与 `last_frame_image` / `end_frame_image` 二选一 |
| end_frame_image | string | 首尾帧必填* | 同 `last_frame_image` | 与 `last_frame_image` / `last_frame_url` 二选一 |
| seconds | integer | 否 | 视频时长（秒） | 与 `duration` 等价，二选一即可；取值见下方「时长与分辨率」 |
| duration | integer | 否 | 视频时长（秒） | 默认 6；与 `seconds` 等价；取值见下方「时长与分辨率」 |
| size | string | 否 | 视频分辨率 | 与 `resolution` 等价，二选一即可 |
| resolution | string | 否 | 视频分辨率 | 见下方「时长与分辨率」；首尾帧仅 `768P`、`1080P`（不支持 `512P`） |
| prompt_optimizer | boolean | 否 | 是否自动优化 prompt | 默认 `true`，设为 `false` 可精确控制 |
| fast_pretreatment | boolean | 否 | 是否缩短 prompt 优化耗时 | 默认 `false`；仅对海螺系列文生/图生生效 |
| callback_url | string | 否 | 任务状态回调 URL | 需在 3 秒内正确响应 `challenge` 校验 |
| aigc_watermark | boolean | 否 | 是否添加 AIGC 水印 | 默认 `false` |

\* **图生必填**：文生视频不传首帧；图生视频需传 `first_frame_image` 或 `image_url` 或 `first_frame_url` 其一。
\* **首尾帧必填**：需传 `last_frame_image` 或 `last_frame_url` 或 `end_frame_image` 其一。

### 图片要求

首帧/尾帧图片要求（图生视频、首尾帧）：
- 格式：`JPG/JPEG/PNG/WebP`
- 体积：`< 20MB`
- 短边：`> 300px`
- 长宽比：`2:5 ～ 5:2`
- 首尾帧时生成视频尺寸遵循首帧；首尾帧尺寸不一致时以首帧为参考对尾帧裁剪。

---

## 时长与分辨率对应关系

### 文生视频 / 图生视频（MiniMax-Hailuo-2.3、MiniMax-Hailuo-02）

| 模型 | 512P | 768P | 1080P |
|------|------|------|-------|
| MiniMax-Hailuo-2.3 | — | 6 或 10 秒 | 6 秒 |
| MiniMax-Hailuo-02 | 6 或 10 秒 | 6 或 10 秒 | 6 秒 |

*(512P 仅 MiniMax-Hailuo-02 支持。)*

### 首尾帧生成视频（仅 MiniMax-Hailuo-02，不支持 512P）

| 模型 | 768P | 1080P |
|------|------|-------|
| MiniMax-Hailuo-02 | 6 或 10 秒 | 6 秒 |

按时长看分辨率：**6s** 可选 768P（默认）/1080P，**10s** 仅 768P。

---

## 运镜指令（海螺系列：文生 / 图生 / 首尾帧）

对 `MiniMax-Hailuo-2.3`、`MiniMax-Hailuo-02`，在 `prompt` 中可使用 `[指令]` 控制运镜，例如：

| 指令类型 | 可用指令 |
|----------|----------|
| 左右移 | `[左移]`、`[右移]` |
| 左右摇 | `[左摇]`、`[右摇]` |
| 推拉 | `[推进]`、`[拉远]` |
| 升降 | `[上升]`、`[下降]` |
| 上下摇 | `[上摇]`、`[下摇]` |
| 变焦 | `[变焦推近]`、`[变焦拉远]` |
| 其他 | `[晃动]`、`[跟随]`、`[固定]` |

- **组合运镜**：同一组 `[]` 内可组合多个指令（建议不超过 3 个），如：`[左摇,上升]`。
- **顺序运镜**：`prompt` 中前后出现的指令会依次生效，如 `…[推进]，然后…[拉远]`。
- 也支持用自然语言描述运镜，但使用标准指令可获得更准确的效果。

更多说明见 MiniMax 视频生成 API。

---

## 请求示例

### 1. 6 秒 1080P，带运镜指令

```json
{
  "model": "MiniMax-Hailuo-2.3",
  "prompt": "A man picks up a book [上升], then reads [固定].",
  "duration": 6,
  "resolution": "1080P"
}
```

### 2. 6 秒 768P，关闭自动优化（海螺）

```json
{
  "model": "MiniMax-Hailuo-2.3",
  "prompt": "一只小猫在阳光下打盹，镜头缓缓推进",
  "seconds": 6,
  "size": "768P",
  "prompt_optimizer": true,
  "fast_pretreatment": false
}
```

### 3. 图生视频（首帧图片 + 文本描述）

```json
{
  "model": "MiniMax-Hailuo-2.3",
  "first_frame_image": "https://example.com/first-frame.jpg",
  "prompt": "A mouse runs toward the camera, smiling and blinking.",
  "duration": 6,
  "resolution": "1080P"
}
```

也可使用别名 `image_url` 或 `first_frame_url` 传首帧，与 `first_frame_image` 二选一。

### 4. 首尾帧生成视频（仅 MiniMax-Hailuo-02）

```json
{
  "model": "MiniMax-Hailuo-02",
  "first_frame_image": "https://filecdn.minimax.chat/public/fe9d04da-f60e-444d-a2e0-18ae743add33.jpeg",
  "last_frame_image": "https://filecdn.minimax.chat/public/97b7cd08-764e-4b8b-a7bf-87a0bd898575.jpeg",
  "prompt": "A little girl grow up.",
  "duration": 6,
  "resolution": "1080P"
}
```

尾帧必填，可用 `last_frame_url` 或 `end_frame_image` 替代 `last_frame_image`。首帧可选；分辨率仅支持 `768P`、`1080P`（不支持 `512P`）。

---

## 响应格式

### 创建任务响应（POST /videos）

创建任务成功时立即返回：

```json
{
  "id": "106916112212032",
  "status": "pending",
  "created_at": "2025-02-09T10:00:00.000000Z",
  "model": "MiniMax-Hailuo-2.3",
  "seconds": 6,
  "size": "1080P"
}
```

| 参数名 | 类型 | 说明 |
|--------|------|------|
| id | string | 任务 ID，用于后续 `GET /videos/{task_id}` 查询；格式为 `{原始任务ID}*{模型ID}` |
| status | string | 固定为 `pending`，表示已提交排队 |
| created_at | string | 任务创建时间（ISO 8601） |
| model | string | 模型名称 |
| seconds | integer | 视频时长（秒），可选 |
| size | string | 视频分辨率（如 1080P），可选 |

任务结果需通过 `GET /videos/{task_id}` 轮询获取，响应格式见下方「查询任务」。

---

## 任务状态（查询接口）

GET 查询任务时，`status` 取值为：

| 状态 | 说明 |
|------|------|
| queued | 排队中 |
| in_progress | 生成中 |
| completed | 已完成 |
| failed | 失败 |

---

## 查询任务

| 网络协议 | 请求地址 | 请求方法 | 请求格式 | 响应格式 |
|----------|----------|----------|----------|----------|
| https | `/videos/{task_id}` | GET | - | application/json |

### 请求头

| 字段 | 值 | 描述 |
|------|-----|------|
| Authorization | Bearer | 鉴权信息 |

### 请求路径参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| task_id | string | 是 | 任务 ID，创建任务时返回的 `id` 字段 |

### 查询参数（可选）

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| provider | string | 否 | 服务商名称，可选，便于路由与缓存 |

---

### 响应体（任务进行中）

`status` 为 `queued` 或 `in_progress` 时：

```json
{
  "id": "106916112212032",
  "status": "in_progress",
  "created_at": "2025-02-09T10:00:00.000000Z"
}
```

### 响应体（任务完成）

`status` 为 `completed` 时：

```json
{
  "id": "106916112212032",
  "status": "completed",
  "created_at": "2025-02-09T10:00:00.000000Z",
  "completed_at": "2025-02-09T10:02:00.000000Z",
  "updated_at": "2025-02-09T10:02:00.000000Z",
  "video_url": "https://example.com/output.mp4",
  "usage": {
    "seconds": 6.0,
    "video_count": 1,
    "size": "1920*1080"
  },
  "raw_response": { ... }
}
```

### 响应体（任务失败）

`status` 为 `failed` 时：

```json
{
  "id": "106916112212032",
  "status": "failed",
  "created_at": "2025-02-09T10:00:00.000000Z",
  "error": "Unknown error",
  "raw_response": { ... }
}
```

---

### 响应字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 任务 ID（与创建任务时返回的 `id` 一致） |
| status | string | 任务状态：`queued`、`in_progress`、`completed`、`failed` |
| created_at | string | 任务创建时间（ISO 8601） |
| completed_at | string | 任务完成时间（仅完成时返回） |
| updated_at | string | 任务更新时间（仅完成时返回） |
| video_url | string | 生成的视频下载 URL（仅完成时返回） |
| usage.seconds | float | 视频时长（秒） |
| usage.video_count | int | 生成的视频数量 |
| usage.size | string | 视频尺寸，格式为 `宽*高`（如 `1920*1080`） |
| raw_response | object | MiniMax 原始响应（完成或失败时返回） |
| error | string | 错误信息（仅失败时返回） |

---

## 注意事项

1. **异步任务**：视频生成为异步，提交后返回任务 ID，需通过轮询或 `callback_url` 获取结果。
2. **分辨率与时长**：文生/图生支持 `768P/1080P`（MiniMax-Hailuo-02 还支持 `512P`），时长 6 秒或 10 秒。首尾帧生成仅支持 `MiniMax-Hailuo-02`，且仅 `768P/1080P`（不支持 `512P`）。参数 `seconds` 与 `duration` 等价，`size` 与 `resolution` 等价，任选其一即可。
3. **prompt 长度**：最大 2000 字符。
4. **回调地址**：若设置 `callback_url`，需在 3 秒内正确响应 `challenge` 校验（原样返回请求体中的 `challenge` 字段）。
5. **计费**：以实际生成视频的用量为准，具体以平台计费规则为准。

---

**官方文档与索引**：[MiniMax 文档索引](https://www.minimaxi.com/document) / [MiniMax 视频生成 API](https://www.minimaxi.com/document/video-gen)