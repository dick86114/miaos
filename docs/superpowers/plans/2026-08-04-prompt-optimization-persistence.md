# 提示词优化状态与碎片重组动效实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让快速生图与项目生图的提示词优化在切换路由后保持正确状态，并用受性能约束的文字碎片重组动效替代粒子层，同时改善模型名称显示。

**Architecture:** 新建内存型 `prompt-optimization` 状态模块，负责按上下文启动、订阅和结算优化任务。页面只负责将状态映射到 DOM；新建碎片覆盖层工具负责安全拆分文字和创建/销毁视觉节点。CSS 统一提供响应式模型 chip、碎片动画和 reduced-motion 降级规则。

**Tech Stack:** Electron 31、原生 ES Module、原生 DOM、CSS、Node 内建测试运行器、pnpm。

## Global Constraints

- 只使用 pnpm，不新增第三方依赖。
- 所有新增注释、文案和文档使用中文。
- 优化状态只存在运行期内存，不写入 `localStorage`、项目数据或供应商配置。
- 动画只允许修改 `transform` 与 `opacity`；碎片层必须 `aria-hidden` 且 `pointer-events: none`。
- 在 `prefers-reduced-motion: reduce` 下不得播放碎片运动。
- 保持现有 Hash 路由、`main.js` / `preload.js` IPC 边界和快速/项目生图生成逻辑不变。

---

## 文件结构

- 新建 `src/js/prompt-optimization.js`：运行期任务状态机、上下文键、订阅、异步结算与文字碎片 DOM 工具。
- 修改 `src/js/pages/generate.js`：快速生图接入 `quick` 上下文并恢复挂载状态。
- 修改 `src/js/pages/project.js`：项目版本接入 `projectId + versionId` 上下文并恢复挂载状态。
- 修改 `src/css/pages.css`：模型 chip 响应式、碎片覆盖层、仅 transform/opacity 的关键帧与 reduced-motion 规则。
- 修改 `tests/generate-ui-contract.test.mjs`、`tests/motion-style.test.mjs`：更新 DOM/CSS 契约。
- 新建 `tests/prompt-optimization.test.mjs`：状态机、订阅、成功/失败、并发和碎片数量上限测试。
- 如当前项目页测试已有合适契约，修改对应测试；否则新建 `tests/project-prompt-optimization.test.mjs` 覆盖项目上下文。

## Task 1: 运行期优化状态机与碎片工具

**Files:**
- Create: `src/js/prompt-optimization.js`
- Create: `tests/prompt-optimization.test.mjs`

**Interfaces:**
- Produces `createPromptOptimizationManager({ optimize })`，返回 `{ getState(context), subscribe(context, listener), start(context, prompt), clear(context) }`。
- `start(context, prompt)` 在空闲时返回 `{ started: true, promise }`；同一上下文优化中返回 `{ started: false, reason: 'optimizing' }`。
- 状态对象为 `{ status, prompt, startedAt, result, error }`，状态为 `idle`、`optimizing`、`succeeded` 或 `failed`。
- Produces `createPromptFragmentOverlay({ container, textarea, prompt, maxFragments })`，返回 `{ mount(), settle(), destroy(), fragmentCount }`。

- [x] **Step 1: 写失败测试**

在 `tests/prompt-optimization.test.mjs` 覆盖：状态初始 idle；启动后通知 optimizing；重复启动被拒绝；成功通知 succeeded 并带 result；失败通知 failed 并保留错误；取消订阅后不再通知；片段数量受 `maxFragments` 限制、覆盖层 `aria-hidden="true"` 且不可交互。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec node --test tests/prompt-optimization.test.mjs`

Expected: FAIL，因为状态模块和碎片工具尚不存在。

- [x] **Step 3: 最小实现**

实现纯内存 `Map` 状态和上下文订阅集合。异步优化完成后以同一上下文的最新任务 token 结算，避免陈旧结果覆盖新任务。碎片按短词/字符分段，最多 36 个节点，使用安全的 `textContent` 构建 DOM；`settle()` 添加结束类并在 transition/animation 安全回调后销毁，`destroy()` 幂等。

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm exec node --test tests/prompt-optimization.test.mjs`

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add src/js/prompt-optimization.js tests/prompt-optimization.test.mjs
git commit -m "feat: 增加提示词优化状态机"
```

## Task 2: 快速生图和项目生图接入跨路由状态

**Files:**
- Modify: `src/js/pages/generate.js`
- Modify: `src/js/pages/project.js`
- Modify: `tests/generate-ui-contract.test.mjs`
- Create or Modify: `tests/project-prompt-optimization.test.mjs`

**Interfaces:**
- Consumes `createPromptOptimizationManager` 单例、`subscribe(context, listener)`、`start(context, prompt)` 和 `createPromptFragmentOverlay`。
- Produces统一页面绑定函数：根据 `optimizing`、`succeeded`、`failed` 应用输入框只读、按钮加载、overlay、toast 和清理；页面 cleanup 只调用 unsubscribe/overlay.destroy。

- [x] **Step 1: 写失败测试**

为快速页与项目页建立可替换依赖的契约：优化进行中离开页面后，同一上下文新挂载会收到 optimizing 并恢复只读/加载/碎片层；离开期间成功后重新挂载会写入新提示词并恢复可编辑；失败后重新挂载显示错误且恢复可编辑；重复点击不创建第二个请求。

- [x] **Step 2: 运行相关测试确认失败**

Run: `pnpm exec node --test tests/generate-ui-contract.test.mjs tests/project-prompt-optimization.test.mjs`

Expected: FAIL，旧代码状态被页面局部 `finally` 清理且没有共享订阅。

- [x] **Step 3: 最小实现**

删除两页各自的 `withButtonLoading` 包裹式优化生命周期，改为共享管理器驱动。快速页固定 context `quick`；项目页仅在 `projectId`、当前 `versionId` 存在时使用组合 context。订阅回调统一管理按钮、`aria-busy`、`readOnly`、`is-optimizing` 与 overlay；完成状态只消费一次并回到 idle，避免重新挂载重复 toast。保留原有文本供应商校验与中文反馈。

- [x] **Step 4: 运行相关测试确认通过**

Run: `pnpm exec node --test tests/generate-ui-contract.test.mjs tests/project-prompt-optimization.test.mjs`

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add src/js/pages/generate.js src/js/pages/project.js tests/generate-ui-contract.test.mjs tests/project-prompt-optimization.test.mjs
git commit -m "feat: 保留跨页面提示词优化状态"
```

