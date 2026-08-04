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

async function loadStoreWithApi(initialState, api) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage({ 'miaos.state.v5': JSON.stringify(initialState) }),
    addEventListener() {},
    api,
  };
  const url = new URL(`../src/js/store.js?generate-smart-provider=${Date.now()}-${Math.random()}`, import.meta.url);
  const store = await import(url.href);
  return { store, restore() { globalThis.window = previousWindow; } };
}

function createDuplicateModelState() {
  const state = createDefaultState();
  const gptProvider = state.providers.find((p) => p.id === 'p_grsai');
  gptProvider.name = 'GPT 供应商';
  gptProvider.type = 'openai';
  gptProvider.endpoint = 'https://gpt.example/v1';
  // 默认供应商也包含同名模型，旧实现按模型 ID 首匹配会错误命中它。
  gptProvider.imageModels = [
    { id: 'shared-image', name: 'shared-image', enabled: true },
    { id: 'other-image', name: 'other-image', enabled: true },
  ];
  state.providers.push({
    id: 'p_custom',
    name: '自定义供应商',
    type: 'custom',
    endpoint: 'https://custom.example/v1',
    capabilities: ['image'],
    imageModels: [{ id: 'shared-image', name: '自定义模型', enabled: true }],
    textModels: [],
    videoModels: [],
  });
  state.providers.push({
    id: 'p_other',
    name: '空模型供应商',
    type: 'custom',
    endpoint: 'https://empty.example/v1',
    capabilities: ['image'],
    imageModels: [],
    textModels: [],
    videoModels: [],
  });
  state.projects = [{
    id: 'project-1',
    name: '测试项目',
    description: '',
    createdAt: 1,
    updatedAt: 1,
    coverImageId: null,
    currentVersionId: 'version-1',
    versions: [{
      id: 'version-1',
      parentId: null,
      parentImageId: null,
      name: '版本',
      prompt: '一只猫',
      // 版本此前由默认供应商生成，用户本次改选自定义供应商的同 ID 模型。
      providerId: 'p_grsai',
      providerName: 'GPT 供应商',
      modelId: 'shared-image',
      createdAt: 1,
      images: [],
      sourceImage: null,
    }],
  }];
  return state;
}

test('项目生图以传入 providerId 为准，同 ID 模型存在其他供应商时仍命中自定义供应商', async () => {
  const requests = [];
  const { store, restore } = await loadStoreWithApi(createDuplicateModelState(), {
    generateImage: async (params) => {
      requests.push(params);
      return { ok: true, fileUrl: 'file:///result.png' };
    },
  });
  try {
    const result = await store.generateSmart('project-1', 'version-1', {
      prompt: '一只猫',
      providerId: 'p_custom',
      modelId: 'shared-image',
      ratio: '1:1',
      quality: '高清',
      sourceImage: null,
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].providerId, 'p_custom', '请求必须命中下拉选中的自定义供应商');
    assert.equal(requests[0].modelName, 'shared-image');
    assert.equal(result.image.providerId, 'p_custom');
    assert.equal(result.image.providerName, '自定义供应商');
    const savedVersion = store.getProject('project-1').versions.find((v) => v.id === 'version-1');
    assert.equal(savedVersion.providerId, 'p_custom');
  } finally {
    restore();
  }
});

test('providerId 指向的供应商没有该模型时报错，绝不跨供应商回退', async () => {
  const requests = [];
  const { store, restore } = await loadStoreWithApi(createDuplicateModelState(), {
    generateImage: async (params) => {
      requests.push(params);
      return { ok: true, fileUrl: 'file:///result.png' };
    },
  });
  try {
    await assert.rejects(
      store.generateSmart('project-1', 'version-1', {
        prompt: '一只猫',
        providerId: 'p_other',
        modelId: 'shared-image',
        ratio: '1:1',
        quality: '高清',
        sourceImage: null,
      }),
      /所选模型不可用/u,
    );
    assert.equal(requests.length, 0, '模型校验失败时不得发出任何生成请求');
  } finally {
    restore();
  }
});

test('主线自动新建时以传入 providerId 归属新版本，避免丢失自定义供应商', async () => {
  const state = createDuplicateModelState();
  state.projects[0].versions[0].images = [{
    id: 'image-1',
    image: 'file:///old.png',
    providerId: 'p_custom',
    providerName: '自定义供应商',
    modelId: 'shared-image',
    prompt: '旧提示词',
    createdAt: 1,
  }];
  const requests = [];
  const { store, restore } = await loadStoreWithApi(state, {
    generateImage: async (params) => {
      requests.push(params);
      return { ok: true, fileUrl: 'file:///new.png' };
    },
  });
  try {
    const result = await store.generateSmart('project-1', 'version-1', {
      prompt: '新提示词',
      providerId: 'p_custom',
      modelId: 'shared-image',
      ratio: '1:1',
      quality: '高清',
      sourceImage: null,
    });
    const project = store.getProject('project-1');
    const newVersion = project.versions.find((v) => v.id === result.versionId && v.id !== 'version-1');
    assert.ok(newVersion, '修改已有图片的主线应自动新建新主线');
    assert.equal(newVersion.providerId, 'p_custom');
    assert.equal(newVersion.providerName, '自定义供应商');
    assert.equal(requests[0].providerId, 'p_custom');
  } finally {
    restore();
  }
});
