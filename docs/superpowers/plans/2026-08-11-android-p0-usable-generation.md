# Android P0 真实可用生图闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让全新安装的 Android 客户端无需查阅文档即可配置供应商，并使用真实供应商完成第一张文生图和图生图，同时具备可诊断的失败反馈。

**Architecture:** 保留现有 Room、WorkManager 和 Keystore；新增内置供应商预设、首装向导、验证后保存服务和统一失败模型。生成任务继续由 Worker 执行，但错误会先转为稳定公开模型，再写入 Room 和脱敏诊断日志。

**Tech Stack:** Kotlin、Jetpack Compose、Material 3、Room、WorkManager、Android Keystore、现有 `HttpURLConnection` 客户端。

## Global Constraints

- 永远使用中文注释、文档和用户可见文案。
- Android 继续使用 Kotlin + Jetpack Compose，不引入跨端 UI 框架。
- API Key 只保存在 Android Keystore，不写入 Room、日志、截图或测试 fixture。
- 已知供应商配置不得要求用户手工填写端点和模型 ID。
- 自定义供应商继续只允许 HTTPS，拒绝 URL 用户信息和片段。
- 真实供应商测试必须由用户授权输入 Key，不把 Key 放入 Gradle 参数或 shell 历史。
- 每个任务遵循测试先行，并以独立中文提交结束。

---

### Task 1: 固定 Android 可用性基线命令

**Files:**
- Modify: `package.json`
- Create: `docs/android/android-usability-baseline.md`
- Test: `tests/package-manager.test.cjs`

**Interfaces:**
- Consumes: 现有 `android/gradlew` 和 SDK 路径。
- Produces: `pnpm android:test`、`pnpm android:lint`、`pnpm android:assemble`、`pnpm android:connected-test`。

- [ ] **Step 1: 为根脚本写失败测试**

在 `tests/package-manager.test.cjs` 增加断言：

```js
assert.equal(pkg.scripts['android:test'], 'cd android && ./gradlew testDebugUnitTest');
assert.equal(pkg.scripts['android:lint'], 'cd android && ./gradlew lintDebug');
assert.equal(pkg.scripts['android:assemble'], 'cd android && ./gradlew assembleDebug');
assert.equal(pkg.scripts['android:connected-test'], 'cd android && ./gradlew connectedDebugAndroidTest');
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/package-manager.test.cjs`

Expected: FAIL，提示 Android 脚本不存在。

- [ ] **Step 3: 增加 pnpm Android 命令**

在 `package.json` 的 `scripts` 中增加：

```json
"android:test": "cd android && ./gradlew testDebugUnitTest",
"android:lint": "cd android && ./gradlew lintDebug",
"android:assemble": "cd android && ./gradlew assembleDebug",
"android:connected-test": "cd android && ./gradlew connectedDebugAndroidTest"
```

- [ ] **Step 4: 记录当前基线**

`docs/android/android-usability-baseline.md` 必须记录：84 个 JVM 测试、仪器测试列表、Lint 20 个警告、API 36 AVD、`0.1.0/versionCode 1`、dev46 APK 哈希和真实供应商未验证边界。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/package-manager.test.cjs`

Expected: PASS。

```bash
git add package.json tests/package-manager.test.cjs docs/android/android-usability-baseline.md
git commit -m "chore: 固定安卓可用性验证命令"
```

### Task 2: 建立内置供应商预设

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/data/ProviderPreset.kt`
- Create: `android/app/src/test/java/com/miaos/android/data/ProviderPresetTest.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/SettingsScreen.kt`

**Interfaces:**
- Produces: `ProviderPreset`、`builtinProviderPresets()`、`ProviderPreset.toProviderEntity(now)`。
- Consumes: `ProviderEntity`、现有模型 JSON 格式。

- [ ] **Step 1: 写预设失败测试**

