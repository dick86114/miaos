import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('项目删除入口使用回收站包装，并明确说明可恢复', async () => {
  const project = await source('src/js/pages/project.js');
  assert.match(project, /moveProjectToTrash/u);
  assert.match(project, /moveVersionToTrash/u);
  assert.match(project, /回收站/u);
  assert.match(project, /恢复/u);
  assert.match(project, /toast\('已移入回收站', 'success'\)/u);
});

test('历史批量删除使用回收站批量接口，不调用物理删除入口', async () => {
  const history = await source('src/js/pages/history.js');
  assert.match(history, /moveHistoryRecordsToTrash/u);
  assert.doesNotMatch(history, /deleteHistoryRecords\s*\(/u);
});

test('统计查询页提供前往存储管理的非破坏性入口', async () => {
  const history = await source('src/js/pages/history.js');
  assert.match(history, /getStorageUsage/u);
  assert.match(history, /#\/settings\?section=storage/u);
  assert.match(history, /存储管理/u);
});

test('设置页根据 storage 查询参数选中存储 Tab', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /renderSettings\(container, params = \[\], query = \{\}\)/u);
  assert.match(settings, /query\.section\s*===\s*['"]storage['"]/u);
});

test('混合来源历史批量移入回收站时同时处理 quick 与 project', async () => {
  const previousWindow = globalThis.window;
  const state = {
    version: 6,
    providers: [],
    projects: [{
      id: 'project-mixed', name: '混合项目', description: '', createdAt: 1, updatedAt: 1,
      coverImageId: null, currentVersionId: 'version-mixed',
      versions: [{
        id: 'version-mixed', parentId: null, parentImageId: null, name: '版本', prompt: '', createdAt: 1,
        images: [{ id: 'image-mixed', image: '/Users/me/.miaos/generated/mixed.png', createdAt: 1 }],
      }],
    }],
    history: [{ id: 'quick-mixed', image: '/Users/me/.miaos/generated/quick.png', createdAt: 1 }],
    storage: { trash: [], lastScanAt: 0 },
  };
  const map = new Map([['miaos.state.v6', JSON.stringify(state)]]);
  globalThis.window = { localStorage: { getItem: (key) => map.get(key) || null, setItem: (key, value) => map.set(key, String(value)), removeItem: () => {} }, addEventListener() {} };
  try {
    const store = await import(`../src/js/store.js?mixed-entrypoint=${Date.now()}-${Math.random()}`);
    const result = store.moveHistoryRecordsToTrash([
      { source: 'quick', historyId: 'quick-mixed' },
      { source: 'project', projectId: 'project-mixed', versionId: 'version-mixed', imageId: 'image-mixed' },
    ]);
    assert.equal(result.count, 2);
    assert.deepEqual(store.getHistory(), []);
    assert.deepEqual(store.getProject('project-mixed').versions[0].images, []);
    assert.deepEqual(store.getStorageState().trash.map((entry) => entry.kind).sort(), ['history', 'image']);
  } finally {
    globalThis.window = previousWindow;
  }
});
