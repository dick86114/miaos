package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PairingUrlTest {
    @Test
    fun `只接受 macOS 局域网二维码配对地址`() {
        val parsed = PairingUrl.parse("http://192.168.1.9:43210/miaos/pair?token=abc_DEF-123")

        assertEquals("192.168.1.9", parsed.host)
        assertEquals(43210, parsed.port)
        assertEquals("abc_DEF-123", parsed.token)
        assertEquals("5CD61B", parsed.confirmationCode)
    }

    @Test
    fun `扫码后先生成可核对的确认状态再允许进入密码导入`() {
        val pending = preparePairingConfirmation("http://192.168.1.9:43210/miaos/pair?token=abc_DEF-123")

        assertEquals("http://192.168.1.9:43210/miaos/pair?token=abc_DEF-123", pending.url)
        assertEquals("5CD61B", pending.confirmationCode)
    }

    @Test
    fun `拒绝公网地址和非配对路径`() {
        assertThrows(IllegalArgumentException::class.java) {
            PairingUrl.parse("https://example.com/miaos/pair?token=abc")
        }
        assertThrows(IllegalArgumentException::class.java) {
            PairingUrl.parse("http://8.8.8.8:43210/miaos/pair?token=abc")
        }
        assertThrows(IllegalArgumentException::class.java) {
            PairingUrl.parse("http://192.168.1.9:43210/other?token=abc")
        }
    }
}
