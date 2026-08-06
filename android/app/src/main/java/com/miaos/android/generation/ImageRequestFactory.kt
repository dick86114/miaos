package com.miaos.android.generation

import org.json.JSONArray
import org.json.JSONObject

data class ImageGenerationInput(
    val providerType: String,
    val endpoint: String,
    val modelId: String,
    val prompt: String,
    val ratio: String,
    val quality: String,
    val size: String = "1024x1024",
    val sourceImage: String? = null,
)

data class ImageRequestSpec(
    val url: String,
    val body: Map<String, Any>,
)

/** 集中处理供应商请求差异；API Key 由调用方从 Keystore 读取后写入 Authorization。 */
object ImageRequestFactory {
    fun build(input: ImageGenerationInput): ImageRequestSpec {
        require(input.endpoint.startsWith("https://")) { "生图 API 地址必须使用 HTTPS" }
        require(input.modelId.isNotBlank()) { "请选择生图模型" }
        require(input.prompt.isNotBlank()) { "请输入提示词" }
        val normalizedType = input.providerType.trim().lowercase()
        val body = when (normalizedType) {
            "grsai" -> buildGrsai(input)
            "aiping" -> buildAiping(input)
            "agnes-ai" -> buildAgnes(input)
            else -> buildOpenAi(input)
        }
        return ImageRequestSpec(imageEndpoint(input.endpoint, normalizedType), body)
    }

    private fun imageEndpoint(endpoint: String, providerType: String): String {
        val normalized = endpoint.trimEnd('/')
        return when (providerType) {
            "grsai" -> normalized
            "aiping", "agnes-ai" -> if (normalized.endsWith("/images/generations", ignoreCase = true)) normalized else "$normalized/images/generations"
            else -> when {
                normalized.endsWith("/images/generations", ignoreCase = true) -> normalized
                Regex("/v\\d+$", RegexOption.IGNORE_CASE).containsMatchIn(normalized) -> "$normalized/images/generations"
                else -> "$normalized/v1/images/generations"
            }
        }
    }

    /**
     * 仅为 macOS 同样支持的 OpenAI 兼容文生图提供一次格式字段回退。
     * Aiping、Grsai 和带参考图的专用图生图协议不能复用该降级结构。
     */
    fun canRetryWithoutFormat(input: ImageGenerationInput): Boolean {
        val providerType = input.providerType.trim().lowercase()
        return input.sourceImage == null && providerType !in setOf("grsai", "aiping")
    }

    /** 部分兼容服务拒绝 response_format 或 return_base64 时使用的最小文生图请求。 */
    fun buildWithoutFormat(input: ImageGenerationInput): ImageRequestSpec {
        require(canRetryWithoutFormat(input)) { "当前请求不支持格式字段回退" }
        return ImageRequestSpec(
            url = imageEndpoint(input.endpoint, input.providerType.trim().lowercase()),
            body = linkedMapOf(
                "model" to input.modelId,
                "prompt" to input.prompt,
                "n" to 1,
                "size" to input.size.ifBlank { "1024x1024" },
            ),
        )
    }

    /** 只在真实 HTTP 调用前转换为 JSONObject，避免 JVM 单测依赖 Android 的 org.json stub。 */
    fun toJson(body: Map<String, Any>): JSONObject = JSONObject().apply {
        body.forEach { (key, value) -> put(key, toJsonValue(value)) }
    }

    private fun toJsonValue(value: Any): Any = when (value) {
        is Map<*, *> -> JSONObject().apply {
            value.forEach { (key, nested) -> if (key is String && nested != null) put(key, toJsonValue(nested)) }
        }
        is Iterable<*> -> JSONArray().apply { value.forEach { item -> put(if (item == null) JSONObject.NULL else toJsonValue(item)) } }
        else -> value
    }

    private fun buildGrsai(input: ImageGenerationInput): Map<String, Any> = linkedMapOf(
        "model" to input.modelId,
        "prompt" to input.prompt,
        "images" to listOfNotNull(input.sourceImage),
        "aspectRatio" to input.ratio.ifBlank { "1:1" },
        "replyType" to "json",
    )

