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

test('未完成详细扫描时只展示总量，不把 usage 的 byCategory 当作孤立文件', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /const hasDetailedScan = Boolean\(view\.scan\)/u);
  assert.match(settings, /hasDetailedScan[\s\S]{0,400}byCategory\.active/u);
});

test('存储 Tab 在窄窗口允许换行或滚动，且首次进入只触发一次 usage IPC', async () => {
  const [settings, css] = await Promise.all([source('src/js/pages/settings.js'), source('src/css/pages.css')]);
  assert.doesNotMatch(settings, /if \(pageState\.tab === 'storage'\) loadStorageUsage\(\);/u);
  assert.match(settings, /usageLoaded/u);
  assert.match(css, /\.settings-tabs\s*\{[^}]*flex-wrap:\s*wrap/u);
  assert.match(css, /\.settings-content\s*\{[^}]*overflow-y:\s*auto/u);
  assert.match(css, /\.settings-tab\s*\{[^}]*white-space:\s*normal/u);
});

test('空引用、共享保护和已不存在文件支持 metadata-only 清理确认', async () => {
  const [settings, store] = await Promise.all([source('src/js/pages/settings.js'), source('src/js/store.js')]);
  assert.match(settings, /metadataOnly/u);
  assert.match(store, /metadataOnly:\s*true/u);
  assert.match(store, /result\.metadataOnly === true/u);
});

test('孤儿清理向主进程传递带校验信息的引用并处理失败响应', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /selectedOrphans[\s\S]{0,500}scan\?\.files[\s\S]{0,300}checksum/u);
  assert.match(settings, /if \(!result \|\| result\.ok === false\)/u);
});

test('项目删除文案明确进入可恢复回收站', async () => {
  const projects = await source('src/js/pages/projects.js');
  assert.match(projects, /移入回收站/u);
  assert.match(projects, /可在存储管理恢复/u);
  assert.doesNotMatch(projects, /此操作不可撤销/u);
  assert.doesNotMatch(projects, /toast\('项目已删除'/u);
});

test('回收站和孤儿文件使用缩略图网格展示并支持图片预览', async () => {
  const [settings, css] = await Promise.all([source('src/js/pages/settings.js'), source('src/css/pages.css')]);
  assert.match(settings, /storage-thumb-grid/u);
  assert.match(settings, /data-storage-preview/u);
  assert.match(settings, /openImagePreview/u);
  assert.match(settings, /toImageSrc/u);
  assert.match(settings, /image: toImageSrc\(imagePath\)/u);
  assert.match(css, /\.storage-thumb-grid/u);
  assert.match(css, /\.storage-thumb-card/u);
  assert.match(css, /\.storage-thumb-image/u);
});

test('无法预览的存储文件显示异常占位而不伪造缩略图', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /storage-thumb-placeholder/u);
  assert.match(settings, /is-unsafe/u);
});

test('进入存储管理时自动扫描，扫描按钮只负责手动刷新', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /autoScanStarted/u);
  assert.match(settings, /if \(!pageState\.storage\.autoScanStarted\)[\s\S]{0,260}runScan\(\)/u);
});

test('存储文件预览右侧展示文件元数据而不是提示词字段', async () => {
  const [settings, preview] = await Promise.all([source('src/js/pages/settings.js'), source('src/js/image-preview.js')]);
  assert.match(settings, /storageDetails/u);
  assert.match(settings, /fileName/u);
  assert.match(settings, /storageLocation/u);
  assert.match(preview, /存储位置/u);
  assert.match(preview, /文件大小/u);
  assert.match(preview, /修改时间/u);
  assert.match(preview, /storageDetails/u);
});

test('恢复回收站条目后会重新扫描，避免孤立文件列表停留为空', async () => {
  const settings = await source('src/js/pages/settings.js');
  const restoreBlock = settings.match(/inner\.querySelectorAll\('\[data-act="restore-trash"\]'\)[\s\S]{0,1200}/u)?.[0] || '';
  assert.match(restoreBlock, /pageState\.storage\.scan = null/u);
  assert.match(restoreBlock, /await runScan\(\)/u);
});
