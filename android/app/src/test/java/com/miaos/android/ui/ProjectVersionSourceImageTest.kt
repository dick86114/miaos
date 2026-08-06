package com.miaos.android.ui

import com.miaos.android.data.database.GeneratedImageEntity
import com.miaos.android.data.database.ProjectVersionEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectVersionSourceImageTest {
    @Test
    fun `派生版本再次生成时会恢复持久化父图路径`() {
        val sourcePath = projectVersionSourceImagePath(
            version = version(parentImageId = "source_image"),
            images = listOf(image(id = "source_image", imagePath = "/data/user/0/com.miaos.android/files/source.png")),
        )

        assertEquals("/data/user/0/com.miaos.android/files/source.png", sourcePath)
    }

    @Test
    fun `主线版本与已移除父图的分支不会伪造参考图`() {
        assertEquals(null, projectVersionSourceImagePath(version(parentImageId = null), emptyList()))
        assertEquals(null, projectVersionSourceImagePath(version(parentImageId = "missing"), emptyList()))
    }

    private fun version(parentImageId: String?) = ProjectVersionEntity(
        id = "branch_v1_1",
        projectId = "project_1",
        parentVersionId = "root_v1",
        parentImageId = parentImageId,
        name = "派生分支",
        prompt = "调整角色表情",
        providerId = "provider_1",
        providerName = "示例供应商",
        modelId = "model_1",
        createdAt = 100L,
    )

    private fun image(id: String, imagePath: String) = GeneratedImageEntity(
        id = id,
        providerId = "provider_1",
        providerName = "示例供应商",
        modelId = "model_1",
        prompt = "原始角色",
        ratio = "1:1",
        quality = "高清",
        imagePath = imagePath,
        createdAt = 100L,
        projectId = "project_1",
        versionId = "root_v1",
    )
}
