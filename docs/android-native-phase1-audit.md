# 原生 Android 第一阶段完成审计

审计日期：2026 年 8 月 6 日  
审计范围：`/Users/dickies/Documents/workspaces/miaos` 当前工作区，不包含未授权的真实供应商调用或用户未连接的真机环境。

## 判定口径

- **已完成（代码与自动化证据）**：实现、相关测试和本机构建均已存在。
- **已完成（模拟器/跨端证据）**：除代码与测试外，还在 API 36 模拟器或真实主机 HTTP 服务中运行过。
- **待外部验收**：必须依赖真实 Android 设备、同一 Wi-Fi、用户授权 API Key 或较低系统版本，当前环境不能诚实替代。

## 逐项审计

| 第一阶段目标 | 判定 | 当前证据 |
| --- | --- | --- |
| 版本化 `.miaos` 白名单协议、PBKDF2-HMAC-SHA256、AES-256-GCM、未知版本拒绝 | 已完成（代码与自动化证据） | `src/js/config-transfer.js`、`docs/protocol/miaos-config-v1.md`、`tests/config-transfer.test.mjs`、Android `MiaosConfigCryptoTest` / `MacosExportInteropTest` |
| macOS 加密配置导出，密钥只在主进程进入密文 payload | 已完成（代码与自动化证据） | `main.js` 的 `export-config` IPC、`preload.js`、`tests/main-startup.test.cjs`；测试验证导出文件不含明文密钥 |
| Android 原生 Compose 壳、Room、Keystore 加密密钥存储 | 已完成（模拟器/跨端证据） | `MainActivity.kt`、`MiaosDatabase.kt`、`MiaosSecretStore.kt`、`MiaosConfigRepositoryInstrumentedTest` |
| Grsai、Aiping、OpenAI 兼容、Agnes AI 请求适配与错误脱敏 | 已完成（代码与自动化证据） | `ImageRequestFactory.kt`、`ImageGenerationClient.kt`、`ImageRequestFactoryTest`、`ImageRequestFallbackExecutorTest`、`GenerationTaskErrorTest` |
| WorkManager 串行队列、恢复、重试、取消、终态移除 | 已完成（代码与自动化证据） | `GenerationTaskScheduler.kt`、`GenerationTaskWorker.kt`、队列/终态相关 JVM 与仪器测试 |
| 快速生图、项目、版本树、历史、统计、图片预览、分享、相册保存、供应商设置与提示词优化 | 已完成（模拟器/自动化证据） | `GenerateScreen.kt`、`ProjectsScreen.kt`、`ProjectDetailScreen.kt`、`HistoryScreen.kt`、`ImageMediaActions.kt`、`SettingsScreen.kt` 以及对应 38 个 JVM 测试、5 个仪器测试 |
| macOS `.miaos` → Android 文件导入、解密摘要、导入确认 | 已完成（模拟器/跨端证据） | `MiaosConfigImporter.kt`、`ConfigImportPreview.kt`、`MacosExportInteropInstrumentedTest`；API Key 导入后在 Keystore 中读取且不在 Room / 明文偏好中出现 |
| 局域网二维码一次性配对、确认短码、读取后撤销端口 | 已完成（模拟器/跨端证据） | `config-pairing.js`、`MiaosConfigPairingClient.kt`、`SettingsScreen.kt`、配对 Node 测试；主机服务与 API 36 模拟器经 `10.0.2.2` 实测，成功读取后端口拒绝后续连接 |
| macOS/Android 视觉对齐 | 已完成（模拟器视觉证据） | 共享浅灰画布、白色卡片、低对比描边、靛蓝强调；主题分段控件、配对确认短码卡片、统一空态卡片已在 API 36 模拟器截图检查 |

## 本机验证基线

截至 dev46：

```text
pnpm test                                      250 passed, 0 failed
android: lintDebug                             BUILD SUCCESSFUL
android: testDebugUnitTest                     BUILD SUCCESSFUL
android: assembleDebug                         BUILD SUCCESSFUL
android: connectedDebugAndroidTest             BUILD SUCCESSFUL
```

最新 Android 测试包：

```text
release/miaos-android-0.1.0-dev46.apk
SHA-256: 0ca9820c7440a2a1ca4aacddbf07de404b15729c9b6a86c93cd25d35a23e0424
```

## dev44 UI 迁移增量

- 新增 `MiaosPageHeader`、`MiaosPageColumn`、`MiaosFilterChip`、`MiaosRoundAction` 和 `MiaosResultPlaceholder`，统一 macOS 页面标题、工具栏胶囊、圆形动作按钮和结果占位区。
- 快速生图、项目、项目工作台、历史和设置页面改用统一标题区与页面留白；快速生图增加 macOS 风格结果占位区，提示词工具栏改为紧凑胶囊控件。
- 空态从 Unicode 字符改为 Material Extended 线性图标；历史页内容/来源筛选和设置页主题切换改为紧凑分段胶囊。
- 已在 API 36 模拟器启动并截图检查快速生图、设置、配置导入弹窗；真实供应商调用仍按上表列为外部验收。

## dev45 稳定性与 UI 增量

- 修复 Android ICU 不兼容原模型 JSON 正则的问题：此前在 Android 的配置导入摘要路径中，`\{([^{}]*)}` 会触发 `PatternSyntaxException` 并使应用退出；现在使用跨 Android/JVM 都可执行的字符类写法。
- 新增 `ProviderModelOptionInstrumentedTest`，在 API 36 真 Android Runtime 中覆盖导入模型 JSON 的解析，防止 JVM 单元测试未暴露的 ICU 差异回归。
- 供应商列表改为 macOS 风格的紧凑信息卡：类型标签、模型计数及编辑/模型管理/测试/拉取模型操作统一收口为可换行胶囊控件。
- 历史图片卡片的五项操作改为 `FlowRow`，避免窄屏横向挤压或被裁切。

## dev46 品牌与 SVG 资源增量

- Android 启动图标和 Android 12+ Splash Screen 已改为 macOS 同源的 `src/assets/logo.png`，通过自适应图标资源提供给 Launcher。
- 新增本地 Android VectorDrawable 插图和对应 SVG 源文件：生图、项目、历史、跨端迁移四类，不依赖网络或外部生图服务。
- 生图配置迁移引导使用产品 Logo 和跨端迁移插图；生成结果空态、项目/历史空态使用对应矢量插图。
- 设置页“应用与数据安全”区域增加产品 Logo；`MiaosIllustrationTest` 保护既有空态状态到产品插图的映射。

## 待外部验收：不应以当前环境伪称完成

1. **真实供应商直连**：使用用户授权的 Grsai、Aiping、OpenAI 兼容和 Agnes AI Key，覆盖文生图、图生图、提示词优化、模型拉取、HTTP 400 兼容回退，并检查日志/错误提示不泄露密钥。
2. **真机同 Wi-Fi 扫码配对**：从 macOS 扫描二维码，核对短码，验证取消、过期、重复扫描、首次读取后端口关闭和中途断网。
3. **Android 8/9 媒体权限与系统分享**：验证写入相册的运行时权限请求、拒绝权限后的提示、保存成功，以及目标应用的系统分享 URI 访问。
4. **真实长任务后台恢复**：真实供应商长耗时请求中切换后台/恢复前台，确认 WorkManager 和 Room 状态保持一致。

## 结论

第一阶段的本地代码、构建产物、自动化测试、模拟器 UI 和主机—模拟器配对闭环已具备交付条件；剩余项全部需要真实设备或用户授权的外部服务，不能在当前无凭据、无真机同 Wi-Fi 的环境中继续真实验证。
