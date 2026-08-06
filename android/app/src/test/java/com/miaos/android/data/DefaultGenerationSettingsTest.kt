package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Test

class DefaultGenerationSettingsTest {
    @Test
    fun `从 macOS 默认配置读取图像和文本模型`() {
        val settings = DefaultGenerationSettings.fromJson(
            """{
                "defaultImageProvider":"p_grsai",
                "defaultImageModel":"gpt-image-2",
                "defaultTextProvider":"p_text",
                "defaultTextModel":"qwen-plus"
            }""",
        )

        assertEquals("p_grsai", settings.defaultImageProvider)
        assertEquals("gpt-image-2", settings.defaultImageModel)
        assertEquals("p_text", settings.defaultTextProvider)
        assertEquals("qwen-plus", settings.defaultTextModel)
    }
    @Test
    fun `默认配置 JSON 往返会保留模型标识`() {
        val original = DefaultGenerationSettings(
            defaultImageProvider = "provider_\"one",
            defaultImageModel = "image-model",
            defaultTextProvider = "text-provider",
            defaultTextModel = "text-model",
        )

        val restored = DefaultGenerationSettings.fromJson(original.toJson())
        assertEquals(original.defaultImageProvider, restored.defaultImageProvider)
        assertEquals(original.defaultImageModel, restored.defaultImageModel)
        assertEquals(original.defaultTextProvider, restored.defaultTextProvider)
        assertEquals(original.defaultTextModel, restored.defaultTextModel)
    }

}
