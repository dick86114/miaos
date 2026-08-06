package com.miaos.android.data

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.miaos.android.data.database.MiaosDatabase
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** 真实 Android Runtime 验证：导入配置后密钥进入 Keystore，不进入 Room 或明文偏好存储。 */
@RunWith(AndroidJUnit4::class)
class MiaosConfigRepositoryInstrumentedTest {
    @Test
    fun imported_secret_is_readable_from_keystore_but_not_plaintext_storage() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val database = MiaosDatabase.create(context)
        val secretStore = MiaosSecretStore(context)
        val repository = MiaosConfigRepository(database, secretStore)
        val raw = instrumentation.context.assets.open("macos-export-v1.miaos")
            .bufferedReader().use { it.readText() }
        val imported = MiaosConfigImporter.parse(raw, "跨端导出密码".toCharArray())

        repository.importConfig(imported)

        val provider = database.providerDao().observeAll().first().single { it.id == "p_fixture" }
        assertEquals("https://example.com/v1", provider.endpoint)
        assertEquals("fixture-api-key-not-real", secretStore.get("p_fixture"))

        val secretPreferences = context.getSharedPreferences("miaos-secrets", Context.MODE_PRIVATE)
        assertTrue(secretPreferences.all.isNotEmpty())
        assertFalse(secretPreferences.all.values.any { it.toString().contains("fixture-api-key-not-real") })
        assertFalse(provider.imageModelsJson.contains("fixture-api-key-not-real"))
        assertFalse(provider.textModelsJson.contains("fixture-api-key-not-real"))

        repository.deleteProvider("p_fixture")
        secretStore.remove("p_fixture")
    }
}
