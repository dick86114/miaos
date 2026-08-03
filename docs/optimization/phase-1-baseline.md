# 第一阶段性能与环境基线

记录范围：Task 1 包管理迁移、Electron 安装验证、以及当前自动桌面环境可采集的最小 GUI/渲染基线。

## 测试机器

| 项目 | 结果 |
| --- | --- |
| 记录日期 | 2026-08-03 |
| 机器 | MacBook Air |
| 型号 | Mac17,3 |
| 芯片 | Apple M5 |
| CPU | 10 核（4 Super + 6 Efficiency） |
| 内存 | 32 GB |
| macOS | 26.5.2（Build 25F84） |
| Node.js | v26.5.1 |
| pnpm | 10.33.3 |
| 应用版本 | 1.0.1 |
| Electron | 43.2.0 |
| 代码规模 | 35 个源/文档/配置文件，合计 14854 行（main.js、preload.js、src、scripts、.github、docs） |

## 迁移前依赖失败基线

| 项目 | 结果 |
| --- | --- |
| 状态 | 迁移前失败基线，仅作为问题背景；本轮按控制器要求未再次下载或启动 Electron 31.7.7 |
| 失败复验命令 | `pnpm exec electron --version` |
| 失败现象 | pnpm 10.33.3 默认阻止 `electron@31.7.7` 的官方 postinstall，Electron 可执行入口未正确生成 |
| 关键错误 | `Error: Electron failed to install correctly, please delete node_modules/electron and try installing again` |
| 安全发现 | `electron@31.7.7` 的原始 macOS notarization 已撤销，真实用户会收到 XProtect “恶意软件并移到废纸篓”弹窗；该版本不得再下载、启动或通过 ad-hoc 重签名规避 |

## 当前安装验证基线

| 项目 | 结果 |
| --- | --- |
| 安装命令 | `npm_config_registry=https://registry.npmjs.org pnpm install --frozen-lockfile` |
| Electron 版本命令 | `pnpm exec electron --version` |
| Electron 版本结果 | `v43.2.0` |
| 自定义 postinstall | 无 |
| 自定义重下载/重签名脚本 | 无 |
| pnpm 构建脚本白名单 | `pnpm.onlyBuiltDependencies = ['electron']`，仅允许官方 Electron postinstall 执行 |

## GUI 与渲染基线

### 测量方法

- 冷启动到窗口出现：运行真实应用入口 `pnpm exec electron .`，使用临时脚本轮询 macOS System Events 中 Electron/miaos/妙生进程窗口是否出现。
- 首屏可操作：使用 Electron 43 临时测量脚本打开真实 `src/index.html` 与 `preload.js`，等待首屏主操作控件选择器出现。该指标是自动化可得的 DOM 可操作代理值，不包含人工鼠标点击确认。
- 200 条历史渲染：临时测量脚本向 `localStorage['miaos.state.v5']` 注入 synthetic 大状态，导航到 `#/history`，等待 `.history-card` 达到 200 个并等待双 `requestAnimationFrame`。
- 100 个版本节点渲染：同一 synthetic 大状态包含一个 100 版本节点项目，导航到 `#/project/p_big`，等待 `.pwb-timeline-node` 达到 100 个并等待双 `requestAnimationFrame`。
- 连续切换页面 30 次后的内存：同一 Electron 43 临时测量脚本在 `#/generate`、`#/history`、`#/projects`、`#/project/p_big`、`#/settings` 间切换 30 次，随后用 `ps -o rss=` 记录测量进程 RSS。

### 三次结果

| 指标 | 第 1 次 | 第 2 次 | 第 3 次 | 中位数 | 证据/边界 |
| --- | ---: | ---: | ---: | ---: | --- |
| 冷启动到窗口出现 | 847.66 ms | 410.15 ms | 667.68 ms | 667.68 ms | 真实 `pnpm exec electron .` 启动，System Events 自动轮询窗口；未做人工视觉确认 |
| 首屏可操作 | 15.30 ms | 9.76 ms | 8.07 ms | 9.76 ms | Electron 43 临时测量脚本，主控件选择器出现；该值是 DOM 可操作代理，不是人工点击耗时 |
| 200 条历史渲染 | 40.50 ms | 29.20 ms | 34.60 ms | 34.60 ms | 注入 synthetic 200 历史状态，等待 200 个 `.history-card` |
| 100 个版本节点渲染 | 49.80 ms | 47.70 ms | 49.70 ms | 49.70 ms | 注入 synthetic 100 版本节点项目，等待 100 个 `.pwb-timeline-node` |
| 连续切换页面 30 次后的内存 | 164368 KB | 168656 KB | 170544 KB | 168656 KB | 30 次 hash 路由切换后用 `ps -o rss=` 采集测量进程 RSS |

### 仍需人工确认的边界

1. 首屏可操作当前是 DOM 代理值，未人工点击按钮；控制器如需人工确认，可启动 `pnpm exec electron .` 后在首屏点击提示词输入框和发送按钮，记录从窗口出现到控件接受输入的三次耗时。
2. 历史与版本渲染使用 synthetic localStorage 状态和临时 Electron harness，未通过真实用户历史文件或人工 DevTools Performance 录制；控制器如需浏览器性能火焰图，可用同一 synthetic 状态打开 DevTools Performance 录制 `#/history` 和 `#/project/p_big`。
3. 内存为 Electron 临时测量主进程 RSS，不等价于 Activity Monitor 中所有 Electron Helper 进程合计；控制器如需用户视角总内存，可在 Activity Monitor 中筛选 Electron/miaos，执行同样 30 次路由切换后记录所有相关进程总和。
