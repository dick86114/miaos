import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGeneratedFileRefs, migrateState } from '../src/js/state-schema.js';
import { createTrashEntry, getStorageState } from '../src/js/store.js';

test('旧状态迁移时初始化空回收站且不改变项目和历史', () => {
  const migrated = migrateState({ projects: [], history: [] });
  assert.deepEqual(migrated.storage, { trash: [], lastScanAt: 0 });
});

test('文件引用收集只保留 generated 内的路径', () => {
  assert.deepEqual(collectGeneratedFileRefs({
    image: '/Users/me/.miaos/generated/a.png',
    sourceImage: '/Users/me/Desktop/original.png',
  }), [{ path: '/Users/me/.miaos/generated/a.png', size: null, checksum: null }]);
});

test('文件引用收集拒绝协议地址和相对路径', () => {
  assert.deepEqual(collectGeneratedFileRefs({
    remote: 'https://example.com/.miaos/generated/remote.png',
    fileUrl: 'file:///Users/me/.miaos/generated/url.png',
    relative: 'Users/me/.miaos/generated/relative.png',
    local: '/Users/me/.miaos/generated/local.png',
  }), [{ path: '/Users/me/.miaos/generated/local.png', size: null, checksum: null }]);
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
