智谱 AI 图像生成 API 文档

请求格式

图像生成 API 支持 OpenAI 标准格式（推荐），同时也支持嵌套格式。嵌套格式的详细说明请参见文档末尾。

模型支持的参数

GLM-Image 模型

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
model	string	是	模型编码	-	glm-image
prompt	string	是	所需图像的文本描述	-	支持中英文，长度不超过 800 个字符，每个汉字、字母、数字或符号计为一个字符，超过部分会自动截断
quality	string	否	生成图像的质量	hd	hd（生成更精细、细节更丰富的图像，整体一致性更高，耗时约 20 秒，仅支持 hd）或 standard（快速生成图像，适合对生成速度有较高要求的场景，耗时约 5-10 秒）。glm-image 仅支持 hd
size	string	否	图片尺寸	1280x1280	推荐枚举值：1280x1280 (默认), 1568×1056, 1056×1568, 1472×1088, 1088×1472, 1728×960, 960×1728。自定义参数：长宽推荐设置在 1024px-2048px 范围内，并保证最大像素数不超过 2^22px；长宽均需为 32 的整数倍。格式：宽x高（如 1280x1280）或 宽*高，会自动转换为 宽x高 格式
image_size	string	否	图片尺寸的别名（映射到 size）	-	格式：宽x高（如 1280x1280）或 宽*高，会自动转换为 宽x高 格式
watermark_enabled	boolean	否	控制 AI 生成图片时是否添加水印	true	true（默认启用 AI 生成的显式水印及隐式数字水印，符合政策要求）或 false（关闭所有水印，仅允许已签署免责声明的客户使用）
watermark	boolean	否	水印控制的别名（映射到 watermark_enabled）	-	true 或 false
user_id	string	否	终端用户的唯一 ID，协助平台对终端用户的违规行为、生成违法及不良信息或其他滥用行为进行干预	-	ID 长度要求：最少 6 个字符，最多 128 个字符
user	string	否	终端用户 ID 的别名（映射到 user_id）	-	最少 6 个字符，最多 128 个字符
provider	object	否	调度配置参数	-	对象类型，包含图像生成特有参数和服务商调度参数。

图像生成特有参数：
- enable_image_base64 (bool, 默认 false): 是否在响应数据的 data 字段中同时返回图像的 Base64 编码
- enable_image_origin_data (bool, 默认 false): 是否在响应中包含原始响应数据

服务商调度参数：还支持 only、order、sort、input_price_range、output_price_range、throughput_range、latency_range、input_length_range、allow_filter_prompt_length、ignore、allow_fallbacks 等参数。

详细说明请参考：服务商调度参数说明

请求示例

json
{
  "model": "glm-image",
  "prompt": "一只可爱的小猫咪，坐在阳光明媚的窗台上，背景是蓝天白云",
  "size": "1280x1280",
  "quality": "hd",
  "watermark_enabled": true,
  "user_id": "user123456",
  "extra_body": {
    "provider": {
      "enable_image_base64": false,
      "enable_image_origin_data": true
    }
  }
}
1
2
3
4
5
6
7
8
9
10
11
12
13
14

响应示例

模型返回标准化的响应格式，示例如下：

json
{
  "created": 1736123456,
  "data": [
    {
      "url": "https://open.bigmodel.cn/api/paas/v4/files/xxx",
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA... " // 可选字段
    }
  ],
  "content_filter": [
    {
      "role": "assistant",
      "level": 0
    }
  ],
  "usage": {
    "total_tokens": 0,
    "input_tokens": 0,
    "output_tokens": 0,
    "input_tokens_details": {
      "text_tokens": 0,
      "image_tokens": 0
    },
    "image_count": 1
  },
  "provider": "智谱 AI",
  "model": "glm-image",
  "origin_data": { ... } // 可选字段
}
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28


说明：

data[].b64_json 字段：仅在 extra_body.provider.enable_image_base64 设置为 true 时返回。默认值为 false，此时响应中不包含 b64_json 字段
content_filter 字段：返回内容安全的相关信息，包括安全生效环节（assistant、user、history）和严重程度（level 0-3，level 0 表示最严重，3 表示轻微）
origin_data 字段：包含服务商 API 的完整原始响应数据。可通过设置 extra_body.provider.enable_image_origin_data 参数控制是否返回此字段（默认值为 false，不会返回）。如需查看原始响应格式，请在请求中设置 extra_body.provider.enable_image_origin_data: true，然后在响应的 origin_data 字段中查看服务商返回的原始数据

