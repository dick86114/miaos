package com.miaos.android.ui

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.OutlinedButton
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
import androidx.core.content.ContextCompat
import com.miaos.android.data.ProjectRepository
import com.miaos.android.data.ProjectVersionTreeRow
import com.miaos.android.data.projectVersionTree
import com.miaos.android.data.database.GeneratedImageEntity
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.data.database.ProjectVersionEntity
import com.miaos.android.ui.components.MiaosCard
import com.miaos.android.ui.components.MiaosPageHeader
import com.miaos.android.ui.components.MiaosFilterChip
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 派生版本重新打开时，从持久化父图关联恢复图生图参考图。 */
internal fun projectVersionSourceImagePath(
    version: ProjectVersionEntity,
    images: List<GeneratedImageEntity>,
): String? = version.parentImageId
    ?.let { parentImageId -> images.firstOrNull { it.id == parentImageId }?.imagePath }
    ?.takeIf { it.isNotBlank() }

/** 当前版本工作台的类型与操作文案，主线和分支必须清晰区分。 */
internal data class CurrentVersionWorkspacePresentation(
    val title: String,
    val description: String,
    val generateLabel: String,
)

internal fun currentVersionWorkspacePresentation(
    version: ProjectVersionEntity?,
    sourceImagePath: String?,
): CurrentVersionWorkspacePresentation = when {
    version?.parentImageId == null -> CurrentVersionWorkspacePresentation(
        title = "版本主线",
        description = "当前版本会作为项目内生成和后续分支派生的默认目标。",
        generateLabel = "在当前版本生成",
    )
    sourceImagePath != null -> CurrentVersionWorkspacePresentation(
        title = "派生分支",
        description = "当前分支已关联父图，后续生成会继续以此图作为参考。",
        generateLabel = "继续图生图",
    )
    else -> CurrentVersionWorkspacePresentation(
        title = "派生分支",
        description = "父图记录已移除，后续生成将按文生图处理。",
        generateLabel = "在当前分支生成",
    )
}

