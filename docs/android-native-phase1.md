# 原生 Android 第一阶段

第一阶段目标是完整复刻 macOS 版核心能力，但不部署服务端、不使用 S3、不代理生图请求。

## 构建前置条件

- Android Studio 或 Android SDK
- JDK 17
- Android SDK Platform 36
- Android SDK Build Tools 36
- Gradle Wrapper（提交到仓库）

## 本地运行

```bash
cd android
./gradlew test
./gradlew assembleDebug
```

## 手动验收重点

1. Android 能直接调用 Grsai、Aiping 和 OpenAI 兼容接口。
2. API Key 保存在 Android Keystore 保护的存储中，日志和 Room 普通字段不出现明文。
3. macOS 导出 `.miaos` 后，Android 能输入密码导入。
4. 错误密码、篡改文件、未知版本均被拒绝。
5. macOS 与 Android 在同一 Wi-Fi 下可以通过二维码配对。
6. 配对 token 过期、重复使用、取消和断网均能安全失败。
7. 生成任务在切后台后保持状态，完成后可查看历史和项目版本。

## 当前开发包（2026 年 8 月 5 日）

`release/miaos-android-0.1.0-dev19.apk` 包含本轮 macOS 风格 UI 调整：

- 生图页改为提示词创作面板，参考图、随机提示词、提示词优化、供应商、模型、比例、质量和数量都在面板内就近操作。
- 比例和质量选择器会保留历史记录或外部配置带入的自定义值，不会被预设选项覆盖。
- 没有供应商时提供“前往配置迁移”入口，直接跳转到设置页。
- 底部导航增加独立的“供应商”工作区，和 macOS 的生图、项目、历史、供应商、设置五个核心入口对应。
- 统一卡片使用无阴影圆角面板，保留浅色/深色主题和品牌靛蓝选中态。

本轮已验证：

```text
pnpm test                         245 passed, 0 failed
android: lintDebug                BUILD SUCCESSFUL
android: testDebugUnitTest       BUILD SUCCESSFUL
android: assembleDebug            BUILD SUCCESSFUL
android: connectedDebugAndroidTest BUILD SUCCESSFUL
```

APK SHA-256：

```text
530c24ef65b5e73ff6f5420547c10987e6b8040750b7a2b28e5b97b9795d30a3
```

## 当前开发包（2026 年 8 月 5 日，dev21）

`release/miaos-android-0.1.0-dev21.apk` 还包含以下安全与兼容性修正：

- 供应商端点在导入和手动保存前统一校验：只接受 HTTPS、拒绝 URL 用户信息、片段和超长地址，避免把类似 `https://密钥@example.com` 的内容写入本地配置。
- 导入配置时只把已有供应商对应的密钥写入 Android Keystore，忽略孤立密钥条目。
- 配置解密密码和供应商 API Key 输入框使用密码掩码和密码键盘。
- 修复 Android Keystore AES-GCM 加密：IV 改由 Keystore/Cipher 生成，兼容 Android API 36 的 `Caller-provided IV not permitted` 约束；密文格式仍保持 `iv.ciphertext`，旧格式可继续解密。
- 新增真实 Android Runtime 导入测试，验证 API Key 可从 Keystore 读回且不出现在 Room、模型 JSON 或明文 SharedPreferences 中。

dev21 SHA-256：

```text
90163bacde5f3cfbc19adbacc43dc2f540a1472a6bdf951a0227496de3437565
```

## 当前开发包（2026 年 8 月 5 日，dev22）

`release/miaos-android-0.1.0-dev22.apk` 还包含系统返回键导航修正：

- 从项目内生图页面按系统返回键，会返回当前项目详情，不会直接退出应用。
- 从项目详情按返回键，会回到项目列表。
- 生图、历史、供应商和设置等普通工作区仍交给系统默认返回行为。
- 返回导航规则已通过 JVM 单元测试固定，应用冷启动和模拟器回归正常。

dev22 SHA-256：

```text
5b3075ad1155529bca50177e95582fc07c97a18949819e521273b362f9c769a8
```

## 当前开发包（2026 年 8 月 5 日，dev23）

`release/miaos-android-0.1.0-dev23.apk` 补齐 macOS 端的独立文本模型配置能力：

- 新增供应商时不再强制填写图像模型；只配置文本模型的 OpenAI 兼容供应商也可以保存。
- 图像模型和文本模型都为空时仍会拒绝保存，避免无效供应商。
- 保存时 `capabilities` 会根据实际模型类别写入 `image` / `text`，不再把文本专用供应商错误标记为图像供应商。
- 文本专用供应商可作为默认文本模型，用于“优化提示词”；生图页仍只展示启用的图像模型。

dev23 SHA-256：

```text
f4aade5919432e88a47648a66b3a766ac6a653c106336c07d8ed9eb401aa3232
```

