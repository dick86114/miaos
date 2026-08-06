package com.miaos.android.ui

import com.miaos.android.data.database.GeneratedImageEntity
import com.miaos.android.data.database.ProjectEntity
import com.miaos.android.data.database.ProjectVersionEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectCardSummaryTest {
    @Test
    fun `项目卡片汇总只统计自身版本和图片并显示当前模型`() {
        val project = ProjectEntity(
            id = "project_1",
            name = "角色设计",
            description = "",
            createdAt = 100L,
            updatedAt = 100L,
            currentVersionId = "version_2",
        )
        val summary = projectCardSummary(
            project = project,
            versions = listOf(
                version("version_1", "project_1", "sdxl"),
                version("version_2", "project_1", "flux-pro"),
                version("other", "project_2", "other-model"),
            ),
            images = listOf(
                image("image_1", "project_1"),
                image("image_2", "project_1"),
                image("other_image", "project_2"),
            ),
        )

        assertEquals(2, summary.versionCount)
        assertEquals(2, summary.imageCount)
        assertEquals("flux-pro", summary.currentModelId)
    }

    private fun version(id: String, projectId: String, modelId: String) = ProjectVersionEntity(
        id = id,
        projectId = projectId,
        name = id,
        prompt = "",
        providerId = "provider",
        providerName = "供应商",
        modelId = modelId,
        createdAt = 100L,
    )

    private fun image(id: String, projectId: String) = GeneratedImageEntity(
        id = id,
        providerId = "provider",
        providerName = "供应商",
        modelId = "model",
        prompt = "提示词",
        ratio = "1:1",
        quality = "高清",
        imagePath = "/tmp/$id.png",
        createdAt = 100L,
        projectId = projectId,
    )
}
