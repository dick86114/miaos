package com.miaos.android.ui

import com.miaos.android.data.database.GeneratedImageEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class HistoryFilterTest {
    @Test
    fun `历史筛选支持来源和提示词关键词组合`() {
        val records = listOf(
            image("quick_1", "雨夜城市", projectId = null),
            image("project_1", "雨夜港口", projectId = "proj_1"),
            image("project_2", "晴天草地", projectId = "proj_2"),
        )

        assertEquals(listOf("quick_1"), filterHistoryRecords(records, "雨夜", HistorySourceFilter.QUICK).map { it.id })
        assertEquals(listOf("project_1"), filterHistoryRecords(records, "雨夜", HistorySourceFilter.PROJECT).map { it.id })
        assertEquals(3, filterHistoryRecords(records, "", HistorySourceFilter.ALL).size)
    }

    private fun image(id: String, prompt: String, projectId: String?) = GeneratedImageEntity(
        id = id,
        providerId = "p_1",
        providerName = "测试供应商",
        modelId = "model_1",
        prompt = prompt,
        ratio = "1:1",
        quality = "高清",
        imagePath = "/tmp/$id.png",
        createdAt = 100L,
        projectId = projectId,
    )
}
