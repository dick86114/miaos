// 将快速生图队列转换为纯展示状态，避免失败任务继续显示为“生成中”。
export function getQuickQueueViewState(tasks) {
  const quickTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => task.source === 'quick');
  const visibleTasks = quickTasks.filter((task) => ['queued', 'running', 'failed'].includes(task.status));
  const pendingCount = visibleTasks.filter((task) => task.status === 'queued' || task.status === 'running').length;
  const queuedCount = visibleTasks.filter((task) => task.status === 'queued').length;
  const failedCount = visibleTasks.filter((task) => task.status === 'failed').length;
  const isGenerating = pendingCount > 0;
  let countText = `${visibleTasks.length} 个任务`;
  if (!isGenerating && failedCount > 0) countText = `${failedCount} 个失败任务`;
  else if (isGenerating && failedCount > 0) countText = `${pendingCount} 个进行中 · ${failedCount} 个失败`;

  return {
    visibleTasks,
    pendingCount,
    failedCount,
    isGenerating,
    title: isGenerating ? '生成中' : '生成失败',
    icon: isGenerating ? 'loader' : 'alert-circle',
    countText,
    showCancelQueued: queuedCount > 0,
  };
}