```kotlin
@Test
fun 内置预设提供可直接使用的端点和启用模型() {
    val presets = builtinProviderPresets()
    val grsai = presets.single { it.type == "grsai" }
    val aiping = presets.single { it.type == "aiping" }

    assertEquals("https://grsaiapi.com/v1/api/generate", grsai.endpoint)
    assertEquals("https://aiping.cn/api/v1", aiping.endpoint)
    assertTrue(grsai.imageModels.any { it.enabled })
    assertTrue(aiping.imageModels.any { it.enabled })
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*ProviderPresetTest'`

Expected: FAIL，`builtinProviderPresets` 未定义。

- [ ] **Step 3: 实现预设模型**

```kotlin
data class ProviderPreset(
    val id: String,
    val name: String,
    val type: String,
    val endpoint: String,
    val imageModels: List<ProviderModelOption>,
    val textModels: List<ProviderModelOption>,
)

fun builtinProviderPresets(): List<ProviderPreset>

fun ProviderPreset.toProviderEntity(now: Long = System.currentTimeMillis()): ProviderEntity
```

只内置 Grsai 和 Aiping。Agnes AI 与 OpenAI 兼容继续走自定义配置，避免为不稳定端点写死错误默认值。

- [ ] **Step 4: 设置页新增“从预设添加”入口**

供应商页顶部提供 Grsai、Aiping 和“自定义供应商”三个入口。选择预设后锁定类型与端点，只允许输入名称覆盖、API Key 和模型启用状态。

- [ ] **Step 5: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*ProviderPresetTest'`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/data/ProviderPreset.kt android/app/src/main/java/com/miaos/android/ui/SettingsScreen.kt android/app/src/test/java/com/miaos/android/data/ProviderPresetTest.kt
git commit -m "feat: 增加安卓内置供应商预设"
```

### Task 3: 实现先验证再保存

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/data/ProviderSetupService.kt`
- Create: `android/app/src/test/java/com/miaos/android/data/ProviderSetupServiceTest.kt`
- Modify: `android/app/src/main/java/com/miaos/android/generation/ProviderConnectionClient.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/SettingsScreen.kt`

**Interfaces:**
- Consumes: `MiaosConfigRepository.saveProvider`、`MiaosSecretStore`、`ProviderConnectionClient.testConnection`。
- Produces: `ProviderSetupService.verifyAndSave(provider, apiKey)`、`ProviderVerification` 和 `ProviderSetupResult`。

- [ ] **Step 1: 写验证顺序失败测试**

```kotlin
@Test
fun 新密钥必须验证成功后才保存() = runTest {
    val calls = mutableListOf<String>()
    val service = ProviderSetupService(
        verify = { _, _ -> calls += "verify"; ProviderVerification.Success("连接成功") },
        save = { _, _ -> calls += "save" },
    )

    val result = service.verifyAndSave(providerFixture(), "secret")

    assertTrue(result is ProviderSetupResult.Saved)
    assertEquals(listOf("verify", "save"), calls)
}
```

同时覆盖验证失败时不保存、编辑且 Key 为空时保留旧密钥、验证异常不回显 Key。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*ProviderSetupServiceTest'`

Expected: FAIL，服务未定义。

- [ ] **Step 3: 实现设置服务**

```kotlin
sealed interface ProviderVerification {
    data class Success(val message: String) : ProviderVerification
    data class Rejected(val message: String) : ProviderVerification
}

sealed interface ProviderSetupResult {
    data class Saved(val message: String) : ProviderSetupResult
    data class Rejected(val message: String) : ProviderSetupResult
}

class ProviderSetupService(
    private val verify: suspend (ProviderEntity, String) -> ProviderVerification,
    private val save: suspend (ProviderEntity, String?) -> Unit,
) {
    suspend fun verifyAndSave(provider: ProviderEntity, apiKey: String?): ProviderSetupResult
}
```

新建供应商必须提供 Key。编辑供应商且不修改 Key 时允许保存元数据，但界面必须提示“未重新验证已有密钥”。

- [ ] **Step 4: 设置页接入验证状态**

