# Android P3 正式内部发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可重复、不可调试、可校验的 Android 内部发布流程，生成签名 APK/AAB，并通过 GitHub Actions 和真机矩阵交付测试版本。

**Architecture:** Gradle 从本机或 CI Secret 读取签名配置，仓库不保存 keystore 和密码；手动 GitHub Actions 接收版本号与发布说明，执行完整测试、构建签名产物、生成 SHA-256 并发布到 GitHub Release。应用内不增加第三方更新 SDK，测试用户通过发行页获取新版本。

**Tech Stack:** Gradle、Android signingConfig、GitHub Actions、GitHub Releases、pnpm、Android Emulator、ADB。

## Global Constraints

- 必须在 P0 和 P1 完成门槛通过后开始；P2 可独立决定是否先执行。
- keystore、store password、key alias、key password 不得提交到仓库。
- `versionName` 使用纯版本号或明确预发布后缀，例如 `0.2.0-beta.1`；GitHub tag 使用 `v0.2.0-beta.1`。
- `versionCode` 必须单调递增。
- Release 包必须 `debuggable=false`，不得使用 debug keystore。
- 发布任务必须运行 JVM 测试、Lint、Debug 构建和 API 36 仪器测试。
- 每个任务遵循测试先行，并以独立中文提交结束。

---

### Task 1: 建立版本参数和签名边界

**Files:**
- Modify: `android/app/build.gradle.kts`
- Modify: `android/gradle.properties`
- Modify: `.gitignore`
- Create: `android/signing.properties.example`
- Create: `android/app/src/test/java/com/miaos/android/ReleaseConfigurationTest.kt`

**Interfaces:**
- Consumes: Gradle properties `MIAOS_VERSION_CODE`、`MIAOS_VERSION_NAME` 和签名属性。
- Produces: 参数化 release 构建。

- [ ] **Step 1: 写发布配置失败测试**

测试读取 Gradle 文件并断言版本来自 Gradle property、release 启用签名且未引用 debug signing config。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*ReleaseConfigurationTest'`

Expected: FAIL，当前版本仍写死且 release 未配置签名。

- [ ] **Step 3: 参数化版本**

```kotlin
versionCode = providers.gradleProperty("MIAOS_VERSION_CODE").orNull?.toInt() ?: 1
versionName = providers.gradleProperty("MIAOS_VERSION_NAME").orNull ?: "0.1.0-dev"
```

- [ ] **Step 4: 配置 release 签名**

从未跟踪的 `android/signing.properties` 或 CI 环境变量读取 keystore 路径与密码。缺少签名配置时 `assembleRelease` 必须明确失败，不得回退 debug keystore。

- [ ] **Step 5: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*ReleaseConfigurationTest' assembleDebug`

Expected: PASS。

```bash
git add android/app/build.gradle.kts android/gradle.properties android/signing.properties.example .gitignore android/app/src/test/java/com/miaos/android/ReleaseConfigurationTest.kt
git commit -m "build: 建立安卓版本和签名配置"
```

### Task 2: 增加 Android 手动发布工作流

**Files:**
- Create: `.github/workflows/release-android.yml`
- Create: `tests/android-release-workflow.test.cjs`

**Interfaces:**
- Produces: `workflow_dispatch` 输入 `version`、`version_code`、`release_notes`、`prerelease`。

- [ ] **Step 1: 写工作流失败测试**

测试解析 YAML 文本并断言：

- tag 使用 `v${version}`。
- Gradle `versionName` 使用不带 `v` 的版本。
- workflow 设置 `GH_REPO: ${{ github.repository }}`。
- 发布 job 下载构建 artifact，不依赖隐式 `.git` 推断。
- APK、AAB、SHA-256 和发布说明均上传。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/android-release-workflow.test.cjs`

Expected: FAIL，工作流不存在。

- [ ] **Step 3: 实现 workflow_dispatch 校验**

版本必须匹配：

```text
^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$
```

`version_code` 必须为正整数。工作流不得自动修改仓库版本文件或创建版本提交。

- [ ] **Step 4: 构建和发布**

构建 job 执行 pnpm 测试、Android JVM 测试、Lint、Debug 构建、API 36 仪器测试和签名 release APK/AAB。发布 job 下载 artifact，验证 SHA-256 后创建或更新对应 GitHub Release。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/android-release-workflow.test.cjs`

Expected: PASS。

```bash
git add .github/workflows/release-android.yml tests/android-release-workflow.test.cjs
git commit -m "ci: 增加安卓手动发布流程"
```

