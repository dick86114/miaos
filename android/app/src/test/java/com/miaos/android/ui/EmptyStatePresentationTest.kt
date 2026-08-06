package com.miaos.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class EmptyStatePresentationTest {
    @Test
    fun `首次项目空态提供 macOS 一致的新建入口`() {
        val presentation = projectEmptyStatePresentation(hasAnyProjects = false)

        assertEquals("▧", presentation.symbol)
        assertEquals("还没有项目", presentation.title)
        assertEquals("新建项目", presentation.actionLabel)
    }

    @Test
    fun `项目搜索空态不诱导重复新建项目`() {
        val presentation = projectEmptyStatePresentation(hasAnyProjects = true)

        assertEquals("没有匹配的项目", presentation.title)
        assertNull(presentation.actionLabel)
    }

    @Test
    fun `首次历史空态说明本地保存边界`() {
        val presentation = historyEmptyStatePresentation(hasAnyRecords = false)

        assertEquals("◷", presentation.symbol)
        assertEquals("还没有生成记录", presentation.title)
        assertEquals("成功生图后会自动保存在这里，仅保存在本机。", presentation.description)
    }
}