    /**
     * 与 macOS 保持兼容：常规 OpenAI 文生图使用 response_format；带参考图时使用兼容供应商约定的 extra_body.image。
     * 该分支用于 OpenAI 兼容和自定义供应商，不改变 Aiping、Agnes AI 或 Grsai 的专用协议。
     */
    private fun buildOpenAi(input: ImageGenerationInput): Map<String, Any> {
        val size = input.size.ifBlank { "1024x1024" }
        return if (input.sourceImage != null) {
            linkedMapOf(
                "model" to input.modelId,
                "prompt" to input.prompt,
                "size" to size,
                "extra_body" to mapOf(
                    "image" to listOf(input.sourceImage),
                    "response_format" to "b64_json",
                ),
            )
        } else {
            linkedMapOf(
                "model" to input.modelId,
                "prompt" to input.prompt,
                "n" to 1,
                "size" to size,
                "response_format" to "b64_json",
            )
        }
    }

    /** Agnes 文生图和图生图使用不同协议：参考图必须放入 extra_body.image。 */
    private fun buildAgnes(input: ImageGenerationInput): Map<String, Any> {
        val size = input.size.ifBlank { "1024x1024" }
        return if (input.sourceImage != null) {
            linkedMapOf(
                "model" to input.modelId,
                "prompt" to input.prompt,
                "size" to size,
                "extra_body" to mapOf(
                    "image" to listOf(input.sourceImage),
                    "response_format" to "b64_json",
                ),
            )
        } else {
            linkedMapOf(
                "model" to input.modelId,
                "prompt" to input.prompt,
                "n" to 1,
                "size" to size,
                "return_base64" to true,
            )
        }
    }

    private fun buildAiping(input: ImageGenerationInput): Map<String, Any> {
        val model = input.modelId.trim()
        requireAipingImageMode(model, input.sourceImage)
        val body = linkedMapOf<String, Any>(
            "model" to model,
            "prompt" to input.prompt,
            "extra_body" to mapOf("provider" to mapOf(
                "order" to listOf("siliconflow", "volcengine", "aliyun", "official", "modelscope", "together", "replicate"),
                "sort" to "price",
            )),
        )
        input.sourceImage?.let { body["image"] = it }
        val standardQuality = input.quality == "标准"

        when (model) {
            "Doubao-Seedream-5.0-lite" -> body.putAll(mapOf("size" to sizeFor(SEEDREAM5, input.ratio), "output_format" to "png", "watermark" to false, "sequential_image_generation" to "disabled"))
            "Doubao-Seedream-4.5" -> body.putAll(mapOf("size" to sizeFor(SEEDREAM2K, input.ratio), "output_format" to "jpeg", "watermark" to false, "force_single" to true, "optimize_prompt_options" to mapOf("mode" to "standard")))
            "Doubao-Seedream-4.0" -> body.putAll(mapOf("size" to sizeFor(if (standardQuality) SEEDREAM4_1K else SEEDREAM2K, input.ratio), "watermark" to false, "force_single" to true, "optimize_prompt_options" to mapOf("mode" to if (standardQuality) "fast" else "standard")))
            "Kling-V2.1", "Kling-V1" -> body.putAll(mapOf("resolution" to if (standardQuality) "1k" else "2k", "n" to 1, "aspect_ratio" to input.ratio))
            "glm-image" -> body.putAll(mapOf("size" to sizeFor(GLM, input.ratio), "quality" to "hd"))
            "即梦文生图 3.0", "即梦文生图 3.1" -> {
                val (width, height) = dimensionsFor(if (standardQuality) JIMENG1K else JIMENG2K, input.ratio)
                body.putAll(mapOf("use_pre_llm" to true, "seed" to -1, "width" to width, "height" to height))
            }
            "即梦图片生成 4.0" -> {
                val (width, height) = dimensionsFor(if (standardQuality) JIMENG1K else JIMENG2K, input.ratio)
                body.putAll(mapOf("width" to width, "height" to height, "scale" to if (input.sourceImage == null) 0.5 else 0.6, "force_single" to true))
            }
            "Kolors" -> body.putAll(mapOf("image_size" to sizeFor(KOLORS, input.ratio), "num_inference_steps" to if (standardQuality) 20 else 30))
            "HunyuanImage-3.0" -> body.putAll(mapOf("size" to sizeFor(HUNYUAN, input.ratio), "seed" to -1))
            "Qwen-Image", "Qwen-Image-Plus", "Qwen-Image-Edit", "Qwen-Image-Edit-Plus" -> body.putAll(mapOf("size" to sizeFor(QWEN, input.ratio), "n" to 1, "prompt_extend" to true, "watermark" to false))
            "Wan2.5-T2I-Preview", "Wan2.5-I2I-Preview" -> body.putAll(mapOf("size" to sizeFor(WAN, input.ratio), "n" to 1, "prompt_extend" to false, "watermark" to false))
            else -> body.putAll(mapOf("n" to 1, "size" to input.size.ifBlank { "1024x1024" }.replace("x", "*", ignoreCase = true)))
        }
        return body
    }

