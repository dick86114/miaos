package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class MiaosConfigCryptoTest {
    @Test
    fun `能够解密 macOS 生成的配置密文`() {
        val envelope = ConfigEnvelope(
            format = "miaos-config",
            version = 1,
            kdfName = "PBKDF2-HMAC-SHA256",
            iterations = 100000,
            salt = "v5tdv4mVNGUj2kxBxr4XcA",
            cipherName = "AES-256-GCM",
            iv = "hw-c-G_JDv-_UrHR",
            tag = "flT8e3pjt-SGOytSa7uAnQ",
            payload = "lE5DVgBjSv4sHlnhCKge38GiRALIwjs8cljPFuvZ10X8gHP2lExGsZwnP7YkQ2q0PhNLTdpAUeVyQk-8aNCGKtM8FoV7b5hSYVz0ITphkTrDFQ",
        )

        val plaintext = MiaosConfigCrypto.decryptPayload(envelope, "正确密码".toCharArray())
        assertEquals("{\"schemaVersion\":1,\"providers\":[],\"secrets\":{},\"defaults\":{},\"themeMode\":\"system\"}", plaintext)
    }

    @Test
    fun `错误密码返回统一错误`() {
        val envelope = ConfigEnvelope(
            format = "miaos-config",
            version = 1,
            kdfName = "PBKDF2-HMAC-SHA256",
            iterations = 100000,
            salt = "v5tdv4mVNGUj2kxBxr4XcA",
            cipherName = "AES-256-GCM",
            iv = "hw-c-G_JDv-_UrHR",
            tag = "flT8e3pjt-SGOytSa7uAnQ",
            payload = "lE5DVgBjSv4sHlnhCKge38GiRALIwjs8cljPFuvZ10X8gHP2lExGsZwnP7YkQ2q0PhNLTdpAUeVyQk-8aNCGKtM8FoV7b5hSYVz0ITphkTrDFQ",
        )

        val error = assertThrows(IllegalArgumentException::class.java) {
            MiaosConfigCrypto.decryptPayload(envelope, "错误密码".toCharArray())
        }
        assertEquals("配置解密失败", error.message)
    }
}
