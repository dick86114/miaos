package com.miaos.android.data

import androidx.room.withTransaction
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.data.database.PreferenceEntity
import com.miaos.android.data.database.ProviderEntity

fun ImportedProvider.toEntity(updatedAt: Long): ProviderEntity = ProviderEntity(
    id = id,
    name = name,
    type = type,
    endpoint = endpoint,
    capabilitiesJson = capabilitiesJson,
    imageModelsJson = imageModelsJson,
    textModelsJson = textModelsJson,
    videoModelsJson = videoModelsJson,
    updatedAt = updatedAt,
)

/** 先写普通配置，再写 Keystore 密钥；密钥从不进入 Room。 */
class MiaosConfigRepository(
    private val database: MiaosDatabase,
    private val secretStore: MiaosSecretStore,
) {
    suspend fun importConfig(config: ImportedConfig, now: Long = System.currentTimeMillis()) {
        database.withTransaction {
            database.providerDao().upsertAll(config.providers.map { it.toEntity(now).copy(endpoint = validateProviderEndpoint(it.endpoint)) })
            database.preferenceDao().putAll(listOf(
                PreferenceEntity("defaults", config.defaults.toString()),
                PreferenceEntity("themeMode", config.themeMode),
            ))
        }
        knownProviderSecrets(config.providers.map { it.id }, config.secrets)
            .forEach { (providerId, apiKey) -> secretStore.put(providerId, apiKey) }
    }

    suspend fun saveProvider(provider: ProviderEntity, apiKey: String?) {
        val normalizedProvider = provider.copy(endpoint = validateProviderEndpoint(provider.endpoint))
        database.providerDao().upsertAll(listOf(normalizedProvider))
        apiKey?.trim()?.takeIf { it.isNotBlank() }?.let { secretStore.put(normalizedProvider.id, it) }
    }

    suspend fun deleteProvider(providerId: String) {
        database.withTransaction { database.providerDao().deleteById(providerId) }
        secretStore.remove(providerId)
    }

    suspend fun replaceImageModels(provider: ProviderEntity, imageModelsJson: String) {
        database.providerDao().upsertAll(listOf(provider.copy(
            imageModelsJson = imageModelsJson,
            updatedAt = System.currentTimeMillis(),
        )))
    }

    suspend fun replaceTextModels(provider: ProviderEntity, textModelsJson: String) {
        database.providerDao().upsertAll(listOf(provider.copy(
            textModelsJson = textModelsJson,
            updatedAt = System.currentTimeMillis(),
        )))
    }

    suspend fun saveThemeMode(themeMode: String) {
        require(themeMode in setOf("system", "light", "dark")) { "主题模式不正确" }
        database.preferenceDao().putAll(listOf(PreferenceEntity("themeMode", themeMode)))
    }

    suspend fun saveDefaults(defaults: DefaultGenerationSettings) {
        database.preferenceDao().putAll(listOf(PreferenceEntity("defaults", defaults.toJson())))
    }
}