    private fun requireAipingImageMode(model: String, sourceImage: String?) {
        if (model in AIPING_EDIT_ONLY && sourceImage == null) throw IllegalArgumentException("$model 是图片编辑模型，需要先上传参考图")
        if (model in AIPING_TEXT_ONLY && sourceImage != null) throw IllegalArgumentException("$model 不支持图生图，请改用图片编辑模型")
    }

    private fun sizeFor(map: Map<String, String>, ratio: String): String = map[ratio] ?: map.getValue("1:1")
    private fun dimensionsFor(map: Map<String, Pair<Int, Int>>, ratio: String): Pair<Int, Int> = map[ratio] ?: map.getValue("1:1")

    private val AIPING_EDIT_ONLY = setOf("Qwen-Image-Edit", "Qwen-Image-Edit-Plus", "Wan2.5-I2I-Preview")
    private val AIPING_TEXT_ONLY = setOf("Qwen-Image", "HunyuanImage-3.0", "即梦文生图 3.0", "即梦文生图 3.1", "glm-image", "Kolors", "Qwen-Image-Plus", "Wan2.5-T2I-Preview")
    private val QWEN = mapOf("1:1" to "1280*1280", "4:3" to "1280*960", "16:9" to "1280*720", "9:16" to "720*1280")
    private val HUNYUAN = mapOf("1:1" to "1024*1024", "4:3" to "1152*864", "16:9" to "1344*768", "9:16" to "768*1344")
    private val JIMENG1K = mapOf("1:1" to (1328 to 1328), "4:3" to (1472 to 1104), "16:9" to (1664 to 936), "9:16" to (936 to 1664))
    private val JIMENG2K = mapOf("1:1" to (2048 to 2048), "4:3" to (2304 to 1728), "16:9" to (2560 to 1440), "9:16" to (1440 to 2560))
    private val SEEDREAM4_1K = mapOf("1:1" to "1024*1024", "4:3" to "1280*960", "16:9" to "1600*900", "9:16" to "900*1600")
    private val SEEDREAM2K = mapOf("1:1" to "2048*2048", "4:3" to "2304*1728", "16:9" to "2560*1440", "9:16" to "1440*2560")
    private val SEEDREAM5 = mapOf("1:1" to "2048*2048", "4:3" to "2304*1728", "16:9" to "2848*1600", "9:16" to "1600*2848")
    private val GLM = mapOf("1:1" to "1280x1280", "4:3" to "1472x1088", "16:9" to "1728x960", "9:16" to "960x1728")
    private val KOLORS = mapOf("1:1" to "1024x1024", "4:3" to "1280x960", "16:9" to "1280x720", "9:16" to "720x1280")
    private val WAN = mapOf("1:1" to "1280*1280", "4:3" to "1280*960", "16:9" to "1280*720", "9:16" to "720*1280")
}