保存按钮在验证期间禁用；状态显示“正在验证”“连接成功并已保存”或明确失败原因。不得先关闭弹窗再异步验证。

- [ ] **Step 5: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*ProviderSetupServiceTest' '*ProviderConnectionUrlTest'`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/data/ProviderSetupService.kt android/app/src/main/java/com/miaos/android/generation/ProviderConnectionClient.kt android/app/src/main/java/com/miaos/android/ui/SettingsScreen.kt android/app/src/test/java/com/miaos/android/data/ProviderSetupServiceTest.kt
git commit -m "feat: 安卓供应商验证成功后再保存"
```

### Task 4: 建立首装配置向导

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/ui/onboarding/FirstRunSetupScreen.kt`
- Create: `android/app/src/main/java/com/miaos/android/ui/onboarding/FirstRunSetupState.kt`
- Create: `android/app/src/test/java/com/miaos/android/ui/FirstRunSetupStateTest.kt`
- Modify: `android/app/src/main/java/com/miaos/android/MainActivity.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt`

**Interfaces:**
- Consumes: `builtinProviderPresets()`、`ProviderSetupService`、现有配置导入回调。
- Produces: `FirstRunSetupState`、`FirstRunSetupAction`、`FirstRunSetupScreen(onComplete, onImportConfig)`。

- [ ] **Step 1: 写状态机失败测试**

```kotlin
@Test
fun 首装向导只有验证保存后才能进入完成状态() {
    val initial = FirstRunSetupState.initial()
    val selected = reduceFirstRunSetup(initial, FirstRunSetupAction.SelectPreset("preset_grsai"))
    val verifying = reduceFirstRunSetup(selected, FirstRunSetupAction.Submit("secret"))
    val completed = reduceFirstRunSetup(verifying, FirstRunSetupAction.VerificationSucceeded("provider_grsai"))

    assertEquals(FirstRunSetupStep.CHOOSE_PROVIDER, initial.step)
    assertEquals(FirstRunSetupStep.ENTER_KEY, selected.step)
    assertEquals(FirstRunSetupStep.VERIFYING, verifying.step)
    assertEquals(FirstRunSetupStep.COMPLETE, completed.step)
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*FirstRunSetupStateTest'`

Expected: FAIL，首装状态不存在。

- [ ] **Step 3: 实现纯状态机**

```kotlin
enum class FirstRunSetupStep { CHOOSE_PROVIDER, ENTER_KEY, VERIFYING, COMPLETE }

data class FirstRunSetupState(
    val step: FirstRunSetupStep,
    val selectedPresetId: String? = null,
    val message: String? = null,
)

fun reduceFirstRunSetup(state: FirstRunSetupState, action: FirstRunSetupAction): FirstRunSetupState
```

- [ ] **Step 4: 实现向导页面**

页面顺序固定为：欢迎 → 选择 Grsai/Aiping/自定义/导入 → 输入 Key → 自动验证 → 完成并返回生图页。导入 `.miaos` 和扫码继续复用现有安全流程。

- [ ] **Step 5: 主壳接入首装路由**

`MainActivity` 根据 `providers.isEmpty()` 显示首装向导；不再让 `GenerateScreen` 同时承担首装说明和正常生图。向导完成后自动进入生图页并选中已保存供应商。

- [ ] **Step 6: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*FirstRunSetupStateTest'`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/MainActivity.kt android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt android/app/src/main/java/com/miaos/android/ui/onboarding android/app/src/test/java/com/miaos/android/ui/FirstRunSetupStateTest.kt
git commit -m "feat: 增加安卓首次使用配置向导"
```

### Task 5: 建立统一生成失败模型与数据库迁移

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/generation/GenerationFailure.kt`
- Create: `android/app/src/test/java/com/miaos/android/generation/GenerationFailureTest.kt`
- Modify: `android/app/src/main/java/com/miaos/android/data/database/MiaosDatabase.kt`
- Modify: `android/app/src/main/java/com/miaos/android/data/GenerationTaskRepository.kt`
- Modify: `android/app/src/main/java/com/miaos/android/generation/ImageGenerationClient.kt`
- Modify: `android/app/src/main/java/com/miaos/android/generation/GenerationTaskWorker.kt`
- Create: `android/app/schemas/com.miaos.android.data.database.MiaosDatabase/5.json`

