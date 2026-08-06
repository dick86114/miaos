package com.miaos.android.ui

import com.miaos.android.data.database.GeneratedImageEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class HistoryProjectFilterTest {
    @Test
    fun `项目来源可继续筛选到一个具体项目`() {
        val records = listOf(
            record(id = "quick", projectId = null),
            record(id = "project_a_1", projectId = "project_a"),
            record(id = "project_a_2", projectId = "project_a"),
            record(id = "project_b", projectId = "project_b"),
        )

        assertEquals(
            listOf("project_a_1", "project_a_2"),
            filterHistoryRecords(
                records = records,
                query = "",
                sourceFilter = HistorySourceFilter.PROJECT,
                projectFilterId = "project_a",
            ).map { it.id },
        )
    }

    @Test
    fun `项目筛选不会误伤快速或全部来源视图`() {
        val records = listOf(
            record(id = "quick", projectId = null),
            record(id = "project_a", projectId = "project_a"),
            record(id = "project_b", projectId = "project_b"),
        )

        assertEquals(
            listOf("quick"),
            filterHistoryRecords(records, "", HistorySourceFilter.QUICK, projectFilterId = "project_a").map { it.id },
        )
        assertEquals(
            listOf("quick", "project_a", "project_b"),
            filterHistoryRecords(records, "", HistorySourceFilter.ALL, projectFilterId = "project_a").map { it.id },
        )
    }

    @Test
    fun `已删除项目的保存筛选状态会安全回退到全部项目`() {
        assertEquals("project_a", restoreHistoryProjectFilter("project_a", setOf("project_a", "project_b")))
        assertEquals(null, restoreHistoryProjectFilter("deleted_project", setOf("project_a", "project_b")))
        assertEquals(null, restoreHistoryProjectFilter("   ", setOf("project_a")))
    }

    private fun record(id: String, projectId: String?) = GeneratedImageEntity(
        id = id,
        providerId = "provider_1",
        providerName = "示例供应商",
        modelId = "model_1",
        prompt = "提示词",
        ratio = "1:1",
        quality = "高清",
        imagePath = "/tmp/$id.png",
        createdAt = 100L,
        projectId = projectId,
        versionId = if (projectId == null) null else "version_1",
    )
}
