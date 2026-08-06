package com.miaos.android.ui

import com.miaos.android.data.database.GeneratedImageEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class HistoryStatisticsTest {
    @Test
    fun `本地统计生成15周活跃热力图并按峰值分级`() {
        val records = buildList {
            repeat(2) { index ->
                add(image("today-$index", "model-a", now - index * 1_000L, projectId = null))
            }
            repeat(5) { index ->
                add(image("active-$index", "model-b", daysBefore(now, 90) - index * 1_000L, projectId = "project_1"))
            }
        }

        val result = buildHistoryStatistics(records, now)

        assertEquals(15 * 7, result.heatmap.size)
        assertEquals(7, result.heatmap.sumOf { it.count })
        assertEquals(4, result.heatmap.maxOf { it.level })
        assertEquals(5, result.heatmap.first { it.count == 5 }.count)
        assertEquals(4, result.heatmap.first { it.count == 5 }.level)
        assertEquals(2, result.heatmap.first { it.count == 2 }.level)
    }

    @Test
    fun `本地统计生成30日趋势并提取高频提示词`() {
        val records = listOf(
            image("today-a", "model-a", now - 1_000L, projectId = null, prompt = "月光下的白猫"),
            image("today-b", "model-a", now - 2_000L, projectId = null, prompt = "月光下的白猫"),
            image("three-days", "model-b", daysBefore(now, 3), projectId = "project_1", prompt = "城市雨夜霓虹"),
            image("old", "model-c", daysBefore(now, 31), projectId = null, prompt = "旧历史提示词"),
        )

        val result = buildHistoryStatistics(records, now)

        assertEquals(30, result.trend.size)
        assertEquals(2, result.trend.last().count)
        assertEquals(1, result.trend[result.trend.lastIndex - 3].count)
        assertEquals(3, result.last7DaysCount)
        assertEquals(result.trend.last().timestamp, result.peakActivity?.timestamp)
        assertEquals(2, result.peakActivity?.count)
        assertEquals("月光下的白猫", result.topPrompts.first().text)
        assertEquals(2, result.topPrompts.first().count)
    }

    @Test
    fun `本地统计汇总总量近期活跃来源和模型排行`() {
        val records = listOf(
            image("a", "model-a", now - 1_000L, projectId = null),
            image("b", "model-b", now - eightDays, projectId = "project_1"),
            image("c", "model-a", now - 2_000L, projectId = "project_2"),
        )

        val result = buildHistoryStatistics(records, now)

        assertEquals(3, result.totalCount)
        assertEquals(2, result.last7DaysCount)
        assertEquals(1, result.quickCount)
        assertEquals(2, result.projectCount)
        assertEquals(33, result.quickSharePercent)
        assertEquals(2, result.modelCount)
        assertEquals("测试供应商 · model-a", result.topModels.first().label)
        assertEquals(2, result.topModels.first().count)
    }

    private fun image(
        id: String,
        modelId: String,
        createdAt: Long,
        projectId: String?,
        prompt: String = "提示词",
    ) = GeneratedImageEntity(
        id = id,
        providerId = "p_1",
        providerName = "测试供应商",
        modelId = modelId,
        prompt = prompt,
        ratio = "1:1",
        quality = "高清",
        imagePath = "/tmp/$id.png",
        createdAt = createdAt,
        projectId = projectId,
    )

    private fun daysBefore(timestamp: Long, days: Int): Long = timestamp - days * 24L * 60 * 60 * 1000

    private companion object {
        const val now = 1_000_000_000L
        const val eightDays = 8L * 24 * 60 * 60 * 1000
    }
}
