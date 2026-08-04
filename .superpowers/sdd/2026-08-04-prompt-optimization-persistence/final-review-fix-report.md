# 整分支复审修复报告

## 修复范围

本轮仅修复复审简报中的 4 个 Important 问题；未进行项目页/生成页共享 binding 抽取，也未修改 Hash 路由、IPC、生成队列、供应商配置、用户数据或第三方依赖。

## 修改文件

- `src/js/prompt-optimization.js`
  - `createPromptFragmentOverlay.settle()` 现在返回可等待的 Promise，并只在碎片结算动画结束或 500ms 兜底结束后销毁覆盖层。
- `src/js/pages/generate.js`
  - binding 销毁时关闭该 binding 创建的 `duration: 0` 优化中 Toast，保留共享优化请求。
  - 成功/失败状态先等待 overlay settle；成功状态在 settle 后才写回 textarea，并随后将共享状态清回 `idle`。
  - 结算期间持续保持优化中的只读与禁用状态，避免重复启动和结果写回竞态。
- `src/css/pages.css`
  - 碎片动画改为无限的“归位 → 碎裂 → 归位”循环；关键帧只修改 `transform`、`opacity`。
  - 为 `.composer-textarea.is-optimizing` 增加实际弱化的 `opacity: 0.28`。
  - 模型 chip 改为基于剩余可用宽度收缩；长模型名始终在 chip 内单行省略，不再依赖固定 viewport 媒体查询，也不会 `overflow: visible` 覆盖后续控件。
- `tests/prompt-optimization.test.mjs`
  - 增加 overlay 可等待结算的真实行为测试。
- `tests/project-prompt-optimization.test.mjs`
  - 增加 binding destroy 关闭常驻 Toast、成功结果等待 settle 后写回及状态清理时序测试。
- `tests/generate-ui-contract.test.mjs`
  - 增加 textarea 真实弱化、模型 chip 收缩/省略约束、碎裂—重组循环的 CSS 合约测试。

## RED → GREEN

### RED

新增测试后，执行：

```bash
pnpm exec node --test tests/prompt-optimization.test.mjs tests/project-prompt-optimization.test.mjs tests/generate-ui-contract.test.mjs
```

结果：退出码 `1`，共 `23` 项测试，`18` 通过、`5` 失败。失败项准确覆盖以下未实现行为：

1. 优化中 textarea 缺少真实视觉弱化及模型 chip 省略约束。
2. 碎片动画仅执行一次，未循环重组。
3. 销毁 binding 未关闭常驻优化 Toast。
4. 成功结果在碎片结算前即写回且共享状态提前清空。
5. overlay `settle()` 未暴露可等待的结算结果。

### GREEN：受影响测试

```bash
pnpm exec node --test tests/prompt-optimization.test.mjs tests/project-prompt-optimization.test.mjs tests/generate-ui-contract.test.mjs tests/motion-style.test.mjs
```

结果：退出码 `0`，`46` 通过、`0` 失败。包含 reduced-motion 下停止碎片运动、关键帧仅使用 `transform`/`opacity` 的门禁。

### GREEN：完整校验

```bash
pnpm check
git diff --check
```

结果：均退出码 `0`；`pnpm check` 为 `203` 通过、`0` 失败；`git diff --check` 无输出。

### 启动冒烟

```bash
pnpm start
```

结果：Electron 成功启动并加载 `file:///.../src/index.html#/generate`；已在默认快速生图页观察到模型 chip、工具栏和页面内容正常渲染。随后正常终止验收进程，未修改用户本地数据。

## 提交

实现提交：`e88abf383af12c8656cb8363c00cf4cc8e9f7a0e`（`fix: 修复提示词优化结算与工具栏约束`）

## 未覆盖项

- 未使用真实供应商凭据发起优化请求：避免触碰供应商配置和用户数据；请求完成、离页 Toast 清理、settle 时序均由可控异步行为测试覆盖。
- 未在手工缩窄窗口中注入超长模型名称：未修改本地模型配置；chip 的 `min-width: 0`、剩余空间 flex、单行省略及完整 `title` 同步由 CSS/页面合约测试覆盖。
