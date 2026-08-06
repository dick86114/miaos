package com.miaos.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class HistoryPaginationTest {
    @Test
    fun `历史记录每页默认展示 24 条并保留稳定顺序`() {
        val page = paginateHistoryItems((1..50).toList(), requestedPage = 2)

        assertEquals(50, page.totalCount)
        assertEquals(3, page.totalPages)
        assertEquals(2, page.page)
        assertEquals((25..48).toList(), page.items)
    }

    @Test
    fun `超出范围的历史页码会收敛到最后有效页`() {
        val page = paginateHistoryItems((1..50).toList(), requestedPage = 99)

        assertEquals(3, page.page)
        assertEquals(listOf(49, 50), page.items)
    }

    @Test
    fun `空结果保持可预测的一页空列表`() {
        val page = paginateHistoryItems(emptyList<String>(), requestedPage = 4)

        assertEquals(0, page.totalCount)
        assertEquals(1, page.totalPages)
        assertEquals(1, page.page)
        assertEquals(emptyList<String>(), page.items)
    }
}
