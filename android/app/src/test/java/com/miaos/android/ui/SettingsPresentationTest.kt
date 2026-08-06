package com.miaos.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class SettingsPresentationTest {
    @Test
    fun `主题分段控件按 macOS 顺序显示且仅当前项选中`() {
        val items = themeModeSegmentItems("dark")

        assertEquals(listOf("light", "dark", "system"), items.map { it.value })
        assertEquals(listOf("浅色", "深色", "跟随系统"), items.map { it.label })
        assertEquals(listOf(false, true, false), items.map { it.isSelected })
    }

    @Test
    fun `未知主题值安全回退到跟随系统`() {
        assertEquals(listOf(false, false, true), themeModeSegmentItems("legacy").map { it.isSelected })
    }

    @Test
    fun `配对短码展示模型保留 macOS 核对文案且拒绝非法短码`() {
        val presentation = pairingConfirmationPresentation("5CD61B")

        assertEquals("配对确认短码", presentation.title)
        assertEquals("5CD61B", presentation.code)
        assertTrue(presentation.hint.contains("macOS"))
        assertEquals("------", pairingConfirmationPresentation("------").code)
        assertThrows(IllegalArgumentException::class.java) {
            pairingConfirmationPresentation("not-a-code")
        }
    }

    @Test
    fun `应用信息只展示本地真实版本和数据边界`() {
        val summary = appInfoSummary("0.1.0")

        assertEquals("妙生 Android · 0.1.0", summary.title)
        assertEquals("Android Keystore", summary.keyStorage)
        assertEquals("设备直连供应商，不经过妙生服务端", summary.networkBoundary)
    }
}
