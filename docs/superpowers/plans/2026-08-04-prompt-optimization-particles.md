# 提示词优化霓虹粒子动效 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用覆盖整个提示词输入框的霓虹粒子能量场替换底部频谱扫过动效，并在快速生成页和项目工作台保持一致。

**Architecture:** 两个页面在现有 `.composer-textarea-wrap` 中预置同结构、不可交互的粒子效果层。优化请求仅切换输入框与效果层的 `is-optimizing` 类；CSS 以多层径向渐变和 `transform`/`opacity` 关键帧渲染流光与粒子，不引入 Canvas、计时器或动画循环 JavaScript。

**Tech Stack:** 原生 ES Module、原生 DOM、CSS 动画、Node.js `node:test`。

## Global Constraints

- 所有注释、测试名称和用户文案使用中文。
- 使用 pnpm，不使用 npm。
- 动画关键帧只可修改 `transform` 和 `opacity`。
- 效果层不得接收指针事件，必须位于文本与光标之下。
- `prefers-reduced-motion: reduce` 下不得循环动画，保留静态低对比彩色提示。
- 不新增依赖，不使用 Canvas、SVG 滤镜、`setInterval`、`requestAnimationFrame`。

---

### Task 1: 粒子动效契约与减少动态效果测试

**Files:**
- Modify: `tests/generate-ui-contract.test.mjs`
- Modify: `tests/motion-style.test.mjs`

**Interfaces:**
- Consumes: `src/js/pages/generate.js` 与 `src/js/pages/project.js` 的输入框模板及优化状态类。
- Produces: 对两页粒子层接入、旧频谱条移除和减少动态效果规则的自动化回归保护。

- [ ] **Step 1: 写入失败测试**

在 `tests/generate-ui-contract.test.mjs` 增加测试，要求两个页面都拥有 `class="composer-particle-field"`，优化流程使用 `particleField.classList.add('is-optimizing')` 和 `remove('is-optimizing')`，且源码不再包含 `composer-wave-bar`。

在 `tests/motion-style.test.mjs` 把“波浪进度”测试替换为下列断言：

```js
const particleRule = getAtRuleBlock(reduceMotion, '.composer-particle-field.is-optimizing');
assert.notEqual(particleRule, '', '粒子效果必须提供减少动态效果覆盖');
assert.match(particleRule, /animation:\s*none\s*!important\s*;/u);
assert.match(particleRule, /opacity:\s*1\s*;/u);
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm exec node --test tests/generate-ui-contract.test.mjs tests/motion-style.test.mjs`

Expected: FAIL，因为当前页面没有 `composer-particle-field`，且仍存在 `composer-wave-bar` 与对应减少动态效果规则。

- [ ] **Step 3: 不修改生产代码的前提下确认失败原因**

检查失败输出必须包含粒子层缺失或旧波浪规则断言失败；若失败来自测试语法或文件读取错误，先修正测试本身再重跑。

- [ ] **Step 4: 提交测试基线**

```bash
git add tests/generate-ui-contract.test.mjs tests/motion-style.test.mjs
git commit -m "test: 覆盖提示词优化粒子动效契约"
```

### Task 2: 双页面粒子层与 CSS 能量场实现

**Files:**
- Modify: `src/js/pages/generate.js:47-88,335-367`
- Modify: `src/js/pages/project.js:397-426,685-718`
- Modify: `src/css/pages.css:232-275`

**Interfaces:**
- Consumes: `.composer-textarea-wrap`、`.composer-textarea.is-optimizing`、两个页面的 `btnOptimize` 异步处理器。
- Produces: `.composer-particle-field` 固定效果层与 `.is-optimizing` 生命周期；旧 `.composer-wave-bar` 完全删除。

- [ ] **Step 1: 写入最小实现**

在两个 `.composer-textarea-wrap` 模板中、`textarea` 之前加入：

```html
<div class="composer-particle-field" aria-hidden="true">
  <span class="composer-particle particle-one"></span>
  <span class="composer-particle particle-two"></span>
  <span class="composer-particle particle-three"></span>
  <span class="composer-particle particle-four"></span>
</div>
```

在各自渲染函数中取得 `const particleField = root.querySelector('.composer-particle-field');`。优化开始时与输入框同时添加 `is-optimizing`；`finally` 中移除该类。删除 `composerCard`、`waveBar` 的创建、追加和移除代码。

- [ ] **Step 2: 编写 CSS 能量场**

将旧 `wave-pulse` 与 `composer-wave-bar` 样式替换为：

```css
.composer-textarea-wrap { position: relative; isolation: isolate; }
.composer-particle-field {
  position: absolute;
  inset: -8px;
  z-index: 0;
  overflow: hidden;
  border-radius: 16px;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--motion-normal) var(--motion-ease);
}
.composer-textarea,
.composer-source-preview { position: relative; z-index: 1; }
.composer-particle-field.is-optimizing { opacity: 1; }
```

补充带有青蓝、紫色、粉色径向渐变的 `::before`、`::after` 以及四个 `.composer-particle`。各关键帧仅使用 `transform` 与 `opacity`，以不同持续时间形成流动层次；不得给 textarea 本身添加位移动画。

在减少动态效果媒体查询中为 `.composer-particle-field.is-optimizing` 设置 `animation: none !important; opacity: 1;`，并对所有粒子及伪元素设置 `animation: none !important; transform: none;`。

- [ ] **Step 3: 运行定向测试，确认通过**

Run: `pnpm exec node --test tests/generate-ui-contract.test.mjs tests/motion-style.test.mjs`

Expected: PASS，且静态动画门禁未报告关键帧使用布局属性。

- [ ] **Step 4: 运行完整验证并提交**

```bash
pnpm check
git diff --check
git add src/js/pages/generate.js src/js/pages/project.js src/css/pages.css
git commit -m "feat: 增加提示词优化霓虹粒子动效"
```

### Task 3: Electron 手动验收与独立复审

**Files:**
- Create: `docs/optimization/prompt-particle-verification.md`

**Interfaces:**
- Consumes: Task 1 和 Task 2 的自动化测试结果以及本地 Electron 运行状态。
- Produces: 不虚报的手动验收记录，供后续 Phase 2 汇总使用。

- [ ] **Step 1: 重启测试应用**

Run:

```bash
pkill -TERM -f '/Users/dickies/Documents/workspaces/miaos/.worktrees/foundation-security/node_modules/.pnpm/electron@43.2.0/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron' || true
pnpm start
```

Expected: 仅保留一个来自 `codex/foundation-security` 的 Electron 实例。

- [ ] **Step 2: 执行手动验收**

在快速生成页和项目工作台分别输入有效提示词、触发“优化提示词”，确认：粒子覆盖输入框整体范围；文字与光标可读；没有底部频谱条；动效结束、失败后完全消失；系统减少动态效果下仅显示静态彩色提示。若无法触发真实供应商请求，记录原因，不将该项标记为已通过。

- [ ] **Step 3: 写入验证记录**

创建 `docs/optimization/prompt-particle-verification.md`，按“自动化验证”“已完成的 GUI 检查”“尚待用户/真实供应商验证”分节记录实际结果，不把未执行步骤写为通过。

- [ ] **Step 4: 独立复审、全量回归和提交记录**

邀请只读审查代理检查 CSS 层级、清理路径、减少动态效果和测试覆盖；处理其 P0/P1/P2 意见后运行：

```bash
pnpm check
git diff --check
git add docs/optimization/prompt-particle-verification.md
git commit -m "docs: 记录提示词粒子动效验证"
```
