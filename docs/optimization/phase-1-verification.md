# 第一阶段基础与安全验证

> 验证时间：2026-08-03 20:45:16 +0800；工作分支：`codex/foundation-security`；验收基线：`be49b26`。

## 环境

- macOS 版本：26.5.2（Darwin 25.5.0）
- 芯片：Apple Silicon（arm64）
- Node：v26.5.1
- pnpm：10.33.3
- Electron：43.2.0
- 应用版本：1.0.1

## 自动化结果

| 命令或检查 | 结果 | 备注 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | 通过 | 锁文件最新；187ms 完成。 |
| `pnpm check` | 通过 | `node --test tests`，104/104 通过，0 失败。 |
| `pnpm dist` | 通过 | 生成 `miaos-1.0.1-arm64.dmg`、`miaos-1.0.1-arm64-mac.zip`、`latest-mac.yml` 与 `.app`。构建中有 npm 未知环境配置警告，但命令退出码为 0。 |
| `codesign --verify --deep --strict release/mac-arm64/miaos.app` | 通过 | 应用包及 DMG 内 `.app` 均验证通过。 |
| 产物完整性 | 通过 | `hdiutil verify` 返回 VALID；`unzip -t` 无错误；YML 指向的 ZIP 存在。 |
| 版本、架构与最低系统 | 通过 | `package.json`、Info.plist、YML 和 DMG/ZIP 文件名均为 1.0.1；主二进制和 DMG 内二进制均为 arm64；`LSMinimumSystemVersion` 为 12.0.0。 |
| 默认安全模式启动 | 通过（非图形验收） | 使用隔离临时 HOME 启动打包应用 8 秒，主进程持续运行且未检测到 `--no-sandbox`；未操作图形界面。 |
| 恶意边界回归 | 通过 | 104 个自动化测试覆盖非法 IPC、危险 URL、恶意更新日志、状态备份恢复、密钥迁移与供应商密钥不泄漏。 |

## 人工冒烟结果

| 场景 | 结果 | 证据/备注 |
| --- | --- | --- |
| 首次启动和已有数据启动 | 部分执行 | 已在隔离临时 HOME 中完成首次启动的进程级验证；未使用或读取真实已有用户数据，也未进行 GUI 操作。 |
| 旧明文 API Key 自动迁移 | 未人工执行 | 自动化测试覆盖成功迁移、失败时保留旧值和非法 providerId 不清理旧密钥；未使用真实数据副本。 |
| 新增、编辑、删除供应商 | 未人工执行 | 自动化测试覆盖主进程事务、回滚和公开 provider 无 Authorization；未操作设置页。 |
| 连接测试和模型获取 | 未人工执行 | 使用测试服务覆盖请求、错误分类与脱敏；未调用真实供应商。 |
| 快速生图、提示词优化、图片保存 | 未执行 | 未获调用可能收费供应商的授权，且不读取或使用任何凭据。 |
| 项目创建、主线生成和分支派生 | 未人工执行 | 未进行 GUI 操作；相关状态与数据恢复逻辑已由自动化测试覆盖。 |
| 历史详情、复制提示词和删除 | 未人工执行 | 未进行 GUI 操作或真实历史数据操作。 |
| 更新检查和 GitHub Release 页面打开 | 未人工执行 | 自动化测试验证更新日志安全渲染、严格外链白名单与拦截；未打开真实 Release 页面。 |
| 损坏当前状态后从备份恢复 | 自动化通过 | 自动化测试覆盖损坏主状态时从 backup 恢复且不覆盖有效 backup。 |
| 非法 IPC、危险 URL 和恶意更新日志被拒绝 | 自动化通过 | 自动化测试覆盖未知 sender、URL 混淆/控制字符和更新日志 HTML/危险协议拒绝。 |

## Git 卫生

- 主仓库 `/Users/dickies/Documents/workspaces/miaos` 的用户未提交 `AGENTS.md` 已仅只读核查，未修改、未暂存、未提交。
- 已取消跟踪历史过程产物 `.superpowers/sdd/2026-08-03-miaos-foundation-security/task-4-brief-report.md`；正式计划与 `docs/` 内容保留。
- `release/` 与 `.superpowers/sdd/` 下的过程产物已被忽略；提交前的精确 Git 卫生检查已确认没有 `.DS_Store`、release、日志、`.env` 或过程产物进入跟踪范围。

## 已知限制

1. 当前验收环境未使用可操作 Electron 图形界面的自动化，也没有用户对真实 GUI 和真实供应商流程的显式授权；所有未人工执行场景均未被当作通过。
2. 未读取、复制或修改真实用户的 `~/.miaos` 数据和 API Key；因此“真实数据副本迁移”门禁未满足。
3. 未发起可能收费的真实供应商生图、提示词优化或连接调用；因此核心业务端到端回归未完成。
4. `codesign --verify --deep --strict` 通过，但当前产物为 ad-hoc 签名（`TeamIdentifier=not set`）；未验证 Developer ID 签名、公证或对外分发信任链。
5. 构建脚本最终发布 DMG、ZIP、YML 和 `.app`；未保留可选的 ZIP blockmap，且 `latest-mac.yml` 未引用它。

## 是否允许进入第二阶段

- [ ] 允许
- [x] 阻塞

阻塞原因：自动化、打包、签名校验与隔离启动均已通过，但真实数据副本迁移、默认安全模式下的 GUI 冒烟，以及不涉及未授权收费操作的核心业务人工流程尚未完成。完成这些门禁并记录结果前，不进入第二阶段“架构治理”。
