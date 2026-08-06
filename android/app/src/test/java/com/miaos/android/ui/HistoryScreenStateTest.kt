package com.miaos.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class HistoryScreenStateTest {
    @Test
    fun `恢复历史筛选状态时保留合法值并拒绝未知枚举`() {
        assertEquals(HistorySourceFilter.PROJECT, restoreHistorySourceFilter("PROJECT"))
        assertEquals(HistorySourceFilter.ALL, restoreHistorySourceFilter("UNKNOWN"))
        assertEquals(HistoryContentTab.STATS, restoreHistoryContentTab("STATS"))
        assertEquals(HistoryContentTab.RECORDS, restoreHistoryContentTab("UNKNOWN"))
    }
}
