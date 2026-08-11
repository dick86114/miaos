# Android P2 加密项目包迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不建设云服务的前提下，让用户显式地在 macOS 与 Android 之间迁移单个项目、版本树、提示词和图片文件。

**Architecture:** 新增独立的 `.miaos-project` 二进制协议，不修改现有 `.miaos` 配置协议。项目元数据和图片先写入 ZIP，再使用 PBKDF2-HMAC-SHA256 派生的 AES-256-GCM 密钥流式加密；导入方先校验包头、大小、路径和 SHA-256，再在事务中写入本地数据库与私有图片目录。

**Tech Stack:** Node.js `crypto`/`stream`、`yazl`/`yauzl`、Electron IPC、Kotlin、Room、Android Keystore、`java.util.zip`、Java Cryptography Architecture、Android Storage Access Framework。

## Global Constraints

- 必须在 P0 和 P1 全部通过后开始。
- `.miaos-project` 与 `.miaos` 配置协议保持独立扩展名和独立版本号。
- 项目包不得包含 API Key、供应商密钥、日志、绝对路径或窗口状态。
- 导入必须防止 ZIP Slip、超大文件、超多条目、重复路径和校验和不匹配。
- 加解密使用流式文件处理，不把完整项目包或全部图片读入内存。
- 默认最大项目包 500 MiB、最多 500 张图片、单张图片最大 50 MiB。
- 冲突默认导入为新项目，不覆盖现有项目和图片。
- 每个任务遵循测试先行，并以独立中文提交结束。

---

### Task 1: 定义 `.miaos-project` v1 协议与跨端 fixture

**Files:**
- Create: `docs/protocol/miaos-project-v1.md`
- Create: `tests/fixtures/miaos-project-v1/manifest.json`
- Create: `tests/fixtures/miaos-project-v1/images/root.png`
- Create: `tests/project-transfer-format.test.cjs`
- Create: `android/app/src/test/resources/miaos-project-v1.fixture`

**Interfaces:**
- Produces: 固定二进制包头、JSON 加密头、ZIP manifest schema 和测试密码。

- [ ] **Step 1: 写格式常量失败测试**

```js
assert.equal(PROJECT_PACKAGE_MAGIC.toString('ascii'), 'MIAOSPRJ');
assert.equal(PROJECT_PACKAGE_VERSION, 1);
assert.equal(MAX_PROJECT_PACKAGE_BYTES, 500 * 1024 * 1024);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/project-transfer-format.test.cjs`

Expected: FAIL，协议常量不存在。

- [ ] **Step 3: 写协议文档**

文件结构固定为：

```text
8 bytes  magic = MIAOSPRJ
4 bytes  big-endian version = 1
4 bytes  big-endian header length
N bytes  UTF-8 JSON header
...      AES-256-GCM ciphertext of ZIP stream
16 bytes authentication tag
```

header 只包含 KDF、salt、iv、iterations、ciphertextLength 和 tagLength。ZIP 内包含 `manifest.json` 与 `images/<image-id>.<ext>`。

- [ ] **Step 4: 定义 manifest**

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-08-11T00:00:00.000Z",
  "project": {},
  "versions": [],
  "images": [
    {
      "id": "image-1",
      "versionId": "version-1",
      "path": "images/image-1.png",
      "sha256": "hex",
      "size": 1234
    }
  ]
}
```

- [ ] **Step 5: 验证并提交**

Run: `node --test tests/project-transfer-format.test.cjs`

Expected: PASS。

```bash
git add docs/protocol/miaos-project-v1.md tests/fixtures tests/project-transfer-format.test.cjs android/app/src/test/resources/miaos-project-v1.fixture
git commit -m "docs: 定义跨端加密项目包协议"
```

### Task 2: 实现 macOS 流式项目导出

**Files:**
- Create: `src/main/services/project-package.js`
- Create: `tests/project-package.test.cjs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `src/js/store.js`
- Modify: `src/js/pages/project.js`

**Interfaces:**
- Produces: `exportProjectPackage({ project, password, destination })` 和 IPC `export-project-package`。

- [ ] **Step 1: 写导出失败测试**

使用临时目录构造一个项目、两个版本和两张图片，断言导出的文件不包含项目名、提示词或 API Key 明文，并且解密后的 ZIP manifest 与图片 SHA-256 正确。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/project-package.test.cjs`

Expected: FAIL，项目包服务不存在。

- [ ] **Step 3: 实现安全 manifest 构造器**

只投影项目、版本、图片元数据和相对图片条目；图片路径必须经过现有本地图片访问边界校验。

- [ ] **Step 4: 实现流式 ZIP 与 AES-GCM 导出**

使用 `yazl` 创建 ZIP 流，写入临时文件，完成 `fsync` 后原子重命名到用户选择位置；失败时删除临时文件。密码转换为 Buffer 后在结束时清零。`yauzl` 仅用于测试和 macOS 导入，不使用同步 ZIP API。

- [ ] **Step 5: 接入项目页导出入口**

项目设置菜单增加“导出加密项目包”，弹窗要求输入和确认密码。导出成功显示目标文件名，不显示完整路径中的敏感目录。

- [ ] **Step 6: 验证并提交**

Run: `node --test tests/project-package.test.cjs && pnpm test`

Expected: PASS。

```bash
git add src/main/services/project-package.js main.js preload.js src/js/store.js src/js/pages/project.js tests/project-package.test.cjs package.json pnpm-lock.yaml
git commit -m "feat: 增加macOS加密项目导出"
```

### Task 3: 实现 Android 流式解密与安全解包

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/data/ProjectPackageReader.kt`
- Create: `android/app/src/main/java/com/miaos/android/data/ProjectPackageModels.kt`
- Create: `android/app/src/test/java/com/miaos/android/data/ProjectPackageReaderTest.kt`
- Create: `android/app/src/androidTest/java/com/miaos/android/data/ProjectPackageInteropInstrumentedTest.kt`

