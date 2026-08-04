PPIO 派欧云 图像生成 API 文档

请求格式

图像生成 API 支持 OpenAI 标准格式（推荐），同时也支持嵌套格式。嵌套格式的详细说明请参见文档末尾。

各模型支持的参数

Qwen-Image 模型

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
prompt	string	是	文本提示词，描述要生成的图像内容	-	非空字符串，长度无限制（建议 ≤ 2000 字符）
size	string	否	生成媒体的像素大小（宽*高）	1024*1024	格式：宽度*高度，长和宽的像素范围：256 ~ 1536
image_size	string	否	图片尺寸的别名（映射到 size）	1024*1024	格式：宽度*高度 或 宽度x高度，长和宽的像素范围：256 ~ 1536
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
  "size": "1024*1024",
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

Qwen-Image-Edit 图像编辑

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
prompt	string	是	用于生成图像的提示	-	非空字符串
image	string/array	是	用于生成图像的图像。支持字符串格式（单张图像）或数组格式（多张图像）	-	支持 URL（http:// 或 https://）或 Base64 编码（带 data:image/{format};base64, 前缀或不带前缀，支持 PNG、JPEG、JPG 等格式）。数组格式示例：["url1", "url2"] 或 ["base64_1", "base64_2"]
seed	integer	否	用于生成的随机种子	-1	范围：-1 ~ 2147483647。-1 表示将使用随机种子
output_format	string	否	输出图像的格式	jpeg	枚举值: jpeg, png, webp

请求示例

