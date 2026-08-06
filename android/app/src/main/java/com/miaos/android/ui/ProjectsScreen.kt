package com.miaos.android.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import com.miaos.android.data.ProjectRepository
import com.miaos.android.data.database.GeneratedImageEntity
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.data.database.ProjectEntity
import com.miaos.android.data.database.ProjectVersionEntity
import com.miaos.android.ui.components.MiaosCard
import com.miaos.android.ui.components.MiaosPageHeader
import com.miaos.android.ui.components.MiaosPrimaryAddAction
import com.miaos.android.ui.components.MiaosEmptyState
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ProjectsScreen(onOpen: (String) -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val database = remember { MiaosDatabase.create(context.applicationContext) }
    val repository = remember { ProjectRepository(database) }
    val projects by database.projectDao().observeAll().collectAsState(initial = emptyList())
    val versions by database.projectVersionDao().observeAll().collectAsState(initial = emptyList())
    val images by database.generatedImageDao().observeAll().collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showCreateDialog by remember { mutableStateOf(false) }
    var projectName by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var initialPrompt by remember { mutableStateOf("") }
    var query by remember { mutableStateOf("") }
    var projectForDelete by remember { mutableStateOf<com.miaos.android.data.database.ProjectEntity?>(null) }

    com.miaos.android.ui.components.MiaosPageColumn(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    ) {
        MiaosPageHeader(
            title = "项目",
            subtitle = "为同一件事持续创作，维护独立的提示词版本树",
            action = { MiaosPrimaryAddAction("新建项目") { showCreateDialog = true } },
        )
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("搜索项目名称或描述") },
            singleLine = true,
        )
        val filteredProjects = filterProjects(projects, query)
        if (filteredProjects.isEmpty()) {
            MiaosEmptyState(
                presentation = projectEmptyStatePresentation(hasAnyProjects = projects.isNotEmpty()),
                onAction = if (projects.isEmpty()) ({ showCreateDialog = true }) else null,
            )
        }
        filteredProjects.forEach { project ->
            val summary = projectCardSummary(project, versions, images)
            MiaosCard {
                project.coverImageId?.let { coverId ->
                    images.firstOrNull { it.id == coverId }?.let { cover ->
                        BitmapFactory.decodeFile(cover.imagePath)?.let { bitmap ->
                            Image(bitmap = bitmap.asImageBitmap(), contentDescription = "项目封面", modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
                Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(project.name, style = MaterialTheme.typography.titleLarge)
                        Text(
                            project.description.ifBlank { "暂无描述" },
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    TextButton(onClick = { projectForDelete = project }) { Text("删除") }
                }
                FlowRow(
                    modifier = Modifier.padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text("${summary.versionCount} 个版本", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    Text("${summary.imageCount} 张图", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    summary.currentModelId?.takeIf { it.isNotBlank() }?.let { modelId ->
                        Text(modelId, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("更新于 ${formatProjectTime(project.updatedAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { onOpen(project.id) }) { Text("进入项目") }
                }
            }
        }
    }

    projectForDelete?.let { project ->
        AlertDialog(
            onDismissRequest = { projectForDelete = null },
            title = { Text("删除项目？") },
            text = { Text("将删除项目、所有版本、项目内历史记录和等待中的生成任务；图片文件会保留在应用私有目录。") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.delete(project.id)
                        projectForDelete = null
                    }
                }) { Text("确认删除") }
            },
            dismissButton = { TextButton(onClick = { projectForDelete = null }) { Text("取消") } },
        )
    }

    if (showCreateDialog) {
        AlertDialog(
            onDismissRequest = { showCreateDialog = false },
            title = { Text("新建项目") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(value = projectName, onValueChange = { projectName = it }, label = { Text("项目名称") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("项目描述（可选）") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = initialPrompt, onValueChange = { initialPrompt = it }, label = { Text("初始提示词（可选）") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.create(projectName, description, initialPrompt)
                        projectName = ""
                        description = ""
                        initialPrompt = ""
                        showCreateDialog = false
                    }
                }) { Text("创建") }
            },
            dismissButton = { TextButton(onClick = { showCreateDialog = false }) { Text("取消") } },
        )
    }
}

private fun formatProjectTime(value: Long): String = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(value))


internal data class ProjectCardSummary(
    val versionCount: Int,
    val imageCount: Int,
    val currentModelId: String?,
)

internal fun projectCardSummary(
    project: ProjectEntity,
    versions: List<ProjectVersionEntity>,
    images: List<GeneratedImageEntity>,
): ProjectCardSummary {
    val projectVersions = versions.filter { it.projectId == project.id }
    return ProjectCardSummary(
        versionCount = projectVersions.size,
        imageCount = images.count { it.projectId == project.id },
        currentModelId = projectVersions.firstOrNull { it.id == project.currentVersionId }?.modelId,
    )
}

fun filterProjects(projects: List<ProjectEntity>, query: String): List<ProjectEntity> {
    val keyword = query.trim().lowercase()
    if (keyword.isBlank()) return projects
    return projects.filter { project ->
        project.name.lowercase().contains(keyword) || project.description.lowercase().contains(keyword)
    }
}
