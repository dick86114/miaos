package com.miaos.android.generation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ImageRequestFactoryTest {
    @Test
    fun `Grsai 请求保持原生接口字段`() {
        val request = ImageRequestFactory.build(ImageGenerationInput(
            providerType = "grsai",
            endpoint = "https://grsai.example/v1/api/generate",
            modelId = "gpt-image-2",
            prompt = "一只猫",
            ratio = "16:9",
            quality = "高清",
            sourceImage = "data:image/png;base64,abc",
        ))

        assertEquals("https://grsai.example/v1/api/generate", request.url)
        assertEquals("gpt-image-2", request.body.getValue("model") as String)
        assertEquals("16:9", request.body.getValue("aspectRatio") as String)
        assertEquals("json", request.body.getValue("replyType") as String)
        assertEquals("data:image/png;base64,abc", (request.body.getValue("images") as List<*>)[0] as String)
    }

    @Test
    fun `OpenAI 兼容请求使用 b64_json 返回格式`() {
        val request = ImageRequestFactory.build(ImageGenerationInput(
            providerType = "openai",
            endpoint = "https://api.example/v1/images/generations",
            modelId = "gpt-image-1",
            prompt = "山水",
            ratio = "1:1",
            quality = "标准",
        ))

        assertEquals("b64_json", request.body.getValue("response_format") as String)
        assertEquals("1024x1024", request.body.getValue("size") as String)
    }

    @Test
    fun `OpenAI 兼容文生图可回退为不带格式字段的请求`() {
        val input = ImageGenerationInput(
            providerType = "openai",
            endpoint = "https://compatible.example/v1",
            modelId = "compatible-image-model",
            prompt = "海边日落",
            ratio = "1:1",
            quality = "高清",
        )

        org.junit.Assert.assertTrue(ImageRequestFactory.canRetryWithoutFormat(input))
        val fallback = ImageRequestFactory.buildWithoutFormat(input)

        assertEquals("https://compatible.example/v1/images/generations", fallback.url)
        assertEquals(1, fallback.body.getValue("n"))
        org.junit.Assert.assertFalse(fallback.body.containsKey("response_format"))
        org.junit.Assert.assertFalse(fallback.body.containsKey("return_base64"))
    }

    @Test
    fun `带参考图和专用供应商不会进入格式字段回退`() {
        val openAiImageToImage = ImageGenerationInput(
            providerType = "openai",
            endpoint = "https://compatible.example/v1",
            modelId = "compatible-image-model",
            prompt = "海边日落",
            ratio = "1:1",
            quality = "高清",
            sourceImage = "data:image/png;base64,reference",
        )
        val aiping = openAiImageToImage.copy(providerType = "aiping")
        val grsai = openAiImageToImage.copy(providerType = "grsai", sourceImage = null)

        org.junit.Assert.assertFalse(ImageRequestFactory.canRetryWithoutFormat(openAiImageToImage))
        org.junit.Assert.assertFalse(ImageRequestFactory.canRetryWithoutFormat(aiping))
        org.junit.Assert.assertFalse(ImageRequestFactory.canRetryWithoutFormat(grsai))
    }

    @Test
    fun `OpenAI 兼容供应商有参考图时使用 macOS 的兼容图生图结构`() {
        val sourceImage = "data:image/png;base64,openai-reference"
        val request = ImageRequestFactory.build(ImageGenerationInput(
            providerType = "openai",
            endpoint = "https://compatible.example/v1",
            modelId = "compatible-image-model",
            prompt = "基于参考图生成一张海报",
            ratio = "1:1",
            quality = "高清",
            sourceImage = sourceImage,
        ))

        assertEquals("https://compatible.example/v1/images/generations", request.url)
        val extraBody = request.body.getValue("extra_body") as Map<*, *>
        assertEquals(listOf(sourceImage), extraBody["image"])
        assertEquals("b64_json", extraBody["response_format"])
        org.junit.Assert.assertFalse(request.body.containsKey("response_format"))
        org.junit.Assert.assertFalse(request.body.containsKey("n"))
    }

    @Test
    fun `Agnes 无参考图时保持文生图 base64 协议`() {
        val request = ImageRequestFactory.build(ImageGenerationInput(
            providerType = "agnes-ai",
            endpoint = "https://agnes.example/v1",
            modelId = "agnes-image",
            prompt = "水彩城市",
            ratio = "1:1",
            quality = "高清",
        ))

        assertEquals(true, request.body.getValue("return_base64"))
        assertEquals(1, request.body.getValue("n"))
        org.junit.Assert.assertFalse(request.body.containsKey("extra_body"))
    }

    @Test
    fun `Agnes 有参考图时改用 extra body 图生图协议`() {
        val sourceImage = "data:image/png;base64,agnes-reference"
        val request = ImageRequestFactory.build(ImageGenerationInput(
            providerType = "agnes-ai",
            endpoint = "https://agnes.example/v1",
            modelId = "agnes-image",
            prompt = "把参考图变成水彩风格",
            ratio = "1:1",
            quality = "高清",
            sourceImage = sourceImage,
        ))

        assertEquals("https://agnes.example/v1/images/generations", request.url)
        val extraBody = request.body.getValue("extra_body") as Map<*, *>
        assertEquals(listOf(sourceImage), extraBody["image"])
        assertEquals("b64_json", extraBody["response_format"])
        org.junit.Assert.assertFalse(request.body.containsKey("return_base64"))
    }

    @Test
    fun `Aiping 编辑模型没有参考图时拒绝生成`() {
        assertThrows(IllegalArgumentException::class.java) {
            ImageRequestFactory.build(ImageGenerationInput(
                providerType = "aiping",
                endpoint = "https://aiping.example/api/v1/images/generations",
                modelId = "Qwen-Image-Edit",
                prompt = "编辑图片",
                ratio = "1:1",
                quality = "高清",
            ))
        }
    }

    @Test
    fun `Aiping Kling 使用平台所需的比例和分辨率字段`() {
        val request = ImageRequestFactory.build(ImageGenerationInput(
            providerType = "aiping",
            endpoint = "https://aiping.example/api/v1/images/generations",
            modelId = "Kling-V2.1",
            prompt = "未来城市",
            ratio = "9:16",
            quality = "标准",
        ))

        assertEquals("1k", request.body.getValue("resolution") as String)
        assertEquals("9:16", request.body.getValue("aspect_ratio") as String)
        assertEquals("Kling-V2.1", request.body.getValue("model") as String)
    }
    @Test
    fun `Aiping 基础地址自动补齐 images generations`() {
        val request = ImageRequestFactory.build(ImageGenerationInput(
            providerType = "aiping",
            endpoint = "https://aiping.example/api/v1",
            modelId = "Qwen-Image",
            prompt = "海边",
            ratio = "1:1",
            quality = "高清",
        ))

        assertEquals("https://aiping.example/api/v1/images/generations", request.url)
    }

}
