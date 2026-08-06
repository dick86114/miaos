package com.miaos.android.data

/** 供确认弹窗展示的无密钥配置摘要。 */
data class ConfigImportProviderPreview(
    val id: String,
    val name: String,
    val type: String,
    val enabledImageModelCount: Int,
    val enabledTextModelCount: Int,
)

data class ConfigImportPreview(
    val providerCount: Int,
    val secretCount: Int,
    val themeLabel: String,
    val providers: List<ConfigImportProviderPreview>,
)

/** 将解密后的配置转为可安全展示的摘要；绝不把 API Key 带入摘要。 */
fun configImportPreview(config: ImportedConfig): ConfigImportPreview = ConfigImportPreview(
    providerCount = config.providers.size,
    secretCount = knownProviderSecrets(config.providers.map { it.id }, config.secrets).size,
    themeLabel = when (config.themeMode) {
        "dark" -> "深色"
        "light" -> "浅色"
        else -> "跟随系统"
    },
    providers = config.providers.map { provider ->
        ConfigImportProviderPreview(
            id = provider.id,
            name = provider.name.ifBlank { provider.id },
            type = provider.type.ifBlank { "openai" },
            enabledImageModelCount = parseProviderModelOptions(provider.imageModelsJson).count { it.enabled },
            enabledTextModelCount = parseProviderModelOptions(provider.textModelsJson).count { it.enabled },
        )
    },
)