## 当前开发包（2026 年 8 月 5 日，dev24）

`release/miaos-android-0.1.0-dev24.apk` 补齐加密配置导入确认流程：

- 文件导入或二维码配对下载后，先输入导出密码解密，但不会立即写入 Room 或 Android Keystore。
- 解密成功后显示 macOS 风格的确认摘要：供应商列表、每个供应商启用的图像/文本模型数量、主题偏好和将迁移的 API Key 数量。
- 摘要绝不展示 API Key 内容；用户点击“确认导入”后才执行落盘。
- 密码错误会在密码弹窗中就地显示；解密用的 `CharArray` 在完成后会被清零。

dev24 SHA-256：

```text
ca97e890ba7eebcb943fe140d1882d511b2af5a17e96b073dcbdf10e4c889bdd
```

## 当前开发包（2026 年 8 月 5 日，dev25）

`release/miaos-android-0.1.0-dev25.apk` 新增了与 macOS 历史页对应的本地统计分析入口：

- 历史页可在“历史记录 / 统计分析”两种内容之间切换，统计数据始终从当前设备的 Room 历史记录即时计算。
- 本地创作概览显示累计产出、近 7 天、快速生图占比和已使用模型数；来源构成区分快速生图与项目版本。
- 显示前 5 个模型使用排行；无历史数据时使用明确的零值与空态，不将用户引导到网络请求。
- API Key、图片文件和提示词均不会因统计功能离开设备。

已在 API 36 模拟器实际检查统计页无数据布局、标签切换和底部导航安全区；自动回归结果：

```text
pnpm test                          245 passed, 0 failed
android: lintDebug                 BUILD SUCCESSFUL
android: testDebugUnitTest         BUILD SUCCESSFUL
android: assembleDebug             BUILD SUCCESSFUL
android: connectedDebugAndroidTest BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
```

dev25 SHA-256：

```text
16cf6eaf6fa516561d434a07d46e01b4cab51f113e36c3c31e813604a6574889
```

## 当前开发包（2026 年 8 月 5 日，dev26）

`release/miaos-android-0.1.0-dev26.apk` 继续补齐 macOS 历史统计的核心内容：

- 新增近 30 日本地创作趋势柱图，按设备当前时区的自然日归档；日期偏移使用日历计算，避免夏令时地区出现统计跨日偏移。
- 趋势卡片显示近 30 天峰值日期与张数，无记录时保留低对比趋势刻度与明确空态。
- 新增前 5 条高频提示词排行；长提示词最多显示两行，所有内容仅在本机历史记录中计算和呈现，不会上传。
- 统计数据单元测试覆盖 30 日趋势、近 7 天汇总、峰值和高频提示词，继续保留总量、来源与模型排行回归。

本轮已验证：

```text
android: HistoryStatisticsTest      BUILD SUCCESSFUL
android: lintDebug                  BUILD SUCCESSFUL
android: testDebugUnitTest          BUILD SUCCESSFUL
android: assembleDebug              BUILD SUCCESSFUL
android: connectedDebugAndroidTest BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
```

已在 API 36 模拟器安装 dev26，实际检查统计分析页的趋势与提示词空态、滚动和底部导航安全区。

dev26 SHA-256：

```text
6a9c58a21c1547a616bc8511c6f36410ca1c0855ac54b86ab3c15cb7ba780fe9
```

## 仍需真实设备验收的边界

以下路径需要使用真实 API Key 或真实同一 Wi‑Fi 环境，不以模拟器构建成功替代：

1. 使用真实 Grsai、Aiping、OpenAI 兼容端点直接生图，并检查请求日志与错误提示不泄露 API Key。
2. macOS 与 Android 真机在同一局域网下扫码配对，覆盖过期 token、重复扫描、取消和中途断网。
3. Android 8/9 设备上的相册写入权限、系统分享，以及后台恢复行为。

## 当前开发包（2026 年 8 月 5 日，dev27）

`release/miaos-android-0.1.0-dev27.apk` 补齐 macOS 历史统计中的本地活跃热力图：

- 新增 15 周 × 7 天的本地创作热力图，按每周从周一到周日排列；颜色由浅至深表示同一自然日的生成数量。
- 与 30 日趋势一样，热力图按设备时区和日历日期计算，避免跨时区或夏令时导致一日统计被拆分。
- 最大活跃日固定为第 4 级色阶，其他有记录日期按峰值比例映射到第 1–3 级；无数据仍显示低对比网格，不会产生误导性网络加载状态。
- 单元测试覆盖 105 个自然日、记录数量汇总和峰值/比例色阶；所有统计保持本地计算，不读取 API Key，也不上传图片或提示词。

本轮已验证：

