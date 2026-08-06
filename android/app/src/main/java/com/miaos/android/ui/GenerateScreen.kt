package com.miaos.android.ui

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.miaos.android.data.DefaultGenerationSettings
import com.miaos.android.data.GenerationTaskRecord
import com.miaos.android.data.GenerationTaskRepository
import com.miaos.android.data.GenerationTaskStatus
import com.miaos.android.data.MiaosSecretStore
import com.miaos.android.data.database.GenerationTaskEntity
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.data.database.ProjectVersionEntity
import com.miaos.android.data.database.ProviderEntity
import com.miaos.android.generation.GenerationTaskScheduler
import com.miaos.android.generation.PromptOptimizationClient
import com.miaos.android.ui.components.MiaosCard
import com.miaos.android.ui.components.MiaosPageHeader
import com.miaos.android.ui.components.MiaosPageColumn
import com.miaos.android.ui.components.MiaosResultPlaceholder
import com.miaos.android.ui.components.MiaosFilterChip
import com.miaos.android.ui.components.MiaosIllustration
import com.miaos.android.ui.components.MiaosIllustrationGraphic
import com.miaos.android.ui.components.MiaosBrandLogo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.File
import java.util.UUID

private data class ImageModelOption(val id: String, val name: String)

data class GeneratePrefill(
    val prompt: String,
    val providerId: String,
    val modelId: String,
    val ratio: String,
    val quality: String,
)

/** 项目内生成始终继承当前版本的创作上下文，避免退回到全局默认配置。 */
internal data class ProjectGenerationContext(
    val prompt: String,
    val providerId: String,
    val modelId: String,
)

internal fun projectGenerationContext(version: ProjectVersionEntity) = ProjectGenerationContext(
    prompt = version.prompt,
    providerId = version.providerId,
    modelId = version.modelId,
)

/** 配置变化恢复时保留用户未提交的项目生图草稿，只在首次加载版本时带入上下文。 */
internal fun shouldApplyProjectGenerationContext(
    isProjectVersionLoaded: Boolean,
    hasAppliedContext: Boolean,
): Boolean = isProjectVersionLoaded && !hasAppliedContext

/** 终态记录可清理；活跃任务只允许取消等待中的任务，避免打断正在执行的供应商请求。 */
internal data class GenerationTaskQueueActions(
    val canCancel: Boolean,
    val canRetry: Boolean,
    val canDismiss: Boolean,
)

internal fun generationTaskQueueActions(status: String): GenerationTaskQueueActions = GenerationTaskQueueActions(
    canCancel = status == GenerationTaskStatus.QUEUED,
    canRetry = status == GenerationTaskStatus.FAILED || status == GenerationTaskStatus.CANCELED,
    canDismiss = status == GenerationTaskStatus.DONE || status == GenerationTaskStatus.FAILED || status == GenerationTaskStatus.CANCELED,
)

