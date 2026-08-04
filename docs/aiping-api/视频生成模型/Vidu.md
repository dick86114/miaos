Vidu 接口文档

接口整体以 Vidu 官方协议为主，返回为扁平 JSON 结构，并在响应中追加平台请求 ID aiping_id。

## 1. 接口列表

| 分类 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 创建视频任务 | POST | /api/v1/multimodal/vidu/videos/text2video | 文生视频 |
| 创建视频任务 | POST | /api/v1/multimodal/vidu/videos/img2video | 图生视频 |
| 创建视频任务 | POST | /api/v1/multimodal/vidu/videos/start-end2video | 首尾帧 |
| 创建视频任务 | POST | /api/v1/multimodal/vidu/videos/reference2video | 参考生视频 |
| 任务管理 | GET | /api/v1/multimodal/vidu/tasks/{task_id}/creations | 查询任务 |
| 任务管理 | GET | /api/v1/multimodal/vidu/tasks | 任务列表 |
| 任务管理 | POST | /api/v1/multimodal/vidu/tasks/{task_id}/cancel | 取消任务 |
| 主体库 | POST | /api/v1/multimodal/vidu/subjects | 创建主体 |
| 主体库 | GET | /api/v1/multimodal/vidu/subjects | 查询主体 |
| 主体库 | PUT | /api/v1/multimodal/vidu/subjects/{id} | 编辑主体 |

## 2. 鉴权与通用约定

### 请求头

| 字段 | 值 | 必填 | 说明 |
|------|-----|------|------|
| Content-Type | application/json | 是 | 请求体格式 |
| Authorization | Bearer {api_key} | 是 | AI Ping 平台 API Key |

### 回调说明

如果创建任务时传入 callback_url，任务状态变化时向该地址发起 POST 请求。

- Content-Type: application/json
- 回调请求支持签名校验，可用于确认回调来源
- Body 为 Vidu 任务响应结构

## 3. 创建视频任务

创建任务接口均为异步接口。创建成功后会返回 task_id，可通过任务查询接口获取最终视频结果。

创建成功响应示例：

```json
{
  "task_id": "1450000000000000000",
  "state": "created",
  "model": "ViduQ3-Pro",
  "prompt": "未来感展厅中，一台银色机器人缓慢走向镜头",
  "duration": 5,
  "resolution": "720p",
  "created_at": "2026-07-09T12:00:00Z",
  "aiping_id": "request-uuid"
}
```

当前可用模型以本文列出的大小写为准。官方存在但本文未列出的模型，当前平台不对外承诺支持。

### 3.1 文生视频

`POST /api/v1/multimodal/vidu/videos/text2video`

根据文本提示词生成视频。

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| model | string | 是 | 模型名，可选 ViduQ3-Pro、ViduQ3-Turbo、ViduQ2。 |
| prompt | string | 是 | 文本提示词，最长 5000 字符。 |
| style | string | 否 | 风格，例如 general、anime；Vidu Q2、Q3 系列模型不生效。 |
| duration | int | 否 | 视频时长；可选范围随模型不同。 |
| aspect_ratio | string | 否 | 画面比例，例如 16:9、9:16、3:4、4:3、1:1。 |
| resolution | string | 否 | 分辨率，例如 540p、720p、1080p。 |
| movement_amplitude | string | 否 | 运动幅度，例如 auto、small、medium、large；Vidu Q2、Q3 系列模型不生效。 |
| seed | int | 否 | 随机种子。不传或传 0 时使用随机数。注意：仅官方线路可用 |
| bgm | bool | 否 | 是否添加背景音乐；部分模型或时长下不生效。 |
| audio | bool | 否 | 是否开启音视频直出；仅 Vidu Q3 系列模型支持。 |
| off_peak | bool | 否 | 错峰模式。 |
| watermark | bool | 否 | 是否添加水印。 |
| wm_position | int | 否 | 水印位置，1 左上、2 右上、3 右下、4 左下，默认 3。注意：仅官方线路可用 |
| wm_url | string | 否 | 自定义水印图片 URL。 |
| payload | string | 否 | 业务透传字段，最多 1048576 个字符。 |
| meta_data | string | 否 | 元数据透传字段，JSON 格式字符串。 |
| callback_url | string | 否 | 任务状态变化时会向该地址发送 POST 回调，回调体与查询任务返回体一致。 |

