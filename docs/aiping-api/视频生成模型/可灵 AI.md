# 可灵 AI 视频生成 API 文档

可灵官方文档（可参考）：https://klingai.com/document-api/api/video/3-0-omni/text-to-video

## API 总览

### 统一请求头

| 字段 | 值 | 描述 |
|------|-----|------|
| Content-Type | application/json | 数据交换格式 |
| Authorization | Bearer | 鉴权信息 |

### 核心说明

- 统一采用 `{BASE_URL}/api/v1/multimodal/kling/videos/...` 接口路径承载可灵视频能力。
- 统一采用 `{BASE_URL}/api/v1/multimodal/kling/general/...` 接口路径承载可灵主体和音色能力。
- 当前视频任务长期可查，但 URL 有有效期，查询到视频结果后请及时转存。
- `BASE_URL` 为 `https://aiping.cn`

---

## 视频能力接口

| 功能 | 方法 | 路径 |
|------|------|------|
| 文生视频（Text2Video） | | |
| 创建 | POST | `/api/v1/multimodal/kling/videos/text2video` |
| 单任务查询 | GET | `/api/v1/multimodal/kling/videos/text2video/{task_id}` |
| 列表查询 | GET | `/api/v1/multimodal/kling/videos/text2video?pageNum=1&pageSize=30` |
| 图生视频（Image2Video） | | |
| 创建 | POST | `/api/v1/multimodal/kling/videos/image2video` |
| 单任务查询 | GET | `/api/v1/multimodal/kling/videos/image2video/{task_id}` |
| 列表查询 | GET | `/api/v1/multimodal/kling/videos/image2video?pageNum=1&pageSize=30` |
| Omni / 多镜头（Omni Video） | | |
| 创建 | POST | `/api/v1/multimodal/kling/videos/omni-video` |
| 单任务查询 | GET | `/api/v1/multimodal/kling/videos/omni-video/{task_id}` |
| 列表查询 | GET | `/api/v1/multimodal/kling/videos/omni-video?pageNum=1&pageSize=30` |
| 多图参考生视频（Multi-Image2Video） | | |
| 创建 | POST | `/api/v1/multimodal/kling/videos/multi-image2video` |
| 单任务查询 | GET | `/api/v1/multimodal/kling/videos/multi-image2video/{task_id}` |
| 列表查询 | GET | `/api/v1/multimodal/kling/videos/multi-image2video?pageNum=1&pageSize=30` |
| 动作控制（Motion Control） | | |
| 创建 | POST | `/api/v1/multimodal/kling/videos/motion-control` |
| 单任务查询 | GET | `/api/v1/multimodal/kling/videos/motion-control/{task_id}` |
| 列表查询 | GET | `/api/v1/multimodal/kling/videos/motion-control?pageNum=1&pageSize=30` |
| 视频延长（Video Extend） | | |
| 创建 | POST | `/api/v1/multimodal/kling/videos/video-extend` |
| 单任务查询 | GET | `/api/v1/multimodal/kling/videos/video-extend/{task_id}` |
| 列表查询 | GET | `/api/v1/multimodal/kling/videos/video-extend?pageNum=1&pageSize=30` |

---

## 主体能力接口

| 能力 | 方法 | 路径 |
|------|------|------|
| 创建自定义主体 | POST | `/api/v1/multimodal/kling/general/advanced-custom-elements` |
| 查询自定义主体列表 | GET | `/api/v1/multimodal/kling/general/advanced-custom-elements` |
| 查询自定义主体单个 | GET | `/api/v1/multimodal/kling/general/advanced-custom-elements/{id}` |
| 查询官方主体列表 | GET | `/api/v1/multimodal/kling/general/advanced-presets-elements` |
| 删除自定义主体 | POST | `/api/v1/multimodal/kling/general/delete-elements` |

---

## 音色能力接口

