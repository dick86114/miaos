package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Test

class GeneratedImageRecordTest {
    @Test
    fun `生成记录映射会保留展示和复用所需字段`() {
        val record = GeneratedImageRecord(
            id = "img_1",
            providerId = "p_grsai",
            providerName = "Grsai",
            modelId = "gpt-image-2",
            prompt = "雨夜城市",
            ratio = "16:9",
            quality = "高清",
            imagePath = "/data/user/0/com.miaos.android/files/generated/one.png",
            createdAt = 100L,
            projectId = "proj_1",
            versionId = "ver_1",
        )

        val entity = record.toEntity()
        assertEquals("img_1", entity.id)
        assertEquals("Grsai", entity.providerName)
        assertEquals("雨夜城市", entity.prompt)
        assertEquals(100L, entity.createdAt)
        assertEquals("proj_1", entity.projectId)
        assertEquals("ver_1", entity.versionId)
    }
}
