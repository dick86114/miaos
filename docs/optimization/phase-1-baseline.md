# 第一阶段性能与环境基线

> 记录时间：2026-08-03 11:07:13 CST  
> 记录范围：Task 1 可自动获得的环境、代码规模、依赖状态，以及需要人工 GUI 操作的性能门禁。  
> 重要说明：当前执行环境无法进行人工点击、DevTools Performance 录制或 Activity Monitor 截图采集，因此涉及窗口出现、首屏可操作、历史/版本渲染和页面连续切换后的内存数据均标记为“未测量”。这些项目必须在执行 Task 9 前由人工在 GUI 环境完成三次测量并补充截图路径，不得用估算值替代。

## 测试机器

| 项目 | 结果 |
| --- | --- |
| 机器 | MacBook Air |
| 型号 | Mac17,3 |
| 芯片 | Apple M5 |
| CPU | 10 核（4 Super + 6 Efficiency） |
| 内存 | 32 GB |
| macOS | 26.5.2（Build 25F84） |
| Node.js | v26.5.1 |
| pnpm | 10.33.3 |
| 应用版本 | 1.0.1 |
| 代码规模 | 35 个源/文档/配置文件，合计 14854 行（main.js、preload.js、src、scripts、.github、docs） |

## 自动可得的依赖基线

| 项目 | 结果 |
| --- | --- |
| 当前包管理器状态 | 仓库基线仍包含 package-lock.json，尚未包含 pnpm-lock.yaml |
| 当前 Electron 可运行性 | 失败 |
| 失败命令 | `npx --no-install electron --version` |
| 失败原因 | Electron 安装不完整，当前 node_modules 下 `electron@31.7.7` 缺少 postinstall 产生的可执行文件路径 |
| 关键错误 | `Error: Electron failed to install correctly, please delete node_modules/electron and try installing again` |

## GUI 性能基线

| 指标 | 测量步骤 | 三次结果 | 中位数 | 截图/证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 冷启动到窗口出现 | 清理后台进程后运行 `pnpm start`，从命令触发计时到主窗口出现 | 未测量 | 未测量 | 未采集 | 阻塞：当前自动化环境无法人工确认窗口出现 |
| 首屏可操作 | 冷启动后从窗口出现到主要按钮可点击/页面可交互 | 未测量 | 未测量 | 未采集 | 阻塞：当前自动化环境无法人工点击验证 |
| 200 条历史渲染 | 使用 `tests/fixtures/large-state.mjs` 生成 200 条历史数据，打开历史页并录制渲染耗时 | 未测量 | 未测量 | 未采集 | 阻塞：需 DevTools Performance 录制 |
| 100 个版本节点渲染 | 使用固定大数据 fixture 生成版本节点，打开项目版本视图并录制渲染耗时 | 未测量 | 未测量 | 未采集 | 阻塞：需 DevTools Performance 录制 |
| 连续切换页面 30 次后的内存 | 启动应用后连续切换页面 30 次，在 Activity Monitor 或 DevTools 记录内存 | 未测量 | 未测量 | 未采集 | 阻塞：需人工 GUI 操作和内存截图 |

## Task 9 前手动门禁

执行 Task 9 前必须补充以下内容：

1. 在同一台或明确记录的新测试机器上，每个 GUI 指标执行三次测量。
2. 记录每次原始数值和中位数。
3. 对无法直接从脚本输出的项目，补充 DevTools Performance 或 Activity Monitor 截图路径。
4. 若测试机器、Node、pnpm、应用版本或 fixture 参数变化，必须在本文件新增一组独立基线，不能覆盖本次记录。
