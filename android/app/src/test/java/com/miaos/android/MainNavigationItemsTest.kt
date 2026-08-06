package com.miaos.android

import org.junit.Assert.assertEquals
import org.junit.Test

class MainNavigationItemsTest {
    @Test
    fun `底部导航单独提供供应商入口`() {
        val items = miaosNavigationItems()
        assertEquals(5, items.size)
        assertEquals(listOf("auto_awesome", "folder", "image", "dns", "settings"), items.map { it.icon })
        assertEquals("供应商", items[3].label)
        assertEquals("设置", items[4].label)
    }
}
