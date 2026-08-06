package com.miaos.android.generation

import com.miaos.android.data.database.ProviderEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** 供应商连接检查与模型拉取，所有请求只在用户主动点击后发生。 */
class ProviderConnectionClient {
    suspend fun testConnection(provider: ProviderEntity, apiKey: String): String = withContext(Dispatchers.IO) {
        require(apiKey.isNotBlank()) { "请先保存 API Key 再测试连接" }
        when (provider.type.lowercase()) {
            "aiping" -> {
                val response = requestJson(aipingBalanceUrl(provider.endpoint), "GET", apiKey)
                val balance = response.optJSONObject("data")?.optDouble("total_remain", Double.NaN)
                require(response.optInt("code", -1) == 0 && balance != null && balance.isFinite()) { "Aiping API Key 验证失败：余额接口返回异常" }
                "认证成功，当前余额 ${formatNumber(balance)} 元"
            }
            "grsai" -> {
                // 与 macOS 一致：Grsai 没有无副作用的鉴权端点，测试会提交一个最小生成请求。
                val response = requestJson(
                    url = provider.endpoint,
                    method = "POST",
                    apiKey = apiKey,
                    body = JSONObject().put("model", "gpt-image-2").put("prompt", "test").toString(),
                )
                when (response.optString("status")) {
                    "failed" -> throw IllegalArgumentException("供应商未能完成测试请求")
                    "violation" -> throw IllegalArgumentException("供应商拒绝了测试请求")
                }
                "Grsai 认证成功，已提交最小测试请求"
            }
            else -> {
                val models = fetchImageModels(provider, apiKey)
                "认证成功，可用图像模型 ${models.size} 个"
            }
        }
    }

    suspend fun fetchImageModels(provider: ProviderEntity, apiKey: String): List<RemoteProviderModel> =
        fetchModels(provider, apiKey, ProviderModelCategory.IMAGE)

    suspend fun fetchTextModels(provider: ProviderEntity, apiKey: String): List<RemoteProviderModel> =
        fetchModels(provider, apiKey, ProviderModelCategory.TEXT)

    suspend fun fetchModels(
        provider: ProviderEntity,
        apiKey: String,
        category: ProviderModelCategory,
    ): List<RemoteProviderModel> = withContext(Dispatchers.IO) {
        require(apiKey.isNotBlank()) { "请先保存 API Key 再拉取模型" }
        if (provider.type.equals("grsai", ignoreCase = true)) {
            return@withContext when (category) {
                ProviderModelCategory.IMAGE -> grsaiModels
                else -> emptyList()
            }
        }

        val response = requestJson(providerModelsUrl(provider.endpoint), "GET", apiKey)
        val items = response.optJSONArray("data") ?: throw IllegalArgumentException("API 返回格式异常：未找到 data 数组")
        val returned = buildList {
            for (index in 0 until items.length()) {
                val item = items.optJSONObject(index) ?: continue
                val id = item.optString("id")
                if (id.isNotBlank() && item.opt("status") != false) add(RemoteProviderModel(id, id))
            }
        }
        val models = when (provider.type.lowercase()) {
            "aiping" -> {
                val returnedIds = returned.mapTo(mutableSetOf()) { it.id }
                when (category) {
                    ProviderModelCategory.IMAGE -> aipingImageModels.filter { it.id in returnedIds }
                    ProviderModelCategory.TEXT -> aipingTextModels.filter { it.id in returnedIds }
                    ProviderModelCategory.VIDEO -> emptyList()
                }
            }
            else -> when (category) {
                ProviderModelCategory.IMAGE -> returned.filter { it.id.contains("image", ignoreCase = true) }
                ProviderModelCategory.TEXT -> returned.filterNot { it.id.contains("image", ignoreCase = true) || it.id.contains("video", ignoreCase = true) }
                ProviderModelCategory.VIDEO -> returned.filter { it.id.contains("video", ignoreCase = true) }
            }
        }
        val categoryName = when (category) {
            ProviderModelCategory.IMAGE -> "生图"
            ProviderModelCategory.TEXT -> "文本"
            ProviderModelCategory.VIDEO -> "视频"
        }
        require(models.isNotEmpty()) { "API 返回的模型列表中没有${categoryName}模型，可手动添加" }
        models
    }

