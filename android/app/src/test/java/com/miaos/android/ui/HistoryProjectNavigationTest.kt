package com.miaos.android.ui

import com.miaos.android.data.database.GeneratedImageEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class HistoryProjectNavigationTest {
    @Test
    fun `项目历史记录可解析为对应项目工作台目标`() {
        assertEquals("project_1", historyProjectNavigationTarget(record(projectId = "project_1")))
    }

    @Test
    fun `快速生图与损坏项目标识不显示项目跳转入口`() {
        assertEquals(null, historyProjectNavigationTarget(record(projectId = null)))
        assertEquals(null, historyProjectNavigationTarget(record(projectId = "   ")))
    }

    private fun record(projectId: String?) = GeneratedImageEntity(
        id = "image_1",
        providerId = "provider_1",
        providerName = "示例供应商",
        modelId = "model_1",
        prompt = "雨夜城市",
        ratio = "1:1",
        quality = "高清",
        imagePath = "/tmp/image.png",
        createdAt = 100L,
        projectId = projectId,
        versionId = if (projectId == null) null else "version_1",
    )
}