@Composable
fun ProjectDetailScreen(projectId: String, onBack: () -> Unit, onGenerate: (String, String, String?) -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val database = remember { MiaosDatabase.create(context.applicationContext) }
    val repository = remember { ProjectRepository(database) }
    val project by database.projectDao().observeById(projectId).collectAsState(initial = null)
    val versions by database.projectVersionDao().observeForProject(projectId).collectAsState(initial = emptyList())
    val allImages by database.generatedImageDao().observeAll().collectAsState(initial = emptyList())
    val currentVersionId = project?.currentVersionId.orEmpty()
    val currentVersion = versions.firstOrNull { it.id == currentVersionId }
    val currentSourceImagePath = currentVersion?.let { version -> projectVersionSourceImagePath(version, allImages) }
    val currentVersionPresentation = currentVersionWorkspacePresentation(currentVersion, currentSourceImagePath)
    val currentImages by database.generatedImageDao().observeForVersion(currentVersionId).collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var showNewVersionDialog by remember { mutableStateOf(false) }
    var versionName by remember { mutableStateOf("") }
    var versionPrompt by remember { mutableStateOf("") }
    var branchParentImageId by remember { mutableStateOf<String?>(null) }
    var branchSourcePath by remember { mutableStateOf<String?>(null) }
    var branchPrompt by remember { mutableStateOf("") }
    var versionToDelete by remember { mutableStateOf<ProjectVersionTreeRow?>(null) }
    var imageToDelete by remember { mutableStateOf<GeneratedImageEntity?>(null) }
    var previewImage by remember { mutableStateOf<GeneratedImageEntity?>(null) }
    var pendingGalleryPath by remember { mutableStateOf<String?>(null) }
    var showProjectSettings by remember { mutableStateOf(false) }
    var projectNameDraft by remember { mutableStateOf("") }
    var projectDescriptionDraft by remember { mutableStateOf("") }
    var showDeleteProjectDialog by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }

    fun saveToGallery(path: String) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) { ImageMediaActions.saveToGallery(context.applicationContext, File(path)) }
                status = "已保存到系统相册的 妙生 文件夹"
            } catch (error: Exception) {
                status = error.message ?: "保存到相册失败"
            }
        }
    }

    val storagePermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val path = pendingGalleryPath
        pendingGalleryPath = null
        if (granted && path != null) saveToGallery(path) else status = "未授予存储权限，无法保存到相册"
    }

    fun requestSaveToGallery(path: String) {
        if (requiresLegacyGalleryPermission(Build.VERSION.SDK_INT) && ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingGalleryPath = path
            storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        } else {
            saveToGallery(path)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        TextButton(onClick = onBack) { Text("‹ 返回项目") }
        val currentProject = project
        if (currentProject == null) {
            MiaosCard { Text("项目不存在或已被删除") }
            return@Column
        }
        MiaosPageHeader(
            title = currentProject.name,
            subtitle = currentProject.description.ifBlank { "持续维护项目版本树和生成结果" },
            action = {
                TextButton(onClick = {
                    projectNameDraft = currentProject.name
                    projectDescriptionDraft = currentProject.description
                    showProjectSettings = true
                }) { Text("项目设置") }
            },
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MiaosFilterChip(
                label = "删除项目",
                selected = false,
                onClick = { showDeleteProjectDialog = true },
                trailingIcon = null,
            )
        }
        status?.let { message -> MiaosCard { Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant) } }

        currentProject.coverImageId?.let { coverId ->
            allImages.firstOrNull { it.id == coverId }?.let { cover ->
                ProjectImagePreview(cover, "项目封面")
            }
        }

        MiaosCard {
            Text(currentVersionPresentation.title, style = MaterialTheme.typography.titleLarge)
            Text(currentVersionPresentation.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 10.dp)) {
                Button(onClick = { onGenerate(projectId, currentProject.currentVersionId, currentSourceImagePath) }) { Text(currentVersionPresentation.generateLabel) }
                OutlinedButton(onClick = { showNewVersionDialog = true }) { Text("新建主线版本") }
            }
        }

        if (currentImages.isNotEmpty()) {
            MiaosCard {
                Text("当前版本图片", style = MaterialTheme.typography.titleLarge)
                currentImages.forEach { image ->
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 10.dp)) {
                        BitmapFactory.decodeFile(image.imagePath)?.let { bitmap ->
                            Image(bitmap = bitmap.asImageBitmap(), contentDescription = "版本图片", modifier = Modifier.fillMaxWidth())
                        }
                        Text(image.prompt, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(2.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            TextButton(onClick = { previewImage = image }) { Text("查看大图") }
                            TextButton(onClick = {
                                scope.launch {
                                    repository.setCover(projectId, image.id)
                                    status = "已设置为项目封面"
                                }
                            }) { Text(if (currentProject.coverImageId == image.id) "当前封面" else "设为封面") }
                            TextButton(onClick = {
                                branchParentImageId = image.id
                                branchSourcePath = image.imagePath
                                branchPrompt = image.prompt
                            }) { Text("派生分支") }
                            TextButton(onClick = {
                                try {
                                    ImageMediaActions.share(context, File(image.imagePath))
                                } catch (error: Exception) {
                                    status = error.message ?: "无法分享图片"
                                }
                            }) { Text("分享") }
                            TextButton(onClick = { requestSaveToGallery(image.imagePath) }) { Text("保存到相册") }
                            TextButton(onClick = { imageToDelete = image }) { Text("移除图片") }
                        }
                    }
                }
            }
        }

        MiaosCard {
            Text("版本树", style = MaterialTheme.typography.titleLarge)
            Text("主线按 v1、v2 编号，派生分支按 v1.1、v1.1.1 展开。删除版本会递归删除其下游分支。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            projectVersionTree(versions).forEach { row ->
                VersionTreeItem(
                    row = row,
                    isCurrent = row.version.id == currentProject.currentVersionId,
                    canDelete = versions.size > 1,
                    onSelect = { scope.launch { repository.selectVersion(projectId, row.version.id) } },
                    onDelete = { versionToDelete = row },
                )
            }
        }
    }

    previewImage?.let { image ->
        MiaosImagePreviewDialog(
            record = image,
            onDismiss = { previewImage = null },
            onShare = {
                try {
                    ImageMediaActions.share(context, File(image.imagePath))
                } catch (error: Exception) {
                    status = error.message ?: "无法分享图片"
                }
            },
            onSave = { requestSaveToGallery(image.imagePath) },
        )
    }

    if (showProjectSettings) {
        AlertDialog(
            onDismissRequest = { showProjectSettings = false },
            title = { Text("项目设置") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = projectNameDraft,
                        onValueChange = { projectNameDraft = it },
                        label = { Text("项目名称") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = projectDescriptionDraft,
                        onValueChange = { projectDescriptionDraft = it },
                        label = { Text("项目描述（可选）") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        try {
                            repository.updateDetails(projectId, projectNameDraft, projectDescriptionDraft)
                            status = "项目已更新"
                            showProjectSettings = false
                        } catch (error: IllegalArgumentException) {
                            status = error.message ?: "项目名称不能为空"
                        }
                    }
                }) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { showProjectSettings = false }) { Text("取消") } },
        )
    }

    if (showDeleteProjectDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteProjectDialog = false },
            title = { Text("删除项目？") },
            text = { Text("将删除项目、所有版本、项目内历史记录和等待中的生成任务；图片文件会保留在应用私有目录。") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.delete(projectId)
                        showDeleteProjectDialog = false
                        onBack()
                    }
                }) { Text("确认删除") }
            },
            dismissButton = { TextButton(onClick = { showDeleteProjectDialog = false }) { Text("取消") } },
        )
    }

    if (showNewVersionDialog) {
        AlertDialog(
            onDismissRequest = { showNewVersionDialog = false },
            title = { Text("新建主线版本") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(value = versionName, onValueChange = { versionName = it }, label = { Text("版本名称（可选）") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = versionPrompt, onValueChange = { versionPrompt = it }, label = { Text("提示词") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.createRootVersion(projectId, versionName, versionPrompt)
                        versionName = ""
                        versionPrompt = ""
                        showNewVersionDialog = false
                        status = "已创建新的主线版本"
                    }
                }) { Text("创建") }
            },
            dismissButton = { TextButton(onClick = { showNewVersionDialog = false }) { Text("取消") } },
        )
    }

    if (branchParentImageId != null && branchSourcePath != null) {
        AlertDialog(
            onDismissRequest = { branchParentImageId = null; branchSourcePath = null },
            title = { Text("派生图生图分支") },
            text = {
                OutlinedTextField(value = branchPrompt, onValueChange = { branchPrompt = it }, label = { Text("分支提示词") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
            },
            confirmButton = {
                TextButton(onClick = {
                    val parentImageId = branchParentImageId ?: return@TextButton
                    val sourcePath = branchSourcePath ?: return@TextButton
                    scope.launch {
                        val record = repository.createBranchVersion(projectId, currentVersionId, parentImageId, branchPrompt)
                        branchParentImageId = null
                        branchSourcePath = null
                        status = "已创建派生分支并加入生成页"
                        onGenerate(projectId, record.version.id, sourcePath)
                    }
                }) { Text("创建并生成") }
            },
            dismissButton = { TextButton(onClick = { branchParentImageId = null; branchSourcePath = null }) { Text("取消") } },
        )
    }

    imageToDelete?.let { image ->
        AlertDialog(
            onDismissRequest = { imageToDelete = null },
            title = { Text("移除当前版本图片？") },
            text = { Text("这会移除项目和历史中的图片记录；原始图片文件保留在应用私有目录。") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.deleteImage(projectId, image.id)
                        imageToDelete = null
                        status = "已移除图片记录"
                    }
                }) { Text("确认移除") }
            },
            dismissButton = { TextButton(onClick = { imageToDelete = null }) { Text("取消") } },
        )
    }

    versionToDelete?.let { row ->
        AlertDialog(
            onDismissRequest = { versionToDelete = null },
            title = { Text("删除 ${row.label}？") },
            text = { Text("将递归删除该版本及其所有派生分支、关联历史记录和等待中的生图任务。项目至少会保留一个版本。") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        try {
                            repository.deleteVersionTree(projectId, row.version.id)
                            status = "已删除 ${row.label} 及其派生分支"
                        } catch (error: Exception) {
                            status = error.message ?: "删除版本失败"
                        } finally {
                            versionToDelete = null
                        }
                    }
                }) { Text("确认删除") }
            },
            dismissButton = { TextButton(onClick = { versionToDelete = null }) { Text("取消") } },
        )
    }
}

