import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('设置页包含存储管理入口、扫描统计、回收站与孤立文件操作', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /存储管理/u);
  assert.match(settings, /扫描本地文件/u);
  assert.match(settings, /回收站/u);
  assert.match(settings, /孤立文件/u);
  assert.match(settings, /总文件/u);
  assert.match(settings, /总占用/u);
  assert.match(settings, /恢复/u);
  assert.match(settings, /永久删除/u);
  assert.doesNotMatch(settings, /删除 generated 目录/u);
});

test('存储管理接入扫描、恢复、清空和二次确认契约', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /getStorageState\(\)/u);
  assert.match(settings, /scanStorage\(\)/u);
  assert.match(settings, /restoreTrashEntry\(/u);
  assert.match(settings, /purgeTrashEntry\(/u);
  assert.match(settings, /confirmDialog\(/u);
  assert.match(settings, /storageDelete/u);
  assert.match(settings, /select-all-orphans/u);
});

test('首次安装生成目录不存在时显示空扫描结果并允许重试', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /暂无扫描结果/u);
  assert.match(settings, /0 占用/u);
  assert.match(settings, /重试/u);
  assert.match(settings, /扫描失败/u);
});

test('存储管理样式支持窄窗口并避免横向溢出', async () => {
  const css = await source('src/css/pages.css');
  assert.match(css, /\.storage-management/u);
  assert.match(css, /\.storage-file-list/u);
  assert.match(css, /@media \(max-width: 640px\)/u);
  assert.match(css, /overflow-wrap:\s*anywhere/u);
});
