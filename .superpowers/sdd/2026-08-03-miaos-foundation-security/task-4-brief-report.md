# Task 4 第 5 次修复报告

## Status

已完成两个开放 Important 的最小修复，未修改 `AGENTS.md`，未进入 secrets、HTTP、CSP 或 sandbox 范围。所有改动仅发生在当前 `foundation-security` worktree。

## 修复内容

1. 恢复 WebP 文件兼容
   - `pick-image-file` 过滤器恢复 `webp`。
   - 受控 WebP 文件与 BMP 文件共用安全 fallback：先通过 same-fd buffer 完成身份、大小、MIME 和内容校验，再写入私有临时目录。
   - macOS 使用固定 `/usr/bin/sips`、固定参数数组转换为 PNG；下游使用经过 `nativeImage` 正尺寸验证的 PNG buffer。
   - direct WebP data URL 也走同一安全 buffer→私有临时→sips→PNG 流程。
   - zero-VP8 WebP、伪容器和无效 BMP 在网络请求前拒绝。

2. 移除主进程同步 sips
   - `decodeImageBuffer`、`validateDataUrl`、`validateGenerateParams`、文件授权和 source image 读取链路改为 async，并由安全 IPC wrapper await 校验。
   - 每次 fallback 只启动一次异步 `/usr/bin/sips -s format png input --out output`。
   - 使用 `shell: false`、参数数组、64 KiB 子进程输出上限和最多 5 秒 timeout；超时杀进程。
   - 成功后读取 PNG 并再次使用 `nativeImage` 验证正尺寸；所有临时目录在 finally 清理。
   - 主进程与生产安全模块未发现 `spawnSync` 或同步 sips 调用。

## 行为矩阵

| 输入 | 授权/解码 | 下游行为 |
|---|---|---|
| PNG/JPEG | nativeImage 正尺寸 | 保持原 MIME 和原 buffer，允许进入下游 |
| 真实 BMP（normal/topdown） | 异步单次 sips 转 PNG，nativeImage 最终验证 | 使用 `image/png` PNG buffer 进入下游 |
| 真实 WebP 文件 | picker 可选；异步单次 sips 转 PNG，nativeImage 最终验证 | 使用 `image/png` PNG buffer 进入下游 |
| 真实 WebP data URL | 异步安全 fallback 转 PNG | 使用 `image/png` PNG buffer 进入下游 |
| zero-VP8 WebP | sips/最终 nativeImage 校验失败 | HTTP 请求数为 0 |
| 伪 PNG/JPEG/WebP/BMP、invalid BMP | 内容解码失败 | HTTP 请求数为 0 |
| 未授权、符号链接、同路径替换文件 | 文件身份/权限校验失败 | HTTP 请求数为 0 |

## 验证

- `pnpm test`：38/38 通过。
- `node --test tests/image-decoder.test.cjs tests/validators.test.cjs`：9/9 通过。
- `node --test tests/main-startup.test.cjs tests/electron-native-image.test.cjs`：13/13 通过。
- `git diff --check`：通过。
- `node --check`：`main.js`、`image-decoder.js`、`image-files.js`、`validators.js`、`ipc.js` 均通过。
- `pnpm start`：Electron 成功启动；随后为结束验证会话主动发送 SIGINT，中止退出码 1 属于人工停止，不是启动异常。

## 关注点

- fallback 依赖 macOS `/usr/bin/sips`；非 macOS 平台仍不会绕过 nativeImage 去启用系统转换。
- 授权阶段和生成阶段允许分别进行异步 decode，当前没有新增持久化转换缓存，以保留已有文件 identity/hash/same-fd 安全边界。
- 生产日志没有记录用户路径或 sips 输出内容。
