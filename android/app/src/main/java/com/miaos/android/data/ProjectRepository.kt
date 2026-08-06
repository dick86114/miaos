package com.miaos.android.data

import androidx.room.withTransaction
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.data.database.ProjectEntity
import com.miaos.android.data.database.ProjectVersionEntity
import java.util.UUID

data class ProjectRecord(
    val project: ProjectEntity,
    val rootVersion: ProjectVersionEntity,
) {
    companion object {
        fun create(
            id: String = "proj_${UUID.randomUUID()}",
            name: String,
            description: String,
            prompt: String,
            createdAt: Long = System.currentTimeMillis(),
        ): ProjectRecord {
            val rootVersionId = "ver_${UUID.randomUUID()}"
            val projectName = name.trim().ifBlank { "未命名项目" }
            val rootName = prompt.trim().take(10).ifBlank { "主线1" }
            return ProjectRecord(
                project = ProjectEntity(
                    id = id,
                    name = projectName,
                    description = description.trim(),
                    createdAt = createdAt,
                    updatedAt = createdAt,
                    currentVersionId = rootVersionId,
                ),
                rootVersion = ProjectVersionEntity(
                    id = rootVersionId,
                    projectId = id,
                    name = rootName,
                    prompt = prompt.trim(),
                    providerId = "",
                    providerName = "",
                    modelId = "",
                    createdAt = createdAt,
                ),
            )
        }
    }
}

data class ProjectDetailsUpdate(
    val name: String,
    val description: String,
)

/** 项目名称是项目列表与版本工作台的主标识，保存前统一完成输入规范化。 */
fun projectDetailsUpdate(name: String, description: String): ProjectDetailsUpdate {
    val normalizedName = name.trim()
    require(normalizedName.isNotBlank()) { "请填写项目名称" }
    return ProjectDetailsUpdate(
        name = normalizedName,
        description = description.trim(),
    )
}

data class ProjectVersionRecord(
    val version: ProjectVersionEntity,
) {
    companion object {
        fun createRoot(projectId: String, name: String, prompt: String, createdAt: Long = System.currentTimeMillis()): ProjectVersionRecord {
            val normalizedPrompt = prompt.trim()
            return ProjectVersionRecord(ProjectVersionEntity(
                id = "ver_${UUID.randomUUID()}",
                projectId = projectId,
                name = name.trim().ifBlank { normalizedPrompt.take(10).ifBlank { "新主线" } },
                prompt = normalizedPrompt,
                providerId = "",
                providerName = "",
                modelId = "",
                createdAt = createdAt,
            ))
        }

        fun createBranch(
            projectId: String,
            parentVersionId: String,
            parentImageId: String,
            prompt: String,
            createdAt: Long = System.currentTimeMillis(),
        ): ProjectVersionRecord {
            val normalizedPrompt = prompt.trim()
            return ProjectVersionRecord(ProjectVersionEntity(
                id = "ver_${UUID.randomUUID()}",
                projectId = projectId,
                parentVersionId = parentVersionId,
                parentImageId = parentImageId,
                name = normalizedPrompt.take(10).ifBlank { "派生分支" },
                prompt = normalizedPrompt,
                providerId = "",
                providerName = "",
                modelId = "",
                createdAt = createdAt,
            ))
        }
    }
}

class ProjectRepository(private val database: MiaosDatabase) {
    suspend fun create(name: String, description: String, prompt: String): ProjectRecord {
        val record = ProjectRecord.create(name = name, description = description, prompt = prompt)
        database.withTransaction {
            database.projectDao().insert(record.project)
            database.projectVersionDao().insert(record.rootVersion)
        }
        return record
    }

    suspend fun createRootVersion(projectId: String, name: String, prompt: String): ProjectVersionRecord {
        val record = ProjectVersionRecord.createRoot(projectId, name, prompt)
        database.withTransaction {
            database.projectVersionDao().insert(record.version)
            database.projectDao().setCurrentVersion(projectId, record.version.id, record.version.createdAt)
        }
        return record
    }

    suspend fun createBranchVersion(projectId: String, parentVersionId: String, parentImageId: String, prompt: String): ProjectVersionRecord {
        val record = ProjectVersionRecord.createBranch(projectId, parentVersionId, parentImageId, prompt)
        database.withTransaction {
            database.projectVersionDao().insert(record.version)
            database.projectDao().setCurrentVersion(projectId, record.version.id, record.version.createdAt)
        }
        return record
    }

    suspend fun selectVersion(projectId: String, versionId: String) {
        database.projectDao().setCurrentVersion(projectId, versionId, System.currentTimeMillis())
    }

