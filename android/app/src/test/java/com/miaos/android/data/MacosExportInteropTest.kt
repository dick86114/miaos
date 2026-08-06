package com.miaos.android.data

import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM 层验证 macOS 默认 600000 次 PBKDF2 导出的 AES-GCM 密文可被 Android 加密实现解开。 */
class MacosExportInteropTest {
    @Test
    fun `Android 加密层能解开 macOS 默认参数导出的 v1 配置`() {
        val raw = requireNotNull(javaClass.classLoader?.getResource("macos-export-v1.miaos"))
            .readText()
        val plaintext = MiaosConfigCrypto.decryptPayload(fixtureEnvelope(raw), "跨端导出密码".toCharArray())

        assertTrue(plaintext.contains("fixture-api-key-not-real"))
        assertTrue(plaintext.contains("fixture-image"))
        assertTrue(plaintext.contains("fixture-text"))
        assertTrue(plaintext.contains("\"themeMode\":\"dark\""))
    }
}

private fun fixtureEnvelope(raw: String): ConfigEnvelope = ConfigEnvelope(
    format = raw.fixtureString("format"),
    version = raw.fixtureInt("version"),
    kdfName = raw.fixtureObjectString("kdf", "name"),
    iterations = raw.fixtureObjectInt("kdf", "iterations"),
    salt = raw.fixtureObjectString("kdf", "salt"),
    cipherName = raw.fixtureObjectString("cipher", "name"),
    iv = raw.fixtureObjectString("cipher", "iv"),
    tag = raw.fixtureObjectString("cipher", "tag"),
    payload = raw.fixtureString("payload"),
)

private fun String.fixtureObject(name: String): String = Regex("\\\"${Regex.escape(name)}\\\"\\s*:\\s*\\{([^{}]*)}")
    .find(this)?.groupValues?.get(1) ?: error("缺少对象 $name")

private fun String.fixtureString(name: String): String = Regex("\\\"${Regex.escape(name)}\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"")
    .find(this)?.groupValues?.get(1) ?: error("缺少字符串 $name")

private fun String.fixtureInt(name: String): Int = Regex("\\\"${Regex.escape(name)}\\\"\\s*:\\s*(\\d+)")
    .find(this)?.groupValues?.get(1)?.toInt() ?: error("缺少整数 $name")

private fun String.fixtureObjectString(objectName: String, field: String): String = fixtureObject(objectName).fixtureString(field)
private fun String.fixtureObjectInt(objectName: String, field: String): Int = fixtureObject(objectName).fixtureInt(field)
