import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDefaultState } from '../src/js/state-schema.js';
import storageManagerModule from '../src/main/services/storage-manager.js';

const { createStorageManager } = storageManagerModule;

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

async function loadStore(initialState, api) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage({ 'miaos.state.v6': JSON.stringify(initialState) }),
    addEventListener() {},
    api,
  };
  const moduleUrl = new URL(`../src/js/store.js?storage-path-fix=${Date.now()}-${Math.random()}`, import.meta.url);
  const store = await import(moduleUrl.href);
  return { store, restore() { globalThis.window = previousWindow; } };
}

function generationState() {
  const state = createDefaultState();
  const provider = state.providers.find((item) => item.id === 'p_grsai');
  provider.endpoint = 'https://example.test/generate';
  state.projects = [{
    id: 'project-1', name: '测试项目', description: '', createdAt: 1, updatedAt: 1,
    coverImageId: null, currentVersionId: 'version-1',
    versions: [{
      id: 'version-1', parentId: null, parentImageId: null, name: '版本', prompt: '',
      providerId: provider.id, providerName: provider.name, modelId: provider.imageModels.find((m) => m.enabled).id,
      createdAt: 1, images: [], sourceImage: null,
    }],
  }];
  return state;
}

test('快速生图优先保存返回结果中的绝对 imagePath', async () => {
  const state = generationState();
  const imagePath = '/Users/test/.miaos/generated/quick.png';
  const { store, restore } = await loadStore(state, {
    generateImage: async () => ({ ok: true, fileUrl: `file://${imagePath}`, imagePath }),
  });
  try {
    const record = await store.generateImage({
      prompt: '一只猫', providerId: 'p_grsai', modelId: state.providers[0].imageModels.find((m) => m.enabled).id,
      ratio: '1:1', quality: '高清', sourceImage: null,
    });
    assert.equal(record.image, imagePath);
    assert.equal(store.getHistory()[0].image, imagePath);
  } finally {
    restore();
  }
});

test('项目生图优先保存返回结果中的绝对 imagePath，并被存储扫描归类为 active', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-storage-path-fix-'));
  const miaosHome = path.join(home, '.miaos');
  const generated = path.join(miaosHome, 'generated');
  const imagePath = path.join(generated, 'project.png');
  fs.mkdirSync(generated, { recursive: true });
  fs.writeFileSync(imagePath, 'generated');
  const state = generationState();
  const modelId = state.providers[0].imageModels.find((m) => m.enabled).id;
  const { store, restore } = await loadStore(state, {
    generateImage: async () => ({ ok: true, fileUrl: `file://${imagePath}`, imagePath }),
  });
  try {
    const result = await store.generateSmart('project-1', 'version-1', {
      prompt: '一只猫', providerId: 'p_grsai', modelId, ratio: '1:1', quality: '高清', sourceImage: null,
    });
    assert.equal(result.image.image, imagePath);
    assert.equal(store.getProject('project-1').versions[0].images[0].image, imagePath);

    const references = store.buildStorageReferences();
    assert.ok(references.activeRefs.some((ref) => ref.path === imagePath));
    const manager = createStorageManager({ getUserDataPath: () => miaosHome });
    const scan = await manager.scan(references);
    assert.equal(scan.files.find((file) => file.path === fs.realpathSync(imagePath))?.category, 'active');
  } finally {
    restore();
    fs.rmSync(home, { recursive: true, force: true });
  }
});


test('快速生图把 sourceImages 原样交给主进程，并继续发送旧 sourceImage 首图', async () => {
  const state = generationState();
  const imagePath = '/Users/test/.miaos/generated/quick-multi.png';
  let received = null;
  const { store, restore } = await loadStore(state, {
    generateImage: async (params) => {
      received = params;
      return { ok: true, fileUrl: `file://${imagePath}`, imagePath };
    },
  });
  try {
    await store.generateImage({
      prompt: '融合两张参考图',
      providerId: 'p_grsai',
      modelId: state.providers[0].imageModels.find((m) => m.enabled).id,
      ratio: '1:1',
      quality: '高清',
      sourceImages: ['/tmp/a.png', '/tmp/b.png'],
      sourceImage: '/tmp/a.png',
    });
    assert.deepEqual(received.sourceImages, ['/tmp/a.png', '/tmp/b.png']);
    assert.equal(received.sourceImage, '/tmp/a.png');
  } finally {
    restore();
  }
});

test('项目根版本持久化 sourceImages，并在生图时发送完整数组', async () => {
  const state = generationState();
  const modelId = state.providers[0].imageModels.find((m) => m.enabled).id;
  let received = null;
  const { store, restore } = await loadStore(state, {
    generateImage: async (params) => {
      received = params;
      return { ok: true, imagePath: '/Users/test/.miaos/generated/project-multi.png' };
    },
  });
  try {
    const sourceImages = ['/tmp/a.png', '/tmp/b.png', '/tmp/c.png'];
    await store.generateSmart('project-1', 'version-1', {
      prompt: '融合三张参考图', providerId: 'p_grsai', modelId, ratio: '1:1', quality: '高清', sourceImages,
    });
    const version = store.getProject('project-1').versions[0];
    assert.deepEqual(version.sourceImages, sourceImages);
    assert.equal(version.sourceImage, sourceImages[0]);
    assert.deepEqual(received.sourceImages, sourceImages);
    assert.equal(received.sourceImage, sourceImages[0]);
  } finally {
    restore();
  }
});
