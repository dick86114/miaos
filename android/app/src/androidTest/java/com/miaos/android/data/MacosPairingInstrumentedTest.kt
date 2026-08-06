package com.miaos.android.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/** 通过 Android 模拟器的 10.0.2.2 回环地址验证真实 macOS 一次性配对 HTTP 服务。 */
@RunWith(AndroidJUnit4::class)
class MacosPairingInstrumentedTest {
    @Test
    fun android_can_download_one_time_macos_pairing_envelope() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val pairingUrl = InstrumentationRegistry.getArguments().getString("pairingUrl")
        assumeTrue("未提供配对服务地址，跳过网络配对测试", !pairingUrl.isNullOrBlank())

        val expected = instrumentation.context.assets.open("macos-export-v1.miaos")
            .bufferedReader().use { it.readText() }
        val downloaded = kotlinx.coroutines.runBlocking {
            MiaosConfigPairingClient().download(requireNotNull(pairingUrl))
        }

        assertEquals(expected, downloaded)
    }
}
