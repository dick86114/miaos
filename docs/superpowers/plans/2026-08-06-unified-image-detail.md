# 统一图片详情与自适应提示词输入框 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有成功图片的预览统一为详情页布局，完整展示当前及父节点提示词，并让快速生图输入框按内容自适应到最多十行。

**Architecture:** 在现有 `#/detail/:id` 路由基础上扩展统一详情记录解析器，使快速历史、统一历史和项目图片都能通过稳定的来源参数进入同一详情页。详情页负责展示大图、完整提示词、派生链、参数和操作；旧成功图片弹层入口改为导航到详情页，失败详情继续使用轻量弹层。快速生图输入框在 `input` 事件中依据计算行高同步高度，并由 CSS 限制最大十行及内部滚动。

**Tech Stack:** Electron 43、原生 ES Module、Hash 路由、原生 DOM/CSS、Node 内置 test runner、pnpm。

## Global Constraints

- 所有用户文案、注释和文档使用中文。
- 不修改或回退工作区中与本计划无关的未提交改动。
- 前端不得直接访问 Node API；所有文件保存继续走 `window.api` IPC。
- 图片详情中的项目父节点链必须按根节点到直接父节点顺序显示，当前图片提示词独立完整展示。
- 快速生图输入框最多显示十行，超过时仅内部滚动。
- 使用 `pnpm` 执行测试与启动命令。

---

### Task 1: 自适应提示词输入框与快速历史操作精简

**Files:**
- Modify: `src/js/pages/generate.js`
- Modify: `src/css/pages.css`
- Modify: `tests/generate-ui-contract.test.mjs`

**Interfaces:**
- Consumes: `#prompt-input`、快速历史 `data-history-act` 事件委托。
- Produces: 输入框高度同步函数；快速历史只保留预览和下载操作。

- [ ] **Step 1: 写入失败测试**
  - 断言快速页存在绑定 `input` 的自适应高度逻辑。
  - 断言高度计算使用十行上限，CSS 为输入框提供 `overflow-y: auto`。
  - 断言快速历史卡片不再输出 `data-history-act="detail"`，并保留预览与下载动作。

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test -- --test-name-pattern='自适应|快速历史.*详情'`

Expected: FAIL，因为当前输入框没有十行上限逻辑且快速历史仍输出详情按钮。

- [ ] **Step 3: 最小实现**
  - 在快速生图页面挂载后同步提示词输入框高度，初始化、输入、优化提示词回填后均执行。
  - 高度取 `scrollHeight` 与计算行高十倍加内边距上限中的较小值。
  - 从快速历史卡片模板删除重复详情按钮；预览动作改为导航到统一详情页。

- [ ] **Step 4: 运行测试转绿**

Run: `pnpm test -- --test-name-pattern='自适应|快速历史.*详情'`

Expected: PASS。

### Task 2: 统一图片详情记录解析与父节点链

**Files:**
- Create: `src/js/image-detail-data.js`
- Modify: `src/js/pages/detail.js`
- Modify: `src/js/pages/generate.js`
- Modify: `src/js/pages/history.js`
- Modify: `src/js/pages/project.js`
- Modify: `src/js/router.js`
- Test: `tests/image-detail-data.test.mjs`

**Interfaces:**
- Consumes: 快速历史、`getUnifiedHistory()` 返回的项目图片记录、项目及版本数据。
- Produces: `resolveImageDetailRecord({ id, source, projectId, versionId }, data)`，返回 `image`、完整 `prompt`、`promptChain`、参数和返回目标。

- [ ] **Step 1: 写入失败测试**
  - 快速图片解析出详情记录和“返回快速生图”。
  - 项目图片解析出当前图片提示词与根到父的 `promptChain`。
  - 缺失父版本时不抛错，保留当前图片详情。

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test -- --test-name-pattern='图片详情记录|父节点提示词'`

Expected: FAIL，因为统一详情数据解析器尚不存在。

- [ ] **Step 3: 最小实现**
  - 将项目提示词链构建逻辑迁移/抽取为不依赖页面 DOM 的共享选择器。
  - 用来源、项目、版本和图片 ID 生成稳定详情路由参数。
  - 详情页改为读取统一详情记录；右侧使用只读可滚动提示词区和父节点链区。
  - 返回按钮按来源跳回快速生图、历史或项目，并仅在可删除的快速历史中显示删除操作。

- [ ] **Step 4: 运行测试转绿**

Run: `pnpm test -- --test-name-pattern='图片详情记录|父节点提示词'`

Expected: PASS。

### Task 3: 所有成功图片预览入口统一跳转详情页

**Files:**
- Modify: `src/js/pages/generate.js`
- Modify: `src/js/pages/history.js`
- Modify: `src/js/pages/project.js`
- Modify: `src/js/image-preview.js`
- Modify: `tests/generate-ui-contract.test.mjs`
- Modify: `tests/project-gallery.test.mjs`

**Interfaces:**
- Consumes: Task 2 产生的详情路由构造方法。
- Produces: 快速历史、全量历史和项目图片点击预览统一导航到详情页；失败任务仍调用 `openImagePreview`。

- [ ] **Step 1: 写入失败测试**
  - 断言成功图片预览不再调用 `openImagePreview`。
  - 断言失败详情仍调用 `openImagePreview`。
  - 断言项目图片导航携带项目、版本及图片定位参数。

- [ ] **Step 2: 运行失败测试**

Run: `pnpm test -- --test-name-pattern='成功图片.*详情页|失败详情'`

Expected: FAIL，因为成功图片仍使用弹层预览。

- [ ] **Step 3: 最小实现**
  - 所有成功图片卡片及图片点击改为 `navigate()` 进入详情页。
  - 保留 `openImagePreview` 仅处理失败任务详情和必要的无图片错误状态。
  - 删除不再使用的成功预览关闭状态与重复入口。

- [ ] **Step 4: 运行测试转绿**

Run: `pnpm test -- --test-name-pattern='成功图片.*详情页|失败详情'`

Expected: PASS。

### Task 4: 视觉与回归验证

**Files:**
- Modify: `src/css/pages.css`
- Modify: `src/css/theme.css`（仅在统一详情新增类需要深色主题覆盖时）
- Test: `tests/generate-ui-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1–3 的 DOM 类与数据。
- Produces: 与既有图二详情页一致的桌面双栏和窄屏堆叠布局。

- [ ] **Step 1: 完成 CSS**
  - 右侧提示词、父节点提示词链均完整可滚动，不使用省略号截断。
  - 保留图二的左图右信息比例，窄窗自动改为上下布局。
  - 输入框滚动条仅在超过十行后出现。

- [ ] **Step 2: 运行完整验证**

Run:
```bash
pnpm test
node --check src/js/image-detail-data.js
node --check src/js/pages/detail.js
node --check src/js/pages/generate.js
node --check src/js/pages/history.js
node --check src/js/pages/project.js
git diff --check
```

Expected: 所有测试通过，语法检查与 diff 检查均无错误。

- [ ] **Step 3: 启动并手动检查 Electron**

Run: `pnpm exec electron . --enable-logging --remote-debugging-port=9226`

Check:
- 输入框从一行增长至十行后停止增长并内部滚动；
- 快速历史只剩预览和下载；
- 三类成功图片都进入详情页；
- 项目图片右侧显示当前完整提示词和父节点提示词；
- 失败任务详情仍可打开。
