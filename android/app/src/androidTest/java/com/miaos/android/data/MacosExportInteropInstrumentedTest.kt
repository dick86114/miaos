package com.miaos.android.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** 真 Android Runtime 验证：macOS 实际导出的加密文件可经 JSONObject 解析后完整导入。 */
@RunWith(AndroidJUnit4::class)
class MacosExportInteropInstrumentedTest {
    @Test
    fun android_can_import_macos_export_fixture() {
        val context = InstrumentationRegistry.getInstrumentation().context
        val raw = context.assets.open("macos-export-v1.miaos").bufferedReader().use { it.readText() }
        val imported = MiaosConfigImporter.parse(raw, "跨端导出密码".toCharArray())

        assertEquals("dark", imported.themeMode)
        assertEquals("fixture-api-key-not-real", imported.secrets["p_fixture"])
        assertEquals("p_fixture", imported.defaults.optString("defaultImageProvider"))
        assertEquals("fixture-image", imported.defaults.optString("defaultImageModel"))
        val provider = imported.providers.single()
        assertEquals("https://example.com/v1", provider.endpoint)
        assertTrue(provider.imageModelsJson.contains("fixture-image"))
        assertTrue(provider.textModelsJson.contains("fixture-text"))
    }
}
