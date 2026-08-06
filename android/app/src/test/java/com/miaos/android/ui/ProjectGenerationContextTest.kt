package com.miaos.android.ui

import com.miaos.android.data.database.ProjectVersionEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectGenerationContextTest {
    @Test
    fun `项目生图上下文沿用当前版本的提示词供应商和模型`() {
        val context = projectGenerationContext(
            ProjectVersionEntity(
                id = "version_1",
                projectId = "project_1",
                name = "雨夜海报",
                prompt = "雨夜城市街道，霓虹灯倒影",
                providerId = "provider_grsai",
                providerName = "Grsai",
                modelId = "flux-pro",
                createdAt = 100L,
            ),
        )

        assertEquals("雨夜城市街道，霓虹灯倒影", context.prompt)
        assertEquals("provider_grsai", context.providerId)
        assertEquals("flux-pro", context.modelId)
    }
}

class ProjectGenerationContextRestoreTest {
    @Test
    fun `恢复中的项目草稿不会再次被版本上下文覆盖`() {
        assertEquals(true, shouldApplyProjectGenerationContext(isProjectVersionLoaded = true, hasAppliedContext = false))
        assertEquals(false, shouldApplyProjectGenerationContext(isProjectVersionLoaded = true, hasAppliedContext = true))
        assertEquals(false, shouldApplyProjectGenerationContext(isProjectVersionLoaded = false, hasAppliedContext = false))
    }
}
