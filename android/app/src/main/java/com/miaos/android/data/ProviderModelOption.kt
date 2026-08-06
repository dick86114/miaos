package com.miaos.android.data

/** 可在设备端单独启用/停用的供应商模型元数据。 */
data class ProviderModelOption(
    val id: String,
    val name: String = id,
    val enabled: Boolean = true,
)

/**
 * 模型配置来自受控的本地 JSON 字段。外层对象边界采用字符类，避免 Android ICU
 * 不接受原先 `\\{` / `}` 组合正则而导致配置导入预览或模型管理页面崩溃。
 */
fun parseProviderModelOptions(json: String): List<ProviderModelOption> = buildList {
    Regex("[{]([^{}]*)[}]").findAll(json).forEach { match ->
        val objectJson = match.groupValues[1]
        val id = objectJson.jsonModelValue("id")
        if (id.isBlank()) return@forEach
        add(
            ProviderModelOption(
                id = id,
                name = objectJson.jsonModelValue("name").ifBlank { id },
                enabled = !Regex("\\\"enabled\\\"\\s*:\\s*false", RegexOption.IGNORE_CASE).containsMatchIn(objectJson),
            ),
        )
    }
}

fun List<ProviderModelOption>.toJson(): String = joinToString(prefix = "[", postfix = "]") { model ->
    "{\"id\":\"${model.id.modelJsonEscape()}\",\"name\":\"${model.name.modelJsonEscape()}\",\"enabled\":${model.enabled}}"
}

private fun String.jsonModelValue(key: String): String {
    val match = Regex("\\\"${Regex.escape(key)}\\\"\\s*:\\s*\\\"((?:\\\\.|[^\\\"])*)\\\"").find(this) ?: return ""
    return match.groupValues[1]
        .replace("\\\"", "\"")
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
        .replace("\\\\", "\\")
}

private fun String.modelJsonEscape(): String = replace("\\", "\\\\")
    .replace("\"", "\\\"")
    .replace("\n", "\\n")
    .replace("\r", "\\r")
    .replace("\t", "\\t")

/** 供应商可以只配置图像模型、只配置文本模型，或同时配置两类模型。 */
fun hasAnyProviderModel(imageModelIds: List<String>, textModelIds: List<String>): Boolean =
    imageModelIds.any { it.isNotBlank() } || textModelIds.any { it.isNotBlank() }
