# 嵌入模型（Embedding）

## 1. 嵌入模型（Embedding）

- **API 端点**: [https://aiping.cn/api/v1/embeddings](https://aiping.cn/api/v1/embeddings)
- **Note**: 使用 OpenAI SDK 时，base_url 使用 [https://aiping.cn/api/v1](https://aiping.cn/api/v1) （不要带 /embeddings），通过 `client.embeddings.create(...)` 调用
- **说明**: 与 OpenAI Embeddings API 高度兼容；为实现多服务商路由/计费，扩展了 `extra_body`（请求）与 `provider`（响应）等字段

### 1.1 Header 参数

#### Authorization

**Bearer Token**

在 Header 添加参数 `Authorization` ， 其值为在 Bearer 之后拼接 Token

示例:
```
Authorization: Bearer ******...****
```

### 1.2 Body 参数

| 字段 | 类型 | 是否必需 | 说明 |
|------|------|----------|------|
| `model` | string | 必需 | 标准 Embedding 模型目录，不区分大小写，服务端自动标准化；需在系统标准 Embedding 目录内 |
| `input` | string / array[string] | 必需 | 支持单条或多条文本 |
| `encoding_format` | string | 可选 | 透传给下游的编码格式；不填按服务商默认，可选值: `float` / `base64` |
| `extra_body` | `ExtraBody` | 可选 | 路由与策略控制等扩展字段 |
| `provider` | `Provider` | 必需 | 服务商选择/过滤/排序策略 |
| - `only` | array[string] | 可选 | 白名单；仅在该集合内挑选服务商 |
| - `ignore` | array[string] | 可选 | 黑名单；从候选中排除 |
| - `order` | array[string] | 可选 | 服务商排序，可选值: `input_price` / `output_price` / `throughput` / `latency` / `input_length` |
| - `sort` | array[string] | 可选 | 排序策略，详见[路由策略]，支持多关键字排序，优先级按顺序降低。可选值: `input_price` / `output_price` / `throughput` / `latency` / `input_length` |
| - `input_price_range` | `[min, max]` | 可选 | 限制输入价格范围，单位： ¥ / 1M Token，如：`[1,2]`，表示筛选输入价格 price：1≤price≤2 的服务商 |
| - `output_price_range` | `[min, max]` | 可选 | 限制输出价格范围，单位： ¥ / 1M Token |
| - `throughput_range` | `[min, max]` | 可选 | 限制吞吐范围，单位：tokens/s, 基于实时的吞吐数据调度 |
| - `latency_range` | `[min, max]` | 可选 | 限制延迟范围，单位：s, 基于实时的延迟数据调度 |
| - `input_length_range` | `[min, max]` | 可选 | 限制最大输入长度范围 |
| - `allow_filter_prompt_length` | boolean | 可选 | 是否允许打开自动按照输入提示词长度筛选服务商，默认为 True |
| - `allow_fallbacks` | boolean | 可选 | 值为 True 时，系统按照用户指定筛选策略(延迟、吞吐、最大输入长度)无法找到合适的服务商时，为了保证接口可用，将按照指定排序策略调度给其他的服务商。默认为 True |
| `enable_thinking` | boolean | 可选 | 思考功能开关，接受该字段；在 Embeddings 中不生效 |
| `consume_type` | string | 可选 | 建议传 `api`，便于计费/追踪，可选值: `chat` / `api` |
| `dimensions` | integer | 可选 | 返回向量的维度；留空则使用服务商默认值 |

**策略应用顺序：**
- `only` → `ignore` → 各种范围过滤 → `order` → `sort`

**冲突：**
- `only` 与 `ignore` 不可交叉包含相同服务商（将返回 422）

**指标依赖：**
- 范围/排序依赖实时指标（吞吐、时延、价格、输入长度能力）；无指标时可能跳过范围过滤或降级排序

### 1.3 请求格式示例（JSON）

```json
{
  "model": "Qwen3-Embedding-0.6B",
  "input": ["这是一段文本", "第二段文本"],
  "encoding_format": "float",
  "dimensions": 4096,
  "extra_body": {
    "provider": {
      "only": [],
      "ignore": [],
      "order": [],
      "sort": ["throughput"],
      "input_price_range": [],
      "output_price_range": [],
      "throughput_range": [],
      "latency_range": [],
      "input_length_range": []
    },
    "consume_type": "api"
  }
}
```

### 1.4 返回格式

- 兼容 OpenAI Embeddings 响应，附加 `provider` 字段标示实际路由服务商

```json
{
  "model": "Qwen3-Embedding-0.6B",
  "data": [
    {"object": "embedding", "embedding": [0.01, 0.02, 0.03], "index": 0 },
    {"object": "embedding", "embedding": [0.04, 0.05, 0.06], "index": 1 }
  ],
  "usage": {"prompt_tokens": 45, "completion_tokens": 0, "total_tokens": 45 },
  "provider": "某服务商A"
}
```

### 1.5 请求示例

#### Python（OpenAI SDK，非流式）

```python
from openai import OpenAI

openai_client = OpenAI(
    base_url="https://aiping.cn/api/v1",
    api_key="<API_KEY>",
)

response = openai_client.embeddings.create(
    model="Qwen3-Embedding-0.6B",
    input=["这是一段文本", "第二段文本"],
    dimensions=4096,
    extra_body={
        "provider": {
            "only": [],
            "ignore": [],
            "order": [],
            "sort": ["throughput"],
            "input_price_range": [],
            "output_price_range": [],
            "input_length_range": [],
            "throughput_range": [],
            "latency_range": []
        },
        "consume_type": "api"
    },
)

print(response)
```

#### Python requests

```python
import requests
import json

headers = {
    "Authorization": "Bearer <API_KEY>",
    "Content-Type": "application/json",
}

payload = {
    "model": "Qwen3-Embedding-0.6B",
    "input": ["这是一段文本", "第二段文本"],
    "encoding_format": "float",
    "dimensions": 4096,
    "extra_body": {
        "provider": {
            "only": [],
            "ignore": [],
            "order": [],
            "sort": ["throughput"],
            "input_price_range": [],
            "output_price_range": [],
            "input_length_range": [],
            "throughput_range": [],
            "latency_range": []
        },
        "consume_type": "api"
    }
}

response = requests.post(
    "https://aiping.cn/api/v1/embeddings",
    headers=headers,
    json=payload,
    timeout=30
)

print(response.status_code)
print(json.dumps(response.json(), ensure_ascii=False, indent=2))
```

#### curl（非流式）

```bash
curl -N -X POST https://aiping.cn/api/v1/embeddings \
-H "Authorization: Bearer ***" \
-H "Content-Type: application/json" \
-d '{
    "model": "Qwen3-Embedding-0.6B",
    "input": ["这是一段文本", "第二段文本"],
    "dimensions": 4096,
    "extra_body": {
        "provider": {
            "only": [],
            "ignore": [],
            "order": [],
            "sort": ["throughput"],
            "input_price_range": [],
            "output_price_range": [],
            "input_length_range": [],
            "throughput_range": [],
            "latency_range": []
        },
        "consume_type": "api"
    }
}'
```

### 1.6 其他说明

- • Embeddings 不支持流式
- • 模型名大小写不敏感（服务端自动标准化）；服务商名大小写敏感
- • 响应的 usage 若下游未提供，服务端会基于请求内容估算输入 token 用于计费/统计
