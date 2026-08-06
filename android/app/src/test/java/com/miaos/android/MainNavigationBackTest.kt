package com.miaos.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MainNavigationBackTest {
    @Test
    fun `项目模式返回会回到当前项目`() {
        val result = resolveBackNavigation(0, null, "project_1")
        assertEquals(1, result?.selectedTab)
        assertEquals("project_1", result?.projectIdToOpen)
        assertTrue(result?.clearProjectMode == true)
    }

    @Test
    fun `项目详情返回会关闭详情但保留项目工作区`() {
        val result = resolveBackNavigation(1, "project_1", null)
        assertEquals(1, result?.selectedTab)
        assertNull(result?.projectIdToOpen)
        assertFalse(result?.clearProjectMode == true)
    }

    @Test
    fun `普通工作区返回交给系统退出行为`() {
        assertNull(resolveBackNavigation(2, null, null))
    }
}