```text
android: HistoryStatisticsTest      BUILD SUCCESSFUL
android: lintDebug                  BUILD SUCCESSFUL
android: testDebugUnitTest          BUILD SUCCESSFUL
android: assembleDebug              BUILD SUCCESSFUL
android: connectedDebugAndroidTest BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
```

已在 API 36 模拟器安装 dev27，实际检查热力图无数据状态、15 × 7 网格密度、滚动和底部导航安全区。

dev27 SHA-256：

```text
65dfe409426591d73f630370f30e3c789a205ad8648daf2913366c53a68c85ca
```

## 当前开发包（2026 年 8 月 5 日，dev28）

`release/miaos-android-0.1.0-dev28.apk` 修复了第一阶段验收中“旋转”覆盖发现的状态恢复缺口：

- 旋转设备时，当前底部工作区会保持不变；项目详情、项目内生图目标以及从历史页“再次生成”带入的预填参数也会随 Activity 状态恢复。
- 快速生图草稿中的供应商、模型、提示词、比例、质量、数量和参考图 URI 使用可保存状态，避免单纯配置变更丢失正在编辑的内容。
- 应用级导航状态由 Android `Bundle` 保存为单个 Base64URL 字符串；仅包含导航 ID、私有图片路径和非敏感生成参数，**不包含 API Key、图片字节或 Room 数据**。
- 损坏、截断或非法标签的恢复数据会整体安全回到首页，避免半截项目上下文导致错误导航。

本轮审计与验证：

```text
android: AppNavigationStateTest      BUILD SUCCESSFUL
android: lintDebug                   BUILD SUCCESSFUL
android: testDebugUnitTest           BUILD SUCCESSFUL
android: assembleDebug               BUILD SUCCESSFUL
android: connectedDebugAndroidTest  BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                             245 passed, 0 failed
```

已在 API 36 模拟器实际执行：进入“历史”工作区 → 强制切换横屏 → 再切回纵屏。两次配置变化后均仍停留在历史页，横屏布局、底部导航和历史筛选控件正常。

dev28 SHA-256：

```text
86c2e5ec4a7d1f796c49a96484f0d7928bc062d615316ab0ce3adfe9a4815928
```

## 当前开发包（2026 年 8 月 5 日，dev29）

`release/miaos-android-0.1.0-dev29.apk` 继续补齐配置变化下的本地创作体验：

- 修复历史页筛选状态在旋转后丢失的问题；搜索关键词、来源筛选和“历史记录 / 统计分析”标签现在使用可保存状态。
- 对历史页的来源筛选与内容标签增加安全恢复逻辑：只接受当前已知枚举，旧版本或损坏状态会分别回退到“全部”和“历史记录”。
- 额外在 API 36 模拟器中使用无 API Key 的临时供应商与系统照片选择器验证：快速生图草稿的提示词、参考图 URI、供应商/模型默认选择会在横竖屏切换后保留。临时供应商、测试图片和本地文件均已在回归前清理。

本轮已验证：

```text
android: HistoryScreenStateTest     BUILD SUCCESSFUL
android: lintDebug                  BUILD SUCCESSFUL
android: testDebugUnitTest          BUILD SUCCESSFUL
android: assembleDebug              BUILD SUCCESSFUL
android: connectedDebugAndroidTest BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                            245 passed, 0 failed
```

模拟器实际覆盖：

```text
快速生图草稿 + 系统照片选择器 → 横屏 → 纵屏：提示词与参考图仍存在
历史搜索关键词 → 横屏 → 纵屏：关键词仍存在
统计分析标签 → 横屏：仍停留在统计分析内容
```

dev29 SHA-256：

```text
7eb5a84bee6b2af4aa05dff6bdfd4c7b37834c88e4c2423584fe0fc8d4bdba48
```

## 当前开发包（2026 年 8 月 5 日，dev30）

`release/miaos-android-0.1.0-dev30.apk` 修复 Android 与 macOS 在 Agnes AI 图生图请求上的协议差异：

- Agnes AI 无参考图时继续使用文生图协议：顶层 `n` 与 `return_base64`。
- Agnes AI 有参考图时现在与 macOS 一致，改用图生图协议：将参考图放入 `extra_body.image` 数组，并在 `extra_body.response_format` 请求 `b64_json`。
- 图生图分支不再错误发送 Agnes 文生图专用的 `return_base64` 字段，避免供应商按错误模式解析参考图。
- 请求构造单元测试同时覆盖 Agnes 文生图与图生图分支；该修复不读取、打印或保存 API Key。

本轮已验证：

```text
android: ImageRequestFactoryTest    BUILD SUCCESSFUL
android: lintDebug                  BUILD SUCCESSFUL
android: testDebugUnitTest          BUILD SUCCESSFUL
android: assembleDebug              BUILD SUCCESSFUL
android: connectedDebugAndroidTest BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                            245 passed, 0 failed
```

