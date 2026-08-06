package com.miaos.android.generation

import org.junit.Assert.assertEquals
import org.junit.Test

class ProviderConnectionUrlTest {
    @Test
    fun `模型列表地址会从具体生图端点回退到同版本 models 端点`() {
        assertEquals(
            "https://api.example.com/v1/models",
            providerModelsUrl("https://api.example.com/v1/images/generations"),
        )
        assertEquals(
            "https://grsaiapi.com/v1/api/models",
            providerModelsUrl("https://grsaiapi.com/v1/api/generate"),
        )
    }
}
