# Android P1 日常稳定性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除高分辨率图片列表的主线程同步解码，补齐后台任务通知、运行中取消和核心 UI 自动化测试，使 Android 客户端能够承受日常项目与历史数据规模。

**Architecture:** 使用 Coil 统一缩略图和预览加载；列表迁移到 Compose 惰性容器；WorkManager 通过前台信息和通知暴露长任务状态；页面业务状态逐步移动到 ViewModel，Room 继续作为持久化事实来源。

**Tech Stack:** Kotlin、Jetpack Compose、Coil、Room、WorkManager、Lifecycle ViewModel、Compose UI Test。

## Global Constraints

- 必须在 P0 完成门槛全部通过后开始。
- 不改变供应商请求协议和密钥安全边界。
- 列表不得直接调用 `BitmapFactory.decodeFile()`。
- 缩略图不得按原始图片完整尺寸解码。
- 取消运行中任务只承诺停止本地等待与结果写入，不承诺撤销供应商远端任务。
- 性能验收使用固定数据集和相同模拟器配置，记录可复现证据。
- 每个任务遵循测试先行，并以独立中文提交结束。

---

### Task 1: 建立统一异步图片组件

**Files:**
- Modify: `android/app/build.gradle.kts`
- Create: `android/app/src/main/java/com/miaos/android/ui/components/MiaosGeneratedImage.kt`
- Create: `android/app/src/test/java/com/miaos/android/ui/GeneratedImageRequestTest.kt`

**Interfaces:**
- Produces: `GeneratedImageDisplayMode`、`generatedImageRequest(path, mode)`、`MiaosGeneratedImage(path, mode, modifier, contentDescription)`。

- [ ] **Step 1: 写图片请求失败测试**

```kotlin
@Test
fun 列表缩略图限制解码尺寸而预览允许更大尺寸() {
    assertEquals(IntSize(480, 480), generatedImageDecodeSize(GeneratedImageDisplayMode.THUMBNAIL))
    assertEquals(IntSize(1440, 1440), generatedImageDecodeSize(GeneratedImageDisplayMode.PREVIEW))
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*GeneratedImageRequestTest'`

Expected: FAIL，图片显示模式不存在。

- [ ] **Step 3: 增加 Coil 依赖**

在 `android/app/build.gradle.kts` 增加与当前 Compose 兼容的 Coil 3 Compose 依赖，并通过版本目录或单一常量固定版本，不在多个文件重复声明。

- [ ] **Step 4: 实现统一图片组件**

```kotlin
enum class GeneratedImageDisplayMode { THUMBNAIL, RESULT, PREVIEW }

@Composable
fun MiaosGeneratedImage(
    path: String,
    mode: GeneratedImageDisplayMode,
    modifier: Modifier = Modifier,
    contentDescription: String,
)
```

组件必须提供加载中、文件不存在和解码失败状态；缩略图使用裁切或适配由调用方明确选择，不隐藏布局尺寸变化。

- [ ] **Step 5: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*GeneratedImageRequestTest' lintDebug assembleDebug`

Expected: PASS，Lint 无新增图片加载错误。

```bash
git add android/app/build.gradle.kts android/app/src/main/java/com/miaos/android/ui/components/MiaosGeneratedImage.kt android/app/src/test/java/com/miaos/android/ui/GeneratedImageRequestTest.kt
git commit -m "perf: 增加安卓异步图片加载组件"
```

### Task 2: 迁移生图、项目和历史图片加载

**Files:**
- Modify: `android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectsScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectDetailScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/HistoryScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/ImageMediaActions.kt`
- Create: `android/app/src/androidTest/java/com/miaos/android/ui/GeneratedImageUiTest.kt`

**Interfaces:**
- Consumes: `MiaosGeneratedImage`。
- Produces: 所有列表和预览统一异步加载，不再同步解码。

- [ ] **Step 1: 写大图异步渲染失败测试**

在测试目录创建一张固定 6000×6000 图片，使用 Compose Test 渲染 `MiaosGeneratedImage`，断言加载中状态出现后图片节点成功显示且测试进程不发生主线程网络或磁盘 StrictMode 违规。测试结束删除临时图片。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew connectedDebugAndroidTest`

Expected: FAIL，统一图片组件尚未接入完整页面场景或语义标签缺失。

- [ ] **Step 3: 替换各页面图片加载**

- 生图最近结果使用 `RESULT`。
- 项目封面、版本图片和历史卡片使用 `THUMBNAIL`。
- 图片详情弹窗使用 `PREVIEW`。
- 分享和保存继续读取原文件，不从 Coil 缓存导出。

- [ ] **Step 4: 验证并提交**

Run: `cd android && ./gradlew connectedDebugAndroidTest lintDebug assembleDebug`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/ui android/app/src/androidTest/java/com/miaos/android/ui/GeneratedImageUiTest.kt
git commit -m "perf: 安卓页面改用异步缩略图"
```

