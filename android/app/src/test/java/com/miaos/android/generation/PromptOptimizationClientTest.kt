package com.miaos.android.generation

import org.junit.Assert.assertEquals
import org.junit.Test

class PromptOptimizationClientTest {
    @Test
    fun `文本端点会补齐 chat completions`() {
        assertEquals(
            "https://api.example.com/v1/chat/completions",
            chatCompletionsUrl("https://api.example.com/v1"),
        )
        assertEquals(
            "https://api.example.com/v1/chat/completions",
            chatCompletionsUrl("https://api.example.com/v1/chat/completions"),
        )
    }
}
