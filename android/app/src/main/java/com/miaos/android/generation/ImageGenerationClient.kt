package com.miaos.android.generation

import android.content.Context
import android.util.Base64
import com.miaos.android.data.database.ProviderEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.UUID

data class GeneratedImage(
    val file: File,
    val providerId: String,
    val modelId: String,
)

/** 仅在客户端内部区分 HTTP 状态，以支持已知兼容性回退；对外仍使用安全的中文错误文案。 */
internal class ImageGenerationHttpException(
    val statusCode: Int,
    message: String,
) : IllegalArgumentException(message)

/**
 * 对齐 macOS 的 OpenAI 兼容请求策略：只有无参考图的兼容文生图在 HTTP 400 时降级一次。
 * 发送函数通过参数注入，便于验证不会把回退误用到图生图或专用供应商请求。
 */
internal suspend fun <T> executeImageRequestWithCompatibilityFallback(
    input: ImageGenerationInput,
    initialRequest: ImageRequestSpec,
    send: suspend (ImageRequestSpec) -> T,
): T = try {
    send(initialRequest)
} catch (error: ImageGenerationHttpException) {
    if (error.statusCode != 400 || !ImageRequestFactory.canRetryWithoutFormat(input)) throw error
    send(ImageRequestFactory.buildWithoutFormat(input))
}

/** Android 直连供应商的首版客户端；不记录 Authorization 或 API Key。 */
class ImageGenerationClient(private val context: Context) {
    suspend fun generate(
        provider: ProviderEntity,
        apiKey: String,
        input: ImageGenerationInput,
    ): GeneratedImage = withContext(Dispatchers.IO) {
        require(apiKey.isNotBlank()) { "当前供应商未配置 API Key" }
        val request = ImageRequestFactory.build(input)
        val response = executeImageRequestWithCompatibilityFallback(input, request) { requestSpec ->
            postJson(requestSpec.url, apiKey, ImageRequestFactory.toJson(requestSpec.body).toString())
        }
        val source = when (provider.type.lowercase()) {
            "grsai" -> resolveGrsaiResult(provider.endpoint, apiKey, response)
            else -> resolveOpenAiImage(response)
        }
        GeneratedImage(saveImage(source), provider.id, input.modelId)
    }

    private fun postJson(url: String, apiKey: String, body: String): JSONObject {
        val connection = openHttps(url, "POST")
        try {
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer $apiKey")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.outputStream.bufferedWriter().use { it.write(body) }
            return readJsonResponse(connection, "生图请求失败")
        } finally {
            connection.disconnect()
        }
    }

    private suspend fun resolveGrsaiResult(endpoint: String, apiKey: String, response: JSONObject): String {
        val status = response.optString("status")
        if (status == "succeeded") return firstResultUrl(response)
        if (status != "running" || response.optString("id").isBlank()) {
            throw IllegalArgumentException(if (status == "violation") "供应商拒绝了生成任务" else "供应商任务执行失败")
        }
        val id = response.getString("id")
        val resultEndpoint = try {
            val uri = URI(endpoint)
            URI(uri.scheme, uri.authority, uri.path.replace(Regex("generate/?$"), "result"), null, null).toString()
        } catch (_: Exception) {
            endpoint.replace(Regex("generate/?$"), "result")
        }
        repeat(80) {
            delay(3000)
            val connection = openHttps("$resultEndpoint?id=${java.net.URLEncoder.encode(id, "UTF-8")}", "GET")
            try {
                connection.setRequestProperty("Authorization", "Bearer $apiKey")
                val result = readJsonResponse(connection, "Grsai 任务查询失败")
                when (result.optString("status")) {
                    "succeeded" -> return firstResultUrl(result)
                    "failed" -> throw IllegalArgumentException("供应商任务执行失败")
                    "violation" -> throw IllegalArgumentException("供应商拒绝了生成任务")
                }
            } catch (_: java.net.SocketTimeoutException) {
                // 单次轮询超时不终止任务。
            } finally {
                connection.disconnect()
            }
        }
        throw IllegalArgumentException("轮询超时，任务仍未完成")
    }

    private fun resolveOpenAiImage(response: JSONObject): String {
        val item = response.optJSONArray("data")?.optJSONObject(0)
            ?: throw IllegalArgumentException("API 返回格式不正确：未找到图片数据")
        item.optString("url").takeIf { it.isNotBlank() }?.let { return it }
        item.optString("b64_json").takeIf { it.isNotBlank() }?.let {
            return if (it.startsWith("data:image/")) it else "data:image/png;base64,$it"
        }
        throw IllegalArgumentException("API 返回中未找到图片数据")
    }

    private fun firstResultUrl(response: JSONObject): String = response.optJSONArray("results")
        ?.optJSONObject(0)
        ?.optString("url")
        ?.takeIf { it.isNotBlank() }
        ?: throw IllegalArgumentException("供应商返回成功但未找到图片地址")

    private fun saveImage(source: String): File {
        val directory = File(context.filesDir, "generated").apply { mkdirs() }
        val target = File(directory, "gen_${UUID.randomUUID()}.png")
        when {
            source.startsWith("data:image/") -> {
                val base64 = source.substringAfter("base64,", "")
                require(base64.isNotBlank()) { "图片数据格式不正确" }
                target.writeBytes(Base64.decode(base64, Base64.DEFAULT))
            }
            source.startsWith("https://") -> {
                val connection = openHttps(source, "GET")
                try {
                    if (connection.responseCode !in 200..299) throw IllegalArgumentException("下载生成图片失败")
                    connection.inputStream.use { input -> target.outputStream().use { input.copyTo(it) } }
                } finally {
                    connection.disconnect()
                }
            }
            else -> throw IllegalArgumentException("供应商返回了不受支持的图片地址")
        }
        return target
    }

    private fun openHttps(url: String, method: String): HttpURLConnection {
        require(url.startsWith("https://")) { "请求地址必须使用 HTTPS" }
        return (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 30000
            readTimeout = 180000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
        }
    }

    private fun readJsonResponse(connection: HttpURLConnection, fallback: String): JSONObject {
        val status = connection.responseCode
        val stream = if (status in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        if (status !in 200..299) {
            throw ImageGenerationHttpException(
                statusCode = status,
                message = if (status == 401) "API Key 无效或已失效" else fallback,
            )
        }
        return try {
            JSONObject(body)
        } catch (_: Exception) {
            throw IllegalArgumentException("$fallback：响应格式不正确")
        }
    }
}