@Composable
fun GenerateScreen(
    projectId: String? = null,
    versionId: String? = null,
    sourceImagePath: String? = null,
    prefill: GeneratePrefill? = null,
    onPrefillApplied: (() -> Unit)? = null,
    onExitProjectMode: (() -> Unit)? = null,
    onOpenSettings: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val database = remember { MiaosDatabase.create(context.applicationContext) }
    val taskRepository = remember { GenerationTaskRepository(database) }
    val taskScheduler = remember { GenerationTaskScheduler(context.applicationContext, taskRepository) }
    val secretStore = remember { MiaosSecretStore(context.applicationContext) }
    val promptOptimizationClient = remember { PromptOptimizationClient() }
    val providers by database.providerDao().observeAll().collectAsState(initial = emptyList())
    val projectVersion by database.projectVersionDao().observeById(versionId.orEmpty()).collectAsState(initial = null)
    val defaultsJson by database.preferenceDao().observeValue("defaults").collectAsState(initial = "{}")
    val defaults = remember(defaultsJson) { DefaultGenerationSettings.fromJson(defaultsJson) }
    val tasks by taskRepository.observeAll().collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var selectedProviderId by rememberSaveable { mutableStateOf("") }
    var selectedModelId by rememberSaveable { mutableStateOf("") }
    var prompt by rememberSaveable { mutableStateOf("") }
    var hasAppliedProjectContext by rememberSaveable(projectId, versionId) { mutableStateOf(false) }
    var ratio by rememberSaveable { mutableStateOf("1:1") }
    var quality by rememberSaveable { mutableStateOf("高清") }
    var quantity by rememberSaveable { mutableStateOf("1") }
    var status by rememberSaveable {
        mutableStateOf(if (projectId != null && versionId != null) "将在当前项目版本中生成" else "请先从 macOS 导入供应商配置")
    }
    var selectedReferenceUriText by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedReferenceUri = selectedReferenceUriText?.let(Uri::parse)
    var enqueueing by remember { mutableStateOf(false) }
    var optimizing by remember { mutableStateOf(false) }
    var showProviderPicker by remember { mutableStateOf(false) }
    var showModelPicker by remember { mutableStateOf(false) }
    var showRatioPicker by remember { mutableStateOf(false) }
    var showQualityPicker by remember { mutableStateOf(false) }
    var showQuantityPicker by remember { mutableStateOf(false) }
    val referencePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        selectedReferenceUriText = uri?.toString()
    }

    val selectedProvider = providers.firstOrNull { it.id == selectedProviderId } ?: providers.firstOrNull()
    val models = selectedProvider?.imageModels().orEmpty()
    val selectedModel = models.firstOrNull { it.id == selectedModelId } ?: models.firstOrNull()
    val visibleTasks = tasks.filter { task ->
        if (projectId != null && versionId != null) {
            task.projectId == projectId && task.versionId == versionId
        } else {
            task.projectId == null && task.versionId == null
        }
    }.take(8)
    val latestImagePath = visibleTasks.firstOrNull { it.status == GenerationTaskStatus.DONE }?.imagePath

    LaunchedEffect(prefill) {
        prefill ?: return@LaunchedEffect
        prompt = prefill.prompt
        selectedProviderId = prefill.providerId
        selectedModelId = prefill.modelId
        ratio = prefill.ratio
        quality = prefill.quality
        status = "已从历史记录带入生成参数"
        onPrefillApplied?.invoke()
    }

    LaunchedEffect(projectId, versionId, projectVersion?.id, hasAppliedProjectContext) {
        val loadedVersion = projectVersion
        if (
            projectId == null ||
            loadedVersion?.id != versionId ||
            !shouldApplyProjectGenerationContext(
                isProjectVersionLoaded = loadedVersion != null,
                hasAppliedContext = hasAppliedProjectContext,
            )
        ) {
            return@LaunchedEffect
        }
        val generationContext = projectGenerationContext(loadedVersion ?: return@LaunchedEffect)
        prompt = generationContext.prompt
        selectedProviderId = generationContext.providerId
        selectedModelId = generationContext.modelId
        status = "已带入当前版本的创作参数"
        hasAppliedProjectContext = true
    }

    LaunchedEffect(providers, defaults.defaultImageProvider) {
        if (selectedProviderId.isBlank() || providers.none { it.id == selectedProviderId }) {
            selectedProviderId = providers.firstOrNull { it.id == defaults.defaultImageProvider }?.id
                ?: providers.firstOrNull()?.id.orEmpty()
        }
    }
    LaunchedEffect(selectedProvider?.id, models, defaults.defaultImageProvider, defaults.defaultImageModel) {
        if (models.none { it.id == selectedModelId }) {
            selectedModelId = models.firstOrNull { selectedProvider?.id == defaults.defaultImageProvider && it.id == defaults.defaultImageModel }?.id
                ?: models.firstOrNull()?.id.orEmpty()
        }
    }

    MiaosPageColumn(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    ) {
        MiaosPageHeader(
            title = if (projectId != null && versionId != null) "项目内生图" else "快速生图",
            subtitle = if (projectId != null && versionId != null) "结果会归档至当前版本，可继续派生图生图分支。" else "输入提示词，选择供应商与模型，即可开始创作。",
        )

        if (projectId != null && versionId != null) {
            MiaosCard(contentPadding = PaddingValues(14.dp)) {
                Text("项目模式", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                Text(
                    if (sourceImagePath != null) "已带入父版本图片作为图生图参考。" else "本次结果会保存到当前项目版本。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = { onExitProjectMode?.invoke() }, contentPadding = PaddingValues(top = 8.dp)) { Text("退出项目模式") }
            }
        }

        if (providers.isEmpty()) {
            MiaosCard(contentPadding = PaddingValues(20.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MiaosBrandLogo(
                        modifier = Modifier.sizeIn(maxWidth = 54.dp, maxHeight = 54.dp),
                        contentDescription = "妙生产品 Logo",
                    )
                    MiaosIllustrationGraphic(
                        illustration = MiaosIllustration.TRANSFER,
                        modifier = Modifier.weight(1f).height(112.dp).padding(start = 12.dp),
                        contentDescription = "macOS 到 Android 的配置迁移插图",
                    )
                }
                Text("先同步你的创作配置", modifier = Modifier.padding(top = 10.dp), style = MaterialTheme.typography.titleLarge)
                Text(
                    "从 macOS 导入加密 .miaos 文件，或扫描一次性局域网配对二维码；API Key 不会写入普通数据库。",
                    modifier = Modifier.padding(top = 4.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { onOpenSettings?.invoke() },
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                ) { Text("前往配置迁移") }
            }
        } else {
            MiaosCard(contentPadding = PaddingValues(14.dp)) {
                OutlinedTextField(
                    value = prompt,
                    onValueChange = { prompt = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("描述你想生成的画面，例如：清晨的湖边，薄雾缭绕，极简风格…") },
                    minLines = 5,
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent,
                        disabledBorderColor = Color.Transparent,
                    ),
                )
                if (selectedReferenceUri != null || sourceImagePath != null) {
                    Text(
                        "已附带参考图，当前模型将按图生图能力处理。",
                        modifier = Modifier.padding(top = 10.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                FlowRow(
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    ComposerControlButton(
                        label = if (selectedReferenceUri != null || sourceImagePath != null) "更换参考图" else "参考图",
                        onClick = { referencePicker.launch("image/*") },
                    )
                    ComposerControlButton(label = "随机", onClick = {
                        prompt = randomPrompt()
                        status = "已填入随机提示词"
                    })
                    ComposerControlButton(
                        label = if (optimizing) "优化中…" else "优化",
                        enabled = !optimizing && prompt.isNotBlank(),
                        onClick = {
                            optimizing = true
                            status = "正在优化提示词…"
                            scope.launch {
                                try {
                                    prompt = promptOptimizationClient.optimize(providers, secretStore, prompt, defaults)
                                    status = "提示词已优化"
                                } catch (error: Exception) {
                                    status = error.message ?: "提示词优化失败"
                                } finally {
                                    optimizing = false
                                }
                            }
                        },
                    )
                    ComposerControlButton(
                        label = "供应商 · ${selectedProvider?.name ?: "未选择"}",
                        onClick = { showProviderPicker = true },
                    )
                    ComposerControlButton(
                        label = "模型 · ${selectedModel?.name ?: "未选择"}",
                        onClick = { showModelPicker = true },
                    )
                    ComposerControlButton(label = "比例 · $ratio", onClick = { showRatioPicker = true })
                    ComposerControlButton(label = "质量 · $quality", onClick = { showQualityPicker = true })
                    ComposerControlButton(label = "数量 · $quantity", onClick = { showQuantityPicker = true })
                }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        "设备直连供应商 · API Key 由 Android Keystore 保护",
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    FilledIconButton(
                        enabled = !enqueueing && selectedProvider != null && selectedModel != null && prompt.isNotBlank(),
                        onClick = {
                        val provider = selectedProvider ?: return@FilledIconButton
                        val model = selectedModel ?: return@FilledIconButton
                        enqueueing = true
                        status = "正在准备任务…"
                        scope.launch {
                            try {
                                val localSourcePath = selectedReferenceUri?.let { uri ->
                                    withContext(Dispatchers.IO) { copyReferenceImage(context, uri) }
                                } ?: sourceImagePath
                                val requestedQuantity = quantity.toIntOrNull()?.coerceIn(1, 4) ?: 1
                                quantity = requestedQuantity.toString()
                                if (projectId != null && versionId != null) {
                                    database.projectVersionDao().updateGenerationSettings(
                                        versionId = versionId,
                                        prompt = prompt,
                                        providerId = provider.id,
                                        providerName = provider.name,
                                        modelId = model.id,
                                    )
                                }
                                repeat(requestedQuantity) {
                                    taskScheduler.enqueue(GenerationTaskRecord.create(
                                        providerId = provider.id,
                                        providerName = provider.name,
                                        providerType = provider.type,
                                        endpoint = provider.endpoint,
                                        modelId = model.id,
                                        prompt = prompt,
                                        ratio = ratio,
                                        quality = quality,
                                        sourceImagePath = localSourcePath,
                                        projectId = projectId,
                                        versionId = versionId,
                                    ))
                                }
                                selectedReferenceUriText = null
                                status = "已加入 $requestedQuantity 个串行任务"
                            } catch (error: Exception) {
                                status = error.message ?: "无法加入生成队列"
                            } finally {
                                enqueueing = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
                    ) {
                        Icon(Icons.Outlined.ArrowUpward, contentDescription = if (enqueueing) "正在加入队列" else "开始生成")
                    }
                }
            }
        }

        if (latestImagePath == null && visibleTasks.isEmpty()) {
            MiaosResultPlaceholder()
        }

        MiaosCard {
            Text("生成队列", style = MaterialTheme.typography.titleMedium)
            Text(status, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (visibleTasks.isEmpty()) {
                Text("暂无任务。提交后可离开此页面，应用会在联网时按顺序处理。", modifier = Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                visibleTasks.forEach { task ->
                    val actions = generationTaskQueueActions(task.status)
                    MiaosCard(
                        modifier = Modifier.padding(top = 10.dp),
                        contentPadding = PaddingValues(12.dp),
                    ) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(
                                taskStatusLabel(task.status),
                                style = MaterialTheme.typography.labelLarge,
                                color = if (task.status == GenerationTaskStatus.FAILED) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                            )
                            Text(task.modelId, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Text(task.prompt.ifBlank { "未填写提示词" }, modifier = Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text("${task.ratio} · ${task.quality}", modifier = Modifier.padding(top = 2.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        task.errorMessage?.takeIf { task.status == GenerationTaskStatus.FAILED }?.let { message ->
                            Text(message, modifier = Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        }
                        if (actions.canCancel || actions.canRetry || actions.canDismiss) {
                            FlowRow(
                                modifier = Modifier.padding(top = 6.dp),
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                if (actions.canCancel) {
                                    TextButton(onClick = {
                                        scope.launch {
                                            if (taskScheduler.cancelQueued(task.id)) status = "已取消等待中的任务"
                                        }
                                    }) { Text("取消任务") }
                                }
                                if (actions.canRetry) {
                                    TextButton(onClick = {
                                        scope.launch {
                                            if (taskScheduler.retry(task.id)) status = "任务已重新加入队列"
                                        }
                                    }) { Text("重新加入队列") }
                                }
                                if (actions.canDismiss) {
                                    TextButton(onClick = {
                                        scope.launch {
                                            if (taskScheduler.dismissTerminal(task.id)) status = "已从队列移除，历史图片不受影响"
                                        }
                                    }) { Text("移除") }
                                }
                            }
                        }
                    }
                }
            }
            latestImagePath?.let { path ->
                BitmapFactory.decodeFile(path)?.let { bitmap ->
                    Text("最近完成", modifier = Modifier.padding(top = 14.dp), style = MaterialTheme.typography.titleSmall)
                    Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = "最近生成结果",
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).sizeIn(maxHeight = 720.dp),
                    )
                }
            }
        }

    if (showProviderPicker) {
        ComposerChoiceDialog(
            title = "选择供应商",
            options = providers.map { it.id to it.name },
            selectedId = selectedProvider?.id.orEmpty(),
            onDismiss = { showProviderPicker = false },
            onSelect = { providerId ->
                selectedProviderId = providerId
                showProviderPicker = false
            },
        )
    }
    if (showModelPicker) {
        ComposerChoiceDialog(
            title = "选择图像模型",
            options = models.map { it.id to it.name },
            selectedId = selectedModel?.id.orEmpty(),
            emptyMessage = "当前供应商没有启用图像模型，请前往设置页管理模型。",
            onDismiss = { showModelPicker = false },
            onSelect = { modelId ->
                selectedModelId = modelId
                showModelPicker = false
            },
        )
    }
    if (showRatioPicker) {
        ComposerParameterDialog(
            title = "画面比例",
            value = ratio,
            options = generationRatioOptions(ratio),
            onDismiss = { showRatioPicker = false },
            onSelect = {
                ratio = it
                showRatioPicker = false
            },
        )
    }
    if (showQualityPicker) {
        ComposerParameterDialog(
            title = "生成质量",
            value = quality,
            options = generationQualityOptions(quality),
            onDismiss = { showQualityPicker = false },
            onSelect = {
                quality = it
                showQualityPicker = false
            },
        )
    }
    if (showQuantityPicker) {
        ComposerChoiceDialog(
            title = "生成数量",
            options = (1..4).map { it.toString() to "生成 $it 张" },
            selectedId = quantity,
            onDismiss = { showQuantityPicker = false },
            onSelect = {
                quantity = it
                showQuantityPicker = false
            },
        )
    }

    }
}


/** 移动端控制项在窄屏自动换行；长供应商和模型名称以省略号收束，保持 macOS 的圆角 chip 语义。 */
@Composable
private fun ComposerControlButton(
    label: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    MiaosFilterChip(
        label = label,
        selected = false,
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.widthIn(max = 190.dp),
        trailingIcon = null,
    )
}

@Composable
private fun ComposerChoiceDialog(
    title: String,
    options: List<Pair<String, String>>,
    selectedId: String,
    emptyMessage: String = "暂无可选项。",
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (options.isEmpty()) {
                    Text(emptyMessage, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    options.forEach { (id, label) ->
                        if (id == selectedId) {
                            Button(onClick = { onSelect(id) }, modifier = Modifier.fillMaxWidth()) { Text(label) }
                        } else {
                            OutlinedButton(onClick = { onSelect(id) }, modifier = Modifier.fillMaxWidth()) { Text(label) }
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ComposerParameterDialog(
    title: String,
    value: String,
    options: List<String>,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    var draft by remember(value) { mutableStateOf(value) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("自定义值") },
                    singleLine = true,
                )
                options.forEach { option ->
                    if (option == draft) {
                        Button(onClick = { onSelect(option) }, modifier = Modifier.fillMaxWidth()) { Text(option) }
                    } else {
                        OutlinedButton(onClick = { onSelect(option) }, modifier = Modifier.fillMaxWidth()) { Text(option) }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = draft.isNotBlank(),
                onClick = { onSelect(draft.trim()) },
            ) { Text("使用") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

private fun copyReferenceImage(context: Context, uri: Uri): String {
    val mime = context.contentResolver.getType(uri)
    require(mime in setOf("image/png", "image/jpeg", "image/webp")) { "参考图仅支持 PNG、JPEG 或 WebP" }
    val extension = when (mime) {
        "image/jpeg" -> "jpg"
        "image/webp" -> "webp"
        else -> "png"
    }
    val directory = File(context.filesDir, "generation-sources").apply { mkdirs() }
    val target = File(directory, "source_${UUID.randomUUID()}.$extension")
    try {
        context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        } ?: throw IllegalArgumentException("无法读取参考图")
        require(target.length() <= 12L * 1024 * 1024) { "参考图不能超过 12MB" }
        return target.absolutePath
    } catch (error: Exception) {
        target.delete()
        throw error
    }
}

private fun taskStatusLabel(status: String): String = when (status) {
    GenerationTaskStatus.QUEUED -> "等待中"
    GenerationTaskStatus.RUNNING -> "生成中"
    GenerationTaskStatus.DONE -> "已完成"
    GenerationTaskStatus.FAILED -> "失败"
    GenerationTaskStatus.CANCELED -> "已取消"
    else -> "未知状态"
}

private fun ProviderEntity.imageModels(): List<ImageModelOption> = try {
    val models = JSONArray(imageModelsJson)
    buildList {
        for (index in 0 until models.length()) {
            val item = models.optJSONObject(index) ?: continue
            if (item.optBoolean("enabled", false)) {
                val id = item.optString("id")
                if (id.isNotBlank()) add(ImageModelOption(id, item.optString("name", id)))
            }
        }
    }
} catch (_: Exception) {
    emptyList()
}


private fun randomPrompt(): String = listOf(
    "雨夜城市街角，霓虹倒影，电影感构图，细腻光影",
    "极简主义室内空间，柔和自然光，高级杂志摄影风格",
    "未来感机械花园，薄雾与体积光，超高细节",
    "山间湖泊的清晨，远山云海，宁静的东方美学",
).random()