## Task 3: 替换粒子层、完善碎片动画和模型名称响应式

**Files:**
- Modify: `src/js/pages/generate.js`
- Modify: `src/js/pages/project.js`
- Modify: `src/css/pages.css`
- Modify: `tests/generate-ui-contract.test.mjs`
- Modify: `tests/motion-style.test.mjs`

**Interfaces:**
- Consumes每页的 `composer-textarea-wrap` 与状态绑定中创建的碎片 overlay。
- Produces `.composer-fragment-overlay`、`.composer-fragment`、`.is-settling` CSS 契约及 `.composer-chip--model` 响应式选择器。

- [x] **Step 1: 写失败测试**

更新页面契约，要求不再存在 `.composer-particle-field` / `.composer-particle` 静态节点，模型值包含完整名称 `title` 语义且 model chip 带专用类。更新动作样式测试，要求碎片关键帧只写 `transform`、`opacity`，reduced-motion 中关闭 `.composer-fragment` 动画，且原粒子关键帧不再存在。

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm exec node --test tests/generate-ui-contract.test.mjs tests/motion-style.test.mjs`

Expected: FAIL，当前 DOM 和 CSS 仍是粒子能量场与固定 140px 文本限制。

- [x] **Step 3: 最小实现**

从两页模板移除粒子节点，保留输入框包装层作为碎片挂载点。模型 chip 加专用 class，模型变更时同步完整名称到文本和 `title`。CSS 中让 model chip 在宽屏弹性扩展、普通 chip 维持内容宽度；窄屏按媒体查询收缩并允许单行省略。删除粒子层和全部粒子关键帧，新增碎片覆盖层、错位/归位关键帧和 reduced-motion 静态降级；确保覆盖层裁剪在输入区、不会遮挡参考图或交互。

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm exec node --test tests/generate-ui-contract.test.mjs tests/motion-style.test.mjs`

Expected: PASS。

- [x] **Step 5: 提交**

```bash
git add src/js/pages/generate.js src/js/pages/project.js src/css/pages.css tests/generate-ui-contract.test.mjs tests/motion-style.test.mjs
git commit -m "feat: 重构提示词优化碎片动效"
```

## Task 4: 集成验证与验收记录

**Files:**
- Modify: `docs/superpowers/plans/2026-08-04-prompt-optimization-persistence.md`（勾选完成步骤）
- Create: `.superpowers/sdd/2026-08-04-prompt-optimization-persistence/verification.md`

**Interfaces:**
- Consumes前三项实现和现有 Electron 启动脚本。
- Produces可复核的命令输出摘要、GUI 手动验证范围和未验证限制。

- [x] **Step 1: 运行完整自动化验证**

Run: `pnpm check && git diff --check`

Expected: 所有 Node 测试通过，零 diff 格式错误。

- [ ] **Step 2: 启动 Electron 验收**

Run: `pnpm start`

验证快速页和项目页的模型长名称、优化中切换到其他 Hash 路由再返回、成功/失败清理、窄窗口不挤压生成按钮，以及系统减少动态效果下的静态状态。不得为验证修改密钥或供应商配置。

> 2026-08-04：已完成隔离环境下的受控 Electron 启动探测；未执行真实 GUI 操作、真实文本模型调用或系统 reduced-motion 切换，因此本步骤保留未勾选。详见 `.superpowers/sdd/2026-08-04-prompt-optimization-persistence/verification.md`。

- [x] **Step 3: 记录验收结果并提交**

在验证记录中区分自动化已验证、GUI 已验证和因本地文本模型配置而未覆盖的路径。

```bash
git add docs/superpowers/plans/2026-08-04-prompt-optimization-persistence.md .superpowers/sdd/2026-08-04-prompt-optimization-persistence/verification.md
git commit -m "docs: 记录提示词优化验收结果"
```
