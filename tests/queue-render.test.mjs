import assert from 'node:assert/strict';
import test from 'node:test';

import * as queue from '../src/js/queue.js';
import { createInteractionBaselineFixture, measureInteractionBaseline } from './fixtures/interaction-baseline.mjs';

function flushMicrotasks() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function clearQueue() {
  queue.cancelAll();
  queue.clearFinished(0);
}

class FakeNode {
  constructor(tagName, documentRef, { fragment = false } = {}) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = documentRef;
    this.isFragment = fragment;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this._textContent = '';
    this.listeners = new Map();
  }

  appendChild(node) {
    if (node.isFragment) {
      [...node.children].forEach((child) => this.appendChild(child));
      return node;
    }
    node.remove();
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    nodes.forEach((node) => this.appendChild(node));
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    const payload = { preventDefault() {}, ...event };
    (this.listeners.get(payload.type) || []).forEach((listener) => listener(payload));
  }

  closest(selector) {
    let current = this;
    const attribute = selector.match(/^\[data-([^=\]]+)(?:=\"([^\"]*)\")?\]$/);
    while (current) {
      if (attribute) {
        const key = attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        if (Object.hasOwn(current.dataset, key) && (attribute[2] == null || current.dataset[key] === attribute[2])) return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  set textContent(value) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this._textContent = String(value);
  }

  get textContent() {
    return this._textContent;
  }
}

function createFakeDocument() {
  const documentRef = {
    fragmentCount: 0,
    createElement(tagName) { return new FakeNode(tagName, documentRef); },
    createDocumentFragment() {
      documentRef.fragmentCount += 1;
      return new FakeNode('#fragment', documentRef, { fragment: true });
    },
  };
  return documentRef;
}

test('连续同步入队与取消只在同一 microtask 通知一次，且使用最终快照', async () => {
  clearQueue();
  const snapshots = [];
  const unsubscribe = queue.subscribe((snapshot) => snapshots.push(snapshot));

  try {
    const taskId = queue.enqueue({ source: 'quick', prompt: '合并通知测试' });
    assert.equal(queue.cancel(taskId), true);

    await flushMicrotasks();

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].length, 1);
    assert.equal(snapshots[0][0].id, taskId);
    assert.equal(snapshots[0][0].status, 'canceled');
  } finally {
    unsubscribe();
    clearQueue();
  }
});

test('取消订阅后，即使已有待发送通知也绝不再调用 listener', async () => {
  clearQueue();
  let calls = 0;
  const unsubscribe = queue.subscribe(() => { calls += 1; });

  try {
    const taskId = queue.enqueue({ source: 'quick', prompt: '取消订阅测试' });
    queue.cancel(taskId);
    unsubscribe();

    await flushMicrotasks();

    assert.equal(calls, 0);
  } finally {
    clearQueue();
  }
});

test('订阅快照可被调用方修改，但绝不反向污染内部任务', async () => {
  clearQueue();
  let receivedSnapshot = null;
  const unsubscribe = queue.subscribe((snapshot) => { receivedSnapshot = snapshot; });

  try {
    const taskId = queue.enqueue({ source: 'quick', prompt: '原始提示词' });
    queue.cancel(taskId);
    await flushMicrotasks();

    receivedSnapshot[0].prompt = '外部篡改';
    receivedSnapshot[0].status = 'done';
    receivedSnapshot.push({ id: '外部伪造任务' });

    const internalTask = queue.getTasks().find((task) => task.id === taskId);
    assert.equal(internalTask.prompt, '原始提示词');
    assert.equal(internalTask.status, 'canceled');
    assert.equal(queue.getTasks().some((task) => task.id === '外部伪造任务'), false);
  } finally {
    unsubscribe();
    clearQueue();
  }
});

test('稳定 key 的列表渲染复用节点、使用 DocumentFragment 批量提交', async () => {
  const { createKeyedListRenderer } = await import('../src/js/ui.js');
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('section');
  const renderer = createKeyedListRenderer(container, {
    getKey: (item) => item.id,
    createNode: (item) => {
      const node = documentRef.createElement('article');
      node.dataset.itemId = item.id;
      return node;
    },
    updateNode: (node, item) => {
      node.textContent = item.label;
    },
  });

  renderer.render([{ id: 'a', label: '第一项' }, { id: 'b', label: '第二项' }]);
  const firstNode = container.children[0];
  renderer.render([{ id: 'a', label: '第一项已更新' }, { id: 'c', label: '第三项' }]);

  assert.equal(documentRef.fragmentCount, 2);
  assert.equal(container.children.length, 2);
  assert.equal(container.children[0], firstNode);
  assert.equal(container.children[0].textContent, '第一项已更新');
  assert.equal(container.children[1].dataset.itemId, 'c');
});

test('交互性能固定 fixture 始终包含 200 条历史、50 个项目和 100 个版本节点', () => {
  const fixture = createInteractionBaselineFixture();
  assert.equal(fixture.history.length, 200);
  assert.equal(fixture.projects.length, 50);
  assert.equal(fixture.projects.reduce((count, project) => count + project.versions.length, 0), 100);
});

test('队列卡片和历史图片列表使用稳定 key、批量渲染与事件委托', async () => {
  const { readFile } = await import('node:fs/promises');
  const [generateSource, historySource] = await Promise.all([
    readFile(new URL('../src/js/pages/generate.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/js/pages/history.js', import.meta.url), 'utf8'),
  ]);

  assert.match(generateSource, /createKeyedListRenderer/);
  assert.match(generateSource, /resultArea\.addEventListener\('click'/);
  assert.match(historySource, /createKeyedListRenderer/);
  assert.match(historySource, /listEl\.addEventListener\('click'/);
});


test('固定 fixture 的局部列表构造使用一次批量提交，并输出可重复基线', (t) => {
  const baseline = measureInteractionBaseline();
  assert.equal(baseline.history.nodeCount, 200);
  assert.equal(baseline.history.fragmentCount, 1);
  assert.equal(baseline.projects.nodeCount, 50);
  assert.equal(baseline.projects.fragmentCount, 1);
  assert.equal(baseline.versions.nodeCount, 100);
  assert.equal(baseline.versions.fragmentCount, 1);
  assert.ok(baseline.history.medianMs >= 0);
  assert.ok(baseline.projects.medianMs >= 0);
  assert.ok(baseline.versions.medianMs >= 0);
  t.diagnostic(`本地基线：${JSON.stringify(baseline)}`);
});


function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushQueueMicrotasks(times = 6) {
  for (let index = 0; index < times; index += 1) await flushMicrotasks();
}

async function createControlledQueue(options = {}) {
  const queueModule = await import('../src/js/queue.js');
  assert.equal(typeof queueModule.createQueue, 'function', '队列应提供可注入 worker 的工厂');
  return queueModule.createQueue({
    uid: (() => {
      let count = 0;
      return (prefix) => `${prefix}_${++count}`;
    })(),
    schedulePump: (run) => queueMicrotask(run),
    ...options,
  });
}

test('单张任务默认记录第 1/1 张批次元数据', async () => {
  const controlledQueue = await createControlledQueue({ schedulePump: () => {} });

  const taskId = controlledQueue.enqueue({
    source: 'quick',
    prompt: '一只趴在窗边的猫',
  });
  const task = controlledQueue.getTasks().find((item) => item.id === taskId);

  assert.equal(task.batchIndex, 1);
  assert.equal(task.batchTotal, 1);
});

test('批量入队会展开 1–4 个参数相同且 id 不同的独立任务', async () => {
  const controlledQueue = await createControlledQueue({ schedulePump: () => {} });
  const taskData = {
    source: 'project',
    projectId: 'project-1',
    versionId: 'version-1',
    prompt: '夜晚的海边灯塔',
    providerId: 'provider-1',
    providerName: '示例供应商',
    modelId: 'model-1',
    ratio: '16:9',
    quality: '高清',
    isImageToImage: true,
    sourceImage: '/tmp/source.png',
  };

  assert.equal(typeof controlledQueue.enqueueBatch, 'function');
  const taskIds = controlledQueue.enqueueBatch(taskData, 4);
  const tasksById = taskIds.map((taskId) => controlledQueue.getTasks().find((task) => task.id === taskId));

  assert.equal(taskIds.length, 4);
  assert.equal(new Set(taskIds).size, 4);
  assert.deepEqual(tasksById.map((task) => task.batchIndex), [1, 2, 3, 4]);
  assert.deepEqual(tasksById.map((task) => task.batchTotal), [4, 4, 4, 4]);
  for (const task of tasksById) {
    assert.equal(task.source, taskData.source);
    assert.equal(task.projectId, taskData.projectId);
    assert.equal(task.versionId, taskData.versionId);
    assert.equal(task.prompt, taskData.prompt);
    assert.equal(task.providerId, taskData.providerId);
    assert.equal(task.providerName, taskData.providerName);
    assert.equal(task.modelId, taskData.modelId);
    assert.equal(task.ratio, taskData.ratio);
    assert.equal(task.quality, taskData.quality);
    assert.equal(task.isImageToImage, taskData.isImageToImage);
    assert.equal(task.sourceImage, taskData.sourceImage);
  }
  assert.throws(() => controlledQueue.enqueueBatch(taskData, 5), /1 到 4/u);
});

test('项目任务将 providerId 原样交给 generateSmart，避免按模型 ID 二次推导供应商', async () => {
  const workerArgs = [];
  const controlledQueue = await createControlledQueue({
    generateSmart: async (projectId, versionId, options) => {
      workerArgs.push({ projectId, versionId, options });
      return { versionId, image: { id: 'image-1' } };
    },
  });

  controlledQueue.enqueue({
    source: 'project',
    projectId: 'project-1',
    versionId: 'version-1',
    prompt: '夜晚的海边灯塔',
    providerId: 'provider-custom',
    providerName: '自定义供应商',
    modelId: 'shared-model',
    ratio: '16:9',
    quality: '高清',
  });
  await flushMicrotasks();

  assert.equal(workerArgs.length, 1);
  assert.equal(workerArgs[0].projectId, 'project-1');
  assert.equal(workerArgs[0].versionId, 'version-1');
  assert.equal(workerArgs[0].options.providerId, 'provider-custom', '队列必须把下拉选中的供应商传给 generateSmart');
  assert.equal(workerArgs[0].options.modelId, 'shared-model');
  controlledQueue.clearFinished(0);
});

test('受控 worker 维持 running→done/failed 串行执行，并合并首任务完成与次任务运行快照', async () => {
  const first = createDeferred();
  const second = createDeferred();
  const workerCalls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const controlledQueue = await createControlledQueue({
    generateImage: () => {
      const deferred = workerCalls.length === 0 ? first : second;
      workerCalls.push(deferred);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return deferred.promise.finally(() => { inFlight -= 1; });
    },
  });
  const snapshots = [];
  controlledQueue.subscribe((snapshot) => snapshots.push(snapshot));

  const firstId = controlledQueue.enqueue({ source: 'quick', prompt: '第一张' });
  const secondId = controlledQueue.enqueue({ source: 'quick', prompt: '第二张' });
  await flushQueueMicrotasks();

  assert.equal(workerCalls.length, 1);
  assert.equal(maxInFlight, 1);
  // 队列沿用既有 unshift 顺序：后入队的任务先执行。
  assert.equal(controlledQueue.getTasks().find((task) => task.id === secondId).status, 'running');
  assert.equal(controlledQueue.getTasks().find((task) => task.id === firstId).status, 'queued');

  first.resolve({ id: 'image-first', image: 'data:first' });
  await flushQueueMicrotasks();

  assert.equal(workerCalls.length, 2);
  assert.equal(maxInFlight, 1);
  const handoffSnapshot = snapshots.find((snapshot) => (
    snapshot.find((task) => task.id === secondId)?.status === 'done'
    && snapshot.find((task) => task.id === firstId)?.status === 'running'
  ));
  assert.ok(handoffSnapshot, '首任务完成与次任务开始必须合并为同一快照');

  second.reject(new Error('受控失败'));
  await flushQueueMicrotasks();

  assert.equal(controlledQueue.getTasks().find((task) => task.id === firstId).status, 'failed');
  assert.equal(maxInFlight, 1);
});

test('listener 重入产生下一批快照，异常 listener 不影响其他 listener 与后续通知', async () => {
  const controlledQueue = await createControlledQueue({ schedulePump: () => {} });
  const snapshots = [];
  let reentered = false;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    controlledQueue.subscribe(() => { throw new Error('listener 异常'); });
    controlledQueue.subscribe((snapshot) => {
      snapshots.push(snapshot);
      if (!reentered) {
        reentered = true;
        controlledQueue.enqueue({ source: 'quick', prompt: '重入任务' });
      }
    });

    controlledQueue.enqueue({ source: 'quick', prompt: '初始任务' });
    await flushQueueMicrotasks();

    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].length, 1);
    assert.equal(snapshots[1].length, 2);

    controlledQueue.cancel(snapshots[1][0].id);
    await flushQueueMicrotasks();
    assert.equal(snapshots.length, 3);
  } finally {
    console.warn = originalWarn;
  }
});

