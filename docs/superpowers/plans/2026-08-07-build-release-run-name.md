# Build And Release 运行记录名称 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 让 GitHub Actions 的 Build And Release 运行记录显示手动输入的版本号和更新日志。

**Architecture:** 在现有 `.github/workflows/build-dmg.yml` 顶层增加动态 `run-name`。手动触发使用 `inputs.version` 和 `inputs.release_notes`，push 触发使用固定 CI 文案；其余构建和发布步骤保持不变。

**Tech Stack:** GitHub Actions YAML、GitHub Actions expression syntax。

## Global Constraints

- 使用中文注释和用户可见文案。
- 不改变现有构建、发布、版本覆盖和 Release 正文逻辑。
- 不提交、不推送、不触发 Release。

---

### Task 1: 增加动态 workflow 运行名称

**Files:**
- Modify: `.github/workflows/build-dmg.yml:1-9`

**Interfaces:**
- Consumes: `github.event_name`、`inputs.version`、`inputs.release_notes`。
- Produces: GitHub Actions 运行列表中的动态名称。

- [ ] **Step 1: 修改 workflow 顶层名称**

将固定名称改为 `Build And Release`，并在其后增加：

```yaml
run-name: >-
  ${{ github.event_name == 'workflow_dispatch'
      && format('Build And Release：v{0}，{1}', inputs.version, inputs.release_notes)
      || 'Build And Release：CI 构建' }}
```

这样手动触发显示版本号和更新日志，push 触发不引用空的手动输入。

- [ ] **Step 2: 检查差异**

运行 `git diff -- .github/workflows/build-dmg.yml`，确认只涉及 workflow 名称和运行名称。

### Task 2: 验证 workflow 配置

**Files:**
- Test: `.github/workflows/build-dmg.yml`

**Interfaces:**
- Consumes: Task 1 的 workflow 文件。
- Produces: 可被 GitHub Actions 解析的配置。

- [ ] **Step 1: 校验 YAML 语法**

优先运行 `ruby -e "require 'yaml'; YAML.load_file('.github/workflows/build-dmg.yml')"`。若本机 YAML 解析器将 GitHub Actions 的 `on` 误识别为布尔值，只记录该兼容性现象，并改用项目已有校验方式或结构检查。

- [ ] **Step 2: 检查表达式和格式**

运行：

```bash
rg -n "^name:|^run-name:|workflow_dispatch|format\(" .github/workflows/build-dmg.yml
git diff --check
```

预期：同时存在 `name`、`run-name`、`workflow_dispatch` 和动态 `format` 表达式，无 whitespace 错误。
