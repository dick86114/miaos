package com.miaos.android.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ConfigImportPreviewTest {
    @Test
    fun `导入预览只汇总供应商和密钥数量不包含密钥内容`() {
        val config = ImportedConfig(
            providers = listOf(
                ImportedProvider(
                    id = "p_image",
                    name = "图像供应商",
                    type = "openai",
                    endpoint = "https://image.example/v1",
                    capabilitiesJson = "[\"image\"]",
                    imageModelsJson = """[{"id":"image-1","enabled":true},{"id":"image-2","enabled":false}]""",
                    textModelsJson = "[]",
                    videoModelsJson = "[]",
                ),
                ImportedProvider(
                    id = "p_text",
                    name = "文本供应商",
                    type = "openai",
                    endpoint = "https://text.example/v1",
                    capabilitiesJson = "[\"text\"]",
                    imageModelsJson = "[]",
                    textModelsJson = """[{"id":"text-1","enabled":true}]""",
                    videoModelsJson = "[]",
                ),
            ),
            secrets = mapOf("p_image" to "fixture-secret", "p_unknown" to "ignored"),
            defaults = JSONObject("{}"),
            themeMode = "dark",
        )

        val preview = configImportPreview(config)

        assertEquals(2, preview.providerCount)
        assertEquals(1, preview.secretCount)
        assertEquals("深色", preview.themeLabel)
        assertEquals(1, preview.providers[0].enabledImageModelCount)
        assertEquals(1, preview.providers[1].enabledTextModelCount)
        assertEquals(false, preview.toString().contains("fixture-secret"))
    }
}
