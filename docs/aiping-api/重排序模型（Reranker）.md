# 重排序模型（Reranker）

## 1. 重排序模型（Reranker）

- **API 端点**: [https://aiping.cn/api/v1/rerank](https://aiping.cn/api/v1/rerank)
- **Note**: 若用 SDK 封装，请保持 base_url 为 [https://aiping.cn/api/v1](https://aiping.cn/api/v1)，实际请求路径为 `/rerank`（SDK 需自行实现该方法或走 HTTP）
- **说明**: 与主流 Rerank API 兼容（如 Cohere/SiliconFlow 等）；为实现多服务商路由/计费，扩展了 `extra_body`（请求）与 `provider`（响应）等字段

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
| `model` | string | 必需 | 标准 Rerank 模型名，服务端会自动标准化大小写；需在标准 Rerank 模型目录内 |
| `query` | string | 必需 | 查询文本 |
| `documents` | array[string] | 必需 | 待重排的文档列表 |
| `top_n` | integer | 可选 | 仅返回前 N 条结果，默认为服务商默认值或全部，可选值: >0 |
| `return_documents` | boolean | 可选 | 是否在结果中返回对应文档内容，默认值: `true` |
| `extra_body` | `ExtraBody` | 可选 | 路由与策略控制等扩展字段 |
| `provider` | `Provider` | 必需 | 服务商选择/过滤/排序策略 |
| - `only` | array[string] | 可选 | 白名单；仅在该集合内挑选服务商 |
| - `ignore` | array[string] | 可选 | 黑名单；从候选中排除 |
| - `order` | array[string] | 可选 | 服务商排序，可选值: `input_price` / `output_price` / `throughput` / `latency` / `input_length` / `output_length` |
| - `sort` | array[string] | 可选 | 排序策略，详见[路由策略]，支持多关键字排序，优先级按顺序降低。可选值: `input_price` / `output_price` / `throughput` / `latency` / `input_length` / `output_length` |
| - `input_price_range` | `[min, max]` | 可选 | 限制输入价格范围，单位： ¥ / 1M Token，如：`[1,2]`，表示筛选输入价格 price：1≤price≤2 的服务商 |
| - `output_price_range` | `[min, max]` | 可选 | 限制输出价格范围，单位： ¥ / 1M Token |
| - `throughput_range` | `[min, max]` | 可选 | 限制吞吐范围，单位：tokens/s, 基于实时的吞吐数据调度 |
| - `latency_range` | `[min, max]` | 可选 | 限制延迟范围，单位：s, 基于实时的延迟数据调度 |
| - `input_length_range` | `[min, max]` | 可选 | 输入长度能力范围过滤 |
| - `output_length_range` | `[min, max]` | 可选 | 输出长度能力范围过滤 |
| - `allow_filter_prompt_length` | boolean | 可选 | 是否允许打开自动按照输入提示词长度筛选服务商，默认为 True |
| - `ignore` | array[string] | 可选 | 黑名单；从候选中排除 |
| - `allow_fallbacks` | boolean | 可选 | 值为 True 时，系统按照用户指定筛选策略(延迟、吞吐、最大输入长度)无法找到合适的服务商时，为了保证接口可用，将按照指定排序策略调度给其他的服务商。默认为 True |
| `enable_thinking` | boolean | 可选 | 思考功能开关，接受该字段；在 Rerank 中不生效 |
| `consume_type` | string | 可选 | 建议传 `api`，便于计费/追踪，可选值: `chat` / `api`，默认值: `api` |

**策略应用顺序：**
- `only` → `ignore` → 各种范围过滤 → `order` → `sort`

**冲突：**
- `only` 与 `ignore` 不可交叉包含相同服务商（将返回 422）

**指标依赖：**
- 范围/排序依赖实时指标（吞吐、时延、价格、输入长度能力）；无指标时可能跳过范围过滤或降级排序

### 1.3 请求格式示例（JSON）

```json
{
  "model": "bge-reranker-v2-m3",
  "query": "什么是机器学习？",
  "documents": [
    "机器学习是人工智能的一个分支，它使计算机能够从数据中学习。",
    "深度学习是机器学习的一个子集，使用神经网络进行学习。",
    "Python是一种流行的编程语言，广泛用于数据科学。"
  ],
  "top_n": 2,
  "return_documents": true,
  "extra_body": {
    "provider": {
      "only": [],
      "ignore": [],
      "order": [],
      "sort": ["throughput"], // throughput/latency/input_price/output_price/input_length
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

| 顶层字段 | 类型 | 必填 | 描述 |
|---------|------|------|------|
| `model` | string | 是 | 标准 Rerank 模型名（与请求对齐） |
| `results` | array[RerankResult] | 是 | 重排结果列表 |
| `usage` | object | 否 | `{prompt_tokens, completion_tokens, total_tokens}`；下游无提供时服务端可能估算，仅用于计费/统计 |
| `provider` | string | 否 | 实际路由到的服务商名 |

**RerankResult（results 内元素）**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `index` | integer | 是 | 文档在原始 documents 列表中的索引 |
| `relevance_score` | number | 是 | 相关性分值（越大越相关） |
| `document` | string | 否 | 当 `return_documents=true` 时返回对应文档内容（服务端会将对象形态如 `{"text": "..."}` 规范化为字符串） |

**返回示例**

```json
{
  "model": "bge-reranker-v2-m3",
  "results": [
    {
      "index": 0,
      "relevance_score": 0.92,
      "document": "机器学习是人工智能的一个分支，它使计算机能够从数据中学习。"
    },
    {
      "index": 1,
      "relevance_score": 0.76,
      "document": "深度学习是机器学习的一个子集，使用神经网络进行学习。"
    }
  ],
  "usage": {
    "prompt_tokens": 123,
    "completion_tokens": 0,
    "total_tokens": 123
  },
  "provider": "某服务商A"
}
```

### 1.5 请求示例

#### Python requests

```python
import requests
import json

headers = {
    "Authorization": "Bearer <API_KEY>",
    "Content-Type": "application/json",
}

payload = {
    "model": "bge-reranker-v2-m3",
    "query": "什么是机器学习？",
    "documents": [
        "机器学习是人工智能的一个分支，它使计算机能够从数据中学习。",
        "深度学习是机器学习的一个子集，使用神经网络进行学习。",
        "Python是一种流行的编程语言，广泛用于数据科学。"
    ],
    "top_n": 2,
    "return_documents": True,
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
    "https://aiping.cn/api/v1/rerank",
    headers=headers,
    json=payload,
    timeout=30
)

print(response.status_code)
print(json.dumps(response.json(), ensure_ascii=False, indent=2))
```

#### curl（非流式）

```bash
curl -N -X POST https://aiping.cn/api/v1/rerank \
-H "Authorization: Bearer ***" \
-H "Content-Type: application/json" \
-d '{
    "model": "bge-reranker-v2-m3",
    "query": "什么是机器学习？",
    "documents": [
        "机器学习是人工智能的一个分支，它使计算机能够从数据中学习。",
        "深度学习是机器学习的一个子集，使用神经网络进行学习。",
        "Python是一种流行的编程语言，广泛用于数据科学。"
    ],
    "top_n": 2,
    "return_documents": true,
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

- • Rerank 不支持流式
- • 模型名大小写不敏感（服务端自动标准化）；服务商名大小写敏感
- • 响应的 usage 若下游未提供，服务端会基于请求内容估算输入 token（用于计费/统计），可能不会直接在响应中体现
- • 个别服务商返回的 document 可能为对象（如 `{ "text": "..."}`），服务端会规范化为字符串返回
