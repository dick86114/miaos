package com.miaos.android.ui

import com.miaos.android.data.database.ProjectEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class ProjectFilterTest {
    @Test
    fun `项目搜索会同时匹配名称与描述`() {
        val projects = listOf(
            project("p1", "角色设计", "科幻角色系列"),
            project("p2", "海报", "雨夜城市"),
        )

        assertEquals(listOf("p1"), filterProjects(projects, "角色").map { it.id })
        assertEquals(listOf("p2"), filterProjects(projects, "雨夜").map { it.id })
        assertEquals(2, filterProjects(projects, "").size)
    }

    private fun project(id: String, name: String, description: String) = ProjectEntity(
        id = id,
        name = name,
        description = description,
        createdAt = 100L,
        updatedAt = 100L,
        currentVersionId = "v1",
    )
}