**Interfaces:**
- Produces: `GenerationFailure`、`classifyGenerationFailure(error, stage, apiKey)`。
- Adds to `GenerationTaskEntity`: `errorCode`、`failureStage`、`diagnosticId`。

- [ ] **Step 1: 写错误分类失败测试**

```kotlin
@Test
fun http_429_映射为限流并保留诊断阶段() {
    val failure = classifyGenerationFailure(
        error = ImageGenerationHttpException(429, "upstream body"),
        stage = GenerationFailureStage.REQUEST,
        apiKey = "secret-key",
    )

    assertEquals("RATE_LIMITED", failure.code)
    assertEquals("供应商请求过于频繁，请稍后重试", failure.publicMessage)
    assertFalse(failure.diagnosticSummary.contains("secret-key"))
    assertFalse(failure.diagnosticSummary.contains("upstream body"))
}
```

覆盖 401、403、429、5xx、超时、断网、非法 JSON、图片下载和未知异常。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*GenerationFailureTest'`

Expected: FAIL，错误模型未定义。

- [ ] **Step 3: 实现公开错误模型**

```kotlin
enum class GenerationFailureStage { PREPARE, REQUEST, POLL, DOWNLOAD, PERSIST }

data class GenerationFailure(
    val code: String,
    val stage: GenerationFailureStage,
    val publicMessage: String,
    val diagnosticId: String,
    val diagnosticSummary: String,
)
```

- [ ] **Step 4: 增加 Room 4→5 迁移**

为 `generation_tasks` 增加三个可空文本列；旧失败任务保持可读。更新 schema 导出文件并增加迁移测试。

- [ ] **Step 5: Worker 写入结构化失败**

`markFailed` 接收 `GenerationFailure`，Room 中 `errorMessage` 只保存公开文案。Worker 不再直接持久化异常原文。

- [ ] **Step 6: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*GenerationFailureTest' '*GenerationTaskErrorTest'`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/generation/GenerationFailure.kt android/app/src/main/java/com/miaos/android/generation/ImageGenerationClient.kt android/app/src/main/java/com/miaos/android/generation/GenerationTaskWorker.kt android/app/src/main/java/com/miaos/android/data/database/MiaosDatabase.kt android/app/src/main/java/com/miaos/android/data/GenerationTaskRepository.kt android/app/src/test/java/com/miaos/android/generation/GenerationFailureTest.kt android/app/schemas/com.miaos.android.data.database.MiaosDatabase/5.json
git commit -m "feat: 增加安卓生成失败分类"
```

### Task 6: 增加脱敏诊断日志和失败详情

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/data/AndroidDiagnosticLog.kt`
- Create: `android/app/src/test/java/com/miaos/android/data/AndroidDiagnosticLogTest.kt`
- Create: `android/app/src/main/java/com/miaos/android/ui/GenerationFailureDialog.kt`
- Modify: `android/app/src/main/java/com/miaos/android/generation/GenerationTaskWorker.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/xml/miaos_file_paths.xml`

**Interfaces:**
- Produces: `AndroidDiagnosticLog.append(failure, task)`、`exportLatest(context)`、`GenerationFailureDialog`。

- [ ] **Step 1: 写日志脱敏失败测试**

```kotlin
@Test
fun 诊断日志不包含密钥和授权头() {
    val line = buildDiagnosticLogLine(
        failureFixture(diagnosticSummary = "Authorization: Bearer secret-token"),
        taskFixture(),
    )

    assertFalse(line.contains("secret-token"))
    assertTrue(line.contains("Bearer ***"))
    assertTrue(line.contains("diagnosticId"))
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*AndroidDiagnosticLogTest'`

