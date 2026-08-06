package com.miaos.android.generation

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.miaos.android.data.GenerationTaskRecord
import com.miaos.android.data.GenerationTaskRepository

/** 在一个唯一 Work 链中追加任务，确保设备上同一时刻只请求一个生图供应商。 */
class GenerationTaskScheduler(
    context: Context,
    private val taskRepository: GenerationTaskRepository,
) {
    private val appContext = context.applicationContext

    suspend fun enqueue(record: GenerationTaskRecord) {
        taskRepository.enqueue(record)
        appendWork(record.id)
    }

    /** 进程意外终止后恢复未完成任务；重复调度由 Worker 的认领操作幂等拦截。 */
    suspend fun resumePendingTasks() {
        taskRepository.recoverInterruptedTasks().forEach(::appendWork)
    }

    suspend fun retry(taskId: String): Boolean {
        if (!taskRepository.retry(taskId)) return false
        appendWork(taskId)
        return true
    }

    /** 已排队但尚未执行的任务会在 Work 链中被跳过，不中断后续任务。 */
    suspend fun cancelQueued(taskId: String): Boolean = taskRepository.cancelQueued(taskId)

    /** 只移除已经结束的队列记录，不取消正在执行的 Work，也不删除图片历史。 */
    suspend fun dismissTerminal(taskId: String): Boolean = taskRepository.dismissTerminal(taskId)

    private fun appendWork(taskId: String) {
        val request = OneTimeWorkRequestBuilder<GenerationTaskWorker>()
            .setInputData(workDataOf(GenerationTaskWorker.KEY_TASK_ID to taskId))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .addTag("miaos-generation-task-$taskId")
            .build()
        WorkManager.getInstance(appContext).enqueueUniqueWork(
            UNIQUE_WORK_NAME,
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            request,
        )
    }

    private companion object {
        const val UNIQUE_WORK_NAME = "miaos-generation-serial-queue"
    }
}