该差异已通过离线请求体测试固定；仍需使用用户授权的真实 Agnes AI API Key 对实际图生图响应做最终外部验收。

dev30 SHA-256：

```text
570cd29c350dadada9961a7b6a3abe79cca0ee8bdcec81e72edefd90044facb6
```

## 当前开发包（2026 年 8 月 5 日，dev31）

`release/miaos-android-0.1.0-dev31.apk` 修复了 OpenAI 兼容与自定义供应商在带参考图时的跨端行为差异：

- macOS 已有“OpenAI 兼容 / 自定义供应商 + 参考图”兼容图生图结构；Android 之前会显示已选择参考图，却在请求体中静默忽略它。
- Android 现在与 macOS 一致：带参考图时使用 `extra_body.image` 数组并在 `extra_body.response_format` 请求 `b64_json`。
- 无参考图的 OpenAI 兼容文生图请求不变，仍发送顶层 `n`、`size` 和 `response_format: b64_json`。
- Aiping、Agnes AI、Grsai 均继续使用各自专用请求分支，避免本次兼容逻辑改变已有平台参数。

本轮已验证：

```text
android: ImageRequestFactoryTest    BUILD SUCCESSFUL
android: lintDebug                  BUILD SUCCESSFUL
android: testDebugUnitTest          BUILD SUCCESSFUL
android: assembleDebug              BUILD SUCCESSFUL
android: connectedDebugAndroidTest BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                            245 passed, 0 failed
```

此处已用离线请求体测试确保参考图不会被忽略；不同兼容服务是否接受该扩展字段仍需以用户实际配置的供应商 API 进行外部验收。

dev31 SHA-256：

```text
28fbabd14db8fdb40e5361b4a1af974942268e6c4b34c8cfa03850ac60ec069b
```

## 当前开发包（2026 年 8 月 5 日，dev32）

`release/miaos-android-0.1.0-dev32.apk` 补齐 OpenAI 兼容服务的格式字段降级策略，与 macOS 保持一致：

- 部分 OpenAI 兼容服务会以 HTTP 400 拒绝 `response_format` 或 `return_base64`；Android 现在仅在这类兼容文生图请求收到 400 时，移除格式字段并自动重试一次。
- 重试请求只保留 `model`、`prompt`、`n` 和 `size`，与 macOS 的兼容回退请求一致。
- Aiping、Grsai、以及所有带参考图的图生图请求不会触发此降级，避免因重试改变其专用参数或重复发送图生图任务。
- HTTP 状态码只在客户端内部用于选择回退策略；用户可见错误和任务失败记录继续经过既有脱敏逻辑，不会记录 API Key。

本轮已验证：

```text
android: ImageRequestFactoryTest    BUILD SUCCESSFUL
android: lintDebug                  BUILD SUCCESSFUL
android: testDebugUnitTest          BUILD SUCCESSFUL
android: assembleDebug              BUILD SUCCESSFUL
android: connectedDebugAndroidTest BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                            245 passed, 0 failed
```

此行为已通过离线请求构造与回退适用范围测试固定；需要使用真实兼容供应商 API 对 HTTP 400 后的第二次请求进行最终外部验收。

dev32 SHA-256：

```text
215557eda81226b2921d784a20d355761a5f22f8497ed66abbeb3deeaa0fc648
```

## 当前开发包（2026 年 8 月 5 日，dev33）

`release/miaos-android-0.1.0-dev33.apk` 完成移动端生图控制栏的 macOS 风格自适应改造：

- 生图页的“参考图 / 随机 / 优化”与“供应商 / 模型 / 比例 / 质量 / 数量”控制项不再依赖横向滑动。
- 控制项改用自适应换行的圆角 chip 排列，窄屏上所有关键参数均可直接看见；宽屏则自然保持紧凑的横向信息密度。
- 特别长的供应商和模型名称会在 chip 内省略显示，不撑破布局；完整名称仍保留在控件语义文本中，点击可进入原有选择弹窗。
- 视觉继续沿用 macOS 的白色无阴影面板、低对比描边与靛蓝交互色。

本轮已验证：

```text
android: GenerationComposerOptionsTest BUILD SUCCESSFUL
android: lintDebug                     BUILD SUCCESSFUL
android: testDebugUnitTest             BUILD SUCCESSFUL
android: assembleDebug                 BUILD SUCCESSFUL
android: connectedDebugAndroidTest    BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                               245 passed, 0 failed
```

已在 API 36 模拟器用特别长的供应商/模型名称检查纵屏与横屏：纵屏时五个参数全部可见且自动换行；宽屏下保持紧凑控制栏。临时供应商已在回归后删除。

dev33 SHA-256：

```text
58dc0303be8ecbfb01026a2dc10bce5f4d4a33d74f52576e93bd2791febb3786
```

## 当前开发包（2026 年 8 月 5 日，dev34）

