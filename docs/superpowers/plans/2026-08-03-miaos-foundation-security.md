# 妙生基础与安全优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有页面布局、视觉风格和核心功能的前提下，建立 pnpm、自动化测试、数据恢复、密钥保护、IPC 校验、统一网络错误和安全发布基础。

**Architecture:** 保留 `main.js` 作为 Electron 入口，仅抽取本阶段需要独立测试的纯函数和安全服务。渲染层继续使用原生 ES Modules；主进程新模块使用 CommonJS，以兼容当前 Electron 入口。每项变更先写失败测试，再实现最小改动，并通过独立提交形成回滚边界。

**Tech Stack:** Electron 31、Node.js 18+、pnpm 10.33.3、Node 内置 `node:test`、原生 ES Modules、CommonJS、GitHub Actions、electron-builder。

## Global Constraints

- 不迁移 Tauri。
- 不引入 React、Vue 或其他前端框架。
- 不改变现有页面结构、视觉体系和全局串行生图语义。
- 注释、用户文案、测试描述和文档均使用中文。
- 前端依赖和脚本统一使用 pnpm，不再使用 npm。
- 旧版本用户数据必须可迁移；迁移失败时不得覆盖原数据。
- API Key、完整 Base64 和敏感路径不得进入日志或公开错误信息。
- 当前工作区中未提交的 `AGENTS.md` 不属于本计划，执行时不得覆盖、暂存或提交。

---

## 文件结构与职责

本计划新增或调整以下边界：

```text
src/main/
├── app-data.js                 # 解析并验证 ~/.miaos 数据目录
├── secrets-vault.js            # safeStorage 密钥文件读写
├── services/
│   ├── app-error.js            # 统一错误类型和公开错误转换
│   └── http-client.js          # 超时、重定向、响应限制和 JSON 请求
└── security/
    ├── validators.js           # IPC 参数、URL、路径、文件名校验
    ├── ipc.js                  # 可信来源检查和安全 handler 包装
    └── external-links.js       # 外部链接白名单

src/js/
├── state-schema.js             # 默认状态、迁移和结构校验
└── release-notes.js            # 安全的更新日志解析和 DOM 渲染

tests/
├── package-config.test.mjs
├── state-schema.test.mjs
├── app-data.test.cjs
├── secrets-vault.test.cjs
├── validators.test.cjs
├── ipc-security.test.cjs
├── http-client.test.cjs
├── release-notes.test.mjs
└── fixtures/large-state.mjs
```

---

### Task 1: 切换 pnpm 并建立最小测试基线

**Files:**
- Create: `tests/package-config.test.mjs`
- Create: `tests/fixtures/large-state.mjs`
- Create: `docs/optimization/phase-1-baseline.md`
- Modify: `package.json`
- Create: `pnpm-lock.yaml`
- Delete: `package-lock.json`
- Modify: `.github/workflows/build-dmg.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: 当前 `package.json` 脚本和 GitHub Actions 发布流程。
- Produces: `pnpm test`、`pnpm check`、固定大数据 fixture，以及所有后续任务共用的 Node 测试入口。

- [ ] **Step 1: 编写会失败的包管理器配置测试**

```js
// tests/package-config.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/build-dmg.yml', import.meta.url), 'utf8');