**Interfaces:**
- Produces: `ProjectPackageReader.inspect(uri, password)`、`ProjectPackageReader.extract(uri, password, destination)`。

- [ ] **Step 1: 写跨端 fixture 失败测试**

仪器测试读取 macOS 生成的固定 fixture，断言项目名、版本树、图片数量和 SHA-256 正确。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew connectedDebugAndroidTest`

Expected: FAIL，读取器不存在。

- [ ] **Step 3: 实现包头和大小校验**

拒绝错误 magic、未来版本、header 超过 64 KiB、包超过 500 MiB、非法 KDF 参数和截断认证标签。

- [ ] **Step 4: 实现流式解密与 ZIP 安全检查**

每个条目规范化后必须位于临时目录内；拒绝绝对路径、`..`、符号链接、重复条目、条目数量超限和图片体积超限。

- [ ] **Step 5: 校验 manifest 与图片哈希**

所有 manifest 图片必须存在且 SHA-256/size 匹配；ZIP 中不得包含 manifest 未声明的图片。

- [ ] **Step 6: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest connectedDebugAndroidTest`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/data/ProjectPackageReader.kt android/app/src/main/java/com/miaos/android/data/ProjectPackageModels.kt android/app/src/test/java/com/miaos/android/data/ProjectPackageReaderTest.kt android/app/src/androidTest/java/com/miaos/android/data/ProjectPackageInteropInstrumentedTest.kt
git commit -m "feat: 增加安卓项目包安全读取"
```

### Task 4: 实现 Android 项目事务导入

**Files:**
- Create: `android/app/src/main/java/com/miaos/android/data/ProjectPackageImporter.kt`
- Create: `android/app/src/test/java/com/miaos/android/data/ProjectPackageImporterTest.kt`
- Modify: `android/app/src/main/java/com/miaos/android/data/ProjectRepository.kt`
- Modify: `android/app/src/main/java/com/miaos/android/data/database/MiaosDatabase.kt`

**Interfaces:**
- Produces: `importAsNewProject(package, extractedDirectory)` 和 `ProjectImportSummary`。

- [ ] **Step 1: 写 ID 重映射失败测试**

```kotlin
@Test
fun 导入总是创建新项目并保持父子关系() {
    val result = remapProjectPackageIds(packageFixture(), existingIds = setOf("project-1", "version-1"))
    assertNotEquals("project-1", result.project.id)
    assertEquals(result.versions.first().id, result.versions.last().parentVersionId)
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*ProjectPackageImporterTest'`

Expected: FAIL，导入器不存在。

- [ ] **Step 3: 实现稳定 ID 重映射**

同一次导入中维护旧 ID→新 ID 映射，更新 projectId、versionId、parentVersionId、parentImageId 和 coverImageId。项目名称追加“（已导入）”，不覆盖同名项目。

- [ ] **Step 4: 实现事务写入与文件回滚**

图片先复制到新的项目私有目录，再在 Room 事务中写项目、版本和图片。数据库失败时删除新目录；文件复制失败时不得写数据库。

- [ ] **Step 5: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest --tests '*ProjectPackageImporterTest'`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/data/ProjectPackageImporter.kt android/app/src/main/java/com/miaos/android/data/ProjectRepository.kt android/app/src/main/java/com/miaos/android/data/database/MiaosDatabase.kt android/app/src/test/java/com/miaos/android/data/ProjectPackageImporterTest.kt
git commit -m "feat: 增加安卓项目包事务导入"
```

### Task 5: 接入 Android 项目导入与导出界面

**Files:**
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectsScreen.kt`
- Modify: `android/app/src/main/java/com/miaos/android/ui/ProjectDetailScreen.kt`
- Create: `android/app/src/main/java/com/miaos/android/ui/ProjectPackageDialogs.kt`
- Create: `android/app/src/main/java/com/miaos/android/data/ProjectPackageWriter.kt`
- Create: `android/app/src/test/java/com/miaos/android/data/ProjectPackageWriterTest.kt`
- Create: `android/app/src/androidTest/java/com/miaos/android/ui/ProjectPackageFlowTest.kt`

**Interfaces:**
- Consumes: `ProjectPackageReader`、`ProjectPackageImporter`、Android Storage Access Framework。
- Produces: 项目列表“导入项目包”和项目详情“导出项目包”。

- [ ] **Step 1: 编写导入摘要 UI 测试**

断言摘要显示项目名、版本数、图片数、总大小和来源平台；不显示绝对路径和密钥信息。

- [ ] **Step 2: 实现导入流程**

选择文件 → 输入密码 → 校验并展示摘要 → 用户确认 → 导入为新项目 → 自动打开导入项目。

- [ ] **Step 3: 写 Android 流式导出失败测试**

使用临时项目目录导出固定项目，断言包头、manifest、图片 SHA-256 与 macOS fixture 一致，并断言导出过程的最大单次缓冲不超过 1 MiB。

- [ ] **Step 4: 实现 Android 导出流程**

`ProjectPackageWriter` 使用 `ZipOutputStream` 和 `CipherOutputStream` 分块处理，将本机项目导出到用户选择的位置。密码必须二次确认；完成后可通过系统分享面板发送文件。

- [ ] **Step 5: 验证并提交**

Run: `cd android && ./gradlew testDebugUnitTest connectedDebugAndroidTest lintDebug assembleDebug`

Expected: PASS。

```bash
git add android/app/src/main/java/com/miaos/android/ui android/app/src/main/java/com/miaos/android/data/ProjectPackageWriter.kt android/app/src/test/java/com/miaos/android/data/ProjectPackageWriterTest.kt android/app/src/androidTest/java/com/miaos/android/ui/ProjectPackageFlowTest.kt
git commit -m "feat: 接入安卓项目包迁移界面"
```

### Task 6: 实现 macOS 项目包安全导入

**Files:**
- Create: `src/main/services/project-package-import.js`
- Create: `tests/project-package-import.test.cjs`
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `src/js/store.js`
- Modify: `src/js/pages/projects.js`

**Interfaces:**
- Consumes: Android 导出的 `.miaos-project`、`yauzl`、现有项目状态持久化。
- Produces: `inspectProjectPackage(filePath, password)`、`importProjectPackage(filePath, password)` 和 IPC `import-project-package`。

- [ ] **Step 1: 写 Android fixture 导入失败测试**

测试读取 Android `ProjectPackageWriter` 生成的固定 fixture，断言项目、版本、父子关系、封面、图片大小和 SHA-256；同 ID 项目必须导入为新 ID。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/project-package-import.test.cjs`

Expected: FAIL，macOS 导入服务不存在。

- [ ] **Step 3: 实现流式解密和安全 ZIP 读取**

使用 `yauzl` 的 lazy entries 模式逐项读取，复用协议中的 500 MiB、500 张图片、50 MiB 单图、路径规范化和 SHA-256 限制。解密或校验失败时删除临时目录。

- [ ] **Step 4: 实现项目状态事务式提交**

先把图片复制到新的本机项目目录，再构造完整新项目对象；仅在所有文件成功后一次性更新 store。持久化失败时恢复原状态并删除新目录。

- [ ] **Step 5: 接入项目列表导入入口**

项目列表增加“导入项目包”，流程为选择文件 → 输入密码 → 查看摘要 → 确认导入 → 打开新项目。不得覆盖同名项目或原项目。

- [ ] **Step 6: 验证并提交**

Run: `node --test tests/project-package-import.test.cjs tests/project-package.test.cjs && pnpm test`

Expected: PASS。

```bash
git add src/main/services/project-package-import.js main.js preload.js src/js/store.js src/js/pages/projects.js tests/project-package-import.test.cjs
git commit -m "feat: 增加macOS项目包安全导入"
```

### Task 7: 完成双向跨端验收

**Files:**
- Create: `docs/android/android-project-transfer-acceptance.md`
- Modify: `docs/android-native-phase1-audit.md`

- [ ] **Step 1: macOS→Android 验收**

导出包含根版本、两级分支和至少 10 张图片的项目，在真实 Android 手机导入；核对版本父子关系、参考图、提示词、封面和图片文件。

- [ ] **Step 2: Android→macOS 验收**

从 Android 导出同一项目，在 macOS 导入为新项目；核对数据关系并确认不会覆盖原项目。

- [ ] **Step 3: hostile fixture 验收**

验证错误密码、截断包、未来版本、ZIP Slip、重复路径、超限图片和 SHA-256 不匹配全部拒绝，且本地数据库与图片目录不留下半成品。

- [ ] **Step 4: 全量验证并提交**

```bash
pnpm test
pnpm android:test
pnpm android:lint
pnpm android:assemble
pnpm android:connected-test
```

```bash
git add docs/android/android-project-transfer-acceptance.md docs/android-native-phase1-audit.md
git commit -m "test: 完成项目包双向迁移验收"
```

## P2 完成门槛

- macOS 和 Android 可以双向导入/导出单个项目。
- 项目包不包含 API Key、密钥或本机绝对路径。
- 大项目使用流式处理，无需把完整包读入内存。
- 冲突始终导入为新项目，不覆盖本地数据。
- hostile fixture 全部被拒绝且无半成品残留。
- 真实设备完成至少一次双向项目迁移。
