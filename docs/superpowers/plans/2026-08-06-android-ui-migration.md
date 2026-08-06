# Android macOS UI 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持现有 Android 功能不变的前提下，把 macOS 客户端的页面层级、卡片、输入控件、工具栏、空态和操作反馈迁移到原生 Jetpack Compose Android 客户端。

**Architecture:** 保留现有页面状态、Repository、WorkManager 和配置迁移逻辑；新增一组可复用的 Miaos Compose 视觉组件，把 macOS 的浅灰工作区、白色圆角卡片、紫色选中态、紧凑圆形工具按钮和页面标题层级集中实现。移动端继续使用底部导航，桌面端的侧栏信息架构映射为同一组导航项。

**Tech Stack:** Kotlin、Jetpack Compose、Material 3、AndroidX、现有 Room/WorkManager。

## Global Constraints

- 永远使用中文注释、文档和用户可见文案。
- Android 使用 Kotlin + Jetpack Compose，不引入跨端 UI 框架。
- 保留现有业务逻辑、密钥存储、配置导入和生图队列行为。
- 不把 API Key 写入日志、普通数据库字段或截图。
- 不删除已有 APK、文档或未涉及的工作区修改。
- 每个 UI 改动必须通过 JVM 单元测试、Lint 和 Debug 构建验证。

---

### Task 1: 建立 macOS 风格 Compose 视觉基础

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/ui/components/MiaosPage.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/components/MiaosSurface.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/theme/Theme.kt`
- Modify: `android/app/src/main/java/com/miaos/android/MainActivity.kt`

- [ ] 增加统一页面容器、页面标题、紧凑工具按钮和胶囊选择器，使用现有主题色和 macOS 页面结构。
- [ ] 将主壳层背景、底部导航和页面内容的间距收口，确保窄屏不会发生横向溢出。
- [ ] 保留设置入口和导航返回行为，运行 `./gradlew testDebugUnitTest` 验证现有导航测试。

### Task 2: 收口项目与历史页面

**Files:**
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectsScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectDetailScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/HistoryScreen.kt`
- Create: `android/app/src/test/java/com/miaos/android/ui/MacStylePagePresentationTest.kt`

- [ ] 将项目列表、项目详情、历史查询和统计页面改为统一标题区、搜索/筛选工具区、白色卡片和空态。
- [ ] 不删除创建项目、删除项目、版本树、派生分支、图片预览/保存/分享、历史分页和批量管理。
- [ ] 用纯函数测试页面标题和筛选标签的稳定文案与状态映射。

### Task 3: 收口供应商与设置页面

**Files:**
- Modify: `android/app/src/main/java/com/miaos/android/ui/SettingsScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/components/MiaosEmptyState.kt`

- [ ] 将供应商配置、默认模型、主题、配置迁移、配对确认和关于信息分组为 macOS 风格设置卡片。
- [ ] 保留导入、二维码扫描、密码确认、模型拉取、连接测试和删除供应商等全部操作。
- [ ] 确保敏感字段仍使用密码输入和 Keystore，不改变任何安全边界。

### Task 4: 回归验证并生成测试包

**Files:**
- Modify: `docs/android-native-phase1-audit.md`

- [ ] 运行 `pnpm test`。
- [ ] 在 `/opt/homebrew/share/android-commandlinetools` 下运行 `lintDebug`、`testDebugUnitTest`、`assembleDebug`。
- [ ] 安装到当前模拟器，至少截图验证生图、项目、历史、供应商/设置四个入口。
- [ ] 生成 `release/miaos-android-0.1.0-dev44.apk` 并记录 SHA-256。
