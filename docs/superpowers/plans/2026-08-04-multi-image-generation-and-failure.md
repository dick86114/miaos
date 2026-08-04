# 多张生图与失败详情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为快速生图和项目生图增加 1–4 张独立队列任务、项目同款占位卡片和统一失败详情弹窗。

**Architecture:** 数量控件仅在渲染层展开为多个独立任务；队列保存批次元数据；快速页与项目页复用批次卡片和失败详情弹窗，不向 IPC 增加不兼容的供应商数量参数。

**Tech Stack:** 原生 ES Module、CSS、Node.js `node:test`。

## Global Constraints

- 使用 pnpm；中文注释和文案；无第三方依赖。
- 数量只能为 1–4，默认 1。
- 多张生图创建独立串行任务；不向主进程生图参数增加 `n`。
- 失败详情显示完整错误与生成参数，支持遮罩/Escape/焦点恢复关闭。

---

### Task 1: 批次任务元数据与数量控件基础

**Files:** `src/js/queue.js`、`src/js/pages/generate.js`、`src/js/pages/project.js`、相关测试。

- [ ] 先为 queue 的 `batchIndex`、`batchTotal` 和 1–4 任务展开写失败测试；验证单张保持 1/1、多张创建不同 id 且参数相同。
- [ ] 运行定向 RED。
- [ ] 实现批次字段和快速/项目数量控件，点击生成创建对应数量任务。
- [ ] 运行 GREEN、`pnpm check` 并提交 `feat: 支持批量生图任务`。

### Task 2: 项目同款快速占位卡片与失败详情

**Files:** `src/js/pages/generate.js`、`src/js/pages/project.js`、`src/js/image-preview.js`、`src/css/pages.css`、相关测试。

- [ ] 为快速 queued/running 卡片结构、失败详情弹窗、完整错误与参数写失败测试。
- [ ] 运行定向 RED。
- [ ] 复用项目画廊占位结构；为失败任务增加详情操作；实现失败详情弹窗与响应式样式。
- [ ] 运行 GREEN、`pnpm check`、`git diff --check` 并提交 `feat: 增加失败详情与统一任务卡片`。

### Task 3: Electron 验收与复审

**Files:** `docs/optimization/multi-image-generation-verification.md`。

- [ ] 重启 Electron，验证单张、四张、快速/项目占位、失败详情；无法触发的真实供应商项如实记录。
- [ ] 完整测试、独立复审、提交验证记录。
