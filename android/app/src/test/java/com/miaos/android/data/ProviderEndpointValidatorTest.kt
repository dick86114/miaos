package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ProviderEndpointValidatorTest {
    @Test
    fun `供应商端点校验保留 HTTPS 地址`() {
        assertEquals("https://api.example.com/v1", validateProviderEndpoint("  https://api.example.com/v1  "))
    }

    @Test
    fun `供应商端点拒绝 URL 用户信息且不返回其中的密钥`() {
        val error = assertThrows(IllegalArgumentException::class.java) {
            validateProviderEndpoint("https://review-secret@example.com/v1")
        }
        assertEquals("供应商 API 地址不能包含用户信息", error.message)
    }

    @Test
    fun `导入密钥只保留已有供应商对应的条目`() {
        assertEquals(
            mapOf("p_known" to "secret"),
            knownProviderSecrets(
                providerIds = listOf("p_known"),
                secrets = mapOf("p_known" to "secret", "p_orphan" to "ignored", "p_empty" to ""),
            ),
        )
    }
}
