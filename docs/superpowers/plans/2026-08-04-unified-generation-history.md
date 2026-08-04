# 统一生成历史与图片预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一快速生图、项目生图与历史记录的图片展示、分页、预览、项目定位和批量删除体验。

**Architecture:** 在 store 层新增纯数据选择器，将快速记录与项目版本图片标准化为统一历史条目；抽取共享图片预览/全屏缩放组件；快速页只保留活跃队列与持久化快速历史，历史页使用混合数据源。Hash 路由扩展项目版本和图片定位参数。

**Tech Stack:** 原生 ES Module、原生 DOM、Hash 路由、CSS、Node.js `node:test`。

## Global Constraints

- 使用 pnpm；注释、测试和用户文案均使用中文。
- 不新增第三方依赖，不使用 Canvas。
- 快速历史每页 12 条；全量历史每页 24 条。
- 分页仅渲染当前页，采用稳定 key 和事件委托。
- 全屏缩放必须支持滚轮缩放、拖拽平移、Escape/遮罩关闭与焦点恢复。
- 项目图片跳转使用 `#/project/<projectId>?version=<versionId>&image=<imageId>`。

---

### Task 1: 统一历史数据选择器、分页与批量删除基础

**Files:**
- Create: `src/js/history-data.js`
- Modify: `src/js/store.js`
- Create: `tests/history-data.test.mjs`

- [ ] **Step 1: 写失败测试**

测试 `getPaginatedQuickHistory(records, { page, pageSize: 12 })`、`getUnifiedHistory({ history, projects }, { page, pageSize: 24, query, source })`：按时间降序、项目/快速来源标签、复合稳定 key、筛选后回到合法页、项目图片保留 project/version/image 定位字段。测试 `deleteHistoryRecords(selection)` 对快速与项目条目分派正确删除操作。

- [ ] **Step 2: 运行 RED**

Run: `pnpm exec node --test tests/history-data.test.mjs`

Expected: FAIL，因为选择器与批量删除 API 尚不存在。

- [ ] **Step 3: 最小实现**

在 `history-data.js` 实现无副作用的数据标准化、过滤、排序与分页；在 `store.js` 增加批量删除包装，快速记录走 `deleteHistory`，项目图片走 `deleteImage`，返回实际删除数量。

- [ ] **Step 4: GREEN 与提交**

```bash
pnpm exec node --test tests/history-data.test.mjs
git add src/js/history-data.js src/js/store.js tests/history-data.test.mjs
git commit -m "feat: 增加统一历史数据与分页选择器"
```

### Task 2: 统一弹窗预览、全屏缩放与项目定位路由

**Files:**
- Create: `src/js/image-preview.js`
- Modify: `src/js/router.js`
- Modify: `src/js/pages/project.js`
- Modify: `src/css/pages.css`
- Create: `tests/image-preview.test.mjs`
- Modify: `tests/router-lifecycle.test.mjs`

- [ ] **Step 1: 写失败测试**

测试共享预览控制器：弹窗关闭、遮罩关闭、Escape、焦点恢复；全屏层切换、缩放范围、拖拽平移重置；项目条目提供项目跳转回调。测试项目路由能解析 `version` 与 `image` 查询参数并传给项目页。

- [ ] **Step 2: 运行 RED**

Run: `pnpm exec node --test tests/image-preview.test.mjs tests/router-lifecycle.test.mjs`

Expected: FAIL，因为共享预览和项目定位参数尚不存在。

- [ ] **Step 3: 最小实现**

抽取 `openImagePreview(record, options)`；使用两层原生 DOM overlay 实现弹窗和沉浸式缩放层。路由把查询参数解析成项目页参数；项目页选中目标版本、渲染后打开目标图片。

- [ ] **Step 4: GREEN 与提交**

```bash
pnpm exec node --test tests/image-preview.test.mjs tests/router-lifecycle.test.mjs
git add src/js/image-preview.js src/js/router.js src/js/pages/project.js src/css/pages.css tests/image-preview.test.mjs tests/router-lifecycle.test.mjs
git commit -m "feat: 统一图片预览与项目定位跳转"
```

### Task 3: 快速生图页改为队列加持久化快速历史

**Files:**
- Modify: `src/js/pages/generate.js`
- Modify: `src/css/pages.css`
- Modify: `tests/generate-ui-contract.test.mjs`

- [ ] **Step 1: 写失败测试**

要求生成页不再使用主大图预览或已完成队列卡片；活跃区只包含 queued/running；快速历史由 `getHistory()` 与分页选择器渲染，默认 12 条；翻页、查看预览、保存、详情通过委托处理。

- [ ] **Step 2: 运行 RED**

Run: `pnpm exec node --test tests/generate-ui-contract.test.mjs`

Expected: FAIL，因为页面仍有 `queue-result-preview` 和完成任务队列渲染。

- [ ] **Step 3: 最小实现**

删除快速页主预览与完成队列区，改为输入框后的活跃队列和分页快速历史。生成完成后的队列通知触发历史数据重新读取；卡片使用项目画廊同款图片/操作/参数布局。

- [ ] **Step 4: GREEN 与提交**

```bash
pnpm exec node --test tests/generate-ui-contract.test.mjs
git add src/js/pages/generate.js src/css/pages.css tests/generate-ui-contract.test.mjs
git commit -m "refactor: 快速生图整合持久化历史"
```

### Task 4: 全量历史页、批量管理与菜单文案

**Files:**
- Modify: `src/index.html`
- Modify: `src/js/pages/history.js`
- Modify: `src/css/pages.css`
- Create: `tests/history-page.test.mjs`

- [ ] **Step 1: 写失败测试**

测试侧边栏四项新文案；历史页使用统一历史选择器、搜索、来源筛选、24 条分页、批量模式、删除确认；项目卡点击预览并提供跳转入口。

- [ ] **Step 2: 运行 RED**

Run: `pnpm exec node --test tests/history-page.test.mjs`

Expected: FAIL，因为现有页面仅显示快速历史且无筛选、分页和批量模式。

- [ ] **Step 3: 最小实现**

历史页使用混合条目和共享预览；批量模式维护当前筛选结果中的选择集合，底部操作条删除选中项，操作后修正页码。修改侧栏文案。

- [ ] **Step 4: GREEN 与提交**

```bash
pnpm exec node --test tests/history-page.test.mjs
git add src/index.html src/js/pages/history.js src/css/pages.css tests/history-page.test.mjs
git commit -m "feat: 重构全量历史与批量删除"
```

### Task 5: 全量验证与 Electron 验收记录

**Files:**
- Create: `docs/optimization/unified-history-verification.md`

- [ ] **Step 1: 运行全量检查**

```bash
pnpm check
git diff --check
```

- [ ] **Step 2: 重启 Electron 并人工验收**

验证菜单、快速历史分页、混合历史、预览弹窗、全屏缩放、项目跳转与批量删除；未能使用真实供应商的项目如实记录为待验收。

- [ ] **Step 3: 提交记录并独立复审**

```bash
git add docs/optimization/unified-history-verification.md
git commit -m "docs: 记录统一历史重构验证"
```
