package com.miaos.android.ui

import com.miaos.android.data.database.ProjectVersionEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectCurrentVersionPresentationTest {
    @Test
    fun `主线版本展示持续生成工作台文案`() {
        val presentation = currentVersionWorkspacePresentation(
            version = version(parentImageId = null),
            sourceImagePath = null,
        )

        assertEquals("版本主线", presentation.title)
        assertEquals("当前版本会作为项目内生成和后续分支派生的默认目标。", presentation.description)
        assertEquals("在当前版本生成", presentation.generateLabel)
    }

    @Test
    fun `关联父图的分支展示继续图生图工作台文案`() {
        val presentation = currentVersionWorkspacePresentation(
            version = version(parentImageId = "source_image"),
            sourceImagePath = "/data/user/0/com.miaos.android/files/source.png",
        )

        assertEquals("派生分支", presentation.title)
        assertEquals("当前分支已关联父图，后续生成会继续以此图作为参考。", presentation.description)
        assertEquals("继续图生图", presentation.generateLabel)
    }

    @Test
    fun `父图已移除时分支明确提示会降级为文生图`() {
        val presentation = currentVersionWorkspacePresentation(
            version = version(parentImageId = "missing_image"),
            sourceImagePath = null,
        )

        assertEquals("派生分支", presentation.title)
        assertEquals("父图记录已移除，后续生成将按文生图处理。", presentation.description)
        assertEquals("在当前分支生成", presentation.generateLabel)
    }

    private fun version(parentImageId: String?) = ProjectVersionEntity(
        id = "version_1",
        projectId = "project_1",
        parentVersionId = "root_1",
        parentImageId = parentImageId,
        name = "版本",
        prompt = "提示词",
        providerId = "provider_1",
        providerName = "示例供应商",
        modelId = "model_1",
        createdAt = 100L,
    )
}
