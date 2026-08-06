package com.miaos.android.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ImportedConfigMapperTest {
    @Test
    fun `导入供应商会保留端点和模型分类 JSON`() {
        val config = ImportedConfig(
            providers = listOf(
                ImportedProvider(
                    id = "p_grsai",
                    name = "Grsai",
                    type = "grsai",
                    endpoint = "https://example.test/generate",
                    capabilitiesJson = "[\"image\"]",
                    imageModelsJson = "[{\"id\":\"gpt-image-2\",\"enabled\":true}]",
                    textModelsJson = "[]",
                    videoModelsJson = "[]",
                ),
            ),
            secrets = mapOf("p_grsai" to "secret"),
            defaults = JSONObject("{\"defaultImageModel\":\"gpt-image-2\"}"),
            themeMode = "dark",
        )

        val entity = config.providers.single().toEntity(updatedAt = 100L)
        assertEquals("p_grsai", entity.id)
        assertEquals("https://example.test/generate", entity.endpoint)
        assertEquals("[{\"id\":\"gpt-image-2\",\"enabled\":true}]", entity.imageModelsJson)
        assertEquals(100L, entity.updatedAt)
    }
}