| 能力 | 方法 | 路径 |
|------|------|------|
| 创建自定义音色 | POST | `/api/v1/multimodal/kling/general/custom-voices` |
| 查询自定义音色单个 | GET | `/api/v1/multimodal/kling/general/custom-voices/{id}` |
| 查询自定义音色列表 | GET | `/api/v1/multimodal/kling/general/custom-voices?pageNum=1&pageSize=30` |
| 查询官方音色列表 | GET | `/api/v1/multimodal/kling/general/presets-voices?pageNum=1&pageSize=30` |
| 删除自定义音色 | POST | `/api/v1/multimodal/kling/general/delete-voices` |

---

## 返回结果（总览）

### 创建任务返回（示例）

```json
{
  "code": 0,
  "message": "string",
  "request_id": "string",
  "data": {
    "task_id": "string",
    "task_status": "submitted",
    "task_info": {
      "external_task_id": "string"
    },
    "created_at": 1722769557708,
    "updated_at": 1722769557708
  },
  "aiping_id": "string"
}
```

### 单任务查询返回（示例）

```json
{
  "code": 0,
  "message": "string",
  "request_id": "string",
  "data": {
    "task_id": "string",
    "task_status": "succeed",
    "task_status_msg": "string",
    "task_info": {
      "external_task_id": "string"
    },
    "task_result": {
      "videos": [
        {
          "id": "string",
          "url": "string",
          "watermark_url": "string",
          "duration": "string"
        }
      ]
    },
    "watermark_info": {
      "enabled": true
    },
    "final_unit_deduction": "string",
    "created_at": 1722769557708,
    "updated_at": 1722769557708
  },
  "aiping_id": "string"
}
```

### 列表查询返回（示例）

```json
{
  "code": 0,
  "message": "string",
  "request_id": "string",
  "data": [
    {
      "task_id": "string",
      "task_status": "succeed",
      "task_status_msg": "string",
      "task_info": {
        "external_task_id": "string"
      },
      "task_result": {
        "videos": [
          {
            "id": "string",
            "url": "string",
            "watermark_url": "string",
            "duration": "string"
          }
        ]
      },
      "watermark_info": {
        "enabled": boolean
      },
      "final_unit_deduction": "string",
      "created_at": 1722769557708,
      "updated_at": 1722769557708
    }
  ],
  "aiping_id": "string"
}
```

---

## 文生视频

文生视频用于根据文本提示词生成视频。

### 创建任务

| 网络协议 | 请求地址 | 请求方法 | 请求格式 | 响应格式 |
|----------|----------|----------|----------|----------|
| https | `/api/v1/multimodal/kling/videos/text2video` | POST | application/json | application/json |

### 请求头

| 字段 | 值 | 描述 |
|------|-----|------|
| Content-Type | application/json | 数据交换格式 |
| Authorization | Bearer | 鉴权信息 |

### 请求体参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| model_name | string | 否 | Kling-V3 | 推荐使用的模型字段，目前支持Kling-V3，Kling-V2.6，Kling-V1.6 |
| model | string | 否 | 无 | 兼容字段，会映射到 model_name |
| prompt | string | 否 | 无 | 文本提示词 |
| negative_prompt | string | 否 | 空 | 负向提示词 |
| multi_shot | boolean | 否 | false | 多镜头开关 |
| shot_type | string | 条件必填 | 无 | `multi_shot=true` 时按上游规则生效 |
| multi_prompt | array | 条件必填 | 无 | 多镜头分镜信息 |
| sound | string | 否 | off | 是否生成声音 |
| cfg_scale | float | 否 | 0.5 | 提示词参考强度，取值范围 [0,1] |
| mode | string | 否 | std | 视频模式 |
| aspect_ratio | string | 否 | 16:9 | 画面比例 |
| seconds | string | 否 | 无 | 兼容时长字段 |
| duration | string | 否 | 无 | 时长字段 |
| camera_control | object | 否 | 空 | 运镜控制 |
| watermark_info | object | 否 | 空 | 是否同时生成含水印的结果 |
| callback_url | string | 否 | 空 | 回调地址 |
| external_task_id | string | 否 | 空 | 自定义任务 ID |

### 请求示例

