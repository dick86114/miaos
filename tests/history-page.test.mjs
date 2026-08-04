import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

async function loadHistoryPageModule() {
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: createMemoryStorage(),
    location: { hash: '#/history' },
    addEventListener() {},
  };
  const moduleUrl = new URL(`../src/js/pages/history.js?history-page=${Date.now()}-${Math.random()}`, import.meta.url);
  const pageModule = await import(moduleUrl.href);
  return {
    pageModule,
    restore() { globalThis.window = previousWindow; },
  };
}

function createRecord(key, source) {
  return {
    key,
    id: key,
    source,
    image: `file:///${key}.png`,
    prompt: `${source} 提示词`,
    model: `${source}-model`,
    createdAt: 1,
    ...(source === 'project' ? {
      projectId: 'project-1',
      projectName: '测试项目',
      versionId: 'version-1',
      imageId: 'image-1',
    } : {}),
  };
}

test('侧边栏四项文案使用统一生成历史的信息架构，路由键保持不变', async () => {
  const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');

  assert.match(html, /data-nav-key="generate"[\s\S]*?<span class="nav-label">快速生图<\/span>/);
  assert.match(html, /data-nav-key="projects"[\s\S]*?<span class="nav-label">我的项目<\/span>/);
  assert.match(html, /data-nav-key="history"[\s\S]*?<span class="nav-label">统计查询<\/span>/);
  assert.match(html, /data-nav-key="settings"[\s\S]*?<span class="nav-label">系统设置<\/span>/);
});

test('历史页控制器将搜索和来源筛选交给统一选择器，按 24 条分页并在筛选时回到第一页', async () => {
  const { pageModule, restore } = await loadHistoryPageModule();
  try {
    assert.equal(typeof pageModule.createHistoryPageController, 'function');
    const calls = [];
    const controller = pageModule.createHistoryPageController({
      getUnifiedHistory: (_state, options) => {
        calls.push(options);
        return { items: [], page: options.page, pageSize: options.pageSize, total: 0, totalPages: 1 };
      },
      getHistory: () => [],
      getProjects: () => [],
      deleteHistoryRecords: () => 0,
      confirmDialog: async () => true,
    });

    controller.getPage();
    controller.setPage(3);
    controller.getPage();
    controller.setFilters({ query: '猫咪', source: 'project' });
    controller.getPage();
    controller.setFilters({ projectId: 'project-1' });
    controller.getPage();
    controller.setFilters({ source: 'quick' });
    controller.getPage();

    assert.deepEqual(calls, [
      { page: 1, pageSize: 24, query: '', source: 'all', projectId: '' },
      { page: 3, pageSize: 24, query: '', source: 'all', projectId: '' },
      { page: 1, pageSize: 24, query: '猫咪', source: 'project', projectId: '' },
      { page: 1, pageSize: 24, query: '猫咪', source: 'project', projectId: 'project-1' },
      { page: 1, pageSize: 24, query: '猫咪', source: 'quick', projectId: '' },
    ]);
    assert.equal(controller.getState().projectId, '', '切换来源离开项目生图时必须清除残留项目筛选');
  } finally {
    restore();
  }
});

test('批量管理只删除已选混合来源条目，二次确认后清空选择并采用选择器修正页码', async () => {
  const { pageModule, restore } = await loadHistoryPageModule();
  try {
    assert.equal(typeof pageModule.createHistoryPageController, 'function');
    const quick = createRecord('quick:quick-1', 'quick');
    const project = createRecord('project:project-1:version-1:image-1', 'project');
    const calls = [];
    const confirmedMessages = [];
    const deleted = [];
    const controller = pageModule.createHistoryPageController({
      getUnifiedHistory: (_state, options) => {
        calls.push(options);
        return { items: [], page: 1, pageSize: 24, total: 0, totalPages: 1 };
      },
      getHistory: () => [],
      getProjects: () => [],
      deleteHistoryRecords: (records) => {
        deleted.push(records);
        return records.length;
      },
      confirmDialog: async (message) => {
        confirmedMessages.push(message);
        return true;
      },
    });

    controller.setPage(2);
    controller.setBatchMode(true);
    controller.toggleSelection(quick);
    controller.toggleSelection(project);
    assert.equal(controller.getSelectedItems().length, 2);

    const deletedCount = await controller.deleteSelected();

    assert.equal(deletedCount, 2);
    assert.deepEqual(deleted, [[quick, project]]);
    assert.match(confirmedMessages[0], /快速生图 1 张/);
    assert.match(confirmedMessages[0], /项目生图 1 张/);
    assert.match(confirmedMessages[0], /影响对应项目版本/);
    assert.equal(controller.getSelectedItems().length, 0);
    assert.equal(controller.getState().page, 1);
    assert.deepEqual(calls.at(-1), { page: 2, pageSize: 24, query: '', source: 'all', projectId: '' });
  } finally {
    restore();
  }
});

test('历史页复用项目画廊卡片，项目图片可打开统一预览并提供项目跳转入口', async () => {
  const { pageModule, restore } = await loadHistoryPageModule();
  try {
    assert.equal(typeof pageModule.createHistoryCardHtml, 'function');
    const html = pageModule.createHistoryCardHtml(createRecord('project:project-1:version-1:image-1', 'project'), false);

    assert.match(html, /class="gallery-item history-card/);
    assert.match(html, /history-source-badge/);
    assert.match(html, /项目生图/);
    assert.match(html, /data-history-act="preview"/);
    assert.match(html, /data-history-act="project"/);
    assert.match(html, /data-history-key="project:project-1:version-1:image-1"/);
  } finally {
    restore();
  }
});

test('项目历史卡片的项目跳转按钮必须渲染可用文件夹图标', async () => {
  const [iconsSource, historySource] = await Promise.all([
    readFile(new URL('../src/js/icons.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/js/pages/history.js', import.meta.url), 'utf8'),
  ]);

  assert.match(historySource, /icon\('folder-open', 14\)/u);
  assert.match(iconsSource, /'folder-open':/u);
});
