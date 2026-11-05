import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { moveIdToIndex } from '../src/js/sortable-list.js';

const root = new URL('..', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

async function loadStore() {
  const url = new URL(`../src/js/store.js?sortable-test=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(url.href);
}

test('moveIdToIndex 按目标位置重排并限制到有效范围', () => {
  assert.deepEqual(moveIdToIndex(['a', 'b', 'c', 'd'], 'a', 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveIdToIndex(['a', 'b', 'c', 'd'], 'd', 1), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveIdToIndex(['a', 'b', 'c'], 'b', 99), ['a', 'c', 'b']);
  assert.deepEqual(moveIdToIndex(['a', 'b', 'c'], 'missing', 1), ['a', 'b', 'c']);
});

test('供应商与模型排序会直接持久化，并保留模型启用状态', async () => {
  const store = await loadStore();
  const providerIds = store.getProviders().map((provider) => provider.id);
  const reversedProviderIds = providerIds.slice().reverse();
  store.reorderProviders(reversedProviderIds);
  assert.deepEqual(store.getProviders().map((provider) => provider.id), reversedProviderIds);
  assert.deepEqual(store.getStateSnapshot().providers.map((provider) => provider.id), reversedProviderIds);
  assert.throws(() => store.reorderProviders([...providerIds.slice(0, -1), providerIds[0]]), /顺序参数无效/u);
  assert.deepEqual(store.getProviders().map((provider) => provider.id), reversedProviderIds);

  const before = store.getProvider('p_grsai');
  const modelIds = before.imageModels.map((model) => model.id);
  const reversedModelIds = modelIds.slice().reverse();
  store.reorderModelsByCat('p_grsai', 'image', reversedModelIds);
  const after = store.getProvider('p_grsai');
  assert.deepEqual(after.imageModels.map((model) => model.id), reversedModelIds);
  assert.deepEqual(
    after.imageModels.map((model) => [model.id, model.enabled]),
    before.imageModels.slice().reverse().map((model) => [model.id, model.enabled]),
  );
  assert.deepEqual(
    store.getStateSnapshot().providers.find((provider) => provider.id === 'p_grsai').imageModels.map((model) => model.id),
    reversedModelIds,
  );
});

test('设置页将供应商和模型列表都接入整项拖拽排序', async () => {
  const [settings, css, generate, project] = await Promise.all([
    source('src/js/pages/settings.js'),
    source('src/css/pages.css'),
    source('src/js/pages/generate.js'),
    source('src/js/pages/project.js'),
  ]);

  assert.match(settings, /providers-list[\s\S]*?createSortableList/u);
  assert.match(settings, /model-checklist[\s\S]*?createSortableList/u);
  assert.match(settings, /itemSelector: '\.provider-list-item'/u);
  assert.match(settings, /itemSelector: '\.model-check-item'/u);
  assert.match(css, /\.sortable-drag-ghost/u);
  assert.match(css, /\.sortable-item--placeholder/u);
  assert.match(generate, /const pList = providers\.filter/u);
  assert.match(project, /const pList = providers\.filter/u);
  assert.doesNotMatch(generate, /imageModels[\s\S]{0,80}\.sort\(/u);
  assert.doesNotMatch(project, /imageModels[\s\S]{0,80}\.sort\(/u);
});