请求示例：

```json
{
  "model": "ViduQ3-Pro",
  "prompt": "一只可爱的小兔子，戴着眼镜，坐在桌边，看报纸，桌上放着一杯卡布奇诺",
  "duration": 5,
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "audio": true,
  "off_peak": true
}
```

### 3.2 图生视频

`POST /api/v1/multimodal/vidu/videos/img2video`

根据参考图片生成视频。

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| model | string | 是 | 模型名，可选 ViduQ3-Pro、ViduQ3-Turbo、ViduQ3-Pro-Fast、ViduQ2-Pro、ViduQ2-Turbo。 |
| images | array[string] | 是 | 首帧参考图，传 1 张；支持图片 URL 或 Base64 data URL。 |
| prompt | string | 否 | 提示词，最长 5000 字符；启用 is_rec 后以推荐提示词为准。 |
| audio | bool | 否 | 是否开启音视频直出；部分模型默认开启。 |
| audio_type | string | 否 | 音频类型，例如 all、speech_only、sound_effect_only；audio=true 时使用。 |
| voice_id | string | 否 | 音色 ID；为空时由系统推荐，Vidu Q3 系列模型不生效。 |
| is_rec | bool | 否 | 是否使用推荐提示词；开启后会额外消耗积分。注意：仅官方线路可用 |
| bgm | bool | 否 | 是否添加背景音乐；部分模型或时长下不生效。 |
| duration | int | 否 | 视频时长；可选范围随模型不同。 |
| seed | int | 否 | 随机种子。不传或传 0 时使用随机数。注意：仅官方线路可用 |
| resolution | string | 否 | 分辨率，例如 540p、720p、1080p。 |
| movement_amplitude | string | 否 | 运动幅度，例如 auto、small、medium、large；Vidu Q2、Q3 系列模型不生效。 |
| payload | string | 否 | 业务透传字段，最多 1048576 个字符。 |
| off_peak | bool | 否 | 错峰模式。 |
| watermark | bool | 否 | 是否添加水印。 |
| wm_position | int | 否 | 水印位置，1 左上、2 右上、3 右下、4 左下，默认 3。注意：仅官方线路可用 |
| wm_url | string | 否 | 自定义水印图片 URL。 |
| meta_data | string | 否 | 元数据透传字段，JSON 格式字符串。 |
| callback_url | string | 否 | 任务状态变化时会向该地址发送 POST 回调，回调体与查询任务返回体一致。 |

请求示例：

```json
{
  "model": "ViduQ3-Pro",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png"
  ],
  "prompt": "镜头缓缓推进",
  "duration": 5,
  "resolution": "720p",
  "audio": true,
  "off_peak": true
}
```

### 3.3 首尾帧

`POST /api/v1/multimodal/vidu/videos/start-end2video`

根据首帧和尾帧图片生成过渡视频。images 传 2 张图片，第一张为首帧，第二张为尾帧。

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| model | string | 是 | 模型名，可选 ViduQ3-Pro、ViduQ3-Turbo、ViduQ2-Pro、ViduQ2-Turbo。 |
| images | array[string] | 是 | 首尾帧图片 URL 数组，传 2 张；支持图片 URL 或 Base64 data URL。 |
| prompt | string | 否 | 提示词，最长 5000 字符；启用 is_rec 后以推荐提示词为准。 |
| is_rec | bool | 否 | 是否使用推荐提示词；开启后会额外消耗积分。注意：仅官方线路可用 |
| duration | int | 否 | 视频时长；可选范围随模型不同。 |
| seed | int | 否 | 随机种子。不传或传 0 时使用随机数。注意：仅官方线路可用 |
| resolution | string | 否 | 分辨率，例如 540p、720p、1080p。 |
| movement_amplitude | string | 否 | 运动幅度，例如 auto、small、medium、large；Vidu Q2、Q3 系列模型不生效。 |
| audio | bool | 否 | 是否开启音视频直出；仅 Vidu Q3 系列模型支持。 |
| bgm | bool | 否 | 是否添加背景音乐；Vidu Q3 系列模型不生效。 |
| payload | string | 否 | 业务透传字段，最多 1048576 个字符。 |
| off_peak | bool | 否 | 错峰模式。 |
| watermark | bool | 否 | 是否添加水印。 |
| wm_position | int | 否 | 水印位置，1 左上、2 右上、3 右下、4 左下，默认 3。注意：仅官方线路可用 |
| wm_url | string | 否 | 自定义水印图片 URL。 |
| meta_data | string | 否 | 元数据透传字段，JSON 格式字符串。 |
| callback_url | string | 否 | 任务状态变化时会向该地址发送 POST 回调，回调体与查询任务返回体一致。 |

