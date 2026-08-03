# 交互与列表渲染本地性能基线

## 目的与边界

本基线只覆盖本地内存队列通知与稳定列表节点构造；不读取真实 `~/.miaos` 数据，不使用供应商凭据，不发起外部请求，也不上传遥测。它用于发现本阶段局部更新的回归，不替代后续 GUI 帧率、动画和图片滚动人工验收。

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

- 系统：macOS 26.5.2（arm64）；
- Node：v26.5.1；
- 采样：20 轮，取稳定列表首次批量构造的中位数；
- 历史列表节点：200 张卡片；
- 每轮批量提交：1 个 `DocumentFragment`；
- 首轮构造中位数：0.217ms；
- 同步入队再取消的 listener 通知：1 次，且为最终 `canceled` 快照；
- 项目/版本固定数据：50 个项目、100 个版本节点。

## 回归门槛

在相同机器、相同 Node 版本、相同命令和固定 fixture 下：

1. 稳定列表首次批量构造的中位数不得高于 0.239ms（0.217ms 的 110%）；
2. 200 条历史卡片与 1 个 `DocumentFragment` 的节点/批量提交数量不得增加；
3. 同步队列状态变更仍必须合并为 1 次通知；
4. 若环境或 Node 版本变化，先记录新的基线，再以新基线的 110% 作为门槛，不能把跨环境数值直接比较。

后续 Task 5 需要补充真实 GUI 下的历史图片滚动、队列卡片更新和 reduce-motion 手工观察结果。
