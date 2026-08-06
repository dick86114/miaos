package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ProjectDetailsUpdateTest {
    @Test
    fun `项目设置保存前会去除名称和描述两侧空白`() {
        val details = projectDetailsUpdate("  雨夜海报  ", "  霓虹城市系列  ")

        assertEquals("雨夜海报", details.name)
        assertEquals("霓虹城市系列", details.description)
    }

    @Test
    fun `项目设置不允许空名称`() {
        assertThrows(IllegalArgumentException::class.java) {
            projectDetailsUpdate("   ", "允许为空的描述")
        }
    }
}
