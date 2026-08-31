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
