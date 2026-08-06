package com.miaos.android.generation

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test

class ImageRequestFallbackExecutorTest {
    @Test
    fun `兼容文生图收到400后只发送一次最小回退请求`() = runBlocking {
        val input = ImageGenerationInput(
            providerType = "openai",
            endpoint = "https://compatible.example/v1",
            modelId = "compatible-image-model",
            prompt = "海边日落",
            ratio = "1:1",
            quality = "高清",
        )
        val sent = mutableListOf<ImageRequestSpec>()

        val result = executeImageRequestWithCompatibilityFallback(input, ImageRequestFactory.build(input)) { request ->
            sent += request
            if (sent.size == 1) throw ImageGenerationHttpException(400, "生图请求失败")
            "fallback-success"
        }

        assertEquals("fallback-success", result)
        assertEquals(2, sent.size)
        assertFalse(sent[0].body.isEmpty())
        assertFalse(sent[1].body.containsKey("response_format"))
        assertFalse(sent[1].body.containsKey("return_base64"))
        assertEquals(1, sent[1].body.getValue("n"))
    }

    @Test
    fun `带参考图的兼容图生图收到400不会降级重试`() = runBlocking {
        val input = ImageGenerationInput(
            providerType = "openai",
            endpoint = "https://compatible.example/v1",
            modelId = "compatible-image-model",
            prompt = "海边日落",
            ratio = "1:1",
            quality = "高清",
            sourceImage = "data:image/png;base64,reference",
        )
        var attempts = 0

        try {
            executeImageRequestWithCompatibilityFallback(input, ImageRequestFactory.build(input)) {
                attempts += 1
                throw ImageGenerationHttpException(400, "生图请求失败")
            }
            fail("带参考图时应直接抛出原始 HTTP 400 错误")
        } catch (error: ImageGenerationHttpException) {
            assertEquals(400, error.statusCode)
        }
        assertEquals(1, attempts)
    }
}
