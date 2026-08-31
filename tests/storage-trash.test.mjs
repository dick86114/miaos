import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectGeneratedFileRefs, createDefaultState, migrateState } from '../src/js/state-schema.js';
import { createTrashEntry, getStorageState } from '../src/js/store.js';
import storageManagerModule from '../src/main/services/storage-manager.js';

const { createStorageManager } = storageManagerModule;

function createMemoryStorage(seed = {}, { failWrites = false } = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error('写入失败');
      map.set(key, String(value));
    },
    removeItem(key) { map.delete(key); },
  };
}

async function loadStore(initialState, options = {}) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage({ 'miaos.state.v6': JSON.stringify(initialState) }, options),
    addEventListener() {},
  };
  const moduleUrl = new URL(`../src/js/store.js?storage-trash=${Date.now()}-${Math.random()}`, import.meta.url);
  const store = await import(moduleUrl.href);
  return { store, restore() { globalThis.window = previousWindow; } };
}

function projectFixture() {
  return {
    id: 'project-1', name: '项目', description: '', createdAt: 1, updatedAt: 3,
    coverImageId: 'image-root', currentVersionId: 'child',
    versions: [
      { id: 'root', parentId: null, parentImageId: null, name: '根', prompt: '', createdAt: 1, images: [{ id: 'image-root', image: '/Users/me/.miaos/generated/root.png', createdAt: 1 }, { id: 'image-root-shared', image: '/Users/me/.miaos/generated/shared.png', createdAt: 1 }] },
      { id: 'child', parentId: 'root', parentImageId: 'image-root', name: '子', prompt: '', createdAt: 2, images: [{ id: 'image-shared', image: '/Users/me/.miaos/generated/shared.png', createdAt: 2 }] },
      { id: 'grandchild', parentId: 'child', parentImageId: 'image-shared', name: '孙', prompt: '', createdAt: 3, images: [{ id: 'image-only', image: '/Users/me/.miaos/generated/only.png', createdAt: 3 }] },
    ],
  };
}

test('旧状态迁移时初始化空回收站且不改变项目和历史', () => {
  const migrated = migrateState({ projects: [], history: [] });
  assert.deepEqual(migrated.storage, { trash: [], lastScanAt: 0 });
});

