import test from 'node:test';
import assert from 'node:assert/strict';

const previousWindow = globalThis.window;
globalThis.window = { location: { hash: '#/project/project-1' }, addEventListener() {}, removeEventListener() {} };
const projectPage = await import(`../src/js/pages/project.js?generation-target=${Date.now()}-${Math.random()}`);
globalThis.window = previousWindow;

test('修改已有图片主线后，入队前创建新主线并返回新版本 ID', () => {
  assert.equal(typeof projectPage.prepareProjectGenerationTarget, 'function');

  const created = [];
  const updated = [];
  const result = projectPage.prepareProjectGenerationTarget({
    projectId: 'project-1',
    currentVersion: {
      id: 'root-old',
      parentId: null,
      prompt: '原提示词',
      modelId: 'model-old',
      sourceImage: '',
      images: [{ id: 'image-1' }],
    },
    prompt: '修改后的提示词',
    modelId: 'model-new',
    provider: { id: 'provider-new', name: '新供应商' },
    sourceImage: '/tmp/reference.png',
    createRootVersion: (...args) => {
      created.push(args);
      return { currentVersionId: 'root-new' };
    },
    updateVersionFields: (...args) => updated.push(args),
  });

  assert.deepEqual(result, { versionId: 'root-new', willCreateRoot: true });
  assert.deepEqual(created, [[
    'project-1',
    {
      name: '修改后的提示词',
      prompt: '修改后的提示词',
      providerId: 'provider-new',
      providerName: '新供应商',
      modelId: 'model-new',
      sourceImage: '/tmp/reference.png',
    },
  ]]);
  assert.deepEqual(updated, []);
});

test('未触发新主线时，继续将任务归属当前版本', () => {
  const created = [];
  const updated = [];
  const result = projectPage.prepareProjectGenerationTarget({
    projectId: 'project-1',
    currentVersion: {
      id: 'root-old',
      parentId: null,
      prompt: '原提示词',
      modelId: 'model-old',
      sourceImage: '',
      images: [],
    },
    prompt: '修改后的提示词',
    modelId: 'model-new',
    provider: { id: 'provider-new', name: '新供应商' },
    sourceImage: '',
    createRootVersion: (...args) => created.push(args),
    updateVersionFields: (...args) => updated.push(args),
  });

  assert.deepEqual(result, { versionId: 'root-old', willCreateRoot: false });
  assert.deepEqual(created, []);
  assert.deepEqual(updated, [[
    'root-old',
    {
      prompt: '修改后的提示词',
      modelId: 'model-new',
      providerId: 'provider-new',
      providerName: '新供应商',
      sourceImage: '',
    },
  ]]);
});

test('空白主线首次图生图会在入队前保存参考图', () => {
  const updated = [];
  const result = projectPage.prepareProjectGenerationTarget({
    projectId: 'project-1',
    currentVersion: {
      id: 'root-empty',
      parentId: null,
      prompt: '原提示词',
      modelId: 'model-old',
      sourceImage: '',
      images: [],
    },
    prompt: '原提示词',
    modelId: 'model-old',
    provider: { id: 'provider-old', name: '原供应商' },
    sourceImage: '/tmp/reference.png',
    createRootVersion: () => { throw new Error('不应新建主线'); },
    updateVersionFields: (...args) => updated.push(args),
  });

  assert.deepEqual(result, { versionId: 'root-empty', willCreateRoot: false });
  assert.deepEqual(updated, [[
    'root-empty',
    {
      prompt: '原提示词',
      modelId: 'model-old',
      providerId: 'provider-old',
      providerName: '原供应商',
      sourceImage: '/tmp/reference.png',
    },
  ]]);
});