响应参数说明

成功响应

模型返回标准化的响应格式，包含以下字段：

参数名	类型	必填	说明	取值范围/格式
created	integer	是	请求创建时间，是以秒为单位的 Unix 时间戳	Unix 时间戳（秒）
data	array	是	数组，包含生成的图片 URL。目前数组中只包含一张图片	数组对象，每个元素包含：
data[].url	string	是	图片链接。图片的临时链接有效期为 30 天，请及时转存图片	URL 字符串
data[].b64_json	string	否	图像的 Base64 编码数据。控制参数：仅在请求参数 extra_body.provider.enable_image_base64 设置为 true 时返回此字段。默认值为 false，此时不返回此字段	Base64 编码的字符串
content_filter	array	否	返回内容安全的相关信息	数组对象，每个元素包含：
content_filter[].role	string	否	安全生效环节，包括 assistant（模型推理）、user（用户输入）、history（历史上下文）	assistant、user 或 history
content_filter[].level	integer	否	严重程度 level 0-3，level 0 表示最严重，3 表示轻微	0-3 之间的整数
usage	object	是	使用情况统计	对象类型，包含以下字段：
usage.total_tokens	integer	是	总 token 数（图像生成场景通常为 0）	整数
usage.input_tokens	integer	是	输入 token 数	整数
usage.output_tokens	integer	是	输出 token 数	整数
usage.input_tokens_details.text_tokens	integer	是	文本 token 数	整数
usage.input_tokens_details.image_tokens	integer	是	图像 token 数	整数
usage.image_count	integer	是	生成的图像数量	整数
provider	string	是	实际使用的服务商名称	字符串，例如 "智谱 AI"
model	string	是	实际使用的模型名称（标准模型名）	字符串
origin_data	object	否	服务商的原始响应数据。控制参数：仅在请求参数 extra_body.provider.enable_image_origin_data 设置为 true 时返回此字段。默认值为 false，此时不返回此字段	对象类型，包含服务商 API 的完整原始响应

错误响应

当 API 调用失败时，会返回服务商的原始错误信息。

错误响应格式：

如果响应是 JSON 格式，返回完整的错误 JSON 对象
如果响应是文本格式，返回错误文本
如果无法解析，返回 HTTP {status_code}

错误响应示例：

json
{
  "error": {
    "code": "invalid_request_error",
    "message": "参数错误"
  }
}
1
2
3
4
5
6

注意事项

模型参数限制：对于不在白名单中的参数，系统会记录警告日志，但不会过滤，仍会传递给服务商 API 进行最终判断
参数透传：所有参数（包括 size、image_size、quality、watermark_enabled、watermark、user_id、user 等）都会透传给服务商 API，由服务商进行校验和判断

默认值：如果未提供某些参数，系统会使用模型特定的默认值：
quality：hd（默认值，且仅支持 hd）
watermark_enabled：true（默认启用水印）
size：1280x1280（默认分辨率）

图片链接有效期：图片的临时链接有效期为 30 天，请及时转存图片
水印管理：如需关闭水印，需要在智谱 AI 平台签署免责声明，签署路径：个人中心-安全管理-去水印管理

未知参数处理：未知参数会被记录警告日志，但仍会传递给服务商 API，由服务商判断是否返回错误

服务商调度参数：关于 provider 参数的完整说明和使用示例，请参考服务商调度参数说明

嵌套格式（备选）

除了 OpenAI 标准格式，API 也支持嵌套格式。如果使用嵌套格式，参数分配规则如下：

放入 input 对象的参数：prompt 等图片相关输入参数
放入 extra_body 对象的参数：size、image_size、quality、watermark_enabled、watermark、user_id、user 等生成参数，以及 provider 对象

嵌套格式完整示例

json
{
  "model": "glm-image",
  "input": {
    "prompt": "一只可爱的小猫咪，坐在阳光明媚的窗台上，背景是蓝天白云"
  },
  "extra_body": {
    "size": "1280x1280",
    "quality": "hd",
    "watermark_enabled": true,
    "user_id": "user123456",
    "provider": {
      "enable_image_base64": false,
      "enable_image_origin_data": true
    }
  }
}
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16


注意：嵌套格式与 OpenAI 标准格式功能完全等价，系统会自动检测并处理。推荐使用 OpenAI 标准格式以获得更好的兼容性。