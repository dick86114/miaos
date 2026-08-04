// 全局生图任务队列（串行执行，避免供应商限流）
// 任务常驻内存：未完成/已完成任务都保留在内存中，已完成任务的图片通过 store 持久化
// 切换页面不丢失进度：队列与页面解耦，页面通过 subscribe 订阅状态变化

import { generateImage, generateSmart, uid } from './store.js';

// 创建独立队列实例。生产环境使用默认 worker；测试可注入受控 worker 验证真实 pump 与通知时序。
export function createQueue(dependencies = {}) {
  const generateImageWorker = dependencies.generateImage ?? generateImage;
  const generateSmartWorker = dependencies.generateSmart ?? generateSmart;
  const createTaskId = dependencies.uid ?? uid;
  const schedulePump = dependencies.schedulePump ?? ((run) => setTimeout(run, 0));
  let tasks = [];
  let running = false;
  let notifyScheduled = false;
  const listeners = new Set();

  function createSnapshot(taskList = tasks) {
    // 任务结果可能包含嵌套数据，必须深拷贝，避免订阅方反向污染队列内部状态。
    if (typeof structuredClone === 'function') return structuredClone(taskList);
    return JSON.parse(JSON.stringify(taskList));
  }

  function flushNotifications() {
    notifyScheduled = false;
    if (listeners.size === 0) return;
    const snapshot = createSnapshot();
    // 使用当前 listener 集合，已取消订阅的 listener 不会收到待发送的旧通知。
    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.warn('queue listener error', error);
      }
    });
  }

  function notify() {
    // 同一事件循环内的状态变化只发送一次最终快照，减少页面重复全量渲染。
    if (notifyScheduled) return;
    notifyScheduled = true;
    queueMicrotask(flushNotifications);
  }

  function findNext() {
    return tasks.find((task) => task.status === 'queued');
  }

  async function pump() {
    if (running) return;
    const task = findNext();
    if (!task) return;
    running = true;
    task.status = 'running';
    task.startedAt = Date.now();
    notify();

    try {
      let result;
      if (task.source === 'quick') {
        // 快速生图：store.generateImage 内部已写入 history。
        result = await generateImageWorker({
          prompt: task.prompt,
          providerId: task.providerId,
          modelId: task.modelId,
          ratio: task.ratio,
          quality: task.quality,
          sourceImage: task.sourceImage || null,
        });
      } else if (task.source === 'project') {
        // 项目生图：根版本 prompt/model 变更时自动建新主线节点再出图。
        const response = await generateSmartWorker(task.projectId, task.versionId, {
          prompt: task.prompt,
          providerId: task.providerId,
          modelId: task.modelId,
          ratio: task.ratio,
          quality: task.quality,
          sourceImage: task.sourceImage || null,
        });
        // 如果因为主线变更换了版本 id，记录最终版本，便于页面切换。
        if (response.versionId !== task.versionId) task.versionId = response.versionId;
        result = response.image;
      } else {
        throw new Error('未知任务来源');
      }
      task.status = 'done';
      task.result = result;
      task.finishedAt = Date.now();
    } catch (error) {
      task.status = 'failed';
      task.error = (error && error.message) || '生成失败';
      task.finishedAt = Date.now();
    } finally {
      running = false;
      notify();
      // 保持既有串行语义：结束后立即启动下一任务；两次状态变化会被同一 microtask 合并。
      if (findNext()) pump();
    }
  }

  function normalizeBatchTotal(value) {
    const batchTotal = Number(value);
    if (!Number.isInteger(batchTotal) || batchTotal < 1 || batchTotal > 4) {
      throw new Error('批次数量必须为 1 到 4');
    }
    return batchTotal;
  }

  function enqueue(taskData) {
    const batchTotal = normalizeBatchTotal(taskData.batchTotal ?? 1);
    const batchIndex = Number(taskData.batchIndex ?? 1);
    if (!Number.isInteger(batchIndex) || batchIndex < 1 || batchIndex > batchTotal) {
      throw new Error('批次序号必须位于批次数量范围内');
    }

    const task = {
      id: createTaskId('task'),
      source: taskData.source || 'quick',
      projectId: taskData.projectId || null,
      versionId: taskData.versionId || null,
      prompt: taskData.prompt || '',
      providerId: taskData.providerId || '',
      providerName: taskData.providerName || '',
      modelId: taskData.modelId || '',
      ratio: taskData.ratio || '1:1',
      quality: taskData.quality || '高清',
      isImageToImage: !!taskData.isImageToImage,
      sourceImage: taskData.sourceImage || '',
      batchIndex,
      batchTotal,
      status: 'queued',
      createdAt: Date.now(),
    };
    tasks.unshift(task);
    notify();
    // 异步推进，避免在调用栈里立即执行。
    schedulePump(pump);
    return task.id;
  }

  // 一个批次中的每张图都是独立任务，沿用既有串行执行和供应商参数边界。
  function enqueueBatch(taskData, total = 1) {
    const batchTotal = normalizeBatchTotal(total);
    const taskIds = [];
    for (let batchIndex = 1; batchIndex <= batchTotal; batchIndex += 1) {
      taskIds.push(enqueue({ ...taskData, batchIndex, batchTotal }));
    }
    return taskIds;
  }

  // 取消任务（仅 queued 可取消；running 无法撤回已发出的 API 请求）。
  function cancel(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status !== 'queued') return false;
    task.status = 'canceled';
    task.finishedAt = Date.now();
    notify();
    return true;
  }

  // 批量取消符合条件的 queued 任务。
  function cancelAll(predicate) {
    let count = 0;
    tasks.forEach((task) => {
      if (task.status === 'queued' && (!predicate || predicate(task))) {
        task.status = 'canceled';
        task.finishedAt = Date.now();
        count += 1;
      }
    });
    if (count > 0) notify();
    return count;
  }

  // 清理已结束的任务（done/failed/canceled），保留最近 N 条。
  function clearFinished(keep = 0) {
    const before = tasks.length;
    const finished = tasks.filter((task) => ['done', 'failed', 'canceled'].includes(task.status));
    const active = tasks.filter((task) => ['queued', 'running'].includes(task.status));
    tasks = [...active, ...finished.slice(0, Math.max(0, keep))];
    if (tasks.length !== before) notify();
  }

  // 移除单条已结束任务（不能移除 queued/running）。
  function removeTask(taskId) {
    const index = tasks.findIndex((task) => task.id === taskId);
    if (index === -1) return false;
    const task = tasks[index];
    if (task.status === 'queued' || task.status === 'running') return false;
    tasks.splice(index, 1);
    notify();
    return true;
  }

  function getTasks() {
    return createSnapshot();
  }

  // 按项目版本过滤（用于项目画廊占位卡片）。
  function getTasksByVersion(versionId) {
    return createSnapshot(tasks.filter((task) => task.versionId === versionId));
  }

  // 订阅状态变化，返回取消订阅函数。
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    enqueue,
    enqueueBatch,
    cancel,
    cancelAll,
    clearFinished,
    removeTask,
    getTasks,
    getTasksByVersion,
    subscribe,
  };
}

// 生产环境继续暴露既有模块 API，调用方无需改动。
const defaultQueue = createQueue();
export const enqueue = (...args) => defaultQueue.enqueue(...args);
export const enqueueBatch = (...args) => defaultQueue.enqueueBatch(...args);
export const cancel = (...args) => defaultQueue.cancel(...args);
export const cancelAll = (...args) => defaultQueue.cancelAll(...args);
export const clearFinished = (...args) => defaultQueue.clearFinished(...args);
export const removeTask = (...args) => defaultQueue.removeTask(...args);
export const getTasks = (...args) => defaultQueue.getTasks(...args);
export const getTasksByVersion = (...args) => defaultQueue.getTasksByVersion(...args);
export const subscribe = (...args) => defaultQueue.subscribe(...args);
