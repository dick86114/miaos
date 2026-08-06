package com.miaos.android.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Android ICU 正则与桌面 JVM 不同，配置导入的模型 JSON 必须可在真机运行时解析。 */
@RunWith(AndroidJUnit4::class)
class ProviderModelOptionInstrumentedTest {
    @Test
    fun android_runtime_can_parse_imported_model_json() {
        val models = parseProviderModelOptions(
            """[{"id":"image-1","name":"图像一","enabled":true},{"id":"image-2","enabled":false}]""",
        )

        assertEquals(2, models.size)
        assertEquals("图像一", models.first().name)
        assertTrue(models.first().enabled)
        assertFalse(models.last().enabled)
    }
}