@Composable
private fun VersionTreeItem(
    row: ProjectVersionTreeRow,
    isCurrent: Boolean,
    canDelete: Boolean,
    onSelect: () -> Unit,
    onDelete: () -> Unit,
) {
    MiaosCard(modifier = Modifier.padding(start = (row.depth * 16).dp, top = 10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Column(modifier = Modifier.weight(1f)) {
                Text("${row.label} · ${row.version.name}", style = MaterialTheme.typography.titleMedium)
                Text(row.version.prompt.ifBlank { "尚未填写提示词" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (isCurrent) Text("当前", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
        }
        Text(formatVersionTime(row.version.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        FlowRow(
            modifier = Modifier.padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (!isCurrent) {
                MiaosFilterChip(
                    label = "设为当前",
                    selected = false,
                    onClick = onSelect,
                    trailingIcon = null,
                )
            }
            if (canDelete) {
                MiaosFilterChip(
                    label = "删除",
                    selected = false,
                    onClick = onDelete,
                    trailingIcon = null,
                )
            }
        }
    }
}

@Composable
private fun ProjectImagePreview(image: GeneratedImageEntity, title: String) {
    MiaosCard {
        Text(title, style = MaterialTheme.typography.titleMedium)
        BitmapFactory.decodeFile(image.imagePath)?.let { bitmap ->
            Image(bitmap = bitmap.asImageBitmap(), contentDescription = title, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        }
    }
}

private fun formatVersionTime(value: Long): String = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(value))