`release/miaos-android-0.1.0-dev34.apk` 为 OpenAI 兼容格式字段回退补齐了执行层测试：

- 将 400 回退决策抽取为可注入的纯执行器，真实 HTTP 客户端与 JVM 测试复用同一逻辑。
- 测试验证兼容文生图收到第一次 HTTP 400 后，确实只会发送一次不带格式字段的最小回退请求。
- 测试验证带参考图的兼容图生图收到 400 会直接失败，不会错误降级或发送第二次请求。
- Aiping 与 Grsai 的专用请求继续被排除在回退范围外。

本轮已验证：

```text
android: ImageRequestFallbackExecutorTest BUILD SUCCESSFUL
android: lintDebug                       BUILD SUCCESSFUL
android: testDebugUnitTest               BUILD SUCCESSFUL
android: assembleDebug                   BUILD SUCCESSFUL
android: connectedDebugAndroidTest      BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                                 245 passed, 0 failed
```

dev34 SHA-256：

```text
e88ad7c2b3903b1ce10af66051049897cdc53419de4a2d73fc039cecdccf3617
```

## 当前开发包（2026 年 8 月 5 日，dev35）

`release/miaos-android-0.1.0-dev35.apk` 聚焦补齐项目 / 版本工作流与 macOS 工作台的一致性：

- 项目内生图首次进入时，会带入当前版本的提示词、供应商和模型；生成入队前即回写版本参数，避免等待网络成功后才保存创作上下文。
- 修复配置变化恢复时的草稿覆盖问题：横竖屏切换后，`rememberSaveable` 中尚未提交的项目提示词、供应商和模型选择不再被旧版本数据再次覆盖。
- 修复派生版本的后续图生图链路：重新打开一个分支后，会从持久化的 `parentImageId` 恢复父图路径；再次生成仍以父图作为参考，而不是静默退回为文生图。
- 项目详情的当前版本面板会明确区分“版本主线”“已关联父图的派生分支”和“父图已移除的派生分支”，分别展示“在当前版本生成”“继续图生图”或明确的文生图降级提示。
- 保持 macOS 的项目工作台信息结构：白色分层卡片、低对比描边、靛蓝主操作、版本树与图片操作入口保持一致；项目列表继续显示封面、版本数、图片数、当前模型和更新时间。

本轮已验证：

```text
android: ProjectGenerationContextRestoreTest       BUILD SUCCESSFUL
android: ProjectVersionSourceImageTest             BUILD SUCCESSFUL
android: ProjectCurrentVersionPresentationTest     BUILD SUCCESSFUL
android: lintDebug                                 BUILD SUCCESSFUL
android: testDebugUnitTest                         BUILD SUCCESSFUL
android: assembleDebug                             BUILD SUCCESSFUL
android: connectedDebugAndroidTest                 BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                                          245 passed, 0 failed
```

已在 API 36 模拟器实际检查：首次启动的配置迁移引导、空项目列表、新建项目后的项目卡片、项目详情的版本主线卡和版本树均正常显示；重新安装当前 debug 包后，项目本地数据仍能读取。模拟器仅用于本地 UI / 仪器回归，不替代真实 Android 设备、同 Wi-Fi 配对或真实供应商 API 验收。

`dev35` SHA-256：

```text
30cdf11f47e42dfd1b7e4edc95510d7fada9d0e5631ed5a21c3089c61286bbf5
```

## 当前开发包（2026 年 8 月 5 日，dev36）

`release/miaos-android-0.1.0-dev36.apk` 补齐了 Android 与 macOS 的历史 → 项目工作流：

- 历史页中的项目图片现在提供“前往项目”入口，可直接打开对应项目工作台继续查看版本、生成或派生。
- 跳转时会清理不相关的快速再生成和项目生图上下文，避免历史页跳回项目后误带入旧任务参数。
- “项目”来源筛选下新增具体项目选择器，可从“全部项目”继续收敛到某一项目；与 macOS 历史页的项目筛选能力对齐。
- 筛选状态使用可保存状态；横竖屏切换后保留选中的具体项目。若目标项目已删除，保存的筛选值会安全回退到“全部项目”。
- 入口与筛选器沿用 macOS 工作台的低对比描边、白色卡片和靛蓝强调色，避免给历史管理页引入额外视觉语言。

本轮已验证：

```text
android: HistoryProjectNavigationTest       BUILD SUCCESSFUL
android: HistoryProjectNavigationStateTest  BUILD SUCCESSFUL
android: HistoryProjectFilterTest           BUILD SUCCESSFUL
android: lintDebug                          BUILD SUCCESSFUL
android: testDebugUnitTest                  BUILD SUCCESSFUL
android: assembleDebug                      BUILD SUCCESSFUL
android: connectedDebugAndroidTest          BUILD SUCCESSFUL（4 项，其中未注入配对地址的用例按设计跳过）
pnpm test                                   245 passed, 0 failed
```

