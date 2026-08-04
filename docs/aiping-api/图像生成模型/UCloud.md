UCloud 图像生成 API 文档

请求格式

图像生成 API 支持 OpenAI 标准格式（推荐），同时也支持嵌套格式。嵌套格式的详细说明请参见文档末尾。

各模型支持的参数

Qwen-Image 模型

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
prompt	string	是	提示词，描述要生成的图像内容	-	非空字符串
seed	integer	否	随机数种子，用于控制模型生成内容的随机性。如果希望生成内容保持一致，可以使用相同的 seed 参数值	-1	整数，默认值为 -1（随机）
size	string	否	生成图像的尺寸（宽x高）	-	格式：宽度x高度（如 1024x1024），每个维度范围：256 ~ 1536
image_size	string	否	图片尺寸的别名（映射到 size）	-	格式：宽度x高度 或 宽度*高度，每个维度范围：256 ~ 1536
provider	object	否	调度配置参数	-	对象类型，包含图像生成特有参数和服务商调度参数。

图像生成特有参数：
- enable_image_base64 (bool, 默认 false): 是否在响应数据的 data 字段中同时返回图像的 Base64 编码
- enable_image_origin_data (bool, 默认 false): 是否在响应中包含原始响应数据

服务商调度参数：还支持 only、order、sort、input_price_range、output_price_range、throughput_range、latency_range、input_length_range、allow_filter_prompt_length、ignore、allow_fallbacks 等参数。

详细说明请参考：服务商调度参数说明

请求示例

