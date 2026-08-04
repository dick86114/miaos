import assert from 'node:assert/strict';
import test from 'node:test';

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

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(tagName, documentRef) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = documentRef;
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.style = {};
    this.textContent = '';
    this.tabIndex = -1;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((item) => item !== listener));
  }

  dispatch(type, event = {}) {
    const payload = {
      target: this,
      currentTarget: this,
      preventDefault() {},
      ...event,
    };
    (this.listeners.get(type) || []).forEach((listener) => listener(payload));
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  setPointerCapture() {}
  releasePointerCapture() {}
}

function createDocument() {
  const documentRef = {
    activeElement: null,
    listeners: new Map(),
    createElement(tagName) {
      return new FakeElement(tagName, documentRef);
    },
    addEventListener(type, listener) {
      const listeners = documentRef.listeners.get(type) || [];
      listeners.push(listener);
      documentRef.listeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      const listeners = documentRef.listeners.get(type) || [];
      documentRef.listeners.set(type, listeners.filter((item) => item !== listener));
    },
    dispatch(type, event = {}) {
      (documentRef.listeners.get(type) || []).forEach((listener) => listener(event));
    },
  };
  documentRef.body = documentRef.createElement('body');
  return documentRef;
}

function findByAttribute(root, name) {
  if (root.getAttribute?.(name) !== null) return root;
  for (const child of root.children || []) {
    const found = findByAttribute(child, name);
    if (found) return found;
  }
  return null;
}

async function loadPreview() {
  return import(`../src/js/image-preview.js?image-preview=${Date.now()}-${Math.random()}`);
}

function createPreview(documentRef, options = {}) {
  const trigger = documentRef.createElement('button');
  documentRef.body.appendChild(trigger);
  trigger.focus();
  return {
    trigger,
    record: {
      id: 'image-1',
      image: 'data:image/png;base64,AA==',
      prompt: '一只猫',
      providerName: '供应商',
      modelId: '模型',
      ratio: '1:1',
      quality: '高清',
      createdAt: 1,
    },
    options: { documentRef, windowRef: {}, triggerElement: trigger, ...options },
  };
}

test('共享图片预览支持关闭按钮、遮罩、Escape 并恢复触发焦点', async () => {
  const { openImagePreview } = await loadPreview();
  const documentRef = createDocument();
  const { trigger, record, options } = createPreview(documentRef);

  openImagePreview(record, options);
  let overlay = findByAttribute(documentRef.body, 'data-image-preview');
  assert.ok(overlay);
  const closeButton = findByAttribute(overlay, 'data-image-preview-close');
  assert.equal(closeButton.textContent, '×', '关闭按钮应使用紧凑叉号图标，而不是文字按钮');
  closeButton.dispatch('click');
  assert.equal(findByAttribute(documentRef.body, 'data-image-preview'), null);
  assert.equal(documentRef.activeElement, trigger);

  openImagePreview(record, options);
  overlay = findByAttribute(documentRef.body, 'data-image-preview');
  overlay.dispatch('click', { target: overlay });
  assert.equal(findByAttribute(documentRef.body, 'data-image-preview'), null);

  openImagePreview(record, options);
  documentRef.dispatch('keydown', { key: 'Escape' });
  assert.equal(findByAttribute(documentRef.body, 'data-image-preview'), null);
});

test('共享图片预览支持图片二次点击全屏、滚轮缩放范围与拖拽平移重置', async () => {
  const { openImagePreview } = await loadPreview();
  const documentRef = createDocument();
  const { record, options } = createPreview(documentRef);

  const close = openImagePreview(record, options);
  const overlay = findByAttribute(documentRef.body, 'data-image-preview');
  const image = findByAttribute(overlay, 'data-image-preview-image');
  image.dispatch('click');

  let fullscreen = findByAttribute(documentRef.body, 'data-image-preview-fullscreen');
  assert.ok(fullscreen);
  const fullscreenImage = findByAttribute(fullscreen, 'data-image-preview-fullscreen-image');
  assert.equal(fullscreenImage.style.transform, 'translate3d(0px, 0px, 0) scale(1)');

  for (let index = 0; index < 20; index += 1) fullscreen.dispatch('wheel', { deltaY: -100 });
  assert.equal(fullscreenImage.style.transform, 'translate3d(0px, 0px, 0) scale(4)');
  for (let index = 0; index < 30; index += 1) fullscreen.dispatch('wheel', { deltaY: 100 });
  assert.equal(fullscreenImage.style.transform, 'translate3d(0px, 0px, 0) scale(1)');

  fullscreenImage.dispatch('pointerdown', { pointerId: 1, clientX: 20, clientY: 30 });
  fullscreenImage.dispatch('pointermove', { pointerId: 1, clientX: 60, clientY: 80 });
  assert.equal(fullscreenImage.style.transform, 'translate3d(40px, 50px, 0) scale(1)');
  fullscreenImage.dispatch('pointerup', { pointerId: 1 });

  fullscreenImage.dispatch('click');
  assert.equal(findByAttribute(documentRef.body, 'data-image-preview-fullscreen'), null);
  image.dispatch('click');
  fullscreen = findByAttribute(documentRef.body, 'data-image-preview-fullscreen');
  assert.equal(findByAttribute(fullscreen, 'data-image-preview-fullscreen-image').style.transform, 'translate3d(0px, 0px, 0) scale(1)');

  close();
  assert.equal(findByAttribute(documentRef.body, 'data-image-preview'), null);
  assert.equal(findByAttribute(documentRef.body, 'data-image-preview-fullscreen'), null);
});

test('项目图片预览可提供返回项目的通用回调', async () => {
  const { openImagePreview } = await loadPreview();
  const documentRef = createDocument();
  const calls = [];
  const { record, options } = createPreview(documentRef, {
    onNavigateToProject: (target) => calls.push(target),
  });

  openImagePreview({ ...record, projectId: 'project-1', versionId: 'version-1' }, options);
  const projectButton = findByAttribute(documentRef.body, 'data-image-preview-project');
  assert.ok(projectButton);
  projectButton.dispatch('click');
  assert.deepEqual(calls, [{ projectId: 'project-1', versionId: 'version-1', imageId: 'image-1' }]);
});

test('项目定位会选中目标版本，并且只在该版本中打开目标图片', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hash: '#/generate' }, addEventListener() {} };
  try {
    const { resolveProjectRouteTarget } = await import(`../src/js/pages/project.js?project-route-target=${Date.now()}-${Math.random()}`);
    const project = {
      currentVersionId: 'version-current',
      versions: [
        { id: 'version-current', images: [{ id: 'image-current' }] },
        { id: 'version-target', images: [{ id: 'image-target' }] },
      ],
    };

    assert.deepEqual(resolveProjectRouteTarget(project, { version: 'version-target', image: 'image-target' }), {
      versionId: 'version-target',
      imageId: 'image-target',
    });
    assert.deepEqual(resolveProjectRouteTarget(project, { version: 'version-target', image: 'image-current' }), {
      versionId: 'version-target',
      imageId: null,
    });
  } finally {
    globalThis.window = previousWindow;
  }
});