### Task 3: 将主要列表迁移到惰性容器

**Files:**
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectsScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectDetailScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/HistoryScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt`
- Create: `android/app/src/test/java/com/miaos/android/ui/AndroidListWindowTest.kt`

**Interfaces:**
- Produces: `historyPageWindow`、`projectImageWindow` 等纯选择器；Compose 页面使用稳定 key。

- [ ] **Step 1: 写窗口和稳定 key 测试**

```kotlin
@Test
fun 历史页固定最多构建二十四条且使用记录ID作为稳定键() {
    val page = historyPageWindow(records = historyFixture(200), page = 2, pageSize = 24)
    assertEquals(24, page.items.size)
    assertEquals(page.items.map { it.id }.distinct().size, page.items.size)
}
```

- [ ] **Step 2: 运行测试确认失败或固定现有选择器行为**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*AndroidListWindowTest'`

Expected: 新增选择器前 FAIL；若复用现有分页选择器，则新增项目图片窗口断言必须先失败。

- [ ] **Step 3: 使用 LazyColumn/LazyVerticalGrid**

- 项目列表使用 `LazyColumn`。
- 项目图片使用 `LazyVerticalGrid` 或带稳定 key 的 `LazyColumn`。
- 历史卡片使用 `LazyColumn`，保留每页 24 条。
- 队列任务使用惰性列表并继续最多展示 8 条。
- 页面标题和筛选控件使用单独 `item`，不得嵌套同方向无限滚动容器。

- [ ] **Step 4: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*AndroidListWindowTest' '*HistoryPaginationTest' lintDebug assembleDebug`

Expected: PASS，Compose 不报告无限高度布局错误。

```bash
git add android/app/src/main/java/com/miaos/android/ui android/app/src/test/java/com/miaos/android/ui/AndroidListWindowTest.kt
git commit -m "perf: 安卓项目和历史改用惰性列表"
```

### Task 4: 增加后台通知与运行中取消

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/generation/GenerationNotification.kt`
- Create: `android/app/src/test/java/com/miaos/android/generation/GenerationNotificationTest.kt`
- Modify: `android/app/src/main/java/com/miaos/android/generation/GenerationTaskWorker.kt`
- Modify: `android/app/src/main/java/com/miaos/android/generation/GenerationTaskScheduler.kt`
- Modify: `android/app/src/main/java/com/miaos/android/data/GenerationTaskRepository.kt`
- Modify: `android/app/src/main/java/com/miaos/android/data/database/MiaosDatabase.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces: `GenerationNotificationFactory`、`cancel(taskId)`、运行中任务本地取消语义。

- [ ] **Step 1: 写通知和取消状态测试**

```kotlin
@Test
fun 运行中任务允许本地取消但提示远端可能继续() {
    val action = generationTaskQueueActions(GenerationTaskStatus.RUNNING)
    assertTrue(action.canCancel)
    assertEquals("停止本地等待；供应商端任务可能仍继续", runningCancellationNotice())
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*GenerationNotificationTest' '*GenerationTaskQueueActionsTest'`

Expected: FAIL，运行中任务当前不能取消。

- [ ] **Step 3: 实现通知渠道和 ForegroundInfo**

通知显示提示词摘要、供应商、模型和当前阶段，不显示 API Key。Worker 开始时调用 `setForeground`，结束或取消后更新通知。

- [ ] **Step 4: 实现本地取消**

`GenerationTaskScheduler.cancel(taskId)` 必须：

1. 将 queued/running 状态更新为 canceled。
2. `cancelAllWorkByTag("miaos-generation-task-$taskId")`。
3. Worker 在保存图片前继续检查 Room 状态，已取消时删除临时结果并跳过历史写入。

- [ ] **Step 5: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*GenerationNotificationTest' '*GenerationTaskQueueActionsTest' '*GenerationTaskRecordTest' lintDebug assembleDebug`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/generation android/app/src/main/java/com/miaos/android/data android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt android/app/src/main/AndroidManifest.xml android/app/src/test/java/com/miaos/android/generation
git commit -m "feat: 增加安卓后台任务通知和取消"
```

### Task 5: 抽离核心页面 ViewModel

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/ui/generate/GenerateViewModel.kt`
- Create: `android/app/src/main/java/com/miaos/android/ui/history/HistoryViewModel.kt`
- Create: `android/app/src/main/java/com/miaos/android/ui/projects/ProjectsViewModel.kt`
- Create: `android/app/src/main/java/com/miaos/android/ui/settings/SettingsViewModel.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/HistoryScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectsScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/SettingsScreen.kt`
- Create: `android/app/src/test/java/com/miaos/android/ui/generate/GenerateViewModelTest.kt`