已在 API 36 模拟器实际验证：插入两条不含密钥的项目历史记录后，可从“历史”进入正确项目详情；项目来源可选择“全部项目”或某一具体项目，筛选结果会收敛；强制横屏再切回竖屏后，具体项目筛选仍保持。临时项目、版本和图片数据库记录已在打包前清理。

补充跨端网络验证：使用 macOS 代码中的 `createConfigPairingServer` 启动 120 秒的一次性临时服务，并以 Android 模拟器专用私网映射地址 `10.0.2.2` 传入 `MacosPairingInstrumentedTest`。Android 仪器测试成功读取真实 HTTP 响应中的加密 `.miaos` 信封；随后从主机再次读取同一 token，服务按协议返回 HTTP `410` 和“配对已失效，请重新发起”。该验证不包含 API Key，也不替代 Android 真机与 macOS 在真实同一 Wi‑Fi 环境中的扫码验收。

`dev36` SHA-256：

```text
9af82061014209cfa28fc670e922b2ff0267d3206cf6063ef651b9d0fa96f6fa
```

## 当前开发包（2026 年 8 月 5 日，dev37）

`release/miaos-android-0.1.0-dev37.apk` 修复了本地设置在多页面间不能即时同步的问题，并继续向 macOS 设置页的紧凑工作台样式靠拢：

- `MiaosDatabase.create()` 现在以线程安全单例复用同一个 Room 实例；应用壳、设置、项目、历史和供应商页面可以接收同一份本地数据库失效通知。
- 修复主题切换此前只更新设置页分段按钮、却不更新全局背景和卡片色的问题；浅色、深色和跟随系统现在会立即作用于整个原生客户端。
- 设置页的主题选择从三条纵向全宽按钮改为与 macOS 一致的紧凑三段控件，顺序为“浅色 / 深色 / 跟随系统”。
- 新增“应用与数据安全”卡片，展示已安装包的真实版本、Android Keystore 密钥保护方式以及“设备直连供应商，不经过妙生服务端”的网络边界；不读取设备标识、不展示 API Key、不新增网络请求。

本轮已验证：

```text
android: SettingsPresentationTest              BUILD SUCCESSFUL
android: MiaosDatabaseInstanceInstrumentedTest BUILD SUCCESSFUL
android: lintDebug                             BUILD SUCCESSFUL
android: testDebugUnitTest                     BUILD SUCCESSFUL
android: assembleDebug                         BUILD SUCCESSFUL
android: connectedDebugAndroidTest             BUILD SUCCESSFUL（5 项，其中未注入配对地址的用例按设计跳过）
pnpm test                                      245 passed, 0 failed
```

已在 API 36 模拟器实际验证：深色主题切换后，应用背景像素为 `#111827`、卡片像素为 `#1E293B`，证明全局主题已即时更新；随后已恢复为“跟随系统”。设置页还实际检查了紧凑主题分段控件、应用版本 `0.1.0` 以及密钥/网络边界信息卡。

`dev37` SHA-256：

```text
b2d616a68b7dae217e738d65e913db65ebe2ff6c4f21a425a84399d8b0c0ded5
```

## 当前开发包（2026 年 8 月 5 日，dev38）

`release/miaos-android-0.1.0-dev38.apk` 补齐了 Android 与 macOS 的终态生成队列管理能力：

- 已完成、失败和已取消的任务现在可从“生成队列”移除；等待中任务仍只允许取消，运行中任务不提供危险的中途移除操作。
- 队列移除只删除 `generation_tasks` 中的终态记录，不删除 `generated_images` 历史图片、不删除项目版本，也不会影响正在执行的 WorkManager 请求。
- 失败和已取消任务继续提供“重新加入队列”；失败卡片保留受限行数的错误详情，方便排查但不回显 API Key。
- 生成队列由简单文本列表升级为 macOS 工作台风格的状态卡片：状态、模型、提示词、比例/质量和可执行操作分层呈现，失败状态使用明确的错误色。

本轮已验证：

```text
android: GenerationTaskQueueActionsTest        BUILD SUCCESSFUL
android: GenerationTaskDismissInstrumentedTest BUILD SUCCESSFUL
android: lintDebug                             BUILD SUCCESSFUL
android: testDebugUnitTest                     BUILD SUCCESSFUL
android: assembleDebug                         BUILD SUCCESSFUL
android: connectedDebugAndroidTest             BUILD SUCCESSFUL（6 项，其中未注入配对地址的用例按设计跳过）
pnpm test                                      245 passed, 0 failed
```

已在 API 36 模拟器实际验证：注入无密钥的已完成、失败、已取消任务后，三种状态卡片与重试/移除入口均正常显示；点击“移除”后，目标取消任务从 Room 队列记录消失，失败和完成任务仍保留，页面提示“历史图片不受影响”。临时队列记录已在全量回归前清理。

