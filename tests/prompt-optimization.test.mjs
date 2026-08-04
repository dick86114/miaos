import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPromptFragmentOverlay,
  createPromptOptimizationManager,
} from '../src/js/prompt-optimization.js';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.className = '';
    this.parentNode = null;
    this.style = {};
    this.tabIndex = 0;
    this.textContent = '';
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ currentTarget: this });
  }
}

function createFakeDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName, this);
    },
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test('提示词优化管理器初始为空闲状态', () => {
  const manager = createPromptOptimizationManager({ optimize: async () => 'unused' });

  assert.deepEqual(manager.getState('quick-generate'), {
    status: 'idle',
    prompt: null,
    startedAt: null,
    result: null,
    error: null,
  });
});

test('提示词优化管理器启动时通知 optimizing 并拒绝同上下文重复启动', async () => {
  const deferred = createDeferred();
  const manager = createPromptOptimizationManager({ optimize: () => deferred.promise });
  const notifications = [];
  manager.subscribe('quick-generate', (state) => notifications.push(state));

  const first = manager.start('quick-generate', '一只橘猫');
  const duplicate = manager.start('quick-generate', '另一只猫');

  assert.equal(first.started, true);
  assert.equal(manager.getState('quick-generate').status, 'optimizing');
  assert.deepEqual(notifications.map((state) => state.status), ['optimizing']);
  assert.deepEqual(duplicate, { started: false, reason: 'optimizing' });

  deferred.resolve('高细节的橘猫');
  await first.promise;
});

test('提示词优化管理器成功后通知 succeeded 并保留结果', async () => {
  const manager = createPromptOptimizationManager({
    optimize: async (prompt) => `${prompt}，电影感光影`,
  });
  const notifications = [];
  manager.subscribe('project-42', (state) => notifications.push(state));

  const started = manager.start('project-42', '雨夜街道');
  const result = await started.promise;

  assert.equal(result, '雨夜街道，电影感光影');
  assert.deepEqual(notifications.map((state) => state.status), ['optimizing', 'succeeded']);
  assert.equal(notifications[1].result, '雨夜街道，电影感光影');
  assert.deepEqual(manager.getState('project-42'), {
    status: 'succeeded',
    prompt: '雨夜街道',
    startedAt: notifications[0].startedAt,
    result: '雨夜街道，电影感光影',
    error: null,
  });
});

test('提示词优化管理器失败后通知 failed 并保留原始错误', async () => {
  const error = new Error('优化服务不可用');
  const manager = createPromptOptimizationManager({
    optimize: async () => { throw error; },
  });
  const notifications = [];
  manager.subscribe('project-42', (state) => notifications.push(state));

  const started = manager.start('project-42', '雨夜街道');

  await assert.rejects(started.promise, error);
  assert.deepEqual(notifications.map((state) => state.status), ['optimizing', 'failed']);
  assert.equal(notifications[1].error, error);
  assert.equal(manager.getState('project-42').error, error);
  assert.equal(manager.getState('project-42').result, null);
});

test('提示词优化管理器取消订阅后不再通知，并忽略已清理任务的陈旧结算', async () => {
  const deferred = createDeferred();
  const manager = createPromptOptimizationManager({ optimize: () => deferred.promise });
  const notifications = [];
  const unsubscribe = manager.subscribe('quick-generate', (state) => notifications.push(state));

  const started = manager.start('quick-generate', '山间云海');
  unsubscribe();
  manager.clear('quick-generate');
  deferred.resolve('山间云海，超广角');
  await started.promise;

  assert.deepEqual(notifications.map((state) => state.status), ['optimizing']);
  assert.deepEqual(manager.getState('quick-generate'), {
    status: 'idle',
    prompt: null,
    startedAt: null,
    result: null,
    error: null,
  });
});

test('碎片覆盖层限制节点数，标记为隐藏且不可交互，并能安全销毁', () => {
  const documentRef = createFakeDocument();
  const container = documentRef.createElement('div');
  const textarea = documentRef.createElement('textarea');
  const overlay = createPromptFragmentOverlay({
    container,
    textarea,
    prompt: Array.from({ length: 80 }, (_, index) => `词${index}`).join(' '),
    maxFragments: 80,
  });

  overlay.mount();
  const overlayNode = container.children[0];

  assert.equal(overlay.fragmentCount, 36);
  assert.equal(overlayNode.getAttribute('aria-hidden'), 'true');
  assert.equal(overlayNode.style.pointerEvents, 'none');
  assert.equal(overlayNode.tabIndex, -1);
  assert.equal(overlayNode.children.length, 36);

  const limitedOverlay = createPromptFragmentOverlay({
    container: documentRef.createElement('div'),
    textarea,
    prompt: '一 二 三 四 五 六',
    maxFragments: 3,
  });
  limitedOverlay.mount();
  assert.equal(limitedOverlay.fragmentCount, 3);
  limitedOverlay.destroy();

  overlay.settle();
  assert.match(overlayNode.className, /prompt-fragment-overlay--settling/u);
  overlayNode.dispatchEvent('transitionend');
  assert.equal(container.children.length, 0);

  overlay.destroy();
  assert.equal(container.children.length, 0);
});
