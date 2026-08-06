package com.miaos.android.ui

/** 与 macOS 工作台空态一致的图标、标题、说明与可选主操作。 */
internal data class EmptyStatePresentation(
    val symbol: String,
    val title: String,
    val description: String,
    val actionLabel: String? = null,
)

internal fun projectEmptyStatePresentation(hasAnyProjects: Boolean): EmptyStatePresentation =
    if (hasAnyProjects) {
        EmptyStatePresentation(
            symbol = "⌕",
            title = "没有匹配的项目",
            description = "换个关键词搜索，或清除搜索条件后查看全部项目。",
        )
    } else {
        EmptyStatePresentation(
            symbol = "▧",
            title = "还没有项目",
            description = "新建一个项目，在同一主题下持续演进提示词和图片版本。",
            actionLabel = "新建项目",
        )
    }

internal fun historyEmptyStatePresentation(hasAnyRecords: Boolean): EmptyStatePresentation =
    if (hasAnyRecords) {
        EmptyStatePresentation(
            symbol = "⌕",
            title = "没有符合条件的记录",
            description = "调整搜索词或筛选条件后再试。",
        )
    } else {
        EmptyStatePresentation(
            symbol = "◷",
            title = "还没有生成记录",
            description = "成功生图后会自动保存在这里，仅保存在本机。",
        )
    }