请求示例：

```json
{
  "model": "ViduQ3-Pro",
  "images": [
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
    "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png"
  ],
  "prompt": "镜头从首帧平滑过渡到尾帧，人物缓缓转身",
  "duration": 5,
  "resolution": "720p",
  "audio": true,
  "off_peak": false
}
```

### 3.4 参考生视频

`POST /api/v1/multimodal/vidu/videos/reference2video`

根据参考主体生成一致性视频。

参考生视频支持两种主体来源：
- 内联主体：在 `subjects[]` 中直接传 `name/images/videos/voice_id`。
- 主体库主体：先调用主体库创建主体，再在 `subjects[]` 中传 `server_id`。主体库主体仅官方 Vidu 线路支持。

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| model | string | 是 | 模型名，可选 ViduQ3-Turbo、ViduQ2-Pro、ViduQ2。 |
| prompt | string | 是 | 文本提示词，可用 `@name` 引用主体，最长 5000 字符。 |
| auto_subjects | bool | 否 | 是否使用智能主体库能力，默认 false。 |
| subjects | array[object] | 是 | 主体数组。可传内联主体，或传主体库 `server_id`。 |
| subjects[].name | string | 是 | 主体名称，通常与 prompt 中的 `@name` 对应。 |
| subjects[].images | array[string] | 否 | 内联主体图片，与 `subjects[].videos` 至少传一类；支持图片 URL 或 Base64 data URL。 |
| subjects[].videos | array[string] | 否 | 内联主体视频，与 `subjects[].images` 至少传一类；仅部分模型支持视频主体。 |
| subjects[].voice_id | string | 否 | 主体音色 ID；部分模型不生效。 |
| subjects[].server_id | string | 否 | 主体库 ID，仅官方 Vidu 线路支持。 |
| audio | bool | 否 | 是否开启音视频直出。 |
| audio_type | string | 否 | 音频类型，例如 all、speech_only、sound_effect_only；`audio=true` 时使用。 |
| duration | int | 否 | 视频时长；可选范围随模型不同。 |
| seed | int | 否 | 随机种子。不传或传 0 时使用随机数。注意：仅官方线路可用 |
| aspect_ratio | string | 否 | 画面比例，例如 16:9、9:16、1:1。 |
| resolution | string | 否 | 分辨率，例如 540p、720p、1080p。 |
| movement_amplitude | string | 否 | 运动幅度，例如 auto、small、medium、large；Vidu Q2、Q3 系列模型不生效。 |
| payload | string | 否 | 业务透传字段，最多 1048576 个字符。 |
| off_peak | bool | 否 | 错峰模式。 |
| watermark | bool | 否 | 是否添加水印。 |
| wm_position | int | 否 | 水印位置，1 左上、2 右上、3 右下、4 左下，默认 3。注意：仅官方线路可用 |
| wm_url | string | 否 | 自定义水印图片 URL。 |
| meta_data | string | 否 | 元数据透传字段，JSON 格式字符串。 |
| callback_url | string | 否 | 任务状态变化时会向该地址发送 POST 回调，回调体与查询任务返回体一致。 |

内联主体请求示例：

