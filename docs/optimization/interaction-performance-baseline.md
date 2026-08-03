# 交互与列表渲染本地性能基线

## 目的与边界

本基线只覆盖本地内存队列通知与稳定列表的 DOM 批量构造；不读取真实 `~/.miaos` 数据，不使用供应商凭据，不发起外部请求，也不上传遥测。它用于发现本阶段局部更新的结构性回归，不替代后续 GUI 帧率、动画、滚动和图片加载人工验收。

## 固定数据

数据生成器：`tests/fixtures/interaction-baseline.mjs`

- 历史图片：200 条；
- 项目：50 个；
- 版本节点：100 个（每个项目 2 个）；
- 队列场景：同一事件循环内一次 `enqueue()` 后立即 `cancel()`。

## 复现命令

```bash
node --test tests/queue-render.test.mjs
node --input-type=module -e "import { measureInteractionBaseline } from './tests/fixtures/interaction-baseline.mjs'; console.log(JSON.stringify(measureInteractionBaseline(), null, 2));"
```

## 初始记录

记录日期：2026 年 8 月 3 日。

环境：macOS 26.5.2（arm64）、Node v26.5.1。每项运行 20 轮，记录首次通过稳定 key 列表和单个 `DocumentFragment` 的批量构造中位数。

| 测量 | 固定数据 | 初始中位数 | 确定性结构断言 | 用途 |
| --- | --- | ---: | --- | --- |
| 历史图片列表 | 200 张卡片 | 0.214ms | 200 个节点、1 个 `DocumentFragment` | 监控历史筛选/局部更新的构造成本 |
| 项目列表 | 50 个项目节点 | 0.023ms | 50 个节点、1 个 `DocumentFragment` | 单独记录项目规模下的稳定列表批量构造 |
| 项目版本节点 | 100 个版本节点 | 0.041ms | 100 个节点、1 个 `DocumentFragment` | 单独记录时间轴数据规模下的稳定列表批量构造 |
| 队列通知 | 同步入队再取消 | 不适用 | 1 次最终 `canceled` 快照 | 防止同步状态变更导致逐次 notify 风暴 |

## 自动化与人工对比边界

`pnpm check` 只强制验证确定性的 DOM 节点数、`DocumentFragment` 次数、队列合并通知与串行语义；**不会**把上述毫秒数作为 CI 硬失败门槛，避免把易波动的微基准误判为回归。

Task 5/人工验收时，应在相同机器、相同 Node 版本、相同命令和固定 fixture 下复测上述中位数。若任一项高于本表初始值的 110%，需要记录原因并确认 GUI 体验未退化；环境或 Node 版本变化时，先新增环境基线，不能跨环境直接比较。

后续 Task 5 还需补充真实 GUI 下的历史图片滚动、队列卡片更新和 reduce-motion 手工观察结果。
