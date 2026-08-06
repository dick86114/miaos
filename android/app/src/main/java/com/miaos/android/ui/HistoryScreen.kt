package com.miaos.android.ui

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import com.miaos.android.data.GeneratedImageRepository
import com.miaos.android.data.database.GeneratedImageEntity
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.ui.components.MiaosCard
import com.miaos.android.ui.components.MiaosPageHeader
import com.miaos.android.ui.components.MiaosFilterChip
import com.miaos.android.ui.components.MiaosEmptyState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class HistorySourceFilter { ALL, QUICK, PROJECT }
enum class HistoryContentTab(val label: String) { RECORDS("历史记录"), STATS("统计分析") }

/** 恢复筛选状态时只接受已知枚举，旧值或损坏值统一回退到全部。 */
fun restoreHistorySourceFilter(value: String?): HistorySourceFilter = HistorySourceFilter.entries
    .firstOrNull { it.name == value }
    ?: HistorySourceFilter.ALL

/** 恢复历史页标签时只接受已知值，避免配置变化后进入不存在的内容区。 */
fun restoreHistoryContentTab(value: String?): HistoryContentTab = HistoryContentTab.entries
    .firstOrNull { it.name == value }
    ?: HistoryContentTab.RECORDS

/** 项目删除后，旧的保存筛选不会继续指向不存在的项目。 */
internal fun restoreHistoryProjectFilter(value: String?, availableProjectIds: Set<String>): String? = value
    ?.trim()
    ?.takeIf { it.isNotEmpty() && it in availableProjectIds }

/** 项目图片只在项目标识有效时显示跳转入口，避免损坏记录导向空工作台。 */
internal fun historyProjectNavigationTarget(record: GeneratedImageEntity): String? = record.projectId
    ?.trim()
    ?.takeIf { it.isNotEmpty() }

internal const val historyPageSize = 24

/** 与 macOS 历史页一致：固定页大小，空结果也保持稳定的第 1 页。 */
internal data class HistoryPage<T>(
    val items: List<T>,
    val page: Int,
    val totalPages: Int,
    val totalCount: Int,
)

internal fun <T> paginateHistoryItems(
    items: List<T>,
    requestedPage: Int,
    pageSize: Int = historyPageSize,
): HistoryPage<T> {
    require(pageSize > 0) { "每页数量必须大于 0" }
    val totalCount = items.size
    val totalPages = ((totalCount + pageSize - 1) / pageSize).coerceAtLeast(1)
    val page = requestedPage.coerceIn(1, totalPages)
    val start = (page - 1) * pageSize
    return HistoryPage(
        items = items.drop(start).take(pageSize),
        page = page,
        totalPages = totalPages,
        totalCount = totalCount,
    )
}

fun filterHistoryRecords(
    records: List<GeneratedImageEntity>,
    query: String,
    sourceFilter: HistorySourceFilter,
    projectFilterId: String? = null,
): List<GeneratedImageEntity> {
    val normalizedQuery = query.trim().lowercase()
    return records.filter { record ->
        val sourceMatches = when (sourceFilter) {
            HistorySourceFilter.ALL -> true
            HistorySourceFilter.QUICK -> record.projectId == null
            HistorySourceFilter.PROJECT -> record.projectId != null
        }
        val queryMatches = normalizedQuery.isBlank() || listOf(record.prompt, record.providerName, record.modelId)
            .any { it.lowercase().contains(normalizedQuery) }
        val projectMatches = sourceFilter != HistorySourceFilter.PROJECT || projectFilterId == null || record.projectId == projectFilterId
        sourceMatches && queryMatches && projectMatches
    }
}