json
{
  "model": "Qwen-Image",
  "prompt": "一只安静的橘色短毛猫蜷坐在黎明时分薄雾缭绕的湖边。它卷着尾巴，静静地望着水面。柔和的晨光透过树影洒下，冷色调，宁静氛围，轻雾环绕，50mm摄影风格。",
  "seed": -1,
  "size": "1024x1024",
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

Qwen-Image-Edit 模型

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
prompt	string	是	提示词，描述图像编辑的内容	-	非空字符串
image	string/array	是	用于编辑的原始图像。支持字符串格式（单张图像）或数组格式（多张图像）	-	支持 URL（http:// 或 https://）或 Base64 编码（带 data:image/{format};base64, 前缀或不带前缀，支持 PNG、JPEG、JPG 等格式）。数组格式示例：["url1", "url2"] 或 ["base64_1", "base64_2"]
seed	integer	否	随机数种子，用于控制模型生成内容的随机性。如果希望生成内容保持一致，可以使用相同的 seed 参数值	-1	整数，默认值为 -1（随机）
size	string	否	生成图像的尺寸（宽x高）	-	格式：宽度x高度（如 1024x1024），每个维度范围：256 ~ 1536
image_size	string	否	图片尺寸的别名（映射到 size）	-	格式：宽度x高度 或 宽度*高度，每个维度范围：256 ~ 1536
provider	object	否	调度配置参数	-	对象类型，包含图像生成特有参数和服务商调度参数。

图像生成特有参数：
- enable_image_base64 (bool, 默认 false): 是否在响应数据的 data 字段中同时返回图像的 Base64 编码
- enable_image_origin_data (bool, 默认 false): 是否在响应中包含原始响应数据

服务商调度参数：还支持 only、order、sort、input_price_range、output_price_range、throughput_range、latency_range、input_length_range、allow_filter_prompt_length、ignore、allow_fallbacks 等参数。

详细说明请参考：服务商调度参数说明

请求示例

json
{
  "model": "Qwen-Image-Edit",
  "prompt": "把猫变成狗",
  "image": "https://example.com/origin-image.jpeg",
  "seed": -1,
  "size": "1024x1024",
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

响应示例

所有模型都返回标准化的响应格式，示例如下：

json
{
  "created": 1736123456,
  "data": [
    {
      "url": "https://example.com/generated-image-1.jpg",
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA... " // 可选字段
    },
    {
      "url": "https://example.com/generated-image-2.jpg"
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
  "provider": "UCloud",
  "model": "Qwen-Image",
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


说明：

data[].b64_json 字段：仅在 provider.enable_image_base64 设置为 true 时返回。默认值为 false，此时响应中不包含 b64_json 字段
origin_data 字段：包含服务商 API 的完整原始响应数据。可通过设置 provider.enable_image_origin_data 参数控制是否返回此字段（默认值为 false，不会返回）。如需查看不同模型的原始响应格式，请在请求中设置 provider.enable_image_origin_data: true，然后在响应的 origin_data 字段中查看服务商返回的原始数据

响应参数说明

成功响应

参数名	类型	必填	说明	取值范围/格式
created	integer	是	响应创建时间，Unix 时间戳（秒）	整数，Unix 时间戳（秒）
data	array	是	生成的图像数据数组	数组对象，每个元素包含图像信息
data[].url	string	是	生成的图像 URL	URL 字符串
data[].b64_json	string	否	图像的 Base64 编码数据。控制参数：仅在请求参数 provider.enable_image_base64 设置为 true 时返回此字段。默认值为 false，此时不返回此字段	Base64 编码的字符串
usage	object	是	使用情况统计	对象类型
usage.total_tokens	integer	是	总 token 数	整数，图像生成场景通常为 0
usage.input_tokens	integer	是	输入 token 数	整数，图像生成场景通常为 0
usage.output_tokens	integer	是	输出 token 数	整数，图像生成场景通常为 0
usage.input_tokens_details.text_tokens	integer	是	文本 token 数	整数，图像生成场景通常为 0
usage.input_tokens_details.image_tokens	integer	是	图像 token 数	整数，图像生成场景通常为 0
usage.image_count	integer	是	生成的图像数量	整数，大于等于 1
provider	string	是	服务商名称	字符串，如"UCloud"
model	string	是	模型名称	字符串，如 Qwen/Qwen-Image
origin_data	object	否	服务商的原始响应数据。控制参数：仅在请求参数 provider.enable_image_origin_data 设置为 true 时返回此字段。默认值为 false，此时不返回此字段	对象类型，包含服务商 API 的完整原始响应

错误响应

当 API 调用失败时，会返回服务商的原始错误信息。

错误响应格式:

如果响应是 JSON 格式，返回完整的错误 JSON 对象
如果响应是文本格式，返回错误文本
如果无法解析，返回 HTTP {status_code}

错误响应示例:

json
{
  "code": 400,
  "message": "Invalid parameter: prompt cannot be empty",
  "request_id": "req_1234567890"
}
1
2
3
4
5

注意事项

模型参数限制：不同模型版本支持的参数不同。对于不在白名单中的参数，系统会记录警告日志，但不会过滤，仍会传递给服务商 API 进行最终判断

参数透传：所有参数（包括 seed、size、image_size 等）都会透传给服务商 API，由服务商进行校验和判断

随机种子：seed 参数默认值为 -1，表示使用随机种子。如果希望生成内容保持一致，可以使用相同的正整数 seed 值

图像尺寸：size 参数支持格式为 宽度x高度（如 1024x1024），每个维度的范围是 256 ~ 1536

图像编辑模型：使用 Qwen/Qwen-Image-Edit 模型时，image 参数为必填项，支持 Base64 编码或图片 URL 格式

Base64 编码注意事项：

请确保传递的所有图像数据参数均采用 Base64 编码格式
在提交数据时，不要在 Base64 编码字符串前添加任何前缀（如 data:image/{format};base64,）
正确的参数格式应该直接是 Base64 编码后的字符串

未知参数处理：未知参数会被记录警告日志，但仍会传递给服务商 API，由服务商判断是否返回错误

服务商调度参数：关于 provider 参数的完整说明和使用示例，请参考服务商调度参数说明

嵌套格式（备选）

除了 OpenAI 标准格式，API 也支持嵌套格式。如果使用嵌套格式，参数分配规则如下：

放入 input 对象的参数：prompt、negative_prompt、image、image2、image3 等图片相关输入参数
放入 extra_body 对象的参数：n、size、seed、output_format 等生成参数，以及 provider 对象

嵌套格式完整示例

json
{
  "model": "Qwen-Image",
  "input": {
    "prompt": "一只安静的橘色短毛猫蜷坐在黎明时分薄雾缭绕的湖边。它卷着尾巴，静静地望着水面。柔和的晨光透过树影洒下，冷色调，宁静氛围，轻雾环绕，50mm摄影风格。"
  },
  "extra_body": {
    "seed": -1,
    "size": "1024x1024",
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


注意：嵌套格式与 OpenAI 标准格式功能完全等价，系统会自动检测并处理。推荐使用 OpenAI 标准格式以获得更好的兼容性。