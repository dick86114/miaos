package com.miaos.android.data

import com.miaos.android.data.database.GeneratedImageEntity
import com.miaos.android.data.database.MiaosDatabase
import java.util.UUID

data class GeneratedImageRecord(
    val id: String = "img_${UUID.randomUUID()}",
    val providerId: String,
    val providerName: String,
    val modelId: String,
    val prompt: String,
    val ratio: String,
    val quality: String,
    val imagePath: String,
    val createdAt: Long = System.currentTimeMillis(),
    val projectId: String? = null,
    val versionId: String? = null,
)

fun GeneratedImageRecord.toEntity(): GeneratedImageEntity = GeneratedImageEntity(
    id = id,
    providerId = providerId,
    providerName = providerName,
    modelId = modelId,
    prompt = prompt,
    ratio = ratio,
    quality = quality,
    imagePath = imagePath,
    createdAt = createdAt,
    projectId = projectId,
    versionId = versionId,
)

class GeneratedImageRepository(private val database: MiaosDatabase) {
    suspend fun save(record: GeneratedImageRecord) {
        database.generatedImageDao().insert(record.toEntity())
    }

    suspend fun delete(id: String) {
        database.generatedImageDao().deleteById(id)
    }
}
