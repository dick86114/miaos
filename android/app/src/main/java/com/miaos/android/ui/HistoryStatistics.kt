package com.miaos.android.ui

import com.miaos.android.data.database.GeneratedImageEntity
import java.util.Calendar
import kotlin.math.ceil
import kotlin.math.roundToInt

private const val historyTrendDays = 30
private const val historyHeatmapWeeks = 15
private const val historyHeatmapDays = historyHeatmapWeeks * 7

data class HistoryModelUsage(
    val label: String,
    val count: Int,
)

data class HistoryPromptUsage(
    val text: String,
    val count: Int,
)

data class HistoryDailyActivity(
    val timestamp: Long,
    val count: Int,
)

data class HistoryHeatmapDay(
    val timestamp: Long,
    val count: Int,
    val level: Int,
)

data class HistoryStatistics(
    val totalCount: Int,
    val last7DaysCount: Int,
    val quickCount: Int,
    val projectCount: Int,
    val quickSharePercent: Int,
    val modelCount: Int,
    val topModels: List<HistoryModelUsage>,
    val topPrompts: List<HistoryPromptUsage>,
    val trend: List<HistoryDailyActivity>,
    val peakActivity: HistoryDailyActivity?,
    val heatmap: List<HistoryHeatmapDay>,
)

/** 仅根据本机历史记录计算统计数据，不会发起网络请求或上传任何图片、提示词。 */
fun buildHistoryStatistics(
    records: List<GeneratedImageEntity>,
    now: Long = System.currentTimeMillis(),
): HistoryStatistics {
    val today = startOfLocalDay(now)
    val trendStart = localDayOffset(today, -(historyTrendDays - 1))
    val dailyCounts = records
        .groupingBy { startOfLocalDay(it.createdAt) }
        .eachCount()
    val trend = List(historyTrendDays) { index ->
        val timestamp = localDayOffset(trendStart, index)
        HistoryDailyActivity(timestamp = timestamp, count = dailyCounts[timestamp] ?: 0)
    }
    val heatmapStart = localDayOffset(startOfCurrentWeek(today), -(historyHeatmapWeeks - 1) * 7)
    val heatmapCounts = List(historyHeatmapDays) { index ->
        val timestamp = localDayOffset(heatmapStart, index)
        HistoryDailyActivity(timestamp = timestamp, count = dailyCounts[timestamp] ?: 0)
    }
    val heatmapMaxCount = heatmapCounts.maxOfOrNull { it.count } ?: 0
    val heatmap = heatmapCounts.map { item ->
        HistoryHeatmapDay(
            timestamp = item.timestamp,
            count = item.count,
            level = when {
                item.count == 0 || heatmapMaxCount == 0 -> 0
                else -> ceil(item.count.toDouble() / heatmapMaxCount * 4).toInt().coerceIn(1, 4)
            },
        )
    }
    val quickCount = records.count { it.projectId == null }
    val projectCount = records.size - quickCount
    val modelUsage = records
        .groupBy { "${it.providerName} · ${it.modelId}" }
        .map { (label, values) -> HistoryModelUsage(label, values.size) }
        .sortedWith(compareByDescending<HistoryModelUsage> { it.count }.thenBy { it.label })
    val promptUsage = records
        .mapNotNull { record -> record.prompt.trim().takeIf { it.isNotEmpty() } }
        .groupingBy { it }
        .eachCount()
        .map { (text, count) -> HistoryPromptUsage(text, count) }
        .sortedWith(compareByDescending<HistoryPromptUsage> { it.count }.thenBy { it.text })

    return HistoryStatistics(
        totalCount = records.size,
        last7DaysCount = trend.takeLast(7).sumOf { it.count },
        quickCount = quickCount,
        projectCount = projectCount,
        quickSharePercent = if (records.isEmpty()) 0 else ((quickCount * 100.0) / records.size).roundToInt(),
        modelCount = modelUsage.size,
        topModels = modelUsage.take(5),
        topPrompts = promptUsage.take(5),
        trend = trend,
        peakActivity = trend.maxByOrNull { it.count }?.takeIf { it.count > 0 },
        heatmap = heatmap,
    )
}

/** 将任意时间归一化为当前设备时区的自然日零点，避免近 30 日统计跨日偏移。 */
private fun startOfLocalDay(timestamp: Long): Long {
    val calendar = Calendar.getInstance().apply {
        timeInMillis = timestamp
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
    return calendar.timeInMillis
}

/** 使用日历日期增减而不是固定毫秒，兼容设备时区中的夏令时自然日。 */
private fun startOfCurrentWeek(timestamp: Long): Long {
    val calendar = Calendar.getInstance().apply {
        timeInMillis = timestamp
        add(Calendar.DATE, -((get(Calendar.DAY_OF_WEEK) + 5) % 7))
    }
    return calendar.timeInMillis
}

private fun localDayOffset(timestamp: Long, offset: Int): Long {
    val calendar = Calendar.getInstance().apply {
        timeInMillis = timestamp
        add(Calendar.DATE, offset)
    }
    return calendar.timeInMillis
}