    suspend fun updateDetails(projectId: String, name: String, description: String): ProjectDetailsUpdate {
        val details = projectDetailsUpdate(name, description)
        database.projectDao().updateDetails(
            id = projectId,
            name = details.name,
            description = details.description,
            updatedAt = System.currentTimeMillis(),
        )
        return details
    }

    suspend fun updateVersionGenerationSettings(versionId: String, prompt: String, providerId: String, providerName: String, modelId: String) {
        database.projectVersionDao().updateGenerationSettings(versionId, prompt, providerId, providerName, modelId)
    }

    suspend fun setCover(projectId: String, imageId: String?) {
        database.projectDao().setCover(projectId, imageId, System.currentTimeMillis())
    }

    suspend fun deleteImage(projectId: String, imageId: String) {
        database.withTransaction {
            val project = database.projectDao().getById(projectId) ?: throw IllegalArgumentException("项目不存在")
            database.generatedImageDao().deleteById(imageId)
            if (project.coverImageId == imageId) {
                database.projectDao().setCover(projectId, null, System.currentTimeMillis())
            }
        }
    }

    /** 删除一个版本及其全部派生分支，同时撤销仍在等待或运行的关联生成任务。 */
    suspend fun deleteVersionTree(projectId: String, versionId: String) {
        val project = database.projectDao().getById(projectId) ?: throw IllegalArgumentException("项目不存在")
        val versions = database.projectVersionDao().getForProject(projectId)
        require(versions.any { it.id == versionId }) { "版本不存在" }
        val removedIds = projectVersionSubtreeIds(versions, versionId).toList()
        val remaining = versions.filterNot { it.id in removedIds }
        require(remaining.isNotEmpty()) { "项目至少需要保留一个版本；如需全部删除，请删除项目" }
        val nextCurrentVersionId = if (project.currentVersionId in removedIds) {
            versions.firstOrNull { it.id == versions.first { version -> version.id == versionId }.parentVersionId && it.id !in removedIds }?.id
                ?: remaining.first().id
        } else {
            project.currentVersionId
        }
        database.withTransaction {
            val removedImageIds = database.generatedImageDao().idsForVersions(removedIds)
            database.generationTaskDao().cancelForVersions(removedIds, System.currentTimeMillis())
            database.generatedImageDao().deleteForVersions(removedIds)
            database.projectVersionDao().deleteByIds(removedIds)
            database.projectDao().updateAfterVersionDeletion(
                id = projectId,
                versionId = nextCurrentVersionId,
                coverImageId = project.coverImageId?.takeUnless { it in removedImageIds },
                updatedAt = System.currentTimeMillis(),
            )
        }
    }

    suspend fun delete(projectId: String) {
        database.withTransaction {
            val versionIds = database.projectVersionDao().getForProject(projectId).map { it.id }
            if (versionIds.isNotEmpty()) {
                database.generationTaskDao().cancelForVersions(versionIds, System.currentTimeMillis())
                database.generatedImageDao().deleteForVersions(versionIds)
            }
            database.projectVersionDao().deleteForProject(projectId)
            database.projectDao().deleteById(projectId)
        }
    }
}

/** 用于项目详情页的扁平版本树行，保留深度和可读编号。 */
data class ProjectVersionTreeRow(
    val version: ProjectVersionEntity,
    val label: String,
    val depth: Int,
)

fun projectVersionTree(versions: List<ProjectVersionEntity>): List<ProjectVersionTreeRow> {
    val ordered = versions.sortedBy { it.createdAt }
    val ids = ordered.mapTo(mutableSetOf()) { it.id }
    val childrenByParent = ordered.groupBy { version -> version.parentVersionId?.takeIf { it in ids } }
    val rows = mutableListOf<ProjectVersionTreeRow>()

    fun appendChildren(parentId: String?, labelPrefix: String, depth: Int) {
        childrenByParent[parentId].orEmpty().forEachIndexed { index, version ->
            val label = if (parentId == null) "v${index + 1}" else "$labelPrefix.${index + 1}"
            rows += ProjectVersionTreeRow(version, label, depth)
            appendChildren(version.id, label, depth + 1)
        }
    }

    appendChildren(parentId = null, labelPrefix = "", depth = 0)
    return rows
}

fun projectVersionSubtreeIds(versions: List<ProjectVersionEntity>, rootVersionId: String): Set<String> {
    val childrenByParent = versions.groupBy { it.parentVersionId }
    val result = linkedSetOf<String>()
    fun visit(versionId: String) {
        if (!result.add(versionId)) return
        childrenByParent[versionId].orEmpty().forEach { visit(it.id) }
    }
    visit(rootVersionId)
    return result
}
