# 原生 Android 第一阶段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不部署服务端的前提下，新增一个完整原生 Android 客户端，并让 macOS 端通过加密配置文件和局域网二维码配对向 Android 安全迁移配置。

**Architecture:** Android 使用 Kotlin、Jetpack Compose、Room、WorkManager 和 Android Keystore；供应商请求由 Android 直接发往 Grsai、Aiping 或 OpenAI 兼容端点。macOS 保留现有 Electron 架构，仅新增跨平台配置信封、加密导出和一次性局域网配对能力；两端共享版本化的 `.miaos` 配置格式。

**Tech Stack:** Kotlin、Android Gradle Plugin、Jetpack Compose、Room、WorkManager、Android Keystore、Electron 43、原生 ES Module、Node `crypto` / Web Crypto、Node test runner。

## Global Constraints

- 永远使用中文注释、文档、用户可见文案和错误提示。
- 前端依赖使用 pnpm，不新增 npm 安装命令。
- Android 端必须是原生 Kotlin，不使用 Capacitor、Flutter 或 React Native。
- 第一阶段不部署服务端、不使用 S3 同步、不代理生图请求。
- API Key 不得写入日志、明文配置导出文件或 Android 普通数据库字段。
- 现有 macOS 功能和未涉及的工作区改动保持兼容。
- 所有新增跨平台格式必须带版本号，并为未来字段扩展保留兼容策略。

## 文件结构与职责

- Create: `docs/android-native-phase1.md` — Android 第一阶段范围、构建要求和手动验收清单。
- Create: `docs/protocol/miaos-config-v1.md` — `.miaos` 加密配置格式、字段白名单和配对协议。
- Create: `src/js/config-transfer.js` — 纯业务模块，负责配置白名单、加密信封和解密校验。
- Modify: `src/js/state-schema.js` — 提供去除密钥后的配置快照和导入归一化接口。
- Modify: `src/js/pages/settings.js` — 增加加密配置导出、导入和局域网配对入口。
- Modify: `preload.js` — 暴露受限的配置文件和局域网配对 API。
- Modify: `main.js` — 实现文件选择/保存、临时局域网配对服务和请求校验。
- Create: `tests/config-transfer.test.mjs` — 配置白名单、加密信封和错误密码测试。
- Create: `android/settings.gradle.kts` — Android 工程设置。
- Create: `android/build.gradle.kts` — 根构建配置。
- Create: `android/gradle.properties` — Android 构建属性。
- Create: `android/app/build.gradle.kts` — Android 应用模块配置。
- Create: `android/app/src/main/AndroidManifest.xml` — 权限与应用声明。
- Create: `android/app/src/main/java/com/miaos/android/...` — Kotlin 分层代码。
- Create: `android/app/src/test/...` — JVM 单元测试。

## Task 1: 固化跨平台配置协议

- [ ] 阅读现有 state schema、secrets vault 和设置页字段，列出可迁移字段白名单。
- [ ] 编写协议文档，定义 `format`、`version`、KDF、AES-GCM、salt、iv、payload 和校验失败行为。
- [ ] 明确 `.miaos` 默认只迁移供应商、模型启用状态、文本模型配置、默认参数和主题，不迁移图片缓存与日志。
- [ ] 设计未来兼容规则：未知字段忽略、未知版本拒绝并提示升级。

## Task 2: macOS 加密配置导出基础

- [ ] 先为配置快照和加密信封写 Node 单元测试。
- [ ] 实现纯模块 `src/js/config-transfer.js`，使用 Node `crypto` 或 Web Crypto 生成随机 salt/iv 并使用 AES-256-GCM。
- [ ] 接入设置页导出按钮，通过 IPC 保存 `.miaos` 文件。
- [ ] 验证导出的文件不含明文 API Key，错误密码不可解密，重复导出使用不同 salt/iv。

## Task 3: Android 工程骨架与安全存储

- [ ] 创建 Kotlin Android 工程、Compose 入口、导航壳和中文基础文案。
- [ ] 创建 Room entities、DAO、数据库迁移版本和 Repository 接口。
- [ ] 实现 Android Keystore 加密存储 provider secret。
- [ ] 先写 JVM 测试验证配置解密、API Key 写入/读取和错误密码处理。
- [ ] 在具备 Android SDK 的环境运行 `./gradlew test` 和 `./gradlew assembleDebug`。

## Task 4: Android 供应商请求与生成队列

- [ ] 根据 macOS 现有供应商适配器提取统一的 Android `ImageProvider` 接口。
- [ ] 实现 Grsai、Aiping、OpenAI 兼容请求、图片 URL/Base64 落盘和错误映射。
- [ ] 实现串行任务队列和 WorkManager 恢复。
- [ ] 添加请求层和队列层 JVM 测试。

## Task 5: Android 功能页面

- [ ] 实现快速生图页面和配置选择器。
- [ ] 实现项目列表、项目详情、版本树和分支派生。
- [ ] 实现历史记录、图片详情、大图预览、相册保存和系统分享。
- [ ] 实现供应商配置、模型拉取、提示词优化和设置页。
- [ ] 在真机或模拟器覆盖返回键、旋转、后台切换和无权限场景。

## Task 6: 配置文件导入与局域网二维码配对

- [ ] Android 实现 `.miaos` 文件选择、解密、预览和导入确认。
- [ ] macOS 实现一次性局域网配对服务和二维码生成。
- [ ] Android 实现扫码、局域网发现、设备确认码和加密配置接收。
- [ ] 配对成功后自动关闭 macOS 临时服务并撤销一次性 token。
- [ ] 覆盖同 Wi-Fi、错误 token、过期 token、错误密码、中途断网和重复导入。

## Task 7: 集成验证

- [ ] 运行现有 macOS 测试：`pnpm test`。
- [ ] 运行 Android JVM 测试和 debug 构建。
- [ ] 手动验证 macOS → `.miaos` → Android 的配置迁移闭环。
- [ ] 手动验证 Android 直接请求真实供应商时日志不泄露 API Key。
- [ ] 记录当前机器缺失 Android SDK 或真机时无法完成的验证项，不冒充通过。
