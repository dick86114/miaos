package com.miaos.android.generation

import android.content.Context
import android.util.Base64
import androidx.room.withTransaction
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.miaos.android.data.GeneratedImageRecord
import com.miaos.android.data.toEntity
import com.miaos.android.data.GenerationTaskRepository
import com.miaos.android.data.MiaosSecretStore
import com.miaos.android.data.database.GenerationTaskEntity
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.data.database.ProviderEntity
import kotlinx.coroutines.CancellationException
import java.io.File

/**
 * WorkManager 只负责唤醒与串行调度；任务的真实状态落在 Room，方便页面展示和失败后重试。
 * 非幂等的远端生图请求失败后不自动重试，以免用户收到重复扣费或重复图片。
 */
class GenerationTaskWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val taskId = inputData.getString(KEY_TASK_ID) ?: return Result.failure()
        val database = MiaosDatabase.create(applicationContext)
        val taskRepository = GenerationTaskRepository(database)
        val task = taskRepository.claim(taskId) ?: return Result.success()

        var apiKey: String? = null
        return try {
            apiKey = MiaosSecretStore(applicationContext).get(task.providerId).orEmpty()
            val result = ImageGenerationClient(applicationContext).generate(
                provider = task.toProviderSnapshot(),
                apiKey = apiKey.orEmpty(),
                input = task.toImageGenerationInput(),
            )
            database.withTransaction {
                // 项目或版本在网络请求期间被删除时，取消状态优先，避免复活已删除的版本数据。
                if (!database.generationTaskDao().isRunning(task.id)) return@withTransaction
                database.generatedImageDao().insert(GeneratedImageRecord(
                    providerId = task.providerId,
                    providerName = task.providerName,
                    modelId = task.modelId,
                    prompt = task.prompt,
                    ratio = task.ratio,
                    quality = task.quality,
                    imagePath = result.file.absolutePath,
                    projectId = task.projectId,
                    versionId = task.versionId,
                ).toEntity())
                task.versionId?.let { versionId ->
                    database.projectVersionDao().updateGenerationSettings(
                        versionId = versionId,
                        prompt = task.prompt,
                        providerId = task.providerId,
                        providerName = task.providerName,
                        modelId = task.modelId,
                    )
                }
                taskRepository.markCompleted(task.id, result.file.absolutePath)
            }
            Result.success()
        } catch (error: CancellationException) {
            taskRepository.returnToQueue(task.id)
            throw error
        } catch (error: Exception) {
            taskRepository.markFailed(task.id, taskErrorMessage(error, apiKey))
            Result.success()
        }
    }

    companion object {
        const val KEY_TASK_ID = "generation_task_id"
    }
}

private fun GenerationTaskEntity.toProviderSnapshot(): ProviderEntity = ProviderEntity(
    id = providerId,
    name = providerName,
    type = providerType,
    endpoint = endpoint,
    capabilitiesJson = "[]",
    imageModelsJson = "[]",
    textModelsJson = "[]",
    videoModelsJson = "[]",
    updatedAt = createdAt,
)

private fun GenerationTaskEntity.toImageGenerationInput(): ImageGenerationInput = ImageGenerationInput(
    providerType = providerType,
    endpoint = endpoint,
    modelId = modelId,
    prompt = prompt,
    ratio = ratio,
    quality = quality,
    sourceImage = sourceImagePath?.let(::sourceImageToDataUrl),
)

private fun sourceImageToDataUrl(path: String): String {
    val file = File(path)
    require(file.isFile) { "参考图文件不存在" }
    require(file.length() <= 12L * 1024 * 1024) { "参考图不能超过 12MB" }
    val mime = when (file.extension.lowercase()) {
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        else -> "image/png"
    }
    return "data:$mime;base64," + Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
}

/** 供应商错误有可能回显请求头，持久化前做保守脱敏并限制长度。 */
internal fun taskErrorMessage(error: Throwable, apiKey: String?): String {
    val raw = error.message.orEmpty().trim().ifBlank { "生成失败，请检查网络、模型与供应商配置" }
    val withoutKnownKey = apiKey?.takeIf { it.isNotBlank() }?.let { raw.replace(it, "***") } ?: raw
    return withoutKnownKey
        .replace(Regex("(?i)bearer\\s+[A-Za-z0-9._~+/-]{8,}"), "Bearer ***")
        .replace(Regex("(?i)(api[_ -]?key|token)[=:]\\s*[^\\s,;]+"), "$1=***")
        .take(240)
}