```shell
curl --request POST \
    --url https://aiping.cn/api/v1/multimodal/kling/videos/text2video \
    --header 'Authorization: Bearer ***' \
    --header 'Content-Type: application/json' \
    --data '{
      "model_name": "Kling-V2.6",
      "prompt": "一只可爱的小兔子，戴着眼镜，坐在桌边，看报纸，桌上放着一杯卡布奇诺",
      "negative_prompt": "",
      "duration": "5",
      "mode": "pro",
      "sound": "on",
      "aspect_ratio": "1:1",
      "callback_url": "",
      "external_task_id": ""
    }'
```

### 创建返回

```json
{
  "code": 0, // 错误码，具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": {
    "task_id": "string", // 任务ID，系统生成
    "task_info": { // 任务创建时的参数信息
      "external_task_id": "string" // 客户自定义任务ID
    },
    "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 // 任务更新时间，Unix时间戳、单位ms
  }
}
```

### 查询任务

#### 查询单个

| 网络协议 | 请求地址 | 请求方法 | 请求格式 | 响应格式 |
|----------|----------|----------|----------|----------|
| https | `/api/v1/multimodal/kling/videos/text2video/{task_id}` | GET | application/json | application/json |

#### 查询任务返回（单个）

```json
{
  "code": 0, // 错误码，具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": {
    "task_id": "string", // 任务ID，系统生成
    "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
    "task_status_msg": "string", // 任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
    "task_info": { // 任务创建时的参数信息
      "external_task_id": "string" // 客户自定义任务ID
    },
    "task_result": {
      "videos": [
        {
          "id": "string", // 生成的视频ID，全局唯一
          "url": "string", // 生成视频的URL（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
          "watermark_url": "string", // 含水印视频下载URL，防盗链格式
          "duration": "string" // 视频总时长，单位s
        }
      ]
    },
    "watermark_info": {
      "enabled": boolean
    },
    "final_unit_deduction": "string", // 任务最终扣减积分数值
    "final_balance_deduction": {
      "quota": "string"
    },
    "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
    "updated_at": 1722769557708 // 任务更新时间，Unix时间戳、单位ms
  }
}
```

#### 查询列表

| 网络协议 | 请求地址 | 请求方法 | 请求格式 | 响应格式 |
|----------|----------|----------|----------|----------|
| https | `/api/v1/multimodal/kling/videos/text2video?pageNum=1&pageSize=30` | GET | application/json | application/json |

#### 查询任务返回（列表）

```json
{
  "code": 0, // 错误码，具体定义见错误码
  "message": "string", // 错误信息
  "request_id": "string", // 请求ID，系统生成，用于跟踪请求、排查问题
  "data": [
    {
      "task_id": "string", // 任务ID，系统生成
      "task_status": "string", // 任务状态，枚举值：submitted（已提交）、processing（处理中）、succeed（成功）、failed（失败）
      "task_status_msg": "string", // 任务状态信息，当任务失败时展示失败原因（如触发平台的内容风控等）
      "task_info": { // 任务创建时的参数信息
        "external_task_id": "string" // 客户自定义任务ID
      },
      "task_result": {
        "videos": [
          {
            "id": "string", // 生成的视频ID，全局唯一
            "url": "string", // 生成视频的URL（请注意，为保障信息安全，生成的图片/视频会在30天后被清理，请及时转存）
            "watermark_url": "string", // 含水印视频下载URL，防盗链格式
            "duration": "string" // 视频总时长，单位s
          }
        ]
      },
      "watermark_info": {
        "enabled": boolean
      },
      "final_unit_deduction": "string", // 任务最终扣减积分数值
      "created_at": 1722769557708, // 任务创建时间，Unix时间戳、单位ms
      "updated_at": 1722769557708 // 任务更新时间，Unix时间戳、单位ms
    }
  ]
}
```

### 注意事项

- 参数与取值以官方文档为准，优先使用 `model_name`。
- `model` 仅是兼容写法，不建议作为主文档字段。
- 不同模型在 `mode`、`duration`、`sound`、`camera_control` 上支持范围不同，以官方能力地图为准。

---

## 图生视频