json
{
  "model": "Qwen-Image-Edit",
  "prompt": "把猫变成狗",
  "image": "https://example.com/origin-image.jpeg",
  "seed": -1,
  "output_format": "jpeg",
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

HunyuanImage-3.0 模型

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
prompt	string	是	正向提示词，用于指导图片生成内容	-	非空字符串
size	string	否	生成图片的尺寸，像素为宽*高	1024*1024	格式：宽度*高度，每个维度范围：[256 ~ 1536]
image_size	string	否	图片尺寸的别名（映射到 size）	1024*1024	格式：宽度*高度 或 宽度 x 高度，每个维度范围：[256 ~ 1536]
seed	integer	否	随机种子	-1	取值范围：[-1 ~ 2147483647]，取值为 -1 时表示随机种子

请求示例

json
{
  "model": "HunyuanImage-3.0",
  "prompt": "一只安静的橘色短毛猫蜷坐在黎明时分薄雾缭绕的湖边",
  "size": "1024*1024",
  "seed": -1,
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

即梦文生图 3.0 模型

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
prompt	string	是	用于生成图像的提示词，中英文均可输入	-	非空字符串，建议长度 ≤ 120 字符，最长不超过 800 字符，prompt 过长有概率出图异常或不生效
use_pre_llm	boolean	否	开启文本扩写，会针对输入 prompt 进行扩写优化	true	true：开启文本扩写（如果输入 prompt 较短建议开启）
false：关闭文本扩写（如果输入 prompt 较长建议关闭）
seed	integer	否	随机种子，作为确定扩散初始状态的基础	-1	整数，默认 -1（随机）。若随机种子为相同正整数且其他参数均一致，则生成图片极大概率效果一致
width	integer	否	生成图像的宽	1328	取值范围：[512, 2048]
注意：需同时传 width 和 height 才会生效。宽高比在 1:3 到 3:1 之间
height	integer	否	生成图像的高	1328	取值范围：[512, 2048]
注意：需同时传 width 和 height 才会生效
logo_info	object	否	水印相关信息	-	对象类型

推荐的宽度和高度

标清 1K:

1:1: 1328×1328
4:3: 1472×1104
3:2: 1584×1056
16:9: 1664×936
21:9: 2016×864

高清 2K:

1:1: 2048×2048

请求示例

json
{
  "model": "即梦文生图 3.0",
  "prompt": "一只安静的橘色短毛猫蜷坐在黎明时分薄雾缭绕的湖边",
  "use_pre_llm": true,
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

即梦文生图 3.1 模型

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
prompt	string	是	用于生成图像的提示词，中英文均可输入	-	非空字符串，建议长度 ≤ 120 字符，最长不超过 800 字符，prompt 过长有概率出图异常或不生效
use_pre_llm	boolean	否	开启文本扩写，会针对输入 prompt 进行扩写优化	true	true：开启文本扩写（如果输入 prompt 较短建议开启）
false：关闭文本扩写（如果输入 prompt 较长建议关闭）
seed	integer	否	随机种子，作为确定扩散初始状态的基础	-1	整数，默认 -1（随机）。若随机种子为相同正整数且其他参数均一致，则生成图片极大概率效果一致
width	integer	否	生成图像的宽	1328	取值范围：[512, 2048]
注意：需同时传 width 和 height 才会生效。宽高比在 1:3 到 3:1 之间
height	integer	否	生成图像的高	1328	取值范围：[512, 2048]
注意：需同时传 width 和 height 才会生效
logo_info	object	否	水印相关信息	-	对象类型

推荐的宽度和高度

标清 1K:

1:1: 1328×1328
4:3: 1472×1104
3:2: 1584×1056
16:9: 1664×936
21:9: 2016×864

高清 2K:

1:1: 2048×2048

请求示例

json
{
  "model": "即梦文生图 3.1",
  "prompt": "一只安静的橘色短毛猫蜷坐在黎明时分薄雾缭绕的湖边",
  "use_pre_llm": true,
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

Doubao-Seedream-4.0 模型

参数说明

参数名	类型	必填	说明	默认值	取值范围/格式
prompt	string	是	用于生成图像的提示词，支持中英文	-	非空字符串，建议不超过 300 个汉字或 600 个英文单词。字数过多信息容易分散，模型可能因此忽略细节，只关注重点，造成视图片缺失部分元素
image	string/array	否	输入要编辑的图像的 Base64 编码或可访问的 URL。支持字符串格式（单张图像）或数组格式（多张图像，最多 10 张）	-	支持 URL（http:// 或 https://）或 Base64 编码（带 data:image/{format};base64, 前缀或不带前缀，支持 PNG、JPEG、JPG 等格式）。支持上传最多 10 张参考图像。数组格式示例：["url1", "url2", ...] 或 ["base64_1", "base64_2", ...]
size	string	否	设置生成图像的规格。有两种方法可用，但不能同时使用	2048x2048	方法 1：指定分辨率，可选值：1K, 2K, 4K
方法 2：指定生成图像的宽度和高度（像素），格式：宽度x高度 或 宽度*高度，总像素值范围：[1024x1024, 4096x4096]，宽高比值范围：[1/16, 16]
image_size	string	否	图片尺寸的别名（映射到 size）	2048x2048	格式：宽度x高度 或 宽度*高度，总像素值范围：[1024x1024, 4096x4096]，宽高比值范围：[1/16, 16]
sequential_image_generation	string	否	控制是否禁用批量生成功能	disabled	auto：在自动模式下，模型会根据用户的提示词自动决定是否返回多张图像以及包含多少张图像
disabled：禁用批量生成功能。模型将只生成一张图像
max_images	integer	否	指定此请求中要生成的最大图像数量。此参数仅在 sequential_image_generation 设置为 auto 时有效	15	取值范围：[1, 15]
说明：实际生成的图像数量受 max_images 和输入参考图像数量的影响。输入参考图像数量 + 生成图像数量 ≤ 15
watermark	boolean	否	为生成的图像添加水印	true	false：不添加水印
true：在图像的右下角添加带有 "AI 生成" 文字的水印

推荐的宽度和高度

1:1: 2048x2048
4:3: 2304x1728
3:4: 1728x2304
16:9: 2560x1440
9:16: 1440x2560
3:2: 2496x1664
2:3: 1664x2496
21:9: 3024x1296

请求示例

json
{
  "model": "Doubao-Seedream-4.0",
  "prompt": "一只安静的橘色短毛猫蜷坐在黎明时分薄雾缭绕的湖边。它卷着尾巴，静静地望着水面。柔和的晨光透过树影洒下，冷色调，宁静氛围，轻雾环绕，50mm摄影风格。",
  "size": "2048x2048",
  "watermark": true,
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
    "image_count": 2
  },
  "provider": "PPIO 派欧云",
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

data[].b64_json 字段：仅在 extra_body.provider.enable_image_base64 设置为 true 时返回。默认值为 false，此时响应中不包含 b64_json 字段
origin_data 字段：包含服务商 API 的完整原始响应数据。可通过设置 extra_body.provider.enable_image_origin_data 参数控制是否返回此字段（默认值为 false，不会返回）。如需查看不同模型的原始响应格式，请在请求中设置 extra_body.provider.enable_image_origin_data: true，然后在响应的 origin_data 字段中查看服务商返回的原始数据

响应参数说明

成功响应

参数名	类型	必填	说明	取值范围/格式
created	integer	是	响应创建时间，Unix 时间戳（秒）	整数，Unix 时间戳（秒）
data	array	是	生成的图像数据数组	数组对象，每个元素包含图像信息
data[].url	string	是	生成的图像 URL	URL 字符串
data[].b64_json	string	否	图像的 Base64 编码数据。控制参数：仅在请求参数 extra_body.provider.enable_image_base64 设置为 true 时返回此字段。默认值为 false，此时不返回此字段	Base64 编码的字符串
usage	object	是	使用情况统计	对象类型
usage.total_tokens	integer	是	总 token 数	整数，图像生成场景通常为 0
usage.input_tokens	integer	是	输入 token 数	整数，图像生成场景通常为 0
usage.output_tokens	integer	是	输出 token 数	整数，图像生成场景通常为 0
usage.input_tokens_details.text_tokens	integer	是	文本 token 数	整数，图像生成场景通常为 0
usage.input_tokens_details.image_tokens	integer	是	图像 token 数	整数，图像生成场景通常为 0
usage.image_count	integer	是	生成的图像数量	整数，大于等于 1
provider	string	是	服务商名称	字符串，如 "PPIO 派欧云"
model	string	是	模型名称	字符串，如 "Qwen-Image"
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
    "message": "Invalid parameter",
    "code": "invalid_param"
  }
}
1
2
3
4
5
6

注意事项

服务商调度参数：关于 provider 参数的完整说明和使用示例，请参考服务商调度参数说明

嵌套格式（备选）

除了 OpenAI 标准格式，API 也支持嵌套格式。如果使用嵌套格式，参数分配规则如下：

放入 input 对象的参数：prompt、negative_prompt、image、image2、image3 等图片相关输入参数
放入 extra_body 对象的参数：n、size、seed、output_format、use_pre_llm、width、height、watermark 等生成参数，以及 provider 对象

嵌套格式完整示例

json
{
  "model": "Qwen-Image",
  "input": {
    "prompt": "一只安静的橘色短毛猫蜷坐在黎明时分薄雾缭绕的湖边。它卷着尾巴，静静地望着水面。柔和的晨光透过树影洒下，冷色调，宁静氛围，轻雾环绕，50mm摄影风格。"
  },
  "extra_body": {
    "size": "1024*1024",
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


注意：嵌套格式与 OpenAI 标准格式功能完全等价，系统会自动检测并处理。推荐使用 OpenAI 标准格式以获得更好的兼容性。