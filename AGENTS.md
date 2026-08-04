# Repository Guidelines

## 项目结构与模块职责

这是一个基于 Electron 31 的 macOS 本地生图应用。`main.js` 负责主进程、IPC、网络请求和 `~/.miaos/` 文件读写；`preload.js` 只暴露经过审查的渲染层 API。前端入口为 `src/index.html`，页面模块位于 `src/js/pages/`，公共状态、路由、队列和 DOM 工具分别在 `store.js`、`router.js`、`queue.js`、`ui.js`。样式按主题、外壳和页面拆分到 `src/css/`。`build/` 保存图标，`scripts/` 保存打包后处理脚本，`release/` 为构建产物，除明确更新发布文件外不要手工修改。

## 开发、构建与验证

使用 pnpm 管理依赖，不要新增 npm 安装命令：

```bash
pnpm install          # 安装依赖
pnpm start            # 启动 Electron
pnpm dev              # 启动并输出 Electron 日志
pnpm build:dir        # 构建 arm64 .app 并执行后处理
pnpm dist             # 生成 DMG
pnpm dist:zip         # 生成 zip 分发包
```

当前未配置自动化测试、Lint 或格式化脚本。修改后至少运行 `pnpm start`，手动覆盖受影响页面、Hash 路由、IPC 调用及本地数据读写；涉及打包、签名或自动更新时再运行相应构建命令。

## 代码风格与命名

沿用现有原生 ES Module 与 CSS 写法：JavaScript 使用 2 空格缩进、单引号、分号；函数和变量使用 `camelCase`，类名和 CSS 选择器使用 `kebab-case`，页面文件以功能命名，如 `src/js/pages/projects.js`。保持模块职责单一，避免在渲染层直接使用 Node API；新增 IPC 必须同时更新 `main.js`、`preload.js` 和调用方。注释、用户可见文案和新增文档均使用中文。

## 提交与拉取请求

提交历史采用中文动词前缀，例如 `feat: 新增自动更新功能`、`fix: 修复更新日志格式化`、`refactor: 重构设置页`。每个提交只处理一个可验证目标。PR 说明应包含改动范围、验证命令和结果、潜在风险；UI 修改附截图或录屏，关联对应 Issue。不要提交 API Key、`~/.miaos/` 数据、临时日志或无关构建产物。

## 安全与配置

供应商密钥仅保存在用户本地配置中。日志、错误提示和截图中必须脱敏密钥；修改网络端点、权限边界或本地文件路径时，优先采用最小权限和向后兼容方案。