test('项目统一使用 pnpm', () => {
  assert.equal(pkg.packageManager, 'pnpm@10.33.3');
  assert.equal(pkg.scripts.test, 'node --test tests');
  assert.equal(pkg.scripts.check, 'pnpm test');
  assert.equal(existsSync(new URL('../package-lock.json', import.meta.url)), false);
  assert.equal(existsSync(new URL('../pnpm-lock.yaml', import.meta.url)), true);
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.doesNotMatch(workflow, /npm ci|npm run/);
});
```

在修改运行时行为前，创建 `docs/optimization/phase-1-baseline.md` 并使用当前应用记录：冷启动到窗口出现、首屏可操作、200 条历史渲染、100 个版本节点渲染、连续切换页面 30 次后的内存。每项记录测试机器、macOS、Node、应用版本、测量步骤和三次结果的中位数。无法自动测量的项目必须附 DevTools Performance 或 Activity Monitor 截图路径，不能只写“正常”。

同时创建 `tests/fixtures/large-state.mjs`，导出：

```js
export function createLargeStateFixture({ historyCount = 200, projectCount = 50, versionCount = 100 } = {}) {
  return {
    providers: [],
    history: Array.from({ length: historyCount }, (_, index) => ({ id: `h_${index}`, createdAt: index })),
    projects: Array.from({ length: projectCount }, (_, index) => ({
      id: `p_${index}`,
      name: `测试项目 ${index}`,
      versions: Array.from({ length: Math.ceil(versionCount / projectCount) }, (_, versionIndex) => ({
        id: `v_${index}_${versionIndex}`,
        parentId: null,
        images: [],
      })),
    })),
    defaults: {},
    lastSettings: null,
    updateRepo: 'dick86114/miaos',
  };
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/package-config.test.mjs`

Expected: FAIL，至少包含 `packageManager` 缺失、`pnpm-lock.yaml` 不存在或 workflow 仍使用 npm。

- [ ] **Step 3: 完成 pnpm 和脚本配置**

在 `package.json` 增加：

```json
{
  "packageManager": "pnpm@10.33.3",
  "scripts": {
    "test": "node --test tests",
    "check": "pnpm test"
  }
}
```

将 workflow 安装步骤改为：

```yaml
- name: Setup pnpm
  uses: pnpm/action-setup@v4
  with:
    version: 10.33.3

- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '24'
    cache: 'pnpm'

- name: Install dependencies
  run: pnpm install --frozen-lockfile

- name: Run checks
  run: pnpm check

- name: Build DMG
  run: pnpm dist
```

运行 `pnpm install --lockfile-only` 生成锁文件，删除 `package-lock.json`，并将 README 中所有 npm 命令替换为 pnpm。

- [ ] **Step 4: 运行测试和安装验证**

Run: `pnpm install --frozen-lockfile && pnpm test`

Expected: PASS，依赖安装不修改 `pnpm-lock.yaml`。

- [ ] **Step 5: 提交**

```bash
git add package.json pnpm-lock.yaml package-lock.json .github/workflows/build-dmg.yml README.md tests/package-config.test.mjs tests/fixtures/large-state.mjs docs/optimization/phase-1-baseline.md
git commit -m "build: 统一使用 pnpm 并建立测试入口"
```

---

### Task 2: 抽取状态 schema、备份和恢复逻辑

**Files:**
- Create: `src/js/state-schema.js`
- Create: `tests/state-schema.test.mjs`
- Modify: `src/js/store.js:1-190`

**Interfaces:**
- Consumes: `store.js` 中现有默认供应商、v3/v4/v5 迁移和 `localStorage` 数据。
- Produces: `CURRENT_STORAGE_KEY`、`BACKUP_STORAGE_KEY`、`createDefaultState()`、`migrateState(parsed)`、`validateState(value)`、`createStatePersistence(storage)`。

- [ ] **Step 1: 编写状态迁移和恢复失败测试**

```js
// tests/state-schema.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_STORAGE_KEY,
  BACKUP_STORAGE_KEY,
  createDefaultState,
  createStatePersistence,
  validateState,
} from '../src/js/state-schema.js';

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

test('损坏主状态时恢复备份且不覆盖备份', () => {
  const backup = createDefaultState();
  backup.history.push({ id: 'h_backup', createdAt: 1 });
  const storage = createMemoryStorage({
    [CURRENT_STORAGE_KEY]: '{bad-json',
    [BACKUP_STORAGE_KEY]: JSON.stringify(backup),
  });
  const persistence = createStatePersistence(storage);
  const result = persistence.load();
  assert.equal(result.source, 'backup');
  assert.equal(result.state.history[0].id, 'h_backup');
  assert.equal(storage.getItem(BACKUP_STORAGE_KEY), JSON.stringify(backup));
});