图生视频用于根据参考图像（首帧/尾帧）与提示词生成视频。

### 创建任务

| 网络协议 | 请求地址 | 请求方法 | 请求格式 | 响应格式 |
|----------|----------|----------|----------|----------|
| https | `/api/v1/multimodal/kling/videos/image2video` | POST | application/json | application/json |

### 请求头

| 字段 | 值 | 描述 |
|------|-----|------|
| Content-Type | application/json | 数据交换格式 |
| Authorization | Bearer | 鉴权信息 |

### 请求体参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| model_name | string | 可选 | Kling-V3 | 推荐模型字段，目前支持Kling-V3，Kling-V2.6，Kling-V1.6 |
| model | string | 可选 | 无 | 兼容字段，会映射到 model_name |
| image | string | 条件必填 | 无 | 参考图，支持 URL/Base64；与 `image_tail` 至少二选一 |
| image_tail | string | 条件必填 | 无 | 尾帧参考图；与 `image` 至少二选一 |
| multi_shot | boolean | 可选 | false | 是否多镜头；true 时 prompt 失效 |
| shot_type | string | 条件必填 | 无 | `multi_shot=true` 时必填：customize/intelligence |
| prompt | string | 条件必填 | 无 | 正向提示词；长度不超过 2500 |
| multi_prompt | array | 条件必填 | 无 | `multi_shot=true` 且 `shot_type=customize` 时必填 |
| negative_prompt | string | 可选 | 空 | 负向提示词，长度不超过 2500 |
| element_list | array | 可选 | 空 | 参考主体列表，最多 3 个主体 |
| voice_list | array | 可选 | 空 | 音色列表，最多 2 个，和 `element_list` 互斥 |
| sound | string | 可选 | off | 是否生成声音：on/off |
| cfg_scale | float | 可选 | 0.5 | 自由度，范围 [0,1]（kling-v2.x 不支持） |
| mode | string | 可选 | std | 生成模式：std / pro / 4k |
| static_mask | string | 可选 | 空 | 静态笔刷 mask 图片 |
| dynamic_masks | array | 可选 | 空 | 动态笔刷配置列表（每项含 mask + trajectories） |
| camera_control | object | 可选 | 空 | 摄像机运动控制参数 |
| aspect_ratio | string | 可选 | 16:9 | 画面比例：16:9 / 9:16 / 1:1 |
| seconds | string | 可选 | 无 | 兼容时长字段 |
| duration | string | 可选 | 无 | 时长字段 |
| watermark_info | object | 可选 | 空 | 水印开关 |
| callback_url | string | 可选 | 空 | 回调地址 |
| external_task_id | string | 可选 | 空 | 自定义任务 ID |

### 参数兼容

| 兼容字段 | 行为 |
|----------|------|
| model | 自动映射到官方字段 `model_name` |
| seconds | 统一视频创建流程可兼容，最终按标准化逻辑处理 |

### 接口约束

- 当模型为 `Kling-Video-O1` 或 `Kling-V3-Omni` 时，请使用 `/api/v1/multimodal/kling/videos/omni-video`。

### 注意事项

- 参数与取值以官方文档为准。
- 图生视频涉及较多互斥/组合规则（如 `element_list` 与 `voice_list`、`multi_shot` 条件必填等），请按官方约束组包。

---

## 多图参考生视频

### 创建任务

| 网络协议 | 请求地址 | 请求方法 | 请求格式 | 响应格式 |
|----------|----------|----------|----------|----------|
| https | `/api/v1/multimodal/kling/videos/multi-image2video` | POST | application/json | application/json |

### 请求头

| 字段 | 值 | 描述 |
|------|-----|------|
| Content-Type | application/json | 数据交换格式 |
| Authorization | Bearer | 鉴权信息 |