    private fun requestJson(url: String, method: String, apiKey: String, body: String? = null): JSONObject {
        require(url.startsWith("https://")) { "请求地址必须使用 HTTPS" }
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 20_000
            instanceFollowRedirects = false
            setRequestProperty("Authorization", "Bearer $apiKey")
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
        }
        try {
            body?.let { connection.outputStream.bufferedWriter().use { writer -> writer.write(it) } }
            val status = connection.responseCode
            val content = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                throw IllegalArgumentException(if (status == 401) "API Key 无效或已失效" else "供应商连接失败（HTTP $status）")
            }
            return try {
                JSONObject(content)
            } catch (_: Exception) {
                throw IllegalArgumentException("供应商响应格式不正确")
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun formatNumber(value: Double): String = if (value % 1.0 == 0.0) {
        value.toLong().toString()
    } else {
        "%.2f".format(java.util.Locale.US, value).trimEnd('0').trimEnd('.')
    }
}

enum class ProviderModelCategory { IMAGE, TEXT, VIDEO }

data class RemoteProviderModel(val id: String, val name: String)

/** 与 macOS 端保持一致：从生成端点、安全地推导同版本的 /models 地址。 */
internal fun providerModelsUrl(endpoint: String): String {
    val uri = try {
        URI(endpoint)
    } catch (_: Exception) {
        throw IllegalArgumentException("API 地址格式不正确")
    }
    require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) { "请求地址必须使用 HTTPS" }
    var path = uri.path.orEmpty().trimEnd('/')
    path = path.replace(Regex("/(images/generations|generate|chat/completions|completions|videos|responses)$", RegexOption.IGNORE_CASE), "/models")
    if (!path.endsWith("/models", ignoreCase = true)) {
        path = if (Regex("/v\\d+$", RegexOption.IGNORE_CASE).containsMatchIn(path)) "$path/models" else "$path/v1/models"
    }
    return URI(uri.scheme, uri.authority, path, null, null).toString()
}

private fun aipingBalanceUrl(endpoint: String): String {
    val uri = try {
        URI(endpoint)
    } catch (_: Exception) {
        throw IllegalArgumentException("API 地址格式不正确")
    }
    require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) { "请求地址必须使用 HTTPS" }
    val path = uri.path.orEmpty().trimEnd('/')
    val apiV1Index = path.lowercase().indexOf("/api/v1")
    val balancePath = when {
        apiV1Index >= 0 -> path.substring(0, apiV1Index) + "/api/v1/user/remain/points"
        Regex("/v1$", RegexOption.IGNORE_CASE).containsMatchIn(path) -> "$path/user/remain/points"
        else -> "$path/api/v1/user/remain/points"
    }
    return URI(uri.scheme, uri.authority, balancePath, null, null).toString()
}

private val grsaiModels = listOf(
    "gpt-image-2", "gpt-image-2-vip", "nano-banana", "nano-banana-fast", "nano-banana-2",
    "nano-banana-2-cl", "nano-banana-pro", "nano-banana-pro-vt", "nano-banana-pro-cl", "nano-banana-pro-vip",
).map { RemoteProviderModel(it, it) }

private val aipingTextModels = listOf(
    "DeepSeek-V3.1", "DeepSeek-R1-0528",
).map { RemoteProviderModel(it, it) }

private val aipingImageModels = listOf(
    "Qwen-Image", "Qwen-Image-Edit", "HunyuanImage-3.0", "即梦文生图 3.0", "即梦文生图 3.1",
    "Doubao-Seedream-4.0", "Kling-V2.1", "Kling-V1", "glm-image", "Doubao-Seedream-5.0-lite",
    "Doubao-Seedream-4.5", "即梦图片生成 4.0", "Kolors", "Qwen-Image-Plus", "Qwen-Image-Edit-Plus",
    "Wan2.5-T2I-Preview", "Wan2.5-I2I-Preview",
).map { RemoteProviderModel(it, it) }
