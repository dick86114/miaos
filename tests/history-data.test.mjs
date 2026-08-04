import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultState } from '../src/js/state-schema.js';
import { getPaginatedQuickHistory, getUnifiedHistory } from '../src/js/history-data.js';

function createQuickRecord(id, createdAt, prompt = `快速提示词 ${id}`) {
  return {
    id,
    prompt,
    providerId: 'provider-quick',
    providerName: '快速供应商',
    model: 'quick-model',
    ratio: '1:1',
    quality: 'standard',
    image: `file:///quick-${id}.png`,
    createdAt,
  };
}

function createProject(id, versions) {
  return {
    id,
    name: `项目 ${id}`,
    description: '',
    createdAt: 1,
    updatedAt: 1,
    coverImageId: null,
    currentVersionId: versions[0]?.id || null,
    versions,
  };
}

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

async function loadStore(initialState) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage({ 'miaos.state.v5': JSON.stringify(initialState) }),
    addEventListener() {},
  };
  const moduleUrl = new URL(`../src/js/store.js?history-data=${Date.now()}-${Math.random()}`, import.meta.url);
  const store = await import(moduleUrl.href);
  return { store, restore() { globalThis.window = previousWindow; } };
}

test('快速历史按时间倒序分页，并保留快速来源与稳定复合 key', () => {
  const records = Array.from({ length: 14 }, (_, index) => createQuickRecord(`quick-${index + 1}`, index + 1));

  const result = getPaginatedQuickHistory(records, { page: 2, pageSize: 12 });

  assert.deepEqual(result.items.map((item) => item.id), ['quick-2', 'quick-1']);
  assert.deepEqual(result.items.map((item) => item.key), ['quick:quick-2', 'quick:quick-1']);
  assert.ok(result.items.every((item) => item.source === 'quick'));
  assert.deepEqual(
    { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    { page: 2, pageSize: 12, total: 14, totalPages: 2 },
  );
});

test('统一历史标准化快速和项目图片，按时间排序并保留项目定位字段', () => {
  const history = [createQuickRecord('quick-1', 200, '快速中间记录')];
  const projects = [createProject('project-1', [{
    id: 'version-1',
    prompt: '版本提示词',
    providerId: 'provider-project',
    providerName: '项目供应商',
    modelId: 'project-model',
    createdAt: 100,
    images: [
      { id: 'image-new', image: 'file:///project-new.png', ratio: '16:9', quality: 'hd', createdAt: 300 },
      { id: 'image-old', image: 'file:///project-old.png', ratio: '4:3', quality: 'standard', createdAt: 100 },
    ],
  }])];

  const result = getUnifiedHistory({ history, projects }, { page: 1, pageSize: 24 });

  assert.deepEqual(result.items.map((item) => item.key), [
    'project:project-1:version-1:image-new',
    'quick:quick-1',
    'project:project-1:version-1:image-old',
  ]);
  const projectItem = result.items[0];
  assert.deepEqual(
    {
      source: projectItem.source,
      projectId: projectItem.projectId,
      versionId: projectItem.versionId,
      imageId: projectItem.imageId,
      prompt: projectItem.prompt,
      providerId: projectItem.providerId,
      providerName: projectItem.providerName,
      model: projectItem.model,
    },
    {
      source: 'project',
      projectId: 'project-1',
      versionId: 'version-1',
      imageId: 'image-new',
      prompt: '版本提示词',
      providerId: 'provider-project',
      providerName: '项目供应商',
      model: 'project-model',
    },
  );
});

test('统一历史先筛选再分页，并将过大的页码收敛到筛选结果最后一页', () => {
  const history = [
    createQuickRecord('quick-match-1', 10, '猫咪肖像'),
    createQuickRecord('quick-other', 30, '山川风景'),
  ];
  const projects = [createProject('project-1', [{
    id: 'version-1', prompt: '猫咪海报', providerId: '', providerName: '', modelId: '', createdAt: 1,
    images: [{ id: 'image-match-1', image: 'file:///cat.png', createdAt: 20 }],
  }])];

  const filtered = getUnifiedHistory({ history, projects }, { page: 9, pageSize: 1, query: '猫咪' });
  const projectOnly = getUnifiedHistory({ history, projects }, { page: 1, pageSize: 24, source: 'project' });

  assert.deepEqual(filtered.items.map((item) => item.key), ['quick:quick-match-1']);
  assert.deepEqual(
    { page: filtered.page, total: filtered.total, totalPages: filtered.totalPages },
    { page: 2, total: 2, totalPages: 2 },
  );
  assert.deepEqual(projectOnly.items.map((item) => item.key), ['project:project-1:version-1:image-match-1']);
});

test('统一历史可按项目 ID 筛选项目图片，不误伤其他项目或快速记录', () => {
  const history = [createQuickRecord('quick-1', 300)];
  const projects = [
    createProject('project-1', [{
      id: 'version-1', prompt: '项目一', providerId: 'p1', providerName: '', modelId: '', createdAt: 1,
      images: [{ id: 'image-a', image: 'file:///a.png', createdAt: 200 }],
    }]),
    createProject('project-2', [{
      id: 'version-2', prompt: '项目二', providerId: 'p2', providerName: '', modelId: '', createdAt: 1,
      images: [{ id: 'image-b', image: 'file:///b.png', createdAt: 100 }],
    }]),
  ];

  const result = getUnifiedHistory({ history, projects }, {
    page: 1,
    pageSize: 24,
    source: 'project',
    projectId: 'project-1',
  });

  assert.deepEqual(result.items.map((item) => item.key), ['project:project-1:version-1:image-a']);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].projectName, '项目 project-1');
});

test('批量删除按来源分派快速历史和项目图片，并仅返回实际删除数量', async () => {
  const initialState = createDefaultState();
  initialState.history = [createQuickRecord('quick-delete', 10)];
  initialState.projects = [createProject('project-delete', [{
    id: 'version-delete', prompt: '项目删除提示词', providerId: '', providerName: '', modelId: '', createdAt: 1,
    images: [{ id: 'image-delete', image: 'file:///delete.png', createdAt: 20 }],
  }])];
  const { store, restore } = await loadStore(initialState);
  try {
    const unified = getUnifiedHistory({ history: store.getHistory(), projects: store.getProjects() }, { page: 1, pageSize: 24 });
    const deleted = store.deleteHistoryRecords([
      ...unified.items,
      unified.items.find((item) => item.source === 'quick'),
      { source: 'quick', id: 'missing-quick', key: 'quick:missing-quick' },
    ]);

    assert.equal(deleted, 2);
    assert.deepEqual(store.getHistory(), []);
    assert.deepEqual(store.getProject('project-delete').versions[0].images, []);
  } finally {
    restore();
  }
});