@Composable
fun HistoryScreen(
    onRegenerate: (GeneratePrefill) -> Unit,
    onOpenProject: (String) -> Unit,
) {
    val context = LocalContext.current
    val database = remember { MiaosDatabase.create(context.applicationContext) }
    val repository = remember { GeneratedImageRepository(database) }
    val records by database.generatedImageDao().observeAll().collectAsState(initial = emptyList())
    val projects by database.projectDao().observeAll().collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var previewRecord by remember { mutableStateOf<GeneratedImageEntity?>(null) }
    var deleteRecord by remember { mutableStateOf<GeneratedImageEntity?>(null) }
    var pendingGalleryPath by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf("") }
    var sourceFilterValue by rememberSaveable { mutableStateOf(HistorySourceFilter.ALL.name) }
    var projectFilterValue by rememberSaveable { mutableStateOf<String?>(null) }
    var historyContentTabValue by rememberSaveable { mutableStateOf(HistoryContentTab.RECORDS.name) }
    var historyPage by rememberSaveable { mutableIntStateOf(1) }
    val sourceFilter = restoreHistorySourceFilter(sourceFilterValue)
    val historyContentTab = restoreHistoryContentTab(historyContentTabValue)
    val projectFilterId = restoreHistoryProjectFilter(projectFilterValue, projects.mapTo(mutableSetOf()) { it.id })
    var showProjectFilterPicker by remember { mutableStateOf(false) }
    var managing by remember { mutableStateOf(false) }
    val selectedIds = remember { mutableStateListOf<String>() }
    var showBatchDeleteDialog by remember { mutableStateOf(false) }
    val filteredRecords = filterHistoryRecords(records, query, sourceFilter, projectFilterId)
    val historyPageData = paginateHistoryItems(filteredRecords, historyPage)
    LaunchedEffect(historyPage, historyPageData.page) {
        if (historyPage != historyPageData.page) historyPage = historyPageData.page
    }

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
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P && ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingGalleryPath = path
            storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        } else {
            saveToGallery(path)
        }
    }

    com.miaos.android.ui.components.MiaosPageColumn(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
    ) {
        MiaosPageHeader(
            title = "生成历史",
            subtitle = if (historyContentTab == HistoryContentTab.RECORDS) "图片和历史仅保存在本机；可搜索、筛选、批量管理或再次生成。"
            else "所有统计均由设备中的历史记录即时计算，不会上传图片或提示词。",
            action = if (historyContentTab == HistoryContentTab.RECORDS) {
                { TextButton(onClick = {
                    managing = !managing
                    if (!managing) selectedIds.clear()
                }) { Text(if (managing) "完成" else "管理") } }
            } else null,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            HistoryContentTab.entries.forEach { tab ->
                MiaosFilterChip(
                    label = tab.label,
                    selected = historyContentTab == tab,
                    onClick = {
                        historyContentTabValue = tab.name
                        if (tab == HistoryContentTab.STATS) {
                            managing = false
                            selectedIds.clear()
                        }
                    },
                    modifier = Modifier.weight(1f),
                    trailingIcon = null,
                )
            }
        }

        if (historyContentTab == HistoryContentTab.STATS) {
            HistoryStatisticsDashboard(records)
        } else {
            OutlinedTextField(
                value = query,
                onValueChange = {
                    query = it
                    historyPage = 1
                },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("搜索提示词、供应商或模型") },
                singleLine = true,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                HistorySourceFilter.entries.forEach { filter ->
                    val label = when (filter) {
                        HistorySourceFilter.ALL -> "全部"
                        HistorySourceFilter.QUICK -> "快速"
                        HistorySourceFilter.PROJECT -> "项目"
                    }
                    val selectSourceFilter = {
                        sourceFilterValue = filter.name
                        historyPage = 1
                        if (filter != HistorySourceFilter.PROJECT) projectFilterValue = null
                    }
                    MiaosFilterChip(
                        label = label,
                        selected = sourceFilter == filter,
                        onClick = selectSourceFilter,
                        modifier = Modifier.weight(1f),
                        trailingIcon = null,
                    )
                }
            }
            if (sourceFilter == HistorySourceFilter.PROJECT) {
                OutlinedButton(
                    onClick = { showProjectFilterPicker = true },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    val projectName = projects.firstOrNull { it.id == projectFilterId }?.name ?: "全部项目"
                    Text("项目：$projectName")
                }
            }
            if (managing) {
                Button(
                    enabled = selectedIds.isNotEmpty(),
                    onClick = { showBatchDeleteDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("删除已选 ${selectedIds.size} 条记录") }
            }
            status?.let { message ->
                MiaosCard { Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            if (filteredRecords.isEmpty()) {
                MiaosEmptyState(
                    presentation = historyEmptyStatePresentation(hasAnyRecords = records.isNotEmpty()),
                )
            }
            historyPageData.items.forEach { record ->
                MiaosCard {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Row(modifier = Modifier.weight(1f)) {
                            if (managing) {
                                Checkbox(
                                    checked = record.id in selectedIds,
                                    onCheckedChange = { checked ->
                                        if (checked) selectedIds.add(record.id) else selectedIds.remove(record.id)
                                    },
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text("${record.providerName} · ${record.modelId}", style = MaterialTheme.typography.titleMedium)
                                Text(formatTime(record.createdAt), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (!managing) TextButton(onClick = { deleteRecord = record }) { Text("删除") }
                    }
                    Text(record.prompt, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 8.dp))
                    Text("${record.ratio} · ${record.quality}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    historyProjectNavigationTarget(record)?.let { projectId ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text("项目版本记录", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                            if (!managing) {
                                TextButton(onClick = { onOpenProject(projectId) }) { Text("前往项目") }
                            }
                        }
                    }
                    BitmapFactory.decodeFile(record.imagePath)?.let { bitmap ->
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = "历史图片",
                            modifier = Modifier.fillMaxWidth().padding(top = 12.dp).sizeIn(maxHeight = 420.dp),
                        )
                        if (!managing) {
                            FlowRow(
                                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                                verticalArrangement = Arrangement.spacedBy(2.dp),
                            ) {
                                TextButton(onClick = {
                                    onRegenerate(GeneratePrefill(
                                        prompt = record.prompt,
                                        providerId = record.providerId,
                                        modelId = record.modelId,
                                        ratio = record.ratio,
                                        quality = record.quality,
                                    ))
                                }) { Text("再次生成") }
                                TextButton(onClick = {
                                    val clipboard = context.getSystemService(ClipboardManager::class.java)
                                    clipboard.setPrimaryClip(ClipData.newPlainText("妙生提示词", record.prompt))
                                    status = "已复制提示词"
                                }) { Text("复制提示词") }
                                TextButton(onClick = { previewRecord = record }) { Text("查看大图") }
                                TextButton(onClick = {
                                    try {
                                        ImageMediaActions.share(context, File(record.imagePath))
                                    } catch (error: Exception) {
                                        status = error.message ?: "无法分享图片"
                                    }
                                }) { Text("分享") }
                                TextButton(onClick = { requestSaveToGallery(record.imagePath) }) { Text("保存到相册") }
                            }
                        }
                    } ?: Text("图片文件已不存在", color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
                }
            }
            if (historyPageData.totalPages > 1) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    OutlinedButton(
                        onClick = { historyPage = historyPageData.page - 1 },
                        enabled = historyPageData.page > 1,
                    ) { Text("上一页") }
                    Text(
                        "第 ${historyPageData.page} / ${historyPageData.totalPages} 页 · ${historyPageData.totalCount} 条",
                        modifier = Modifier.padding(top = 12.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(
                        onClick = { historyPage = historyPageData.page + 1 },
                        enabled = historyPageData.page < historyPageData.totalPages,
                    ) { Text("下一页") }
                }
            }
        }
    }

    if (showProjectFilterPicker) {
        AlertDialog(
            onDismissRequest = { showProjectFilterPicker = false },
            title = { Text("筛选项目") },
            text = {
                Column(
                    modifier = Modifier.sizeIn(maxHeight = 420.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (projectFilterId == null) {
                        Button(onClick = { projectFilterValue = null; historyPage = 1; showProjectFilterPicker = false }, modifier = Modifier.fillMaxWidth()) { Text("全部项目") }
                    } else {
                        OutlinedButton(onClick = { projectFilterValue = null; historyPage = 1; showProjectFilterPicker = false }, modifier = Modifier.fillMaxWidth()) { Text("全部项目") }
                    }
                    projects.forEach { project ->
                        if (project.id == projectFilterId) {
                            Button(onClick = { }, modifier = Modifier.fillMaxWidth()) { Text(project.name) }
                        } else {
                            OutlinedButton(onClick = { projectFilterValue = project.id; historyPage = 1; showProjectFilterPicker = false }, modifier = Modifier.fillMaxWidth()) { Text(project.name) }
                        }
                    }
                    if (projects.isEmpty()) {
                        Text("当前没有可筛选的项目。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showProjectFilterPicker = false }) { Text("关闭") } },
        )
    }

    previewRecord?.let { record ->
        MiaosImagePreviewDialog(
            record = record,
            onDismiss = { previewRecord = null },
            onShare = {
                try {
                    ImageMediaActions.share(context, File(record.imagePath))
                } catch (error: Exception) {
                    status = error.message ?: "无法分享图片"
                }
            },
            onSave = { requestSaveToGallery(record.imagePath) },
        )
    }

    deleteRecord?.let { record ->
        AlertDialog(
            onDismissRequest = { deleteRecord = null },
            title = { Text("删除这条历史记录？") },
            text = { Text("可只移除数据库记录，或同时删除应用本地图片文件。") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.delete(record.id)
                        deleteRecord = null
                        status = "已移除历史记录，图片文件已保留"
                    }
                }) { Text("只删记录") }
            },
            dismissButton = {
                Row {
                    TextButton(onClick = {
                        scope.launch {
                            repository.delete(record.id)
                            withContext(Dispatchers.IO) { File(record.imagePath).delete() }
                            deleteRecord = null
                            status = "已删除历史记录和本地图片"
                        }
                    }) { Text("同时删图片") }
                    TextButton(onClick = { deleteRecord = null }) { Text("取消") }
                }
            },
        )
    }

    if (showBatchDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showBatchDeleteDialog = false },
            title = { Text("删除已选记录？") },
            text = { Text("将移除 ${selectedIds.size} 条历史数据库记录；图片文件保留在应用私有目录。") },
            confirmButton = {
                TextButton(onClick = {
                    val ids = selectedIds.toList()
                    scope.launch {
                        ids.forEach { repository.delete(it) }
                        selectedIds.clear()
                        showBatchDeleteDialog = false
                        managing = false
                        status = "已移除 ${ids.size} 条历史记录"
                    }
                }) { Text("确认删除") }
            },
            dismissButton = { TextButton(onClick = { showBatchDeleteDialog = false }) { Text("取消") } },
        )
    }
}


@Composable
private fun HistoryStatisticsDashboard(records: List<GeneratedImageEntity>) {
    val statistics = remember(records) { buildHistoryStatistics(records) }
    MiaosCard {
        Text("本地创作概览", style = MaterialTheme.typography.titleMedium)
        Text("数据仅来自当前设备中的生成历史。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(modifier = Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HistoryStatisticMetric("累计产出", "${statistics.totalCount} 张", Modifier.weight(1f))
            HistoryStatisticMetric("近 7 天", "${statistics.last7DaysCount} 张", Modifier.weight(1f))
        }
        Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            HistoryStatisticMetric("快速生图", "${statistics.quickSharePercent}%", Modifier.weight(1f))
            HistoryStatisticMetric("使用模型", "${statistics.modelCount} 个", Modifier.weight(1f))
        }
    }
    MiaosCard {
        Text("近 30 日创作趋势", style = MaterialTheme.typography.titleMedium)
        val peak = statistics.peakActivity
        Text(
            if (peak == null) "近 30 天暂无生成记录。" else "峰值 ${formatHistoryDay(peak.timestamp)} · ${peak.count} 张",
            modifier = Modifier.padding(top = 6.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HistoryTrendChart(statistics.trend, modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
        Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("30 天前", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("今天", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    MiaosCard {
        Text("近 15 周活跃热力图", style = MaterialTheme.typography.titleMedium)
        Text("颜色越深表示当天生成越多；数据仅在本机统计。", modifier = Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        HistoryHeatmapChart(statistics.heatmap, modifier = Modifier.fillMaxWidth().padding(top = 14.dp))
        Row(modifier = Modifier.fillMaxWidth().padding(top = 5.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("15 周前", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("今天所在周", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    MiaosCard {
        Text("来源构成", style = MaterialTheme.typography.titleMedium)
        Text("快速生图 ${statistics.quickCount} 张 · 项目版本 ${statistics.projectCount} 张", modifier = Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    MiaosCard {
        Text("模型使用排行", style = MaterialTheme.typography.titleMedium)
        if (statistics.topModels.isEmpty()) {
            Text("暂无模型使用数据。", modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            statistics.topModels.forEachIndexed { index, model ->
                Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${index + 1}. ${model.label}", modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Text("${model.count} 张", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
    MiaosCard {
        Text("高频提示词", style = MaterialTheme.typography.titleMedium)
        Text("仅显示本机历史中的前 5 条，不会上传。", modifier = Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (statistics.topPrompts.isEmpty()) {
            Text("暂无提示词使用数据。", modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            statistics.topPrompts.forEachIndexed { index, prompt ->
                Row(modifier = Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("${index + 1}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                    Text(prompt.text, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                    Text("${prompt.count} 次", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@Composable
private fun HistoryTrendChart(records: List<HistoryDailyActivity>, modifier: Modifier = Modifier) {
    val primary = MaterialTheme.colorScheme.primary
    val muted = MaterialTheme.colorScheme.outlineVariant
    Canvas(modifier = modifier.sizeIn(minHeight = 92.dp, maxHeight = 92.dp)) {
        val maxCount = records.maxOfOrNull { it.count }?.coerceAtLeast(1) ?: 1
        val spacing = 3.dp.toPx()
        val barWidth = ((size.width - spacing * (records.size - 1)) / records.size).coerceAtLeast(2.dp.toPx())
        records.forEachIndexed { index, record ->
            val height = if (record.count == 0) 4.dp.toPx() else (size.height * record.count / maxCount).coerceAtLeast(8.dp.toPx())
            val x = index * (barWidth + spacing)
            val y = size.height - height
            drawRoundRect(
                color = if (record.count == 0) muted.copy(alpha = 0.55f) else primary.copy(alpha = 0.88f),
                topLeft = Offset(x, y),
                size = Size(barWidth, height),
                cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx()),
            )
        }
    }
}

@Composable
private fun HistoryHeatmapChart(records: List<HistoryHeatmapDay>, modifier: Modifier = Modifier) {
    val primary = MaterialTheme.colorScheme.primary
    val muted = MaterialTheme.colorScheme.outlineVariant
    Canvas(modifier = modifier.sizeIn(minHeight = 104.dp, maxHeight = 104.dp)) {
        val columns = (records.size / 7).coerceAtLeast(1)
        val gap = 3.dp.toPx()
        val cellWidth = ((size.width - gap * (columns - 1)) / columns).coerceAtLeast(3.dp.toPx())
        val cellHeight = ((size.height - gap * 6) / 7).coerceAtLeast(3.dp.toPx())
        records.forEachIndexed { index, record ->
            val column = index / 7
            val row = index % 7
            val alpha = when (record.level) {
                0 -> 0.5f
                1 -> 0.2f
                2 -> 0.4f
                3 -> 0.62f
                else -> 0.9f
            }
            drawRoundRect(
                color = if (record.level == 0) muted.copy(alpha = alpha) else primary.copy(alpha = alpha),
                topLeft = Offset(column * (cellWidth + gap), row * (cellHeight + gap)),
                size = Size(cellWidth, cellHeight),
                cornerRadius = CornerRadius(3.dp.toPx(), 3.dp.toPx()),
            )
        }
    }
}

@Composable
private fun HistoryStatisticMetric(label: String, value: String, modifier: Modifier = Modifier) {
    MiaosCard(modifier = modifier, contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, modifier = Modifier.padding(top = 4.dp), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
    }
}

private fun formatHistoryDay(value: Long): String = SimpleDateFormat("M/d", Locale.getDefault()).format(Date(value))

private fun formatTime(value: Long): String = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(value))
