package com.miaos.android

data class MiaosNavigationItem(
    val label: String,
    val icon: String,
)

/** Android 端直接映射 macOS 的五个核心工作区。 */
fun miaosNavigationItems(): List<MiaosNavigationItem> = listOf(
    MiaosNavigationItem("生图", "auto_awesome"),
    MiaosNavigationItem("项目", "folder"),
    MiaosNavigationItem("历史", "image"),
    MiaosNavigationItem("供应商", "dns"),
    MiaosNavigationItem("设置", "settings"),
)

data class MiaosBackNavigation(
    val selectedTab: Int,
    val projectIdToOpen: String?,
    val clearProjectMode: Boolean,
)

/** 系统返回键优先返回项目上下文，而不是直接退出应用。 */
fun resolveBackNavigation(
    selectedTab: Int,
    openedProjectId: String?,
    projectTargetProjectId: String?,
): MiaosBackNavigation? {
    if (selectedTab == 0 && !projectTargetProjectId.isNullOrBlank()) {
        return MiaosBackNavigation(
            selectedTab = 1,
            projectIdToOpen = projectTargetProjectId,
            clearProjectMode = true,
        )
    }
    if (selectedTab == 1 && !openedProjectId.isNullOrBlank()) {
        return MiaosBackNavigation(
            selectedTab = 1,
            projectIdToOpen = null,
            clearProjectMode = false,
        )
    }
    return null
}
