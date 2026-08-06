package com.miaos.android.data

/** 与 macOS `defaults` 配置字段兼容的默认模型偏好。 */
data class DefaultGenerationSettings(
    val defaultImageProvider: String = "",
    val defaultImageModel: String = "",
    val defaultTextProvider: String = "",
    val defaultTextModel: String = "",
    val defaultVideoProvider: String = "",
    val defaultVideoModel: String = "",
) {
    fun toJson(): String = buildString {
        append('{')
        appendJsonField("defaultImageProvider", defaultImageProvider)
        append(',')
        appendJsonField("defaultImageModel", defaultImageModel)
        append(',')
        appendJsonField("defaultTextProvider", defaultTextProvider)
        append(',')
        appendJsonField("defaultTextModel", defaultTextModel)
        append(',')
        appendJsonField("defaultVideoProvider", defaultVideoProvider)
        append(',')
        appendJsonField("defaultVideoModel", defaultVideoModel)
        append('}')
    }

    companion object {
        fun fromJson(value: String?): DefaultGenerationSettings {
            val raw = value.orEmpty()
            return DefaultGenerationSettings(
                defaultImageProvider = raw.jsonStringValue("defaultImageProvider"),
                defaultImageModel = raw.jsonStringValue("defaultImageModel"),
                defaultTextProvider = raw.jsonStringValue("defaultTextProvider"),
                defaultTextModel = raw.jsonStringValue("defaultTextModel"),
                defaultVideoProvider = raw.jsonStringValue("defaultVideoProvider"),
                defaultVideoModel = raw.jsonStringValue("defaultVideoModel"),
            )
        }
    }
}

private fun StringBuilder.appendJsonField(key: String, value: String) {
    append('"').append(key).append("\":\"").append(value.jsonEscape()).append('"')
}

private fun String.jsonEscape(): String = replace("\\", "\\\\")
    .replace("\"", "\\\"")
    .replace("\n", "\\n")
    .replace("\r", "\\r")
    .replace("\t", "\\t")

private fun String.jsonStringValue(key: String): String {
    val match = Regex("\\\"${Regex.escape(key)}\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"])*)\\\"").find(this) ?: return ""
    return match.groupValues[1]
        .replace("\\\"", "\"")
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
        .replace("\\\\", "\\")
}