`dev38` SHA-256：

```text
6e3a30e45a631e3712d24d8d55d5056b5914a37cd382b8d71e9ed3751383aab6
```

## 当前开发包（2026 年 8 月 5 日，dev39）

`release/miaos-android-0.1.0-dev39.apk` 对齐 macOS 的历史分页工作流，并限制长历史列表的一次性 Compose 渲染量：

- 历史记录按每页 24 条显示；页码始终会收敛到有效范围，空结果稳定显示为第 1 页空列表。
- 搜索、来源筛选和具体项目筛选会回到第一页；删除记录后，如果当前页越界会自动收敛到最后有效页。
- 批量管理仍可跨页面保留已选记录，分页不改变删除、再生成、分享、保存相册或项目跳转行为。
- 页尾新增“上一页 / 第 x / y 页 · 总数 / 下一页”控制，与 macOS 历史页的分页信息架构保持一致，并沿用白色卡片、低对比描边和靛蓝强调色。

本轮已验证：

```text
android: HistoryPaginationTest        BUILD SUCCESSFUL
android: HistoryProjectFilterTest     BUILD SUCCESSFUL
android: lintDebug                    BUILD SUCCESSFUL
android: testDebugUnitTest            BUILD SUCCESSFUL
android: assembleDebug                BUILD SUCCESSFUL
android: connectedDebugAndroidTest    BUILD SUCCESSFUL（6 项，其中未注入配对地址的用例按设计跳过）
pnpm test                             245 passed, 0 failed
```

已在 API 36 模拟器用 200 条不含密钥、无图片文件的历史记录实际验证：初始页显示“第 1 / 9 页 · 200 条”，第二页从第 176 条记录开始，上一页/下一页操作正常。分页改造将每个页面实际构建的历史卡片上限固定为 24；图形统计采样窗口因交互路径不同不作为改造前后的绝对性能对比。临时基准历史记录已在全量回归前清理。

`dev39` SHA-256：

```text
952f0b52adef3182f8cceadddcdbb8bba10e6a5b35bb4eaf4d64a21e506d909d
```

## 当前开发包（2026 年 8 月 6 日，dev40）

`release/miaos-android-0.1.0-dev40.apk` 补齐了 macOS → Android 一次性局域网配对的人工确认步骤，并继续统一两端设置页的安全表达和视觉层级：

- macOS 配对面板现在在二维码下显示由一次性 token 派生的 6 位确认短码；短码卡片使用靛蓝浅底、低对比描边和等宽数字字形，页面不会渲染 token 或 API Key。
- Android 扫描二维码后会先严格校验局域网地址、路径和 token 格式，再显示同一短码；只有用户确认“短码一致，继续”后才打开导出密码输入框并读取一次性地址。
- 取消、关闭确认框、关闭密码框或导入成功时，Android 都会清除待配对地址、短码、文件 URI 和已确认地址，避免旧扫码状态被后续导入误用。
- `.miaos` 文件导入保持原有流程，不显示局域网短码确认；API Key 仍只在确认导入后写入 Android Keystore。
- 协议文档补充确认短码的算法和边界：`SHA-256(token)` 前 3 字节编码为 6 位大写十六进制；短码不进入二维码新字段、不进入 HTTP/供应商请求，也不能替代一次性 token 的访问控制。

本轮已验证：

```text
pnpm test                                      247 passed, 0 failed
android: PairingUrlTest                        BUILD SUCCESSFUL
android: lintDebug                             BUILD SUCCESSFUL
android: testDebugUnitTest                     BUILD SUCCESSFUL
android: assembleDebug                         BUILD SUCCESSFUL
android: connectedDebugAndroidTest             BUILD SUCCESSFUL（未注入配对地址的用例按设计跳过）
```

已在 API 36 模拟器实际安装并启动 `dev40`，检查了快速生图页和设置页：浅灰画布、白色分层卡片、低对比描边、靛蓝主操作和配置迁移卡片均正常渲染。扫码确认弹窗的纯地址校验与短码状态已由 JVM 单元测试覆盖；模拟器本轮没有使用真实摄像头完成 macOS 同一 Wi‑Fi 扫码，因此这不替代真机扫码、短码核对、过期、重复读取与断网的外部验收。

`dev40` SHA-256：

```text
4954cfe48db9be339261d88cce1111ecfd630bb90fe6a705d303b4e6cbefb5e7
```

## 配对服务成功读取后的安全收口（2026 年 8 月 6 日）

为满足“一次性配对成功后立即撤销临时服务”的协议要求，macOS 配对服务补充了以下收口行为：

