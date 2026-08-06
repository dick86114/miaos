package com.miaos.android.generation

import com.miaos.android.data.DefaultGenerationSettings
import com.miaos.android.data.MiaosSecretStore
import com.miaos.android.data.database.ProviderEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** Android 端直接调用已配置的文本模型，为生图页提供提示词优化。 */
class PromptOptimizationClient {
    suspend fun optimize(
        providers: List<ProviderEntity>,
        secretStore: MiaosSecretStore,
        prompt: String,
        defaults: DefaultGenerationSettings = DefaultGenerationSettings(),
    ): String = withContext(Dispatchers.IO) {
        require(prompt.isNotBlank()) { "请输入需要优化的提示词" }
        val configured = providers.firstOrNull { it.id == defaults.defaultTextProvider }
            ?.let { provider -> defaults.defaultTextModel.takeIf { it in provider.textModels() }?.let { provider to it } }
        val selection = configured ?: providers.asSequence()
            .mapNotNull { provider ->
                val model = provider.textModels().firstOrNull() ?: return@mapNotNull null
                provider to model
            }
            .firstOrNull() ?: throw IllegalArgumentException("请先在设置中配置并启用文本模型")
        val apiKey = secretStore.get(selection.first.id).orEmpty()
        require(apiKey.isNotBlank()) { "文本模型供应商未配置 API Key" }
        val body = JSONObject()
            .put("model", selection.second)
            .put("messages", org.json.JSONArray()
                .put(JSONObject().put("role", "system").put("content", SYSTEM_PROMPT))
                .put(JSONObject().put("role", "user").put("content", prompt.trim())))
            .put("temperature", 0.7)
            .put("max_tokens", 500)
        val response = postJson(chatCompletionsUrl(selection.first.endpoint), apiKey, body.toString())
        val content = response.optJSONArray("choices")
            ?.optJSONObject(0)
            ?.optJSONObject("message")
            ?.optString("content")
            ?.trim()
            .orEmpty()
        require(content.isNotBlank()) { "文本模型返回为空" }
        content.replace(apiKey, "***").take(4_000)
    }

    private fun postJson(url: String, apiKey: String, body: String): JSONObject {
        require(url.startsWith("https://")) { "文本模型地址必须使用 HTTPS" }
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15_000
            readTimeout = 60_000
            doOutput = true
            setRequestProperty("Authorization", "Bearer $apiKey")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
        }
        try {
            connection.outputStream.bufferedWriter().use { it.write(body) }
            val status = connection.responseCode
            val raw = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) throw IllegalArgumentException(if (status == 401) "API Key 无效或已失效" else "文本模型请求失败（HTTP $status）")
            return try {
                JSONObject(raw)
            } catch (_: Exception) {
                throw IllegalArgumentException("文本模型响应格式不正确")
            }
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        private const val SYSTEM_PROMPT = "你是一个专业的 AI 绘画提示词优化专家。请根据用户提供的原始提示词，优化为更详细、更具画面感的中文提示词。要求：保留原始意图，补充画质、光影、构图、风格等细节，输出纯中文提示词，不要解释或 Markdown，控制在 200 字以内。"
    }
}

internal fun chatCompletionsUrl(endpoint: String): String {
    val uri = try { URI(endpoint) } catch (_: Exception) { throw IllegalArgumentException("文本模型地址格式不正确") }
    require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) { "文本模型地址必须使用 HTTPS" }
    val path = uri.path.orEmpty().trimEnd('/')
    val chatPath = if (path.endsWith("/chat/completions", ignoreCase = true)) path else "$path/chat/completions"
    return URI(uri.scheme, uri.authority, chatPath, null, null).toString()
}

private fun ProviderEntity.textModels(): List<String> = try {
    val models = org.json.JSONArray(textModelsJson)
    buildList {
        for (index in 0 until models.length()) {
            val item = models.optJSONObject(index) ?: continue
            if (item.optBoolean("enabled", false)) item.optString("id").takeIf { it.isNotBlank() }?.let(::add)
        }
    }
} catch (_: Exception) {
    emptyList()
}
