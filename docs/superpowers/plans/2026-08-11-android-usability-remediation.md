# Android 可用性整改总实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按照严格阶段门槛，把当前 Android 开发样机推进为可真实生图、可日常使用、可迁移项目并可正式内部发布的原生客户端。

**Architecture:** 整改拆为四个边界清晰的子计划。P0 建立真实生图闭环；P1 解决图片性能、后台任务和 UI 回归；P3 在 P0/P1 后建立签名和 GitHub 内部发布；P2 通过独立加密项目包补齐显式跨端迁移，可在 P1 后独立安排，不阻塞首个稳定内部测试版。

**Tech Stack:** Kotlin、Jetpack Compose、Room、WorkManager、Android Keystore、Coil、Compose UI Test、Electron/Node.js、GitHub Actions。

## Global Constraints

- 永远使用中文注释、文档和用户可见文案。
- Android 继续使用原生 Kotlin + Jetpack Compose。
- 不引入账号、云同步、S3、支付或妙生业务服务端。
- API Key 不得进入 Room、日志、项目包、截图或测试 fixture。
- 自动化构建通过不能替代真实供应商和真实手机验收。
- 每个子计划必须单独完成、验证和评审，不并行修改相同 Android 核心文件。
- 工作分支默认使用 `codex/android-<phase>-<description>`。
- 每个任务使用小型中文提交，禁止把整个阶段压成一个无法审查的提交。

---

## 执行顺序

### Phase 0：真实可用生图闭环

Plan: `docs/superpowers/plans/2026-08-11-android-p0-usable-generation.md`

目标结果：

- 首装提供 Grsai/Aiping 内置预设和自定义供应商入口。
- 新 API Key 验证成功后才保存。
- 用户授权真实 Key 完成文生图和图生图。
- 失败具备稳定错误代码、失败阶段、诊断编号和脱敏日志导出。
- 生成 `0.2.0-dev1` 真机测试包。

- [ ] P0 Task 1：固定验证命令与基线。
- [ ] P0 Task 2：建立内置供应商预设。
- [ ] P0 Task 3：实现验证后保存。
- [ ] P0 Task 4：建立首装向导。
- [ ] P0 Task 5：统一生成失败模型和 Room 迁移。
- [ ] P0 Task 6：增加诊断日志与失败详情。
- [ ] P0 Task 7：完成真实供应商和真机验收。
- [ ] Gate P0：全新安装后两分钟内生成第一张真实图片。

### Phase 1：日常稳定性

Plan: `docs/superpowers/plans/2026-08-11-android-p1-daily-stability.md`

目标结果：

- Coil 异步缩略图替代同步原图解码。
- 项目、历史和队列使用惰性列表。
- 后台任务有通知，运行中任务可停止本地等待。
- 核心页面状态进入 ViewModel。
- 首装、队列、失败、项目和历史具备 Compose UI 自动化测试。

- [ ] P1 Task 1：建立统一异步图片组件。
- [ ] P1 Task 2：迁移所有生产图片加载。
- [ ] P1 Task 3：迁移主要列表到惰性容器。
- [ ] P1 Task 4：增加后台通知与运行中取消。
- [ ] P1 Task 5：抽离核心页面 ViewModel。
- [ ] P1 Task 6：增加 Compose UI 流程测试和固定性能验收。
- [ ] Gate P1：100 条历史和 30 张高分辨率图片可顺畅浏览，无崩溃或 ANR。

### Phase 2：显式跨端项目迁移（独立增强，不阻塞 Phase 3）

Plan: `docs/superpowers/plans/2026-08-11-android-p2-project-transfer.md`

目标结果：

- 新增独立 `.miaos-project` v1 协议。
- macOS 与 Android 可双向迁移单个项目、版本树和图片。
- 项目包流式加密，不包含 API Key 或绝对路径。
- 冲突导入为新项目，不覆盖本地数据。

- [ ] P2 Task 1：定义协议和跨端 fixture。
- [ ] P2 Task 2：实现 macOS 流式项目导出。
- [ ] P2 Task 3：实现 Android 安全解密与解包。
- [ ] P2 Task 4：实现 Android 项目事务导入。
- [ ] P2 Task 5：接入 Android 项目导入和导出界面。
- [ ] P2 Task 6：实现 macOS 项目包安全导入。
- [ ] P2 Task 7：完成双向跨端与 hostile fixture 验收。
- [ ] Gate P2：真实设备完成 macOS→Android→macOS 双向迁移，数据关系和图片哈希一致。

### Phase 3：正式内部发布

Plan: `docs/superpowers/plans/2026-08-11-android-p3-internal-release.md`

目标结果：

- Release APK/AAB 使用非 debug 签名并不可调试。
- 版本号、versionCode 和发布说明由手动工作流参数控制。
- GitHub Actions 自动执行测试、构建、验证、SHA-256 和 Release 发布。
- 完成 Android 8/9、12、13/14、15/16 的真实设备验收矩阵。

- [ ] P3 Task 1：建立版本参数和签名边界。
- [ ] P3 Task 2：增加 Android 手动发布工作流。
- [ ] P3 Task 3：增加 release 包静态验证。
- [ ] P3 Task 4：建立真机发布矩阵。
- [ ] P3 Task 5：生成首个签名内部测试版本。
- [ ] Gate P3：远端签名产物通过安装、升级、哈希和真机矩阵验证。

## 阶段评审规则

每个 Gate 必须输出一份证据摘要，至少包含：

1. 当前分支和 commit。
2. 执行过的测试命令及结果。
3. 模拟器型号和 Android API。
4. 真机型号和 Android 版本。
5. 使用的供应商类型和模型，不记录 API Key。
6. 成功路径截图或录屏。
7. 失败路径和诊断编号。
8. 尚未验证的设备、供应商或外部条件。

未满足 Gate 时，不开始下一阶段，也不通过增加无关功能来绕开阻塞问题。

## 推荐实施节奏

第一轮只执行 P0。P0 结束后先让真实用户连续使用测试包，再根据反馈进入 P1。P1 通过后优先执行 P3，发布首个稳定内部测试版；P2 作为独立跨端增强另开分支推进。P2 和 P3 都不与 P0/P1 并行，以免首装、生图、数据协议和发布系统同时变化导致问题无法定位。

执行每个子计划时，从独立分支开始，并使用该计划头部指定的 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 工作流逐任务推进。