```json
{
  "model": "ViduQ3-Turbo",
  "subjects": [
    {
      "name": "subject1",
      "images": [
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-1.png",
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-2.png"
      ]
    },
    {
      "name": "subject2",
      "images": [
        "https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/reference2video-3.png"
      ]
    }
  ],
  "prompt": "@subject1 和 @subject2 在公园里散步，阳光明媚。",
  "duration": 5,
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "audio": true,
  "off_peak": false
}
```

主体库请求示例，仅官方 Vidu 线路支持：

```json
{
  "model": "ViduQ3-Turbo",
  "subjects": [
    {
      "name": "hero",
      "server_id": "platform-subject-id"
    }
  ],
  "prompt": "@hero 在城市街头自然行走，保持人物一致性",
  "duration": 8,
  "audio": true
}
```

## 4. 任务管理

### 4.1 查询任务

`GET /api/v1/multimodal/vidu/tasks/{task_id}/creations`

`task_id` 为创建响应返回的 `task_id`。

成功响应示例：

```json
{
  "id": "1450000000000000000",
  "state": "success",
  "err_code": "",
  "payload": "test-vidu-text2video",
  "bgm": false,
  "off_peak": false,
  "credits": 4,
  "creations": [
    {
      "id": "creation-id",
      "url": "https://example.com/result.mp4",
      "cover_url": "https://example.com/cover.jpg",
      "watermarked_url": "https://example.com/result-watermarked.mp4"
    }
  ],
  "aiping_id": "request-uuid"
}
```

响应字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 任务 ID。 |
| state | string | 任务状态，可能为 created、queueing、processing、success、failed。 |
| err_code | string | 失败时的错误码。 |
| credits | int | 任务消耗的积分数。 |
| payload | string | 创建任务时传入的透传字段。 |
| bgm | bool | 本次任务是否使用背景音乐。 |
| off_peak | bool | 本次任务是否使用错峰模式。 |
| creations | array[object] | 生成物结果。 |
| creations[].id | string | 生成物 ID。 |
| creations[].url | string | 生成物 URL，官方有效期为 24 小时。 |
| creations[].cover_url | string | 生成物封面 URL，官方有效期为 24 小时。 |
| creations[].watermarked_url | string | 带水印的生成物 URL，官方有效期为 24 小时。 |
| aiping_id | string | 平台请求 ID。 |

### 4.2 任务列表

`GET /api/v1/multimodal/vidu/tasks`

查询当前用户的 Vidu 视频任务列表。

查询参数：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| pager.page | Int | 可选 | 页码，默认从第 0 页开始 |
| pager.pagesz | Int | 可选 | 每页的条数默认 10，最大 100 |

响应示例：

```json
{
  "tasks": [
    {
      "id": "1450000000000000000",
      "state": "processing",
      "model": "ViduQ3-Pro",
      "prompt": "未来感展厅中，一台银色机器人缓慢走向镜头",
      "duration": 5,
      "resolution": "720p",
      "aspect_ratio": "16:9",
      "created_at": 1783579200000,
      "creations": []
    }
  ],
  "aiping_id": "request-uuid"
}
```

响应字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| tasks | array[object] | 任务列表。任务对象可能包含任务 ID、状态、模型、提示词、图片、时长、分辨率、画面比例、生成物、创建时间、积分等字段。 |
| aiping_id | string | 平台请求 ID。 |

### 4.3 取消任务

`POST /api/v1/multimodal/vidu/tasks/{task_id}/cancel`

取消任务仅官方 Vidu 线路支持。`task_id` 为创建响应返回的 `task_id`。

成功响应：

```json
{
  "aiping_id": "request-uuid"
}
```

如果未使用官方 Vidu，取消任务可能返回不支持该能力的错误。

## 5. 主体库

主体库能力仅官方 Vidu 线路支持。主体库接口返回的 `id` 是平台主体 ID，后续在参考生视频中作为 `subjects[].server_id` 使用。

### 5.1 创建主体