test('旧状态首次扫描发现未引用生成文件为孤儿且不会自动删除', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-storage-migration-'));
  const generated = path.join(home, 'generated');
  const orphanPath = path.join(generated, 'legacy-orphan.png');
  fs.mkdirSync(generated, { recursive: true });
  fs.writeFileSync(orphanPath, 'legacy-orphan');
  try {
    const migrated = migrateState({ projects: [], history: [] });
    assert.deepEqual(migrated.storage, { trash: [], lastScanAt: 0 });

    const manager = createStorageManager({ getUserDataPath: () => home });
    const scan = await manager.scan({
      activeRefs: collectGeneratedFileRefs(migrated.projects),
      trashRefs: migrated.storage.trash.flatMap((entry) => entry.fileRefs || []),
    });
    assert.deepEqual(scan.files.map((file) => ({ path: file.path, category: file.category })), [
      { path: fs.realpathSync(orphanPath), category: 'orphan' },
    ]);
    assert.equal(fs.existsSync(orphanPath), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('文件引用收集只保留 generated 内的路径', () => {
  assert.deepEqual(collectGeneratedFileRefs({
    image: '/Users/me/.miaos/generated/a.png',
    sourceImage: '/Users/me/Desktop/original.png',
  }), [{ path: '/Users/me/.miaos/generated/a.png', size: null, checksum: null }]);
});

test('文件引用收集兼容本地 file 协议并拒绝远程和相对路径', () => {
  assert.deepEqual(collectGeneratedFileRefs({
    remote: 'https://example.com/.miaos/generated/remote.png',
    fileUrl: 'file:///Users/me/.miaos/generated/url.png',
    relative: 'Users/me/.miaos/generated/relative.png',
    local: '/Users/me/.miaos/generated/local.png',
  }), [
    { path: '/Users/me/.miaos/generated/url.png', size: null, checksum: null },
    { path: '/Users/me/.miaos/generated/local.png', size: null, checksum: null },
  ]);
});

test('迁移保留未知字段并修复无效回收站字段', () => {
  const migrated = migrateState({
    projects: [{ id: 'project-1' }],
    history: [{ id: 'history-1' }],
    customField: { keep: true },
    storage: { trash: 'invalid', lastScanAt: 'invalid', futureField: 'keep' },
  });
  assert.deepEqual(migrated.customField, { keep: true });
  assert.deepEqual(migrated.storage, { trash: [], lastScanAt: 0, futureField: 'keep' });
  assert.deepEqual(migrated.projects, [{ id: 'project-1' }]);
  assert.deepEqual(migrated.history, [{ id: 'history-1' }]);
});

test('回收站条目和存储快照不暴露可变内部引用', () => {
  const payload = { project: { id: 'p1' } };
  const fileRefs = [{ path: '/Users/me/.miaos/generated/a.png', size: 1, checksum: 'abc' }];
  const entry = createTrashEntry({ kind: 'project', payload, fileRefs, deletedAt: 10 });
  assert.match(entry.id, /^trash_/u);
  payload.project.id = 'changed';
  fileRefs[0].size = 99;
  assert.equal(entry.payload.project.id, 'p1');
  assert.equal(entry.fileRefs[0].size, 1);

  const snapshot = getStorageState();
  snapshot.trash.push(entry);
  assert.deepEqual(getStorageState(), { trash: [], lastScanAt: 0 });
});

test('回收站条目的空 payload 统一为 null', () => {
  assert.equal(createTrashEntry({ kind: 'history', fileRefs: [], deletedAt: 10 }).payload, null);
  assert.equal(createTrashEntry({ kind: 'history', payload: null, fileRefs: [], deletedAt: 10 }).payload, null);
});

test('删除版本进入回收站并保留当前节点回退语义', async () => {
  const state = createDefaultState();
  state.projects = [projectFixture()];
  const { store, restore } = await loadStore(state);
  try {
    const result = store.moveVersionToTrash('project-1', 'child');
    assert.equal(result.ok, true);
    assert.equal(store.getProject('project-1').currentVersionId, 'root');
    assert.deepEqual(store.getProject('project-1').versions.map((v) => v.id), ['root']);
    const trash = store.getStorageState().trash;
    assert.equal(trash.length, 1);
    assert.deepEqual(trash[0].payload.versions.map((v) => v.id), ['child', 'grandchild']);
  } finally { restore(); }
});

test('项目和快速历史删除可恢复，ID 冲突拒绝覆盖', async () => {
  const state = createDefaultState();
  state.projects = [projectFixture()];
  state.history = [{ id: 'history-1', image: '/Users/me/.miaos/generated/history.png', createdAt: 1 }];
  const { store, restore } = await loadStore(state);
  try {
    const historyResult = store.moveHistoryToTrash('history-1');
    assert.equal(historyResult.ok, true);
    const projectResult = store.moveProjectToTrash('project-1');
    assert.equal(projectResult.ok, true);
    const projectTrash = store.getStorageState().trash.find((entry) => entry.kind === 'project');
    const conflictState = store.getStorageState();
    assert.equal(store.restoreTrashEntry(projectTrash.id).ok, true);
    assert.equal(store.getProject('project-1').id, 'project-1');
    const second = store.moveProjectToTrash('project-1');
    assert.equal(second.ok, true);
    const latestProjectTrash = store.getStorageState().trash.find((entry) => entry.kind === 'project');
    assert.equal(store.restoreTrashEntry(latestProjectTrash.id).ok, true);
    assert.equal(store.getHistory().length, 0);
    assert.equal(conflictState.trash.length >= 2, true);
  } finally { restore(); }
});

test('恢复项目遇到活动同 ID 时拒绝覆盖', async () => {
  const project = projectFixture();
  const state = createDefaultState();
  state.projects = [project];
  state.storage.trash = [{ id: 'trash-conflict', kind: 'project', payload: project, fileRefs: [], deletedAt: 1 }];
  const { store, restore } = await loadStore(state);
  try {
    const result = store.restoreTrashEntry('trash-conflict');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ID_CONFLICT');
    assert.equal(store.getProject('project-1').id, 'project-1');
  } finally { restore(); }
});

test('批量快速历史删除进入多个回收站条目', async () => {
  const state = createDefaultState();
  state.history = [
    { id: 'h1', image: '/Users/me/.miaos/generated/a.png', createdAt: 1 },
    { id: 'h2', image: '/Users/me/.miaos/generated/b.png', createdAt: 2 },
  ];
  const { store, restore } = await loadStore(state);
  try {
    const result = store.moveHistoryRecordsToTrash([{ source: 'quick', historyId: 'h1' }, { source: 'quick', historyId: 'h2' }]);
    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
    assert.deepEqual(store.getHistory(), []);
  } finally { restore(); }
});

test('共享图片引用仍存在时 purge 不请求物理删除，孤立引用返回删除请求', async () => {
  const state = createDefaultState();
  state.projects = [projectFixture()];
  const { store, restore } = await loadStore(state);
  try {
    const result = store.moveVersionToTrash('project-1', 'child');
    const purge = store.purgeTrashEntry(result.trashEntry.id);
    assert.equal(purge.ok, true);
    assert.deepEqual(purge.files.map((f) => f.path), ['/Users/me/.miaos/generated/only.png']);
    assert.equal(purge.requiresMainProcessConfirmation, true);
  } finally { restore(); }
});

test('持久化失败时删除不会丢失活动记录', async () => {
  const state = createDefaultState();
  state.projects = [projectFixture()];
  const { store, restore } = await loadStore(state, { failWrites: true });
  try {
    const result = store.moveProjectToTrash('project-1');
    assert.equal(result.ok, false);
    assert.equal(store.getProject('project-1').id, 'project-1');
    assert.equal(store.getStorageState().trash.length, 0);
  } finally { restore(); }
});

test('删除唯一根及其子树时拒绝删除，不进入回收站', async () => {
  const state = createDefaultState();
  const project = projectFixture();
  project.versions = project.versions.slice(0, 2);
  project.currentVersionId = 'child';
  state.projects = [project];
  const { store, restore } = await loadStore(state);
  try {
    const result = store.moveVersionToTrash('project-1', 'root');
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LAST_VERSION');
    assert.equal(store.getProject('project-1').versions.length, 2);
    assert.equal(store.getStorageState().trash.length, 0);
  } finally { restore(); }
});

test('purge 请求过滤恶意 fileRefs，只保留 generated 路径且不移除条目', async () => {
  const state = createDefaultState();
  state.storage.trash = [{
    id: 'trash-malicious', kind: 'history', payload: { image: '/Users/me/.miaos/generated/safe.png' },
    fileRefs: [
      { path: '/etc/passwd' },
      { path: 'https://example.com/.miaos/generated/remote.png' },
      { path: '/Users/me/.miaos/generated/safe.png' },
    ], deletedAt: 1,
  }];
  const { store, restore } = await loadStore(state);
  try {
    const result = store.purgeTrashEntry('trash-malicious');
    assert.deepEqual(result.fileDeletionRequest.paths, ['/Users/me/.miaos/generated/safe.png']);
    assert.equal(store.getStorageState().trash.length, 1);
  } finally { restore(); }
});

test('确认失败时回收站条目保持不变，部分成功仅移除已处理引用', async () => {
  const state = createDefaultState();
  state.storage.trash = [{
    id: 'trash-partial', kind: 'history', payload: null,
    fileRefs: [
      { path: '/Users/me/.miaos/generated/ok.png' },
      { path: '/Users/me/.miaos/generated/fail.png' },
    ], deletedAt: 1,
  }];
  const { store, restore } = await loadStore(state);
  try {
    const request = store.purgeTrashEntry('trash-partial');
    assert.equal(store.getStorageState().trash.length, 1);
    const failed = store.finalizeTrashPurge('trash-partial', { requestedPaths: request.fileDeletionRequest.paths, deletedPaths: [], failedPaths: request.fileDeletionRequest.paths });
    assert.equal(failed.ok, false);
    assert.equal(store.getStorageState().trash.length, 1);
    const partial = store.finalizeTrashPurge('trash-partial', {
      requestedPaths: request.fileDeletionRequest.paths,
      deletedPaths: ['/Users/me/.miaos/generated/ok.png'],
      failedPaths: [{ path: '/Users/me/.miaos/generated/fail.png', error: '占用' }],
    });
    assert.equal(partial.ok, false);
    assert.deepEqual(store.getStorageState().trash[0].fileRefs.map((ref) => ref.path), ['/Users/me/.miaos/generated/fail.png']);
    const done = store.finalizeTrashPurge('trash-partial', { requestedPaths: ['/Users/me/.miaos/generated/fail.png'], deletedPaths: ['/Users/me/.miaos/generated/fail.png'], missingPaths: [] });
    assert.equal(done.ok, true);
    assert.equal(store.getStorageState().trash.length, 0);
  } finally { restore(); }
});

test('共享引用不阻止确认完成后移除当前回收站条目', async () => {
  const state = createDefaultState();
  state.projects = [projectFixture()];
  state.storage.trash = [{
    id: 'trash-shared-finalize', kind: 'history', payload: null,
    fileRefs: [
      { path: '/Users/me/.miaos/generated/shared.png' },
      { path: '/Users/me/.miaos/generated/orphan.png' },
    ], deletedAt: 1,
  }];
  const { store, restore } = await loadStore(state);
  try {
    const request = store.purgeTrashEntry('trash-shared-finalize');
    assert.deepEqual(request.fileDeletionRequest.paths, ['/Users/me/.miaos/generated/orphan.png']);
    const finalized = store.finalizeTrashPurge('trash-shared-finalize', { requestedPaths: request.fileDeletionRequest.paths, deletedPaths: request.fileDeletionRequest.paths });
    assert.equal(finalized.ok, true);
    assert.equal(store.getStorageState().trash.length, 0);
  } finally { restore(); }
});

test('缺少明确确认结果时不允许完成 purge', async () => {
  const state = createDefaultState();
  state.storage.trash = [{
    id: 'trash-await-confirmation', kind: 'history', payload: null,
    fileRefs: [{ path: '/Users/me/.miaos/generated/pending.png' }], deletedAt: 1,
  }];
  const { store, restore } = await loadStore(state);
  try {
    const result = store.finalizeTrashPurge('trash-await-confirmation', {});
    assert.equal(result.ok, false);
    assert.equal(result.code, 'PURGE_CONFIRMATION_REQUIRED');
    assert.equal(store.getStorageState().trash.length, 1);
  } finally { restore(); }
});

test('无可删除文件时允许显式 metadata-only 清理回收站记录', async () => {
  const state = createDefaultState();
  state.storage.trash = [{ id: 'trash-empty', kind: 'history', payload: null, fileRefs: [], deletedAt: 1 }];
  const { store, restore } = await loadStore(state);
  try {
    const request = store.purgeTrashEntry('trash-empty');
    assert.equal(request.metadataOnly, true);
    assert.equal(request.requiresMainProcessConfirmation, false);
    const finalized = store.finalizeTrashPurge('trash-empty', { metadataOnly: true });
    assert.equal(finalized.ok, true);
    assert.equal(store.getStorageState().trash.length, 0);
  } finally { restore(); }
});

test('仅包含活动共享引用时允许 metadata-only 清理而不请求物理删除', async () => {
  const state = createDefaultState();
  state.projects = [{ id: 'p1', versions: [{ id: 'v1', images: [{ id: 'i1', image: '/Users/me/.miaos/generated/shared.png' }] }] }];
  state.storage.trash = [{ id: 'trash-shared-only', kind: 'history', payload: null, fileRefs: [{ path: '/Users/me/.miaos/generated/shared.png' }], deletedAt: 1 }];
  const { store, restore } = await loadStore(state);
  try {
    const request = store.purgeTrashEntry('trash-shared-only');
    assert.equal(request.metadataOnly, true);
    assert.deepEqual(request.fileDeletionRequest.paths, []);
    assert.equal(store.finalizeTrashPurge('trash-shared-only', { metadataOnly: true }).ok, true);
  } finally { restore(); }
});

test('主进程确认文件已不存在后可完成普通 purge', async () => {
  const state = createDefaultState();
  state.storage.trash = [{ id: 'trash-missing', kind: 'history', payload: null, fileRefs: [{ path: '/Users/me/.miaos/generated/missing.png' }], deletedAt: 1 }];
  const { store, restore } = await loadStore(state);
  try {
    const request = store.purgeTrashEntry('trash-missing');
    assert.equal(request.metadataOnly, false);
    const finalized = store.finalizeTrashPurge('trash-missing', { requestedPaths: request.fileDeletionRequest.paths, deletedPaths: [], missingPaths: request.fileDeletionRequest.paths });
    assert.equal(finalized.ok, true);
    assert.equal(store.getStorageState().trash.length, 0);
  } finally { restore(); }
});