- Android 成功读取加密信封、HTTP 响应写入完成后，macOS 会立即关闭临时监听端口；不会在剩余 TTL 内继续保留可返回 `410` 的可探测端点。
- 配对服务将结束原因限定为成功读取、过期或用户取消等内部状态。成功读取和过期时，主进程会通知 macOS 设置页自动撤销二维码与短码面板；用户取消或离开页面则保持本地即时收起行为。
- macOS 关闭窗口时，即使应用进程仍按系统惯例留在后台，也会主动撤销未消费的临时配对服务；应用退出时会再次尽力释放端口。

本轮已验证：

```text
pnpm test                                      250 passed, 0 failed
android: lintDebug                             BUILD SUCCESSFUL
android: testDebugUnitTest                     BUILD SUCCESSFUL
android: assembleDebug                         BUILD SUCCESSFUL
android: connectedDebugAndroidTest             BUILD SUCCESSFUL
```

补充跨端实测：主机启动真实一次性配对服务，API 36 模拟器通过 `10.0.2.2` 下载 Android 仪器测试资源中的加密信封；下载完成后，主机再次访问同一端口得到连接拒绝，确认监听端口已被主动关闭。该测试未使用真实 API Key，也不替代真实 Android 手机摄像头扫码和同 Wi‑Fi 外部验收。

## 当前开发包（2026 年 8 月 6 日，dev41）

`release/miaos-android-0.1.0-dev41.apk` 将 Android 扫码后的设备确认步骤进一步对齐 macOS 设置页的安全视觉语言：

- “确认 macOS 配对设备”弹窗中的短码从普通文字升级为独立强调卡片：靛蓝浅底、靛蓝描边、圆角容器和等宽大号短码，与 macOS 二维码下的确认卡片建立一致的核对焦点。
- 短码展示文案被抽为可测试模型，固定为“配对确认短码”及 macOS 核对说明；只允许显示 6 位大写十六进制短码，异常状态安全降级为 `------`，不会渲染 token、URL 或 API Key。
- 用户仍必须主动点击“短码一致，继续”才会进入导出密码与一次性配置读取流程；视觉优化不改变任何密码、Keystore 或网络边界。

本轮已验证：

```text
pnpm test                                      250 passed, 0 failed
android: SettingsPresentationTest              BUILD SUCCESSFUL
android: lintDebug                             BUILD SUCCESSFUL
android: testDebugUnitTest                     BUILD SUCCESSFUL
android: assembleDebug                         BUILD SUCCESSFUL
android: connectedDebugAndroidTest             BUILD SUCCESSFUL（未注入配对地址的用例按设计跳过）
```

已在 API 36 模拟器安装并冷启动 `dev41`，快速生图页的浅灰画布、白色卡片、靛蓝主操作和五项底部导航正常渲染。短码卡片的展示模型和样式代码已通过 Kotlin 单元/构建验证；本轮未通过真实摄像头触发扫码弹窗，因此不替代真机扫码与人工短码核对。

`dev41` SHA-256：

```text
3f2fca7270856157d1c083808ebd6fe354c9b3c1097b3dc5846bb8de91c5973c
```

## 当前开发包（2026 年 8 月 6 日，dev42）

`release/miaos-android-0.1.0-dev42.apk` 继续把 Android 空数据工作区对齐为 macOS 的图标化工作台空态：

- 项目页首次使用时显示“图标 + 标题 + 说明 + 就近新建项目”卡片；搜索无结果时改为不带新建动作的搜索空态，避免用户误以为需要重复创建项目。
- 历史页首次使用时显示本地保存边界说明；已有历史但筛选无结果时显示独立的筛选空态，帮助用户区分“尚未生成”和“当前条件无匹配”。
- 新增统一 `MiaosEmptyState` 组件，延续浅灰画布、白色分层卡片、低对比描边、靛蓝图标和主操作的 macOS 视觉层级，后续工作区可复用。
- 空态展示文案有 JVM 单元测试，避免后续改动丢失新建入口或把搜索空态错误地引导成创建新项目。

本轮已验证：

```text
pnpm test                                      250 passed, 0 failed
android: EmptyStatePresentationTest            BUILD SUCCESSFUL
android: lintDebug                             BUILD SUCCESSFUL
android: testDebugUnitTest                     BUILD SUCCESSFUL
android: assembleDebug                         BUILD SUCCESSFUL
android: connectedDebugAndroidTest             BUILD SUCCESSFUL（未注入配对地址的用例按设计跳过）
```

已在 API 36 模拟器安装并检查 dev42 的项目与历史页：首次空态均正常显示，项目空态的“新建项目”入口可见，历史空态明确说明图片和历史只保存在本机。真实供应商、真机扫码和真实图库/分享外部验收仍需在具备授权与真实设备时完成。

`dev42` SHA-256：

```text
45c907cbda7aa9365a8b33d9027b62ff17b6090cd6a58224e60a2a6f06598ac3
```
