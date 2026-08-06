package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Test

class GenerationTaskRecordTest {
    @Test
    fun `新任务默认进入等待队列并保留项目归属`() {
        val record = GenerationTaskRecord.create(
            providerId = "p_grsai",
            providerName = "Grsai",
            providerType = "grsai",
            endpoint = "https://api.example.com",
            modelId = "gpt-image-2",
            prompt = "雨夜城市",
            ratio = "16:9",
            quality = "高清",
            projectId = "proj_1",
            versionId = "ver_1",
            createdAt = 500L,
        )

        assertEquals(GenerationTaskStatus.QUEUED, record.status)
        assertEquals("proj_1", record.projectId)
        assertEquals("ver_1", record.versionId)
        assertEquals(500L, record.createdAt)
        assertEquals("雨夜城市", record.prompt)
    }
}
