package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProviderModelOptionTest {
    @Test
    fun `模型配置解析与序列化保留启用状态`() {
        val models = parseProviderModelOptions(
            """[
                {"id":"image-1","name":"图像一","enabled":true},
                {"id":"text-1","enabled":false}
            ]""",
        )

        assertEquals(2, models.size)
        assertTrue(models[0].enabled)
        assertFalse(models[1].enabled)
        assertEquals("text-1", models[1].name)
        assertTrue(parseProviderModelOptions(models.toJson()).first().enabled)
        assertFalse(parseProviderModelOptions(models.toJson())[1].enabled)
    }
}