**Interfaces:**
- Produces: 每页不可变 `UiState` 和单向 `onAction`。
- Consumes: 现有 Repository、Scheduler、客户端和纯选择器。

- [ ] **Step 1: 从生图页写 ViewModel 失败测试**

```kotlin
@Test
fun 配置变化后草稿保留且项目上下文只应用一次() = runTest {
    val viewModel = createGenerateViewModel()
    viewModel.onAction(GenerateAction.PromptChanged("用户草稿"))
    viewModel.onProjectContextLoaded(projectContextFixture(prompt = "版本提示词"))
    viewModel.onProjectContextLoaded(projectContextFixture(prompt = "旧提示词"))

    assertEquals("用户草稿", viewModel.state.value.prompt)
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*GenerateViewModelTest'`

Expected: FAIL，ViewModel 未定义。

- [ ] **Step 3: 依次抽离页面状态**

先抽离 Generate，再抽离 History、Projects、Settings。Composable 只负责渲染状态、触发 Action 和系统 ActivityResult；数据库 Flow、网络调用和状态文案由 ViewModel 管理。

- [ ] **Step 4: 保持导航状态边界**

`MainActivity` 继续拥有顶层导航；项目详情目标和历史再生成参数通过现有 `AppNavigationState` 传递，不把导航对象注入 Repository。

- [ ] **Step 5: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest lintDebug assembleDebug`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/ui android/app/src/test/java/com/miaos/android/ui
git commit -m "refactor: 抽离安卓核心页面状态"
```

### Task 6: 增加 Compose 核心流程测试与性能验收

**Files:**
- Modify: `android/app/build.gradle.kts`
- Create: `android/app/src/androidTest/java/com/miaos/android/ui/FirstRunSetupScreenTest.kt`
- Create: `android/app/src/androidTest/java/com/miaos/android/ui/GenerateQueueScreenTest.kt`
- Create: `android/app/src/androidTest/java/com/miaos/android/ui/ProjectHistoryNavigationTest.kt`
- Create: `android/app/src/androidTest/java/com/miaos/android/ui/GenerationFailureDialogTest.kt`
- Create: `docs/android/android-p1-performance-acceptance.md`

**Interfaces:**
- Consumes: 页面语义标签和可注入 ViewModel fixture。
- Produces: 首装、队列、失败、项目/历史导航的真实 Compose UI 回归。

- [ ] **Step 1: 增加 Compose UI 测试依赖**

加入 `ui-test-junit4` 和 debug manifest/test tooling，保持依赖版本与 Compose BOM 一致。

- [ ] **Step 2: 编写首装流程测试**

使用无真实 Key 的假验证器：选择 Grsai → 输入测试 Key → 点击验证 → 显示完成 → 进入生图页面。断言测试 Key 不出现在语义树之外的状态文本中。

- [ ] **Step 3: 编写队列和失败详情测试**

注入 queued/running/failed 数据，验证取消、重试、失败详情和诊断编号入口。

- [ ] **Step 4: 编写项目/历史导航测试**

验证项目图片进入项目详情、历史再次生成预填、系统返回键恢复上下文。

- [ ] **Step 5: 建立固定性能数据集**

在 API 36 模拟器生成：100 条历史元数据、30 张固定测试图片、10 个项目、40 个版本。记录冷启动、进入历史、滚动首屏和打开预览时是否出现崩溃、ANR 或明显空白。

- [ ] **Step 6: 运行完整验证并提交**

```bash
pnpm test
pnpm android:test
pnpm android:lint
pnpm android:assemble
pnpm android:connected-test
```

Expected: 全部成功，固定数据集滚动无崩溃或 ANR。

```bash
git add android/app/build.gradle.kts android/app/src/androidTest/java/com/miaos/android/ui docs/android/android-p1-performance-acceptance.md
git commit -m "test: 增加安卓核心界面和性能验收"
```

## P1 完成门槛

- 生产 UI 文件中没有列表级 `BitmapFactory.decodeFile()`。
- 项目、历史和队列使用惰性容器与稳定 key。
- 100 条历史、30 张高分辨率图片数据集可正常滚动和预览。
- 长任务有通知，运行中任务可停止本地等待。
- 首装、队列、失败详情、项目和历史具备 Compose UI 自动化测试。
- 真机覆盖后台、锁屏、断网、恢复和取消行为。