### Task 3: 增加 release 包静态验证

**Files:**
- Create: `scripts/verify-android-release.sh`
- Create: `tests/android-release-verifier.test.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm android:verify-release -- <apk-path> <expected-version>`。

- [ ] **Step 1: 写验证器失败测试**

使用 fixture 路径和伪造 `apkanalyzer` 输出，断言验证器检查包名、版本、debuggable、minSdk、targetSdk、签名证书和 SHA-256。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/android-release-verifier.test.cjs`

Expected: FAIL，验证脚本不存在。

- [ ] **Step 3: 实现验证脚本**

脚本必须检查：

- package 为 `com.miaos.android`。
- `versionName` 与输入一致。
- `versionCode` 为正整数。
- `minSdk=26`、`targetSdk=36`。
- manifest 不可调试。
- `apksigner verify --verbose --print-certs` 成功。
- 输出 SHA-256。

- [ ] **Step 4: 接入 pnpm 与 CI**

在 `package.json` 增加 `android:verify-release`，发布工作流构建后必须调用它。

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/android-release-verifier.test.cjs`

Expected: PASS。

```bash
git add scripts/verify-android-release.sh tests/android-release-verifier.test.cjs package.json .github/workflows/release-android.yml
git commit -m "build: 增加安卓发布包校验"
```

### Task 4: 建立真机发布矩阵

**Files:**
- Create: `docs/android/android-release-acceptance-template.md`
- Create: `docs/android/android-device-matrix.md`
- Modify: `docs/android-native-phase1-audit.md`

**Interfaces:**
- Produces: 每个版本可复制的验收记录模板。

- [ ] **Step 1: 定义最低设备矩阵**

至少包含：

- Android 8/9：存储权限、相册保存、系统分享。
- Android 12：后台任务、通知、进程恢复。
- Android 13/14：通知权限、照片选择器、分享 URI。
- Android 15/16：目标 SDK 行为、边到边布局、系统返回行为。

- [ ] **Step 2: 定义每台设备必测路径**

首装、内置供应商配置、文生图、图生图、后台、锁屏、断网、失败详情、项目派生、历史分页、大图预览、相册保存、分享和升级安装。

- [ ] **Step 3: 记录不可替代边界**

模拟器通过不能替代真机摄像头扫码、OEM 后台限制、系统相册、系统分享和真实供应商。

- [ ] **Step 4: 提交模板**

```bash
git add docs/android/android-release-acceptance-template.md docs/android/android-device-matrix.md docs/android-native-phase1-audit.md
git commit -m "docs: 增加安卓真机发布验收矩阵"
```

### Task 5: 生成首个签名内部测试版本

**Files:**
- Modify: `docs/android/android-device-matrix.md`
- Modify: `README.md`

- [ ] **Step 1: 在本地安全生成或配置 release keystore**

keystore 保存在仓库外；把证书 SHA-256 指纹记录到私有发布凭据管理位置，不写入公开日志中的密码或路径。

- [ ] **Step 2: 本地预验证 release**

```bash
cd android
./gradlew clean testDebugUnitTest lintDebug assembleDebug bundleRelease assembleRelease \
  -PMIAOS_VERSION_NAME=0.2.0-beta.1 \
  -PMIAOS_VERSION_CODE=3
```

Run: `pnpm android:verify-release -- android/app/build/outputs/apk/release/app-release.apk 0.2.0-beta.1`

Expected: 全部成功。

- [ ] **Step 3: 执行 GitHub 手动发布**

输入：

```text
version: 0.2.0-beta.1
version_code: 3
prerelease: true
release_notes: Android 首个可用性整改内部测试版
```

- [ ] **Step 4: 下载远端产物复验**

验证 APK/AAB 哈希、签名证书、版本、安装和升级路径与本地产物一致。

- [ ] **Step 5: 完成真机矩阵并提交证据**

只有实际执行过的设备标记通过；其他设备保持未验证。

```bash
git add docs/android/android-device-matrix.md README.md
git commit -m "release: 记录安卓内部测试版本"
```

## P3 完成门槛

- Release APK/AAB 使用非 debug 签名且不可调试。
- 版本号和 versionCode 由手动发布参数明确控制。
- GitHub Actions 完成测试、构建、验证、哈希和 Release 发布。
- 远端下载产物可安装并通过升级验证。
- 真机矩阵如实区分已验证与未验证设备。
- 发布过程不暴露 keystore、密码或 API Key。