### 请求体参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| model_name | string | 否 | Kling-V1.6 | 推荐模型字段，目前支持Kling-V1.6 |
| model | string | 否 | 无 | 兼容字段，会映射到 model_name |
| image_list | array | 是 | 无 | 参考图片列表（会自动归一化） |
| reference_images | array | 否 | 无 | image_list 兼容别名 |
| prompt | string | 否 | 空 | 正向提示词 |
| negative_prompt | string | 否 | 空 | 负向提示词 |
| mode | string | 否 | std | 模式（常见 std / pro） |
| seconds | string | 否 | 无 | 兼容时长字段 |
| duration | string | 否 | 无 | 时长字段 |
| aspect_ratio | string | 否 | 16:9 | 画面比例 |
| watermark_info | object | 否 | 空 | 水印开关 |
| callback_url | string | 否 | 空 | 回调地址 |
| external_task_id | string | 否 | 空 | 自定义任务 ID |

### 请求示例

```shell
curl --request POST \
    --url https://aiping.cn/api/v1/multimodal/kling/videos/multi-image2video \
    --header 'Authorization: Bearer ***' \
    --header 'Content-Type: application/json' \
    --data '{
      "model_name": "Kling-V1.6",
      "image_list": [
        { "image": "https://p1-kling.klingai.com/kcdn/cdn-kcdn112452/kling-qa-test/dog.png" },
        { "image": "https://p1-kling.klingai.com/kcdn/cdn-kcdn112452/kling-qa-test/dog_cloth.png" }
      ],
      "prompt": "一只白色比熊穿着东北红色花棉袄，舔自己的手",
      "negative_prompt": "",
      "mode": "pro",
      "duration": "5",
      "aspect_ratio": "16:9",
      "callback_url": "",
      "external_task_id": ""
    }'
```

### 创建返回

```json
{
  "code": 0,
  "message": "string",
  "request_id": "string",
  "data": {
    "task_id": "string",
    "task_status": "string",
    "created_at": 1722769557708,
    "updated_at": 1722769557708
  }
}
```

### 注意事项

- `model` 是兼容字段，建议优先使用 `model_name`。
- 多图输入建议直接按 `{ "image": "..." }` 结构传参，最稳定。

---

## 动作控制

动作控制用于通过参考图像和参考视频生成视频，使生成视频中的人物动作与参考视频一致。

### 创建动作控制任务

| 网络协议 | 请求地址 | 请求方法 | 请求格式 | 响应格式 |
|----------|----------|----------|----------|----------|
| https | `/api/v1/multimodal/kling/videos/motion-control` | POST | application/json | application/json |

### 请求体参数（关键部分）

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| model_name | string | 可选 | Kling-V2.6，推荐模型 |
| image_url | string | 必填 | 参考图像URL/Base64 |
| video_url | string | 必填 | 参考视频链接 |
| character_orientation | string | 必填 | 人物朝向：image / video |
| mode | string | 必填 | 生成模式：std / pro |

---

## Omni 视频生成

### 关键约束

- 多镜头开启时，`shot_type` 与 `multi_prompt` 需满足组合规则。
- 有 `video_list` 且 `refer_type=base` 时，上游 Omni 会按"视频编辑/指令变换"场景处理，请求路径仍为 `/api/v1/multimodal/kling/videos/omni-video`，但时长/比例等参数会受到视频编辑场景限制。
- `Kling-Video-O1`、`Kling-V3-Omni` 应优先走本路径，若走 `text2video/image2video` 路径可能返回 422。

---

## 视频延长

视频延长用于基于已有视频继续延长生成。

### 请求体参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| video_id | string | 必填 | 原视频ID，不超过3分钟，仅支持V1.6生成 |
| prompt | string | 可选 | 延长部分文本提示 |

---

## 主体管理

### 重要约定

- **主体 ID**：创建成功后返回主体唯一标识 `element_id`，后续查询、视频生成、删除均使用该 ID。
- **异步状态**：`status` 枚举为 `submitted` / `processing` / `succeed` / `failed`，需轮询查询单个接口，后台自动收敛状态。
- **可用时机**：仅当 `status = succeed` 后，该主体才可用于视频生成。

---

## 音色管理

### 创建自定义音色

支持从音频文件或已有视频提取音色，创建成功后可在视频生成时使用。

### 计费说明

自定义音色创建成功后会进行计费，计费模块名为 `custom-voices`。