test('写入新状态前保留上一个合法状态', () => {
  const oldState = createDefaultState();
  const storage = createMemoryStorage({ [CURRENT_STORAGE_KEY]: JSON.stringify(oldState) });
  const persistence = createStatePersistence(storage);
  const nextState = createDefaultState();
  nextState.updateRepo = 'owner/repo';
  persistence.saveNow(nextState);
  assert.deepEqual(JSON.parse(storage.getItem(BACKUP_STORAGE_KEY)), oldState);
  assert.equal(validateState(JSON.parse(storage.getItem(CURRENT_STORAGE_KEY))).ok, true);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/state-schema.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/js/state-schema.js`。

- [ ] **Step 3: 实现纯状态模块**

`state-schema.js` 必须：

```js
export const CURRENT_STORAGE_KEY = 'miaos.state.v5';
export const BACKUP_STORAGE_KEY = 'miaos.state.backup.v5';
export const LEGACY_STORAGE_KEYS = ['miaos.state.v4', 'miaos.state.v3'];

export function validateState(value) {
  const errors = [];
  if (!value || typeof value !== 'object') errors.push('状态必须是对象');
  if (!Array.isArray(value?.providers)) errors.push('providers 必须是数组');
  if (!Array.isArray(value?.history)) errors.push('history 必须是数组');
  if (!Array.isArray(value?.projects)) errors.push('projects 必须是数组');
  if (!value?.defaults || typeof value.defaults !== 'object') errors.push('defaults 必须是对象');
  return { ok: errors.length === 0, errors };
}
```

将当前默认值和迁移函数原样移动到该模块。`createStatePersistence(storage)` 返回：

```js
{
  load(),                 // { state, source: 'current'|'backup'|'legacy'|'default', warning: string|null }
  scheduleSave(state),    // 100ms 防抖
  saveNow(state),         // 写入前备份上一个合法状态
  flush(),                // 立即写入待保存状态
}
```

`store.js` 使用该接口，并在 `beforeunload` 调用 `flush()`。本阶段只有 `saveLastSettings()` 使用 `scheduleSave()`；供应商、默认模型、历史、项目、版本、图片和任务结果等用户数据变更全部调用 `saveNow()`，避免模糊的“关键/非关键”判断。

- [ ] **Step 4: 运行状态测试和全量测试**

Run: `node --test tests/state-schema.test.mjs && pnpm test`

Expected: PASS；损坏状态恢复备份，现有 v3/v4/v5 fixture 均迁移为合法 v5。

- [ ] **Step 5: 手动验证旧数据加载**

Run: `pnpm start`

Expected: 已有供应商、项目、历史和默认模型保持不变；控制台不出现状态迁移异常。

- [ ] **Step 6: 提交**

```bash
git add src/js/state-schema.js src/js/store.js tests/state-schema.test.mjs
git commit -m "fix: 增加状态备份与损坏恢复"
```

---

### Task 3: 数据目录改为失败即停止

**Files:**
- Create: `src/main/app-data.js`
- Create: `tests/app-data.test.cjs`
- Modify: `main.js:120-138`

**Interfaces:**
- Consumes: Electron `app.getPath('home')` 和 Node `fs`。
- Produces: `resolveAppDataPath({ homePath, fsImpl }) -> string`，失败抛出 `AppDataError`，错误码固定为 `APP_DATA_UNWRITABLE`。

- [ ] **Step 1: 编写不可写目录测试**

```js
// tests/app-data.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAppDataPath } = require('../src/main/app-data');

test('数据目录不可写时抛出明确错误且不回退临时目录', () => {
  const fsImpl = {
    mkdirSync() {},
    accessSync() { throw Object.assign(new Error('denied'), { code: 'EACCES' }); },
    constants: { W_OK: 2 },
  };
  assert.throws(
    () => resolveAppDataPath({ homePath: '/Users/test', fsImpl }),
    (error) => error.code === 'APP_DATA_UNWRITABLE' && error.path === '/Users/test/.miaos',
  );
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/app-data.test.cjs`

Expected: FAIL with `MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现数据目录模块并接入启动流程**

```js
// src/main/app-data.js
const path = require('node:path');

class AppDataError extends Error {
  constructor(targetPath, cause) {
    super(`应用数据目录不可写：${targetPath}`);
    this.name = 'AppDataError';
    this.code = 'APP_DATA_UNWRITABLE';
    this.path = targetPath;
    this.cause = cause;
  }
}

function resolveAppDataPath({ homePath, fsImpl }) {
  const targetPath = path.join(homePath, '.miaos');
  try {
    fsImpl.mkdirSync(targetPath, { recursive: true });
    fsImpl.accessSync(targetPath, fsImpl.constants.W_OK);
    return targetPath;
  } catch (error) {
    throw new AppDataError(targetPath, error);
  }
}

module.exports = { AppDataError, resolveAppDataPath };
```

`main.js` 捕获错误后使用 `dialog.showErrorBox('妙生无法启动', '应用数据目录不可写，请检查 ~/.miaos 权限。')`，设置非零退出码并退出；不得调用 `os.tmpdir()`。

- [ ] **Step 4: 运行测试和权限手动验证**

Run: `node --test tests/app-data.test.cjs && pnpm test`

手动验证：临时将测试 HOME 指向不可写 fixture 启动独立测试进程。

Expected: 显示明确错误并退出，不在系统临时目录生成 `miaos` 数据。

- [ ] **Step 5: 提交**

```bash
git add main.js src/main/app-data.js tests/app-data.test.cjs
git commit -m "fix: 数据目录不可写时阻止静默降级"
```

---

### Task 4: 建立 IPC 校验和可信来源包装

**Files:**
- Create: `src/main/security/validators.js`
- Create: `src/main/security/ipc.js`
- Create: `tests/validators.test.cjs`
- Create: `tests/ipc-security.test.cjs`
- Modify: `main.js:67-110,199-1070`

**Interfaces:**
- Produces: `validateString()`、`validateHttpUrl()`、`validateRepoSlug()`、`validateDataUrl()`、`validateSuggestedName()`、`assertTrustedSender()`、`registerSecureHandler()`。
- `registerSecureHandler({ ipcMain, channel, getMainWindow, validate, handle })` 是本阶段所有 IPC handler 的唯一注册入口。

- [ ] **Step 1: 编写校验器和未知来源测试**

```js
// tests/validators.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateHttpUrl,
  validateRepoSlug,
  validateSuggestedName,
} = require('../src/main/security/validators');

test('拒绝危险协议和非法仓库名', () => {
  assert.throws(() => validateHttpUrl('file:///etc/passwd'), /仅支持 HTTP/);
  assert.throws(() => validateRepoSlug('../owner/repo'), /仓库格式/);
  assert.equal(validateRepoSlug('dick86114/miaos'), 'dick86114/miaos');
});

test('下载文件名移除路径字符', () => {
  assert.equal(validateSuggestedName('../../secret.png'), 'secret.png');
});
```

```js
// tests/ipc-security.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTrustedSender } = require('../src/main/security/ipc');

test('拒绝非主窗口发送的 IPC', () => {
  const mainWindow = { webContents: { id: 10 } };
  assert.throws(() => assertTrustedSender({ sender: { id: 11 } }, mainWindow), /不受信任/);
  assert.doesNotThrow(() => assertTrustedSender({ sender: { id: 10 } }, mainWindow));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/validators.test.cjs tests/ipc-security.test.cjs`

Expected: FAIL with missing modules。

- [ ] **Step 3: 实现安全模块**

校验限制固定为：

| 字段 | 限制 |
|---|---|
| prompt | 1–100000 字符 |
| endpoint | `https:`；仅 `localhost`/`127.0.0.1` 允许 `http:` |
| provider/model/name | 最大 200 字符 |
| repo | `owner/repo`，每段仅字母、数字、点、下划线和连字符 |
| data URL | 仅 `image/png`、`image/jpeg`、`image/webp`，最大 50 MiB |
| suggestedName | basename 后最大 128 字符 |
| category | `image`、`text`、`video` |
| ratio | 现有比例枚举 |
| quality | 现有质量枚举 |

`registerSecureHandler()` 先执行 `assertTrustedSender()`，再执行 channel 的 `validate()`，最后调用 `handle()`；公开错误只返回 `{ ok: false, error, code }`，不返回栈信息。

- [ ] **Step 4: 将所有 IPC 改为安全注册**

逐一覆盖以下 channel：

```text
update-get-current-version
update-check
update-open-release-page
update-configure
save-image
show-in-folder
test-connection
fetch-models
generate-image
save-pasted-image
pick-image-file
pick-text-file
optimize-prompt
summarize-prompt
```

对文件选择这类无参数 handler 仍执行可信来源校验。`show-in-folder` 只允许应用生成目录中的现有文件。

- [ ] **Step 5: 运行测试并手动验证 IPC 功能**

Run: `pnpm test`

Run: `pnpm start`

Expected: 保存图片、打开目录、连接测试、生图、提示词优化和更新检查行为不变；测试直接伪造未知 sender 时被拒绝。

- [ ] **Step 6: 提交**

```bash
git add main.js src/main/security tests/validators.test.cjs tests/ipc-security.test.cjs
git commit -m "security: 增加 IPC 参数与来源校验"
```

---

### Task 5: 使用 safeStorage 保护供应商密钥

**Files:**
- Create: `src/main/secrets-vault.js`
- Create: `tests/secrets-vault.test.cjs`
- Modify: `main.js`
- Modify: `preload.js`
- Modify: `src/js/store.js`
- Modify: `src/js/renderer.js`
- Modify: `src/js/pages/settings.js`
- Modify: `src/js/state-schema.js`
- Modify: `tests/state-schema.test.mjs`

**Interfaces:**
- Produces: `createSecretsVault({ filePath, safeStorage, fsImpl })`，包含 `set(providerId, value)`、`get(providerId)`、`has(providerId)`、`delete(providerId)`。
- Preload 暴露：`setProviderSecret(providerId, value)`、`hasProviderSecret(providerId)`、`deleteProviderSecret(providerId)`。
- 渲染状态中的 provider 使用 `hasApiKey: boolean`，迁移完成后不再保存 `apiKey`。

- [ ] **Step 1: 编写密钥加密、原子写入和损坏文件测试**

```js
// tests/secrets-vault.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createSecretsVault } = require('../src/main/secrets-vault');

const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (buffer) => buffer.toString().replace(/^encrypted:/, ''),
};

test('密钥文件只包含密文且可按 providerId 读取', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-'));
  const filePath = path.join(dir, 'secrets.json');
  const vault = createSecretsVault({ filePath, safeStorage, fsImpl: fs });
  vault.set('p_test', 'sk-secret');
  assert.equal(vault.get('p_test'), 'sk-secret');
  assert.doesNotMatch(readFileSync(filePath, 'utf8'), /sk-secret/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/secrets-vault.test.cjs`

Expected: FAIL with missing module。

- [ ] **Step 3: 实现密钥仓库和 IPC**

`secrets-vault.js` 使用 `safeStorage.encryptString()`，以 Base64 写入 `${userDataPath}/secrets.json`。写入流程固定为：写 `secrets.json.tmp` → `fsync` → rename。`safeStorage.isEncryptionAvailable()` 为 false 时抛出 `SECRET_ENCRYPTION_UNAVAILABLE`，不得明文回退。

注册四个安全 IPC：

```text
provider-secret-set
provider-secret-has
provider-secret-delete
provider-secret-migrate
```

`provider-secret-migrate` 接收 `{ providerId, apiKey }[]`，只有全部写入成功后才返回 `{ ok: true }`。

- [ ] **Step 4: 迁移渲染层状态**

在 `state-schema.js` 保留旧 `apiKey` 字段用于一次性迁移。`renderer.js` 初始化路由前调用：

```js
const result = await migrateLegacyProviderSecrets();
if (!result.ok) {
  toast('API Key 安全迁移失败，旧配置已保留，请检查系统钥匙串', 'error', 8000);
}
```

迁移成功后：

- 删除 provider 的 `apiKey`。
- 设置 `hasApiKey: true`。
- 立即保存清理后的状态。

`settings.js` 对已有密钥显示“已安全保存，留空表示不修改”；用户输入新值时先调用 `setProviderSecret()`，成功后再保存 provider 元数据。删除供应商时先删除密钥，再删除 provider。

- [ ] **Step 5: 主进程请求按 providerId 读取密钥**

`test-connection`、`fetch-models`、`generate-image`、`optimize-prompt`、`summarize-prompt` 请求必须带 `providerId`。主进程从 vault 读取已保存密钥。设置页尚未保存的新供应商允许把输入密钥作为一次性 `apiKeyOverride` 传入连接测试和模型获取，但不得记录或保存该值。

- [ ] **Step 6: 运行自动化和迁移验证**

Run: `pnpm test`

手动验证：

1. 使用包含明文 API Key 的旧 v5 localStorage 启动。
2. 确认供应商仍显示“已配置”。
3. 确认生图和模型获取成功。
4. 确认 localStorage 和日志不再包含明文密钥。
5. 确认 `~/.miaos/secrets.json` 只包含 Base64 密文。

- [ ] **Step 7: 提交**

```bash
git add main.js preload.js src/main/secrets-vault.js src/js/store.js src/js/renderer.js src/js/pages/settings.js src/js/state-schema.js tests/secrets-vault.test.cjs tests/state-schema.test.mjs
git commit -m "security: 使用 safeStorage 保护供应商密钥"
```

---

### Task 6: 抽取统一 HTTP 客户端和公开错误模型

**Files:**
- Create: `src/main/services/app-error.js`
- Create: `src/main/services/http-client.js`
- Create: `tests/http-client.test.cjs`
- Modify: `main.js:238-786,953-1040`

**Interfaces:**
- Produces: `AppError`、`toPublicError(error)`、`requestJson(options)`。
- `requestJson({ url, method, headers, body, timeoutMs, maxRedirects, maxResponseBytes, signal })` 返回解析后的 JSON 或抛出 `AppError`。

- [ ] **Step 1: 编写成功、超时、重定向和响应过大测试**

```js
// tests/http-client.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { requestJson } = require('../src/main/services/http-client');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('请求超时返回统一错误码', async () => {
  await withServer((_req, _res) => {}, async (baseUrl) => {
    await assert.rejects(
      requestJson({ url: baseUrl, timeoutMs: 20 }),
      (error) => error.code === 'NETWORK_TIMEOUT' && error.retryable === true,
    );
  });
});

test('响应超过限制时中止读取', async () => {
  await withServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: 'x'.repeat(2048) }));
  }, async (baseUrl) => {
    await assert.rejects(
      requestJson({ url: baseUrl, maxResponseBytes: 100 }),
      (error) => error.code === 'RESPONSE_TOO_LARGE',
    );
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/http-client.test.cjs`

Expected: FAIL with missing module。

- [ ] **Step 3: 实现错误模型和 HTTP 客户端**

`AppError` 固定字段：

```js
class AppError extends Error {
  constructor(code, userMessage, options = {}) {
    super(userMessage, { cause: options.cause });
    this.code = code;
    this.userMessage = userMessage;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}
```

默认值：`timeoutMs=60000`、`maxRedirects=3`、`maxResponseBytes=10*1024*1024`。错误映射：

- 超时 → `NETWORK_TIMEOUT`
- 401/403 → `AUTH_FAILED`
- 429 → `RATE_LIMITED`
- 5xx → `UPSTREAM_ERROR`
- 非 JSON → `INVALID_RESPONSE`
- 响应过大 → `RESPONSE_TOO_LARGE`
- 用户取消 → `REQUEST_ABORTED`

`toPublicError()` 仅返回 `{ code, error: userMessage, retryable }`。

- [ ] **Step 4: 替换重复请求实现**

删除 `main.js` 中重复的 `requestJson()` 和 `probeEndpoint()` 网络底层，实现连接测试、模型获取、生图、轮询、提示词优化和摘要均复用统一客户端。供应商协议适配逻辑仍保留在原位置，本任务不重构业务分支。

- [ ] **Step 5: 运行测试和供应商回归**

Run: `pnpm test`

手动使用 Mock Server 验证正常响应、401、429、500、超时和异常 JSON；界面提示必须可理解，日志不得出现 `Authorization` 值。

- [ ] **Step 6: 提交**

```bash
git add main.js src/main/services tests/http-client.test.cjs
git commit -m "refactor: 统一网络请求和错误模型"
```

---

### Task 7: 安全渲染更新日志和外部链接

**Files:**
- Create: `src/js/release-notes.js`
- Create: `src/main/security/external-links.js`
- Create: `tests/release-notes.test.mjs`
- Modify: `src/js/pages/settings.js:930-1010`
- Modify: `src/index.html:6`
- Modify: `main.js:161-195`

**Interfaces:**
- Produces: `parseReleaseNotes(markdown) -> Block[]`、`renderReleaseNotes(container, markdown)`、`isAllowedExternalUrl(url)`。
- `Block` 只允许 `paragraph`、`heading`、`list`、`code` 和 `link`，链接协议仅允许 `https:`。

- [ ] **Step 1: 编写恶意更新日志测试**

```js
// tests/release-notes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReleaseNotes } from '../src/js/release-notes.js';

test('更新日志不保留脚本和危险链接', () => {
  const blocks = parseReleaseNotes('<img src=x onerror=alert(1)>\n[危险](javascript:alert(1))\n[安全](https://github.com/dick86114/miaos)');
  const serialized = JSON.stringify(blocks);
  assert.doesNotMatch(serialized, /onerror|javascript:/i);
  assert.match(serialized, /https:\/\/github\.com/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/release-notes.test.mjs`

Expected: FAIL with missing module。

- [ ] **Step 3: 实现安全解析和渲染**

解析器不接受原始 HTML。渲染器只使用 `document.createElement()`、`textContent` 和经过 `new URL()` 验证的 `https:` 链接，不使用拼接后的 `innerHTML`。

将 CSP 改为：

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob: file:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';" />
```

本阶段只移除 `script-src` 的 `unsafe-inline`；内联 style 的清理留到性能与交互计划。

- [ ] **Step 4: 收紧外部链接**

`setWindowOpenHandler` 必须先调用 `isAllowedExternalUrl()`。初始允许域名：

```js
new Set(['github.com', 'www.github.com', 'grsai.ai', 'www.grsai.ai'])
```

其他链接返回 `{ action: 'deny' }` 且不调用 `shell.openExternal()`。更新仓库 owner/repo 必须通过 Task 4 的校验器。

- [ ] **Step 5: 运行测试并手动验证更新页面**

Run: `pnpm test`

Run: `pnpm start`

Expected: 合法 Markdown 正常显示；脚本、HTML 标签和 `javascript:` 链接只显示为文本或被丢弃；GitHub Release 链接可在系统浏览器打开。

- [ ] **Step 6: 提交**

```bash
git add main.js src/index.html src/js/release-notes.js src/js/pages/settings.js src/main/security/external-links.js tests/release-notes.test.mjs
git commit -m "security: 安全渲染更新日志和外部链接"
```

---

### Task 8: 恢复安全运行时默认值并统一发布声明

**Files:**
- Create: `src/main/runtime-security.js`
- Create: `tests/runtime-security.test.cjs`
- Modify: `main.js:130-180`
- Modify: `scripts/postbuild.js`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `.github/workflows/build-dmg.yml`

**Interfaces:**
- Produces: `getRuntimeSecurityConfig(env) -> { legacyMode, sandbox, disableHardwareAcceleration, appendNoSandbox }`。
- 默认安全模式启用 sandbox 和硬件加速；仅显式设置 `MIAOS_LEGACY_RENDERER=1` 时进入兼容模式。

- [ ] **Step 1: 编写安全默认值测试**

```js
// tests/runtime-security.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { getRuntimeSecurityConfig } = require('../src/main/runtime-security');

test('默认启用 sandbox 和硬件加速', () => {
  assert.deepEqual(getRuntimeSecurityConfig({}), {
    legacyMode: false,
    sandbox: true,
    disableHardwareAcceleration: false,
    appendNoSandbox: false,
  });
});

test('只有显式环境变量才进入兼容模式', () => {
  assert.deepEqual(getRuntimeSecurityConfig({ MIAOS_LEGACY_RENDERER: '1' }), {
    legacyMode: true,
    sandbox: false,
    disableHardwareAcceleration: true,
    appendNoSandbox: true,
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/runtime-security.test.cjs`

Expected: FAIL with missing module。

- [ ] **Step 3: 接入运行时安全配置**

默认不再调用：

```js
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
```

仅在 `legacyMode` 为 true 时调用，并将 `BrowserWindow.webPreferences.sandbox` 设置为对应值。保留 `contextIsolation: true` 和 `nodeIntegration: false`。

删除 `autoUpdater.verifyUpdateCodeSignature = false`。由于当前只检测并跳转 GitHub 下载，不允许任何自动下载或自动安装路径重新启用。

- [ ] **Step 4: 更新签名后处理和发布声明**

确认 `postbuild.js` 对 Electron Framework、Helper、Helper (GPU)、Helper (Plugin)、Helper (Renderer) 和主应用逐个签名并验证。失败必须返回非零退出码，不得只打印提示继续。

产品范围固定为 **macOS 12+、Apple Silicon**。README、Release 文案和 `package.json` 只声明 arm64，不再声明 Intel；本计划不增加 x64/universal 构建。

- [ ] **Step 5: 构建并启动安全模式产物**

Run: `pnpm dist`

Run: `open release/mac-arm64/miaos.app`

Expected:

- 应用正常启动，无 Helper 或 GPU 崩溃。
- 页面滚动、动画、图片展示和生图流程正常。
- `ps` 中不存在由应用参数传入的 `--no-sandbox`。
- `codesign --verify --deep --strict release/mac-arm64/miaos.app` 返回 0。

如果安全模式无法启动，本任务不得提交；先保留工作区证据并定位具体 Helper、entitlements 或签名失败点，不得默认回退到兼容模式发布。

- [ ] **Step 6: CI 增加构建安全验证**

在 workflow 产物验证中增加：

```yaml
- name: Verify app signature and architecture
  run: |
    codesign --verify --deep --strict release/mac-arm64/miaos.app
    file release/mac-arm64/miaos.app/Contents/MacOS/miaos | grep arm64
```

- [ ] **Step 7: 运行全量验证**

Run: `pnpm check && pnpm dist`

Expected: 所有测试通过，DMG/ZIP/YML 存在，签名校验通过，工作区仅包含本任务预期文件。

- [ ] **Step 8: 提交**

```bash
git add main.js src/main/runtime-security.js tests/runtime-security.test.cjs scripts/postbuild.js package.json README.md .github/workflows/build-dmg.yml
git commit -m "security: 恢复 Electron 安全运行时默认值"
```

---

### Task 9: 第一阶段端到端验收与结果记录

**Files:**
- Create: `docs/optimization/phase-1-verification.md`
- Modify: `docs/superpowers/plans/2026-08-03-miaos-foundation-security.md`（只勾选完成项）

**Interfaces:**
- Consumes: Task 1–8 的测试、构建和手动验证结果。
- Produces: 可审计的第一阶段验证记录，以及进入“架构治理计划”的门禁结论。

- [x] **Step 1: 运行自动化验证**

Run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm dist
codesign --verify --deep --strict release/mac-arm64/miaos.app
```

Expected: 全部返回 0；`release/` 中 DMG、ZIP、YML 和 `.app` 版本一致。

- [ ] **Step 2: 执行核心人工冒烟**

逐项记录结果：

1. 首次启动和已有数据启动。
2. 旧明文 API Key 自动迁移。
3. 新增、编辑、删除供应商。
4. 连接测试和模型获取。
5. 快速生图、提示词优化、图片保存。
6. 项目创建、主线生成和分支派生。
7. 历史详情、复制提示词和删除。
8. 更新检查和 GitHub Release 页面打开。
9. 损坏当前状态后从备份恢复。
10. 非法 IPC、危险 URL 和恶意更新日志被拒绝。

- [x] **Step 3: 编写验证记录**

`docs/optimization/phase-1-verification.md` 必须包含：

```markdown
# 第一阶段基础与安全验证

## 环境
- macOS 版本：
- 芯片：Apple Silicon
- Node：
- pnpm：10.33.3
- 应用版本：1.0.1

## 自动化结果
| 命令 | 结果 | 备注 |
|---|---|---|

## 人工冒烟结果
| 场景 | 结果 | 证据/备注 |
|---|---|---|

## 已知限制

## 是否允许进入第二阶段
- [ ] 允许
- [ ] 阻塞
```

执行时必须填写真实值，不允许保留空白或模板占位。

- [x] **Step 4: 检查提交范围**

Run: `git status --short && git log --oneline -12`

Expected: `AGENTS.md` 仍保持用户原有未提交状态；没有 `.DS_Store`、`release/`、日志或密钥文件进入 Git。

- [x] **Step 5: 提交验收记录**

```bash
git add docs/optimization/phase-1-verification.md docs/superpowers/plans/2026-08-03-miaos-foundation-security.md
git commit -m "docs: 记录基础与安全阶段验证结果"
```

## 完成门禁

只有同时满足以下条件，才可开始第二阶段“架构治理”：

- `pnpm check` 和 `pnpm dist` 全部通过。
- 旧状态和 API Key 迁移经过真实数据副本验证。
- 默认安全模式打包应用可正常启动，不依赖 `--no-sandbox`。
- 核心生图、项目、历史、供应商和更新流程无回归。
- 第一阶段验证文档中没有未解释的失败项。
