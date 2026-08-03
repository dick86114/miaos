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
  assert.equal(baseline.historyNodeCount, 200);
  assert.equal(baseline.fragmentCount, 1);
  assert.equal(baseline.projectCount, 50);
  assert.equal(baseline.versionCount, 100);
  assert.ok(baseline.medianMs >= 0);
  t.diagnostic(`本地基线：${JSON.stringify(baseline)}`);
});