Expected: FAIL，日志构造器不存在。

- [ ] **Step 3: 实现滚动诊断日志**

日志保存在 `files/diagnostics/`，单文件上限 512 KiB，最多保留 5 个文件。导出通过 `FileProvider` 分享纯文本，不请求存储权限。

- [ ] **Step 4: 实现失败详情弹窗**

弹窗显示：公开原因、建议操作、供应商、模型、比例、质量、失败阶段、诊断编号和“导出诊断信息”。不得显示 API Key、请求头或上游正文。

- [ ] **Step 5: 队列失败卡片接入详情入口**

失败任务卡新增“失败详情”；原有“重新加入队列”和“移除”保持不变。

- [ ] **Step 6: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*AndroidDiagnosticLogTest' '*GenerationTaskErrorTest'`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/data/AndroidDiagnosticLog.kt android/app/src/main/java/com/miaos/android/ui/GenerationFailureDialog.kt android/app/src/main/java/com/miaos/android/generation/GenerationTaskWorker.kt android/app/src/main/java/com/miaos/android/ui/GenerateScreen.kt android/app/src/main/AndroidManifest.xml android/app/src/main/res/xml/miaos_file_paths.xml android/app/src/test/java/com/miaos/android/data/AndroidDiagnosticLogTest.kt
git commit -m "feat: 增加安卓失败详情和诊断导出"
```

### Task 7: 完成真实供应商与真机 P0 验收

**Files:**
- Create: `docs/android/android-p0-device-acceptance.md`
- Modify: `docs/android-native-phase1-audit.md`
- Modify: `android/app/build.gradle.kts`

**Interfaces:**
- Consumes: 用户在应用内输入的真实 API Key。
- Produces: `0.2.0-dev1` Debug 测试包和逐项真机证据。

- [ ] **Step 1: 版本更新**

将 `versionName` 更新为 `0.2.0-dev1`，`versionCode` 更新为 `2`。不修改 release 签名配置。

- [ ] **Step 2: 运行全量自动验证**

```bash
pnpm test
pnpm android:test
pnpm android:lint
pnpm android:assemble
pnpm android:connected-test
```

Expected: 全部成功；Lint 可以保留已记录警告，但不得新增错误。

- [ ] **Step 3: 全新安装真机验收**

按以下顺序记录设备型号、Android 版本、供应商和结果：

1. 清除旧测试数据后安装测试包。
2. 从内置预设添加主要供应商。
3. 输入 Key，连接验证成功后保存。
4. 文生图生成 1 张。
5. 本地参考图完成图生图。
6. 切后台等待完成，再回到前台查看结果。
7. 保存到系统相册并打开确认。
8. 通过系统分享面板分享到一个已安装应用。
9. 分别制造错误 Key、断网、429 或供应商限流，检查失败详情和诊断导出。

- [ ] **Step 4: 生成测试包并记录哈希**

```bash
cp android/app/build/outputs/apk/debug/app-debug.apk release/miaos-android-0.2.0-dev1.apk
shasum -a 256 release/miaos-android-0.2.0-dev1.apk
```

- [ ] **Step 5: 更新审计结论并提交**

只有实际执行过的路径标记为完成。未测试的供应商和设备保持“待外部验收”。

```bash
git add android/app/build.gradle.kts docs/android/android-p0-device-acceptance.md docs/android-native-phase1-audit.md release/miaos-android-0.2.0-dev1.apk
git commit -m "test: 完成安卓真实生图闭环验收"
```

## P0 完成门槛

- 全新安装后两分钟内可以完成已知供应商配置。
- 至少一个真实供应商的文生图和图生图通过。
- 错误 Key、断网、限流和非法响应均有可执行反馈。
- 诊断文件不包含 API Key、Authorization 或完整上游正文。
- 真机后台完成、保存相册和系统分享通过。
- 生成 `0.2.0-dev1` 测试包并记录 SHA-256。
