package com.miaos.android

import com.miaos.android.ui.GeneratePrefill
import java.nio.charset.StandardCharsets
import java.util.Base64

/** 需要跨配置变更保留的应用级导航上下文；不包含 API Key、图片内容或任务数据。 */
data class AppNavigationState(
    val selectedTab: Int = 0,
    val openedProjectId: String? = null,
    val projectGenerationTarget: ProjectGenerationTarget? = null,
    val quickGenerationPrefill: GeneratePrefill? = null,
)

data class ProjectGenerationTarget(
    val projectId: String,
    val versionId: String,
    val sourceImagePath: String?,
)

/** 历史记录跳转到项目工作台时，清理与目标项目无关的生成上下文。 */
fun openHistoryProjectNavigation(
    current: AppNavigationState,
    projectId: String,
): AppNavigationState {
    val normalizedProjectId = projectId.trim()
    require(normalizedProjectId.isNotEmpty()) { "项目标识不能为空" }
    return current.copy(
        selectedTab = 1,
        openedProjectId = normalizedProjectId,
        projectGenerationTarget = null,
        quickGenerationPrefill = null,
    )
}

/**
 * 使用单个 Base64URL 字符串写入 SavedState，避免 Android 对含多个 null 的列表状态在配置恢复时出现截断。
 * 内容仅为导航 ID、图片私有路径和再次生成的非敏感参数，不含 API Key 或图片字节。
 */
fun AppNavigationState.toSaveableValue(): String = listOf(
    selectedTab.toString(),
    openedProjectId,
    projectGenerationTarget?.projectId,
    projectGenerationTarget?.versionId,
    projectGenerationTarget?.sourceImagePath,
    quickGenerationPrefill?.prompt,
    quickGenerationPrefill?.providerId,
    quickGenerationPrefill?.modelId,
    quickGenerationPrefill?.ratio,
    quickGenerationPrefill?.quality,
).joinToString(navigationStateSeparator) { value ->
    value?.let(::encodeNavigationValue) ?: navigationStateNullMarker
}

/** 恢复失败时整体回退至首页，避免半截项目上下文或非法标签造成错误导航。 */
fun restoreAppNavigationState(savedValue: String): AppNavigationState {
    if (savedValue.length > maxNavigationStateLength) return AppNavigationState()
    val encodedValues = savedValue.split(navigationStateSeparator)
    if (encodedValues.size != navigationStateFieldCount) return AppNavigationState()
    val values = encodedValues.map { encoded ->
        if (encoded == navigationStateNullMarker) null else decodeNavigationValue(encoded)
    }
    if (encodedValues.zip(values).any { (encoded, value) -> encoded != navigationStateNullMarker && value == null }) {
        return AppNavigationState()
    }
    val selectedTab = values[0]?.toIntOrNull()?.takeIf { it in 0 until miaosNavigationTabCount }
        ?: return AppNavigationState()
    val projectTargetValues = values.subList(2, 5)
    val quickPrefillValues = values.subList(5, 10)
    if (!hasValidProjectGenerationTarget(projectTargetValues) || !hasValidQuickGenerationPrefill(quickPrefillValues)) {
        return AppNavigationState()
    }
    val projectTarget = restoreProjectGenerationTarget(projectTargetValues)
    val quickPrefill = restoreQuickGenerationPrefill(quickPrefillValues)
    return AppNavigationState(
        selectedTab = selectedTab,
        openedProjectId = values[1],
        projectGenerationTarget = projectTarget,
        quickGenerationPrefill = quickPrefill,
    )
}

private fun encodeNavigationValue(value: String): String = Base64.getUrlEncoder()
    .withoutPadding()
    .encodeToString(value.toByteArray(StandardCharsets.UTF_8))

private fun decodeNavigationValue(value: String): String? = runCatching {
    String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8)
}.getOrNull()

private fun hasValidProjectGenerationTarget(values: List<String?>): Boolean = values.all { it == null } || (
    values.getOrNull(0)?.isNotBlank() == true && values.getOrNull(1)?.isNotBlank() == true
)

private fun hasValidQuickGenerationPrefill(values: List<String?>): Boolean = values.all { it == null } || values.all { !it.isNullOrBlank() }

private fun restoreProjectGenerationTarget(values: List<String?>): ProjectGenerationTarget? {
    if (values.all { it == null }) return null
    val projectId = values.getOrNull(0)?.takeIf { it.isNotBlank() } ?: return null
    val versionId = values.getOrNull(1)?.takeIf { it.isNotBlank() } ?: return null
    return ProjectGenerationTarget(projectId, versionId, values.getOrNull(2))
}

private fun restoreQuickGenerationPrefill(values: List<String?>): GeneratePrefill? {
    if (values.all { it == null }) return null
    val prompt = values.getOrNull(0)?.takeIf { it.isNotBlank() } ?: return null
    val providerId = values.getOrNull(1)?.takeIf { it.isNotBlank() } ?: return null
    val modelId = values.getOrNull(2)?.takeIf { it.isNotBlank() } ?: return null
    val ratio = values.getOrNull(3)?.takeIf { it.isNotBlank() } ?: return null
    val quality = values.getOrNull(4)?.takeIf { it.isNotBlank() } ?: return null
    return GeneratePrefill(prompt, providerId, modelId, ratio, quality)
}

private const val navigationStateFieldCount = 10
private const val miaosNavigationTabCount = 5
private const val navigationStateSeparator = "|"
private const val navigationStateNullMarker = "-"
private const val maxNavigationStateLength = 16 * 1024
