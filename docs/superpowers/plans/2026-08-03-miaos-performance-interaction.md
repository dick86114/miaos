# 妙生流畅度、动画与反馈优化实施计划

> **供代理执行：** 必须使用 `superpowers:subagent-driven-development`，按任务逐项实现、独立审查和修复闭环；每项用复选框追踪。

**目标：** 在不改变现有页面布局与产品功能的前提下，消除页面渲染空白风险，降低重复 DOM 重建与动画布局抖动，并统一异步反馈、Toast 和减少动态效果支持。

**架构：** 保持原生 ES Module 与现有 Hash 路由。先为路由建立显式的页面清理与可恢复错误状态，随后抽取轻量交互原语；CSS 只增加语义化运动变量和明确属性动画。性能优化以测量和局部更新为先，不引入框架、虚拟列表或远程埋点。

**技术栈：** Electron 43、原生 ES Module、原生 CSS、Node 内置 `node:test`、pnpm。

## 全局约束

- 所有注释、文档、用户文案均使用中文；前端依赖和命令使用 pnpm。
- 不迁移 Tauri、不引入 React/Vue、不改变现有页面布局、色彩或信息架构。
- 不读取、复制、修改真实 `~/.miaos` 数据或 API Key；不发起可能收费的真实供应商请求。
- 动画仅使用 `opacity`、`transform` 等合成属性；禁止新增 `transition: all`。
- 默认尊重 `prefers-reduced-motion: reduce`；保留功能，不以动画作为状态表达的唯一方式。
- 每个任务必须先写失败测试，再做最小实现；完成后运行 `pnpm check` 和任务定向测试。
- 第一阶段的真实数据迁移、正式签名和发布门禁仍独立保留；本计划不把它们表述为已完成。

---

### Task 1：路由页面生命周期与可恢复渲染错误状态

**文件：**
- Modify: `src/js/router.js`
- Modify: `src/js/ui.js`
- Modify: `src/js/pages/generate.js`
- Modify: `src/js/pages/projects.js`
- Modify: `src/js/pages/project.js`
- Modify: `src/js/pages/history.js`
- Modify: `src/js/pages/detail.js`
- Modify: `src/js/pages/settings.js`
- Create: `tests/router-lifecycle.test.mjs`

**接口：**
- 页面渲染函数允许返回 `() => void` 清理函数；未返回时保持兼容。
- `mountPage(container, element, options)` 支持 `options.retry`，渲染异常时由路由显示可恢复错误状态。
- 路由切换前调用上一路由的清理函数；相同 Hash 主动刷新也先清理再重建。

- [ ] **Step 1：编写失败测试**

覆盖三件事：上页清理函数恰好调用一次；渲染函数抛错时主容器显示中文错误与“重新加载”按钮；点击重试会重新执行当前路由，而非留下空白区域。

- [ ] **Step 2：确认测试失败**

Run: `node --test tests/router-lifecycle.test.mjs`

Expected: FAIL，当前路由没有生命周期和错误边界。

- [ ] **Step 3：实现最小路由生命周期**

在 `router.js` 保存当前清理函数与当前路由重试闭包。使用 `try/finally` 确保切换前清理；对未知路由维持现有跳转行为。新增 `ui.js` 的错误状态 DOM 构造器，使用 `textContent` 和按钮事件，不拼接不受信任 HTML。

- [ ] **Step 4：逐页返回清理函数**

仅为存在订阅、定时器、窗口事件、Observer 或全局监听的页面返回实际清理函数。不得为无资源页面制造空清理逻辑；队列订阅必须在离开生成页/项目页后取消。

- [ ] **Step 5：验证并提交**

Run: `node --test tests/router-lifecycle.test.mjs && pnpm check`

Commit:
```bash
git add src/js/router.js src/js/ui.js src/js/pages tests/router-lifecycle.test.mjs
git commit -m "refactor: 增加页面生命周期和错误恢复"
```

---

### Task 2：统一 Toast、异步按钮与确认反馈

**文件：**
- Modify: `src/js/ui.js`
- Modify: `src/js/pages/settings.js`
- Modify: `src/js/pages/generate.js`
- Modify: `src/js/pages/project.js`
- Modify: `src/css/shell.css`
- Modify: `src/css/pages.css`
- Create: `tests/ui-feedback.test.mjs`

**接口：**
- `toast(message, type, options)` 支持稳定 `key`、手动关闭、`aria-live`、相同 key 更新而非无限堆叠。
- `withButtonLoading(button, label, operation)` 保持按钮宽高、禁用重复点击，并在 `finally` 恢复原状态。
- `confirmDialog` 保持当前布尔语义，但优先使用应用内轻量对话框；无 DOM 测试环境可注入原生 confirm fallback。

- [ ] **Step 1：编写失败测试**

验证同 key Toast 只有一个节点且文案更新；加载包装器即使 operation 抛错也恢复 disabled 与原文案；确认对话框 Escape/取消返回 false。

- [ ] **Step 2：确认测试失败**

Run: `node --test tests/ui-feedback.test.mjs`

Expected: FAIL，当前 Toast 无 key/关闭/aria，按钮加载逻辑在页面中重复。

- [ ] **Step 3：实现交互原语**

用 DOM API 创建 Toast 与确认对话框。Toast 保持现有视觉语义；关闭、自动关闭和离场动画完成后再删除。异步按钮只替换内部可见状态，保留固定最小宽度，所有错误继续由调用方决定提示内容。

- [ ] **Step 4：迁移高频异步入口**

优先迁移设置页连接测试/模型获取/保存供应商，以及生图页与项目页的生成、提示词优化入口。不得改动请求参数、队列顺序或安全错误文案。

