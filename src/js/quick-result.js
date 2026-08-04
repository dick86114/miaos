// 快速生图主展示区只展示最新完成且含有效图片的任务，队列数据保持不变。
export function getLatestQuickDoneTask(tasks) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.source === 'quick' && task.status === 'done' && task.result?.image)
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))[0] || null;
}
