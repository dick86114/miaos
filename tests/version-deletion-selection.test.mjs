import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../src/js/state-schema.js';

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

async function loadStore(project) {
  const previousWindow = globalThis.window;
  const state = createDefaultState();
  state.projects = [project];
  globalThis.window = {
    localStorage: createMemoryStorage({ 'miaos.state.v5': JSON.stringify(state) }),
    addEventListener() {},
  };
  const moduleUrl = new URL(`../src/js/store.js?version-deletion=${Date.now()}-${Math.random()}`, import.meta.url);
  const store = await import(moduleUrl.href);
  return { store, restore() { globalThis.window = previousWindow; } };
}

function createVersion(id, { parentId = null, createdAt }) {
  return {
    id,
    parentId,
    parentImageId: parentId ? `${parentId}-image` : null,
    name: id,
    prompt: id,
    providerId: '',
    providerName: '',
    modelId: '',
    createdAt,
    images: [],
  };
}

test('删除当前子节点时自动回到其父节点', async () => {
  const { store, restore } = await loadStore({
    id: 'project-child',
    name: '子节点项目',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    coverImageId: null,
    currentVersionId: 'child',
    versions: [
      createVersion('root-older', { createdAt: 1 }),
      createVersion('root-parent', { createdAt: 2 }),
      createVersion('child', { parentId: 'root-parent', createdAt: 3 }),
    ],
  });
  try {
    store.deleteVersion('project-child', 'child');
    assert.equal(store.getProject('project-child').currentVersionId, 'root-parent');
  } finally {
    restore();
  }
});

test('删除当前主线时自动回到前一个主线', async () => {
  const { store, restore } = await loadStore({
    id: 'project-root',
    name: '主线项目',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    coverImageId: null,
    currentVersionId: 'root-3',
    versions: [
      createVersion('root-1', { createdAt: 1 }),
      createVersion('root-2', { createdAt: 2 }),
      createVersion('root-3', { createdAt: 3 }),
    ],
  });
  try {
    store.deleteVersion('project-root', 'root-3');
    assert.equal(store.getProject('project-root').currentVersionId, 'root-2');
  } finally {
    restore();
  }
});
