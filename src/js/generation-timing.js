export function formatGenerationDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '';
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

export function createRunningTaskTicker({
  getTasks,
  onTick,
  intervalMs = 1000,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let timerId = null;

  function stop() {
    if (timerId === null) return;
    clearIntervalFn(timerId);
    timerId = null;
  }

  function sync(tasks = getTasks?.() || []) {
    const hasRunningTask = Array.isArray(tasks) && tasks.some((task) => task.status === 'running');
    if (!hasRunningTask) {
      stop();
      return;
    }
    onTick?.();
    if (timerId === null) timerId = setIntervalFn(() => onTick?.(), intervalMs);
  }

  return { sync, destroy: stop };
}
