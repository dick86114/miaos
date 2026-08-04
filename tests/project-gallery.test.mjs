import assert from 'node:assert/strict';
import test from 'node:test';

class FakeElement {
  constructor({ tagName = 'div', classes = [], attributes = {} } = {}) {
    this.tagName = tagName.toUpperCase();
    this.classes = new Set(classes);
    this.attributes = new Map(Object.entries(attributes));
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (selector.startsWith('.')) {
        if (current.classes.has(selector.slice(1))) return current;
      } else if (selector === '[data-act]' && current.attributes.has('data-act')) {
        return current;
      } else if (selector === '.gallery-item img') {
        if (current.tagName === 'IMG' && current.parentNode?.classes.has('gallery-item')) return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  async dispatchClick(target) {
    const event = { target, preventDefault() {} };
    for (const listener of this.listeners.get('click') || []) await listener(event);
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }
}

function createTaskCard({ taskId, type }) {
  const isCancel = type === 'cancel';
  const isFailureDetail = type === 'failure-detail';
  const card = new FakeElement({
    classes: ['gallery-item', 'gallery-placeholder', isCancel ? 'task-queued' : 'task-failed'],
    attributes: { 'data-task-id': taskId },
  });
  const button = new FakeElement({
    tagName: 'button',
    classes: [isCancel ? 'task-cancel' : (isFailureDetail ? 'task-failure-detail' : 'task-dismiss')],
    attributes: { 'data-task-id': taskId },
  });
  const icon = new FakeElement({ tagName: 'svg' });
  button.appendChild(icon);
  card.appendChild(button);
  return { card, button, icon };
}

function createImageCard(imageId) {
  const card = new FakeElement({
    classes: ['gallery-item', 'pwb-gallery-item'],
    attributes: { 'data-image-id': imageId },
  });
  const button = new FakeElement({
    tagName: 'button',
    attributes: { 'data-act': 'delete', 'data-image-id': imageId },
  });
  const icon = new FakeElement({ tagName: 'svg' });
  button.appendChild(icon);
  card.appendChild(button);
  return { card, button, icon };
}

test('项目画廊控制器使用真实卡片结构处理取消、移除、确认删除与路由清理', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hash: '#/generate' }, addEventListener() {} };
  try {
    const { createProjectGalleryController } = await import(`../src/js/pages/project.js?gallery-controller=${Date.now()}`);
    assert.equal(typeof createProjectGalleryController, 'function');

    const galleryGrid = new FakeElement();
  const cancelTask = createTaskCard({ taskId: 'task-queued', type: 'cancel' });
  const dismissTask = createTaskCard({ taskId: 'task-failed', type: 'dismiss' });
  const image = createImageCard('image-1');
  galleryGrid.appendChild(cancelTask.card);
  galleryGrid.appendChild(dismissTask.card);
  galleryGrid.appendChild(image.card);

  const calls = { cancel: [], remove: [], delete: [], refresh: 0, confirm: 0 };
  const confirmations = [true, false];
  const current = {
    project: { id: 'project-1' },
    version: { id: 'version-1', images: [{ id: 'image-1', image: 'data:image/png;base64,AA==' }] },
  };
  const controller = createProjectGalleryController({
    galleryGrid,
    queueApi: {
      cancel: (taskId) => calls.cancel.push(taskId),
      removeTask: (taskId) => calls.remove.push(taskId),
    },
    getCurrentVersion: () => current,
    confirmDialog: async () => {
      calls.confirm += 1;
      return confirmations.shift();
    },
    deleteImage: (...args) => calls.delete.push(args),
    refreshGallery: () => { calls.refresh += 1; },
    toast: () => {},
    onOpenImage: () => {},
    onImageAction: () => {},
  });

  assert.equal(galleryGrid.listenerCount('click'), 1);

  // 模拟稳定 key 局部更新后的重排；保留旧卡片节点并确保没有重复注册委托 listener。
  galleryGrid.children = [image.card, dismissTask.card, cancelTask.card];
  await galleryGrid.dispatchClick(cancelTask.icon);
  await galleryGrid.dispatchClick(dismissTask.icon);
  await galleryGrid.dispatchClick(image.icon);
  await galleryGrid.dispatchClick(image.icon);

  assert.deepEqual(calls.cancel, ['task-queued']);
  assert.deepEqual(calls.remove, ['task-failed']);
  assert.deepEqual(calls.delete, [['project-1', 'version-1', 'image-1']]);
  assert.equal(calls.refresh, 1);
  assert.equal(calls.confirm, 2);
  assert.equal(galleryGrid.listenerCount('click'), 1);

    controller.dispose();
    assert.equal(galleryGrid.listenerCount('click'), 0);
    await galleryGrid.dispatchClick(cancelTask.icon);
    assert.deepEqual(calls.cancel, ['task-queued']);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('生产项目页接入项目画廊控制器，而非保留独立卡片监听器', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/js/pages/project.js', import.meta.url), 'utf8');
  assert.match(source, /createProjectGalleryController\(\{/);
  assert.doesNotMatch(source, /galleryGrid\.addEventListener\('click', async \(e\) =>/);
});


test('项目画廊委托失败详情操作，并把目标任务交给详情弹窗', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hash: '#/generate' }, addEventListener() {} };
  try {
    const { createProjectGalleryController } = await import(`../src/js/pages/project.js?failure-detail=${Date.now()}`);
    const galleryGrid = new FakeElement();
    const failureDetail = createTaskCard({ taskId: 'task-failed', type: 'failure-detail' });
    galleryGrid.appendChild(failureDetail.card);
    const openedTaskIds = [];
    const controller = createProjectGalleryController({
      galleryGrid,
      queueApi: { cancel() {}, removeTask() {} },
      getCurrentVersion: () => null,
      confirmDialog: async () => true,
      deleteImage() {},
      refreshGallery() {},
      toast() {},
      onOpenImage() {},
      onImageAction() {},
      onOpenTaskFailure: (taskId) => openedTaskIds.push(taskId),
    });

    await galleryGrid.dispatchClick(failureDetail.icon);
    assert.deepEqual(openedTaskIds, ['task-failed']);
    controller.dispose();
  } finally {
    globalThis.window = previousWindow;
  }
});
