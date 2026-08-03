import test from 'node:test';
import assert from 'node:assert/strict';
import * as queue from '../src/js/queue.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }
}

class FakeElement {
  constructor({ id = '', classes = [] } = {}) {
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.classList = new FakeClassList();
    classes.forEach((value) => this.classList.add(value));
    this.value = '';
    this.removed = false;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get('click')?.({ target: this, preventDefault() {} });
  }

  querySelector(selector) {
    if (selector.startsWith('#') && this.id === selector.slice(1)) return this;
    for (const child of this.children) {
      const result = child.querySelector(selector);
      if (result) return result;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    if (selector.startsWith('.') && this.classList.values.has(selector.slice(1))) matches.push(this);
    for (const child of this.children) matches.push(...child.querySelectorAll(selector));
    return matches;
  }

  focus() {}

  select() {}
}

function createDocument() {
  return { body: new FakeElement({ id: 'body' }) };
}

function appendElements(root, definitions) {
  definitions.forEach((definition) => root.appendChild(new FakeElement(definition)));
  return root;
}

function createDeriveOverlay() {
  return appendElements(new FakeElement({ id: 'derive-modal' }), [
    { id: 'modal-close' },
    { id: 'modal-cancel' },
    { id: 'derive-image-grid' },
    { id: 'modal-submit' },
  ]);
}

function createSettingsOverlay() {
  const overlay = appendElements(new FakeElement({ id: 'settings-modal' }), [
    { id: 'modal-close' },
    { id: 'modal-cancel' },
    { id: 'set-name' },
    { id: 'set-desc' },
    { id: 'modal-submit' },
  ]);
  overlay.querySelector('#set-name').value = '原项目';
  overlay.querySelector('#set-desc').value = '原描述';
  return overlay;
}

function createWindow(initialHash = '#/project') {
  return {
    location: { hash: initialHash },
    addEventListener() {},
  };
}

async function loadProjectPage() {
  const moduleUrl = new URL(`../src/js/pages/project.js?dialog-lifecycle=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(moduleUrl.href);
}

async function loadRouter() {
  const moduleUrl = new URL(`../src/js/router.js?dialog-route=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(moduleUrl.href);
}

test('切换路由后，遗留派生弹窗不能重建工作台或新增队列订阅', async () => {
  globalThis.window = createWindow();
  const { createProjectPageLifecycle, openDeriveDialog } = await loadProjectPage();
  const { createRouter } = await loadRouter();
  const documentRef = createDocument();
  const overlay = createDeriveOverlay();
  const project = {
    id: 'project-1',
    versions: [{
      id: 'version-1',
      name: '原版本',
      prompt: '测试提示词',
      providerId: 'provider-1',
      providerName: '供应商',
      modelId: 'model-1',
      images: [{ id: 'image-1', image: 'data:image/png;base64,AA==', createdAt: 1 }],
    }],
  };
  let rebuiltCount = 0;
  let queueSubscriptionCount = 0;
  let createVersionCount = 0;
  let close = null;
  const router = createRouter({
    windowRef: globalThis.window,
    routes: [
      {
        pattern: /^\/project\/?$/,
        render() {
          const lifecycle = createProjectPageLifecycle();
          const unsubscribe = queue.subscribe(() => {});
          queueSubscriptionCount += 1;
          close = lifecycle.trackDialog(openDeriveDialog('project-1', 'version-1', {}, () => {
            rebuiltCount += 1;
            queue.subscribe(() => {});
            queueSubscriptionCount += 1;
          }, 'image-1', {
            documentRef,
            createOverlay: () => overlay,
            renderIconsFn() {},
            getProjectFn: () => project,
            createVersionFn: () => {
              createVersionCount += 1;
              return project;
            },
            toastFn() {},
            isPageActive: lifecycle.isActive,
          }));
          return () => {
            lifecycle.cleanup();
            unsubscribe();
            queueSubscriptionCount -= 1;
          };
        },
      },
      { pattern: /^\/history\/?$/, render() {} },
    ],
  });

  router.init(new FakeElement(), []);
  assert.equal(documentRef.body.children.length, 1);
  router.navigate('/history');
  router.dispatch();

  assert.equal(overlay.removed, true);
  assert.equal(documentRef.body.children.length, 0);
  assert.equal(queueSubscriptionCount, 0);
  assert.doesNotThrow(() => close());
  overlay.querySelector('#modal-submit').click();

  assert.equal(createVersionCount, 0);
  assert.equal(rebuiltCount, 0);
  assert.equal(queueSubscriptionCount, 0);
});

test('切换路由后，遗留设置弹窗不能保存或重建工作台', async () => {
  globalThis.window = createWindow();
  const { createProjectPageLifecycle, openSettingsDialog } = await loadProjectPage();
  const { createRouter } = await loadRouter();
  const documentRef = createDocument();
  const overlay = createSettingsOverlay();
  let updatedCount = 0;
  let rebuiltCount = 0;
  let queueSubscriptionCount = 0;
  let close = null;
  const router = createRouter({
    windowRef: globalThis.window,
    routes: [
      {
        pattern: /^\/project\/?$/,
        render() {
          const lifecycle = createProjectPageLifecycle();
          const unsubscribe = queue.subscribe(() => {});
          queueSubscriptionCount += 1;
          close = lifecycle.trackDialog(openSettingsDialog({ id: 'project-1', name: '原项目', description: '原描述' }, () => {
            rebuiltCount += 1;
            queue.subscribe(() => {});
            queueSubscriptionCount += 1;
          }, {
            documentRef,
            createOverlay: () => overlay,
            renderIconsFn() {},
            updateProjectFn: () => {
              updatedCount += 1;
              return { id: 'project-1', name: '新项目', description: '新描述' };
            },
            toastFn() {},
            isPageActive: lifecycle.isActive,
          }));
          return () => {
            lifecycle.cleanup();
            unsubscribe();
            queueSubscriptionCount -= 1;
          };
        },
      },
      { pattern: /^\/history\/?$/, render() {} },
    ],
  });

  router.init(new FakeElement(), []);
  assert.equal(documentRef.body.children.length, 1);
  router.navigate('/history');
  router.dispatch();

  assert.equal(overlay.removed, true);
  assert.equal(documentRef.body.children.length, 0);
  assert.equal(queueSubscriptionCount, 0);
  assert.doesNotThrow(() => close());
  overlay.querySelector('#modal-submit').click();

  assert.equal(updatedCount, 0);
  assert.equal(rebuiltCount, 0);
  assert.equal(queueSubscriptionCount, 0);
});