`POST /api/v1/multimodal/vidu/subjects`

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 是 | 主体名称，建议唯一。 |
| images | array[string] | 条件 | 主体图片。传图片主体时至少 1 张、最多 3 张，支持 URL 或 Base64 data URL，格式支持 png、jpeg、jpg、webp。 |
| videos | array[string] | 条件 | 主体视频。最多 1 个 5 秒视频，支持 URL 或 Base64 data URL，格式支持 mp4、avi、mov；仅部分参考生模型支持视频主体。 |
| voice_id | string | 否 | 主体音色 ID；创建音视频直出任务时使用，部分模型不支持。 |

请求示例：

```json
{
  "name": "hero",
  "images": ["https://example.com/hero.png"],
  "voice_id": ""
}
```

响应示例：

```json
{
  "id": "platform-subject-id",
  "name": "hero",
  "images": ["https://example.com/hero.png"],
  "videos": [],
  "voice_id": "",
  "style": "",
  "description": "",
  "credits": 1,
  "aiping_id": "request-uuid"
}
```

### 5.2 查询主体

`GET /api/v1/multimodal/vidu/subjects`

查询参数：

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| ownership | string | 否 | 主体归属，private 或 system，默认 private。 |
| subject_ids | array/string | 否 | 指定主体 ID 查询，可以传多个。 |
| count | int | 否 | 查询数量，默认 20，最大 100。 |
| next_page_token | string | 否 | 下一页游标；第一页可不传。 |

响应示例：

```json
{
  "subjects": [
    {
      "id": "platform-subject-id",
      "name": "hero",
      "images": ["https://example.com/hero.png"],
      "videos": [],
      "voice_id": "",
      "style": "",
      "description": ""
    }
  ],
  "next_page_token": "",
  "count": 1,
  "aiping_id": "request-uuid"
}
```

响应字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| subjects | array[object] | 主体列表。 |
| subjects[].id | string | 平台主体 ID，后续在参考生视频中作为 `subjects[].server_id` 使用。 |
| subjects[].name | string | 主体名称。 |
| subjects[].images | array[string] | 主体图片。 |
| subjects[].videos | array[string] | 主体视频。 |
| subjects[].voice_id | string | 主体绑定的音色 ID。 |
| subjects[].style | string | 主体风格信息；官方主体可能不展示。 |
| subjects[].description | string | 主体描述；官方主体可能不展示。 |
| next_page_token | string | 下一页游标。 |
| count | int | 本次返回数量。 |
| aiping_id | string | 平台请求 ID。 |

### 5.3 编辑主体

`PUT /api/v1/multimodal/vidu/subjects/{id}`

路径参数 `id` 是创建主体或查询主体返回的平台注册主体 ID。

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| name | string | 否 | 新主体名称，最长 64 字符。 |
| images | array[string] | 否 | 新主体图片，会覆盖原主体图片；支持 URL 或 Base64 data URL，最多 3 张。 |
| videos | array[string] | 否 | 新主体视频，会覆盖原主体视频；同时存在图片和视频时，按 Vidu 官方规则视频优先。 |
| style | string | 否 | 主体风格描述，最长 100 字符。 |
| description | string | 否 | 主体描述，最长 2000 字符。 |
| voice_id | string | 否 | 新音色 ID。 |

请求示例：

```json
{
  "name": "hero_v2",
  "style": "realistic",
  "description": "成年男性，黑色夹克，短发",
  "voice_id": ""
}
```

响应示例：

```json
{
  "id": "platform-subject-id",
  "name": "hero_v2",
  "style": "realistic",
  "description": "成年男性，黑色夹克，短发",
  "voice_id": "",
  "aiping_id": "request-uuid"
}
```

## 6. 注意事项

- ViduQ2 错峰价格为正常生成价格的一半；由于计算精度问题，可能会略微向上浮动。
- 参考生视频开启音视频直出功能时，会在对应任务基础上多消耗 0.46875 元。

以下能力需要使用官方 Vidu 以保证可用：

| 能力/字段 | 说明 |
|-----------|------|
| 主体库接口 | 创建主体、查询主体、编辑主体均仅官方 Vidu 线路支持。 |
| subjects[].server_id | 在参考生视频中引用主体库主体，仅官方 Vidu 线路支持。 |
| 取消任务 | POST /api/v1/multimodal/vidu/tasks/{task_id}/cancel 仅官方 Vidu 线路支持。 |