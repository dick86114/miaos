# Build And Release 运行记录名称设计

## 目标

让 GitHub Actions 的 `Build And Release` workflow 运行记录直接显示手动输入的版本号和更新日志，便于在列表中区分不同发版任务。

## 方案

- 保留现有 `workflow_dispatch` 的 `version`、`release_notes` 和 `prerelease` 输入字段。
- 将 workflow 固定显示名调整为 `Build And Release`。
- 增加动态 `run-name`：手动触发时显示 `Build And Release：v版本号，更新日志`。
- push 到 `main` 时恢复提交信息作为运行名称，与未设置 `run-name` 时的 GitHub 默认行为一致。
- 不改变版本覆盖、构建产物、GitHub Release 标签或 Release 正文逻辑。

## 验证

- 使用 YAML 解析器确认 workflow 结构有效。
- 检查动态表达式同时覆盖手动触发和 push 触发两条路径。
- 使用 `git diff --check` 检查格式问题。

## 范围

本次只修改 `.github/workflows/build-dmg.yml` 及本设计记录，不提交、不推送、不触发 GitHub Actions。
