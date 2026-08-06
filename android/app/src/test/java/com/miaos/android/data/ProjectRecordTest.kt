package com.miaos.android.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProjectRecordTest {
    @Test
    fun `新项目会建立一个无父级的根版本`() {
        val project = ProjectRecord.create(
            id = "proj_1",
            name = "角色设计",
            description = "用于测试版本演进",
            prompt = "科幻角色",
            createdAt = 100L,
        )

        assertEquals("proj_1", project.project.id)
        assertEquals("角色设计", project.project.name)
        assertEquals("proj_1", project.rootVersion.projectId)
        assertNull(project.rootVersion.parentVersionId)
        assertEquals("科幻角色", project.rootVersion.prompt)
    }

    @Test
    fun `派生分支会关联父版本与父图片`() {
        val record = ProjectVersionRecord.createBranch(
            projectId = "proj_1",
            parentVersionId = "ver_root",
            parentImageId = "img_parent",
            prompt = "在原图基础上加雨夜",
            createdAt = 300L,
        )
        assertEquals("ver_root", record.version.parentVersionId)
        assertEquals("img_parent", record.version.parentImageId)
        assertEquals("在原图基础上加雨夜", record.version.name)
    }

    @Test
    fun `新主线不会关联父版本并根据提示词命名`() {
        val record = ProjectVersionRecord.createRoot("proj_1", "", "新提示词", 200L)
        assertNull(record.version.parentVersionId)
        assertEquals("新提示词", record.version.name)
        assertEquals(200L, record.version.createdAt)
    }
}
