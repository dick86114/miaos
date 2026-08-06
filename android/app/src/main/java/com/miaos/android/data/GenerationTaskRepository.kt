package com.miaos.android.data

import com.miaos.android.data.database.GenerationTaskEntity
import com.miaos.android.data.database.MiaosDatabase
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/** 任务状态只保存业务状态；WorkManager 的内部状态不作为用户可见记录。 */
object GenerationTaskStatus {
    const val QUEUED = "queued"
    const val RUNNING = "running"
    const val DONE = "done"
    const val FAILED = "failed"
    const val CANCELED = "canceled"

    fun isActive(status: String): Boolean = status == QUEUED || status == RUNNING
}

/**
 * 入队时保存完整的请求快照，确保稍后执行时不会因为当前界面状态改变而串改任务。
 * API Key 只根据 providerId 在 Worker 执行时从 Android Keystore 读取，绝不写入该记录。
 */
data class GenerationTaskRecord(
    val id: String = "task_${UUID.randomUUID()}",
    val providerId: String,
    val providerName: String,
    val providerType: String,
    val endpoint: String,
    val modelId: String,
    val prompt: String,
    val ratio: String,
    val quality: String,
    val sourceImagePath: String? = null,
    val projectId: String? = null,
    val versionId: String? = null,
    val status: String = GenerationTaskStatus.QUEUED,
    val createdAt: Long = System.currentTimeMillis(),
    val startedAt: Long? = null,
    val completedAt: Long? = null,
    val errorMessage: String? = null,
    val imagePath: String? = null,
) {
    companion object {
        fun create(
            providerId: String,
            providerName: String,
            providerType: String,
            endpoint: String,
            modelId: String,
            prompt: String,
            ratio: String,
            quality: String,
            sourceImagePath: String? = null,
            projectId: String? = null,
            versionId: String? = null,
            createdAt: Long = System.currentTimeMillis(),
        ): GenerationTaskRecord = GenerationTaskRecord(
            providerId = providerId,
            providerName = providerName,
            providerType = providerType,
            endpoint = endpoint,
            modelId = modelId,
            prompt = prompt.trim(),
            ratio = ratio,
            quality = quality,
            sourceImagePath = sourceImagePath,
            projectId = projectId,
            versionId = versionId,
            createdAt = createdAt,
        )
    }
}

fun GenerationTaskRecord.toEntity(): GenerationTaskEntity = GenerationTaskEntity(
    id = id,
    providerId = providerId,
    providerName = providerName,
    providerType = providerType,
    endpoint = endpoint,
    modelId = modelId,
    prompt = prompt,
    ratio = ratio,
    quality = quality,
    sourceImagePath = sourceImagePath,
    projectId = projectId,
    versionId = versionId,
    status = status,
    createdAt = createdAt,
    startedAt = startedAt,
    completedAt = completedAt,
    errorMessage = errorMessage,
    imagePath = imagePath,
)

fun GenerationTaskEntity.toRecord(): GenerationTaskRecord = GenerationTaskRecord(
    id = id,
    providerId = providerId,
    providerName = providerName,
    providerType = providerType,
    endpoint = endpoint,
    modelId = modelId,
    prompt = prompt,
    ratio = ratio,
    quality = quality,
    sourceImagePath = sourceImagePath,
    projectId = projectId,
    versionId = versionId,
    status = status,
    createdAt = createdAt,
    startedAt = startedAt,
    completedAt = completedAt,
    errorMessage = errorMessage,
    imagePath = imagePath,
)

class GenerationTaskRepository(private val database: MiaosDatabase) {
    fun observeAll(): Flow<List<GenerationTaskEntity>> = database.generationTaskDao().observeAll()

    suspend fun enqueue(record: GenerationTaskRecord) {
        database.generationTaskDao().insert(record.toEntity())
    }

    /** 只有等待中的任务可被 Worker 认领，避免重复调度时重复请求供应商。 */
    suspend fun claim(taskId: String, startedAt: Long = System.currentTimeMillis()): GenerationTaskEntity? {
        if (database.generationTaskDao().markRunning(taskId, startedAt) == 0) return null
        return database.generationTaskDao().findById(taskId)
    }

    suspend fun markCompleted(taskId: String, imagePath: String, completedAt: Long = System.currentTimeMillis()) {
        database.generationTaskDao().markCompleted(taskId, imagePath, completedAt)
    }

    suspend fun markFailed(taskId: String, errorMessage: String, completedAt: Long = System.currentTimeMillis()) {
        database.generationTaskDao().markFailed(taskId, errorMessage, completedAt)
    }

    suspend fun returnToQueue(taskId: String) {
        database.generationTaskDao().returnToQueue(taskId)
    }

    suspend fun retry(taskId: String): Boolean = database.generationTaskDao().retry(taskId) > 0

    suspend fun cancelQueued(taskId: String): Boolean = database.generationTaskDao()
        .cancelQueued(taskId, System.currentTimeMillis()) > 0

    /** 终态队列记录可清理，历史图片和项目版本不受影响。 */
    suspend fun dismissTerminal(taskId: String): Boolean = database.generationTaskDao().deleteTerminal(taskId) > 0

    /** 应用被系统终止后，上一轮遗留的运行中任务会在下次启动时恢复等待。 */
    suspend fun recoverInterruptedTasks(): List<String> {
        database.generationTaskDao().recoverInterruptedTasks()
        return database.generationTaskDao().pendingIds()
    }
}
