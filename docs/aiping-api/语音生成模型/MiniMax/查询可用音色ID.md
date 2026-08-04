# MiniMax 查询可用音色 ID API 文档

## 接口简介

使用本接口可查询当前账号下可调用的全部音色 ID（`voice_id`），包括：

- 系统音色
- 快速复刻音色（音色快速复刻）
- 文生音色（音色设计 生成的音色）
- 音乐生成接口的人声音色、伴奏音色（若支持）

**说明：** 快速复刻得到的音色为未激活状态，需正式调用一次语音合成后，才可在本接口中查询到。

## 请求地址与鉴权

| 项目 | 说明 |
|------|------|
| 请求方法 | POST |
| 请求地址 | `/v1/audio/minimax/voices/list` |
| Content-Type | `application/json` |
| 鉴权方式 | `Authorization: Bearer ***` |

## 请求参数

请求体为 `application/json`。

### 主请求体

| 参数名 | 类型 | 必填 | 说明 | 默认值 | 取值范围/格式 |
|--------|------|------|------|--------|----------------|
| voice_type | string | 是 | 要查询的音色类型 | - | 见下方「`voice_type` 取值」 |

### voice_type 取值

| 取值 | 说明 |
|------|------|
| `system` | 系统音色 |
| `voice_cloning` | 快速复刻的音色（仅成功用于语音合成后才可在此查询到） |
| `voice_generation` | 文生音色接口生成的音色（仅成功用于语音合成后才可在此查询到） |
| `all` | 以上全部 |

## 请求示例

### cURL

```bash
curl -X POST "https://aiping.cn/api/v1/audio/minimax/voices/list" \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"voice_type": "all"}'
```

### 仅查系统音色

```json
{
  "voice_type": "system"
}
```

## 响应格式

### 成功响应（application/json）

```json
{
  "system_voice": [
    {
        "voice_id": "Chinese (Mandarin)_Reliable_Executive",
        "voice_name": "沉稳高管",
        "description": ["一位沉稳可靠的中年男性高管声音，标准普通话，传递出值得信赖的感觉。"],
        "created_time": "1970-01-01"
    },
    {
        "voice_id": "Chinese (Mandarin)_News_Anchor",
        "voice_name": "新闻女声",
        "description": ["一位专业、播音腔的中年女性新闻主播，标准普通话。"],
        "created_time": "1970-01-01"
    }
  ],
  "voice_cloning": [
    {
        "voice_id": "test12345",
        "description": [],
        "created_time": "2025-08-20"
    }
  ],
  "voice_generation": [
    {
        "voice_id": "ttv-voice-2025082011321125-2uEN0X1S",
        "description": [],
        "created_time": "2025-08-20"
    }
  ],
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

**字段说明：**
- `system_voice`：系统预定义音色列表。每项含 `voice_id`（用于合成）、`voice_name`（展示名）、`description`（描述数组）、`created_time`（格式 `yyyy-mm-dd`）。
- `voice_cloning`：快速复刻音色列表。每项含 `voice_id`、`description`、`created_time`。
- `voice_generation`：文生音色列表。每项含 `voice_id`、`description`、`created_time`。
- 未请求的类型对应的数组可能不存在或为空数组。
- `base_resp.status_code`：0 表示成功，非 0 见下方错误码。

## 错误码（base_resp.status_code）

| 状态码 | 说明 |
|--------|------|
| 0 | 请求结果正常 |
| 2013 | 输入参数信息不正常 |