- [ ] **Step 5：验证并提交**

Run: `node --test tests/ui-feedback.test.mjs && pnpm check`

Commit:
```bash
git add src/js/ui.js src/js/pages src/css/shell.css src/css/pages.css tests/ui-feedback.test.mjs
git commit -m "feat: 统一异步反馈与提示状态"
```

---

### Task 3：建立运动变量、减少动态效果与明确动画属性

**文件：**
- Modify: `src/css/theme.css`
- Modify: `src/css/shell.css`
- Modify: `src/css/pages.css`
- Create: `tests/motion-style.test.mjs`

**接口：**
- `:root` 提供 `--motion-fast: 120ms`、`--motion-normal: 180ms`、`--motion-slow: 240ms` 与统一缓动变量。
- 全局 `@media (prefers-reduced-motion: reduce)` 禁用非必要循环/进入动画，并将过渡时间降至可访问的最小值。

- [ ] **Step 1：编写失败静态样式测试**

测试 CSS 必须存在三种运动变量与 reduce media query；`src/css/` 中不得保留 `transition: all`。

- [ ] **Step 2：确认测试失败**

Run: `node --test tests/motion-style.test.mjs`

Expected: FAIL，现有样式包含多处 `transition: all` 且没有统一 reduce 规则。

- [ ] **Step 3：替换高频动画样式**

把 `transition: all` 替换为精确属性（如 `background-color`、`border-color`、`color`、`box-shadow`、`transform`、`opacity`）。保持现有视觉节奏，只统一为运动变量；不得为宽高、left/top、margin、padding 添加动画。

- [ ] **Step 4：完善页面、Toast、弹窗的进退场规则**

页面进入仅使用 opacity/4–6px transform，普通刷新不重复播放；Toast 与弹窗离场结束后删除；加载旋转在 reduce 模式停用或降级为静态状态。

- [ ] **Step 5：验证并提交**

Run: `node --test tests/motion-style.test.mjs && pnpm check`

Commit:
```bash
git add src/css/theme.css src/css/shell.css src/css/pages.css tests/motion-style.test.mjs
git commit -m "style: 统一动画变量与减少动态效果"
```

---

### Task 4：页面局部更新、队列通知合并与列表渲染基线

**文件：**
- Modify: `src/js/queue.js`
- Modify: `src/js/pages/generate.js`
- Modify: `src/js/pages/project.js`
- Modify: `src/js/pages/history.js`
- Modify: `src/js/ui.js`
- Create: `tests/queue-render.test.mjs`
- Create: `tests/fixtures/interaction-baseline.mjs`
- Create: `docs/optimization/interaction-performance-baseline.md`

**接口：**
- 队列通知以单个 microtask/动画帧合并，同一轮状态变更最多通知一次。
- `subscribe(listener)` 继续返回取消订阅函数；快照不允许调用方改写内部任务。
- 固定基线数据：200 条历史、50 个项目、100 个版本节点，记录渲染耗时和 DOM 节点数量。

- [ ] **Step 1：编写失败测试**

验证连续同步 `enqueue/cancel` 不会产生逐次 notify 风暴；取消订阅后不再触发；快照修改不会污染内部队列。

- [ ] **Step 2：确认测试失败**

Run: `node --test tests/queue-render.test.mjs`

Expected: FAIL，当前每次状态变化立即通知。

- [ ] **Step 3：实现队列批量通知**

将 notify 改为调度器：同一事件循环批次只生成一次快照并通知。保留异常 listener 隔离；结束后立即尝试下一任务的既有串行语义不变。

- [ ] **Step 4：减少高频页面全量重建**

仅针对队列卡片和历史图片列表实现局部/批量更新：使用 `DocumentFragment`、事件委托、稳定 item key；不重写项目树算法，不在无性能数据前引入虚拟列表。

- [ ] **Step 5：建立可重复的本地基线**

使用固定 fixture 测量 DOM 构造和队列通知次数。文档记录命令、机器环境、初始数值与“主要页面不得退化超过 10%”门槛；不得上传遥测。

- [ ] **Step 6：验证并提交**

Run: `node --test tests/queue-render.test.mjs && pnpm check`

Commit:
```bash
git add src/js/queue.js src/js/pages src/js/ui.js tests/queue-render.test.mjs tests/fixtures/interaction-baseline.mjs docs/optimization/interaction-performance-baseline.md
git commit -m "perf: 合并队列通知并优化列表渲染"
```

---

### Task 5：体验阶段验收、人工检查与回归记录

**文件：**
- Create: `docs/optimization/phase-2-interaction-verification.md`
- Modify: `docs/superpowers/plans/2026-08-03-miaos-performance-interaction.md`

- [ ] **Step 1：运行自动化与构建验证**

Run:
```bash
pnpm check
pnpm dist
codesign --verify --deep --strict release/mac-arm64/miaos.app
```

- [ ] **Step 2：执行本地 GUI 冒烟**

记录：路由反复切换、设置/供应商切换、快速生图排队/取消、项目进入/返回、历史图片滚动、Toast/弹窗、reduce motion 模式。真实供应商调用只有在用户授权后执行。

- [ ] **Step 3：填写真实验收记录**

验证文档必须填入实际命令、测试数量、截图或操作备注、性能基线对比和已知限制；未执行项必须标为未执行，不得留空或虚报。

- [ ] **Step 4：最终审查与提交**

Run:
```bash
git status --short
git diff --check
```

Commit:
```bash
git add docs/optimization/phase-2-interaction-verification.md docs/superpowers/plans/2026-08-03-miaos-performance-interaction.md
git commit -m "docs: 记录交互体验优化验证结果"
```
