package com.miaos.android.data

import org.json.JSONObject

data class ImportedProvider(
    val id: String,
    val name: String,
    val type: String,
    val endpoint: String,
    val capabilitiesJson: String,
    val imageModelsJson: String,
    val textModelsJson: String,
    val videoModelsJson: String,
)

data class ImportedConfig(
    val providers: List<ImportedProvider>,
    val secrets: Map<String, String>,
    val defaults: JSONObject,
    val themeMode: String,
)

/** 解析 `.miaos` 文件并把密钥与普通配置分开，供导入确认后持久化。 */
object MiaosConfigImporter {
    fun parse(raw: String, password: CharArray): ImportedConfig {
        val envelopeJson = try {
            JSONObject(raw)
        } catch (_: Exception) {
            throw IllegalArgumentException("配置解密失败")
        }
        val envelope = ConfigEnvelope(
            format = envelopeJson.optString("format"),
            version = envelopeJson.optInt("version", -1),
            kdfName = envelopeJson.optJSONObject("kdf")?.optString("name").orEmpty(),
            iterations = envelopeJson.optJSONObject("kdf")?.optInt("iterations", -1) ?: -1,
            salt = envelopeJson.optJSONObject("kdf")?.optString("salt").orEmpty(),
            cipherName = envelopeJson.optJSONObject("cipher")?.optString("name").orEmpty(),
            iv = envelopeJson.optJSONObject("cipher")?.optString("iv").orEmpty(),
            tag = envelopeJson.optJSONObject("cipher")?.optString("tag").orEmpty(),
            payload = envelopeJson.optString("payload"),
        )
        val payload = JSONObject(MiaosConfigCrypto.decryptPayload(envelope, password))
        require(payload.optInt("schemaVersion", -1) == 1) { "配置内容不正确" }

        val providers = buildList {
            val array = payload.optJSONArray("providers") ?: return@buildList
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val id = item.optString("id")
                if (id.isBlank()) continue
                add(ImportedProvider(
                    id = id,
                    name = item.optString("name", id),
                    type = item.optString("type"),
                    endpoint = validateProviderEndpoint(item.optString("endpoint")),
                    capabilitiesJson = item.optJSONArray("capabilities")?.toString() ?: "[]",
                    imageModelsJson = item.optJSONArray("imageModels")?.toString() ?: "[]",
                    textModelsJson = item.optJSONArray("textModels")?.toString() ?: "[]",
                    videoModelsJson = item.optJSONArray("videoModels")?.toString() ?: "[]",
                ))
            }
        }
        val secretsJson = payload.optJSONObject("secrets")
        val secrets = buildMap {
            if (secretsJson != null) {
                for (key in secretsJson.keys()) {
                    val value = secretsJson.optString(key)
                    if (value.isNotBlank()) put(key, value)
                }
            }
        }
        return ImportedConfig(
            providers = providers,
            secrets = secrets,
            defaults = payload.optJSONObject("defaults") ?: JSONObject(),
            themeMode = payload.optString("themeMode", "system"),
        )
    }
}
