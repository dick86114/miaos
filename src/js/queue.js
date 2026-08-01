// 全局生图任务队列（串行执行，避免供应商限流）
// 任务常驻内存：未完成/已完成任务都保留在内存中，已完成任务的图片通过 store 持久化
// 切换页面不丢失进度：队列与页面解耦，页面通过 subscribe 订阅状态变化

import { generateImage, generateSmart, uid } from './store.js';

// 任务状态：queued（排队中）/ running（生成中）/ done（已完成）/ failed（失败）/ canceled（已取消）
let tasks = [];
let running = false;
const listeners = new Set();

function notify() {
  // 拷贝一份给订阅者，避免外部误改
  const snapshot = tasks.map((t) => ({ ...t }));
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (e) {
      console.warn('queue listener error', e);
    }
  });
}

function findNext() {
  return tasks.find((t) => t.status === 'queued');
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
      // 快速生图：store.generateImage 内部已写入 history
      result = await generateImage({
        prompt: task.prompt,
        providerId: task.providerId,
        modelId: task.modelId,
        ratio: task.ratio,
        quality: task.quality,
        sourceImage: task.sourceImage || null,
      });
    } else if (task.source === 'project') {
      // 项目生图：走 generateSmart —— 根版本 prompt/model 变更时自动建新主线节点再出图
      const res = await generateSmart(task.projectId, task.versionId, {
        prompt: task.prompt,
        modelId: task.modelId,
        ratio: task.ratio,
        quality: task.quality,
        sourceImage: task.sourceImage || null,
      });
      // 如果因为主线变更换了版本 id，记录下最终版本（便于页面切换）
      if (res.versionId !== task.versionId) {
        task.versionId = res.versionId;
      }
      result = res.image;
    } else {
      throw new Error('未知任务来源');
    }
    task.status = 'done';
    task.result = result;
    task.finishedAt = Date.now();
  } catch (err) {
    task.status = 'failed';
    task.error = (err && err.message) || '生成失败';
    task.finishedAt = Date.now();
  } finally {
    running = false;
    notify();
    // 推进下一个
    if (findNext()) pump();
  }
}

// 入队
export function enqueue(taskData) {
  const task = {
    id: uid('task'),
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
    status: 'queued',
    createdAt: Date.now(),
  };
  tasks.unshift(task);
  notify();
  // 异步推进，避免在调用栈里立即执行
  setTimeout(pump, 0);
  return task.id;
}

// 取消任务（仅 queued 可取消；running 无法撤回已发出的 API 请求）
export function cancel(taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || task.status !== 'queued') return false;
  task.status = 'canceled';
  task.finishedAt = Date.now();
  notify();
  return true;
}

// 批量取消符合条件的 queued 任务
export function cancelAll(predicate) {
  let n = 0;
  tasks.forEach((t) => {
    if (t.status === 'queued' && (!predicate || predicate(t))) {
      t.status = 'canceled';
      t.finishedAt = Date.now();
      n++;
    }
  });
  if (n > 0) notify();
  return n;
}

// 清理已结束的任务（done/failed/canceled），保留最近 N 条
export function clearFinished(keep = 0) {
  const before = tasks.length;
  const finished = tasks.filter((t) => t.status === 'done' || t.status === 'failed' || t.status === 'canceled');
  const active = tasks.filter((t) => t.status === 'queued' || t.status === 'running');
  tasks = [...active, ...finished.slice(0, Math.max(0, keep))];
  if (tasks.length !== before) notify();
}

// 移除单条已结束任务（不能移除 queued/running）
export function removeTask(taskId) {
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return false;
  const t = tasks[idx];
  if (t.status === 'queued' || t.status === 'running') return false;
  tasks.splice(idx, 1);
  notify();
  return true;
}

// 获取全部任务（倒序）
export function getTasks() {
  return tasks.map((t) => ({ ...t }));
}

// 按项目版本过滤（用于项目画廊占位卡片）
export function getTasksByVersion(versionId) {
  return tasks.filter((t) => t.versionId === versionId).map((t) => ({ ...t }));
}

// 订阅状态变化，返回取消订阅函数
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
