package com.miaos.android.data

import com.miaos.android.data.database.ProjectVersionEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectVersionTreeTest {
    @Test
    fun `版本树为主线与派生分支生成稳定编号`() {
        val rows = projectVersionTree(listOf(
            version("root_a", null, 100L),
            version("branch_a", "root_a", 200L),
            version("nested", "branch_a", 300L),
            version("root_b", null, 400L),
        ))

        assertEquals(listOf("v1", "v1.1", "v1.1.1", "v2"), rows.map { it.label })
        assertEquals(listOf(0, 1, 2, 0), rows.map { it.depth })
    }

    private fun version(id: String, parentVersionId: String?, createdAt: Long) = ProjectVersionEntity(
        id = id,
        projectId = "proj_1",
        parentVersionId = parentVersionId,
        name = id,
        prompt = "",
        providerId = "",
        providerName = "",
        modelId = "",
        createdAt = createdAt,
    )
}
