package com.miaos.android

import com.miaos.android.ui.GeneratePrefill
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppNavigationStateTest {
    @Test
    fun `旋转恢复时保留当前工作区项目生图目标和再次生成预填`() {
        val original = AppNavigationState(
            selectedTab = 0,
            openedProjectId = "project_1",
            projectGenerationTarget = ProjectGenerationTarget(
                projectId = "project_1",
                versionId = "version_3",
                sourceImagePath = "/data/user/0/com.miaos.android/files/reference.png",
            ),
            quickGenerationPrefill = GeneratePrefill(
                prompt = "雨夜中的霓虹城市",
                providerId = "provider_1",
                modelId = "model_1",
                ratio = "16:9",
                quality = "高清",
            ),
        )

        val restored = restoreAppNavigationState(original.toSaveableValue())

        assertEquals(original, restored)
    }

    @Test
    fun `没有项目或再次生成上下文的历史页也能在旋转后恢复`() {
        val original = AppNavigationState(selectedTab = 2)

        val restored = restoreAppNavigationState(original.toSaveableValue())

        assertEquals(2, restored.selectedTab)
        assertNull(restored.openedProjectId)
        assertNull(restored.projectGenerationTarget)
        assertNull(restored.quickGenerationPrefill)
    }

    @Test
    fun `损坏恢复数据会安全回到默认导航状态`() {
        val restored = restoreAppNavigationState("not-a-valid-state")

        assertEquals(0, restored.selectedTab)
        assertNull(restored.openedProjectId)
        assertNull(restored.projectGenerationTarget)
        assertNull(restored.quickGenerationPrefill)
    }
}

class HistoryProjectNavigationStateTest {
    @Test
    fun `历史项目跳转会打开项目工作台并清理其他生成上下文`() {
        val result = openHistoryProjectNavigation(
            current = AppNavigationState(
                selectedTab = 2,
                projectGenerationTarget = ProjectGenerationTarget("old_project", "version_1", "/tmp/source.png"),
                quickGenerationPrefill = GeneratePrefill("提示词", "provider", "model", "1:1", "高清"),
            ),
            projectId = "project_1",
        )

        assertEquals(1, result.selectedTab)
        assertEquals("project_1", result.openedProjectId)
        assertNull(result.projectGenerationTarget)
        assertNull(result.quickGenerationPrefill)
    }
}
