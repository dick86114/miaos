package com.miaos.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Dns
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.miaos.android.data.GenerationTaskRepository
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.generation.GenerationTaskScheduler
import com.miaos.android.ui.GenerateScreen
import com.miaos.android.ui.HistoryScreen
import com.miaos.android.ui.ProjectDetailScreen
import com.miaos.android.ui.ProjectsScreen
import com.miaos.android.ui.SettingsScreen
import com.miaos.android.ui.theme.MiaosTheme

class MainActivity : ComponentActivity() {
    private var navigationStateForRestore = AppNavigationState()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        navigationStateForRestore = savedInstanceState
            ?.getString(navigationStateBundleKey)
            ?.let(::restoreAppNavigationState)
            ?: AppNavigationState()
        setContent {
            val appContext = LocalContext.current.applicationContext
            val database = remember { MiaosDatabase.create(appContext) }
            val themeMode by database.preferenceDao().observeValue("themeMode").collectAsState(initial = null)
            MiaosTheme(themeMode = themeMode ?: "system") {
                val taskScheduler = remember {
                    GenerationTaskScheduler(appContext, GenerationTaskRepository(database))
                }
                LaunchedEffect(taskScheduler) {
                    taskScheduler.resumePendingTasks()
                }
                var navigationState by remember { mutableStateOf(navigationStateForRestore) }
                SideEffect { navigationStateForRestore = navigationState }
                val selectedTab = navigationState.selectedTab
                val openedProjectId = navigationState.openedProjectId
                val projectGenerationTarget = navigationState.projectGenerationTarget
                val quickGenerationPrefill = navigationState.quickGenerationPrefill
                val canNavigateBack = openedProjectId != null || (selectedTab == 0 && projectGenerationTarget != null)
                BackHandler(enabled = canNavigateBack) {
                    resolveBackNavigation(
                        selectedTab = selectedTab,
                        openedProjectId = openedProjectId,
                        projectTargetProjectId = projectGenerationTarget?.projectId,
                    )?.let { navigation ->
                        navigationState = navigationState.copy(
                            selectedTab = navigation.selectedTab,
                            openedProjectId = navigation.projectIdToOpen,
                            projectGenerationTarget = if (navigation.clearProjectMode) null else projectGenerationTarget,
                        )
                    }
                }
                val tabs = miaosNavigationItems()
                Scaffold(
                    bottomBar = {
                        NavigationBar(
                            containerColor = MaterialTheme.colorScheme.surface,
                            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        ) {
                            tabs.forEachIndexed { index, item ->
                                NavigationBarItem(
                                    selected = selectedTab == index,
                                    onClick = {
                                        navigationState = navigationState.copy(
                                            selectedTab = index,
                                            openedProjectId = if (index != 1) null else openedProjectId,
                                            projectGenerationTarget = if (index == 0) null else projectGenerationTarget,
                                            quickGenerationPrefill = if (index == 0) null else quickGenerationPrefill,
                                        )
                                    },
                                    icon = { MiaosNavigationIcon(item.icon) },
                                    label = { Text(item.label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = MaterialTheme.colorScheme.primary,
                                        selectedTextColor = MaterialTheme.colorScheme.primary,
                                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                    ),
                                )
                            }
                        }
                    },
                ) { paddingValues ->
                    Surface(modifier = Modifier.fillMaxSize().padding(paddingValues), color = MaterialTheme.colorScheme.background) {
                        when (selectedTab) {
                            0 -> GenerateScreen(
                                projectId = projectGenerationTarget?.projectId,
                                versionId = projectGenerationTarget?.versionId,
                                sourceImagePath = projectGenerationTarget?.sourceImagePath,
                                prefill = quickGenerationPrefill,
                                onPrefillApplied = { navigationState = navigationState.copy(quickGenerationPrefill = null) },
                                onExitProjectMode = { navigationState = navigationState.copy(projectGenerationTarget = null) },
                                onOpenSettings = { navigationState = navigationState.copy(selectedTab = 4) },
                            )
                            1 -> openedProjectId?.let { projectId ->
                                ProjectDetailScreen(
                                    projectId = projectId,
                                    onBack = { navigationState = navigationState.copy(openedProjectId = null) },
                                    onGenerate = { targetProjectId, targetVersionId, sourceImagePath ->
                                        navigationState = navigationState.copy(
                                            projectGenerationTarget = ProjectGenerationTarget(targetProjectId, targetVersionId, sourceImagePath),
                                            selectedTab = 0,
                                        )
                                    },
                                )
                            } ?: ProjectsScreen(onOpen = { navigationState = navigationState.copy(openedProjectId = it) })
                            2 -> HistoryScreen(
                                onRegenerate = { prefill ->
                                    navigationState = navigationState.copy(
                                        projectGenerationTarget = null,
                                        quickGenerationPrefill = prefill,
                                        selectedTab = 0,
                                    )
                                },
                                onOpenProject = { projectId ->
                                    navigationState = openHistoryProjectNavigation(navigationState, projectId)
                                },
                            )
                            3 -> SettingsScreen(providerOnly = true)
                            4 -> SettingsScreen()
                            else -> Column(
                                modifier = Modifier.fillMaxSize().padding(paddingValues).padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center,
                            ) {
                                Text("妙生", style = MaterialTheme.typography.headlineLarge)
                                Text("原生 Android 客户端 · ${tabs[selectedTab].label}")
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString(navigationStateBundleKey, navigationStateForRestore.toSaveableValue())
        super.onSaveInstanceState(outState)
    }
}

@Composable
private fun MiaosNavigationIcon(iconKey: String) {
    val imageVector: ImageVector = when (iconKey) {
        "auto_awesome" -> Icons.Outlined.AutoAwesome
        "folder" -> Icons.Outlined.Folder
        "image" -> Icons.Outlined.Image
        "dns" -> Icons.Outlined.Dns
        else -> Icons.Outlined.Settings
    }
    Icon(imageVector = imageVector, contentDescription = null)
}

private const val navigationStateBundleKey = "miaos.navigation-state.v1"
