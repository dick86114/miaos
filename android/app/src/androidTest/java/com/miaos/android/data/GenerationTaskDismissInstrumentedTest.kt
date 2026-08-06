package com.miaos.android.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.miaos.android.data.database.GenerationTaskEntity
import com.miaos.android.data.database.MiaosDatabase
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GenerationTaskDismissInstrumentedTest {
    @Test
    fun 已完成任务可从队列记录移除但不会触及图片历史() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext
        val dao = MiaosDatabase.create(context).generationTaskDao()
        val taskId = "terminal_task_${System.nanoTime()}"
        dao.insert(
            GenerationTaskEntity(
                id = taskId,
                providerId = "provider_test",
                providerName = "测试供应商",
                providerType = "openai",
                endpoint = "https://example.invalid/v1",
                modelId = "model_test",
                prompt = "测试任务",
                ratio = "1:1",
                quality = "高清",
                status = GenerationTaskStatus.DONE,
                createdAt = 1L,
                completedAt = 2L,
                imagePath = "/data/user/0/com.miaos.android/files/result.png",
            ),
        )

        assertEquals(1, dao.deleteTerminal(taskId))
        assertNull(dao.findById(taskId))
    }
}