test('受控队列取消订阅后不会收到已排队的 flush', async () => {
  const controlledQueue = await createControlledQueue({ schedulePump: () => {} });
  let calls = 0;
  const unsubscribe = controlledQueue.subscribe(() => { calls += 1; });
  controlledQueue.enqueue({ source: 'quick', prompt: '待取消订阅' });
  unsubscribe();
  await flushQueueMicrotasks();
  assert.equal(calls, 0);
});

test('项目画廊的稳定 key 重排后复用节点，委托取消与删除各只触发一次', async () => {
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('section');
  let cancelCalls = 0;
  let deleteCalls = 0;
  container.addEventListener('click', (event) => {
    const cancelButton = event.target.closest('[data-action="cancel"]');
    const deleteButton = event.target.closest('[data-action="delete"]');
    if (cancelButton) cancelCalls += 1;
    if (deleteButton) deleteCalls += 1;
  });
  const { createKeyedListRenderer } = await import('../src/js/ui.js');
  const renderer = createKeyedListRenderer(container, {
    getKey: (item) => item.key,
    getSignature: (item) => item.status,
    createNode: (item) => {
      const card = documentRef.createElement('article');
      card.dataset.itemKey = item.key;
      const action = documentRef.createElement('button');
      action.dataset.action = item.type === 'task' ? 'cancel' : 'delete';
      action.dataset.itemId = item.key;
      card.appendChild(action);
      return card;
    },
  });

  renderer.render([
    { key: 'task-a', type: 'task', status: 'queued' },
    { key: 'image-b', type: 'image', status: 'done' },
  ]);
  const taskA = container.children[0];
  const imageB = container.children[1];
  renderer.render([
    { key: 'image-b', type: 'image', status: 'done' },
    { key: 'task-a', type: 'task', status: 'queued' },
  ]);

  assert.equal(container.children[0], imageB);
  assert.equal(container.children[1], taskA);
  container.dispatchEvent({ type: 'click', target: taskA.children[0] });
  container.dispatchEvent({ type: 'click', target: imageB.children[0] });
  assert.equal(cancelCalls, 1);
  assert.equal(deleteCalls, 1);

  const { readFile } = await import('node:fs/promises');
  const projectSource = await readFile(new URL('../src/js/pages/project.js', import.meta.url), 'utf8');
  assert.match(projectSource, /createKeyedListRenderer/);
  assert.match(projectSource, /galleryGrid\.addEventListener\('click'/);
});
