package com.miaos.android.generation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GenerationTaskErrorTest {
    @Test
    fun `持久化的失败信息不会包含 API Key`() {
        val apiKey = "sk-sensitive-test-key-123456"
        val message = taskErrorMessage(IllegalArgumentException("请求失败：Bearer $apiKey"), apiKey)

        assertFalse(message.contains(apiKey))
        assertTrue(message.contains("Bearer ***"))
    }
}
