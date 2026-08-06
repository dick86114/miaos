package com.miaos.android.ui

import com.miaos.android.data.GenerationTaskStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class GenerationTaskQueueActionsTest {
    @Test
    fun `等待任务只显示取消操作`() {
        assertEquals(
            GenerationTaskQueueActions(canCancel = true, canRetry = false, canDismiss = false),
            generationTaskQueueActions(GenerationTaskStatus.QUEUED),
        )
    }

    @Test
    fun `失败任务可重试或从队列移除`() {
        assertEquals(
            GenerationTaskQueueActions(canCancel = false, canRetry = true, canDismiss = true),
            generationTaskQueueActions(GenerationTaskStatus.FAILED),
        )
    }

    @Test
    fun `完成和取消任务仅可移除，运行中任务不可错误操作`() {
        assertEquals(
            GenerationTaskQueueActions(canCancel = false, canRetry = false, canDismiss = true),
            generationTaskQueueActions(GenerationTaskStatus.DONE),
        )
        assertEquals(
            GenerationTaskQueueActions(canCancel = false, canRetry = true, canDismiss = true),
            generationTaskQueueActions(GenerationTaskStatus.CANCELED),
        )
        assertEquals(
            GenerationTaskQueueActions(canCancel = false, canRetry = false, canDismiss = false),
            generationTaskQueueActions(GenerationTaskStatus.RUNNING),
        )
    }
}
