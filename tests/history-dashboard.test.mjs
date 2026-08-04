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
  const moduleUrl = new URL(`../src/js/pages/history.js?history-dashboard=${Date.now()}-${Math.random()}`, import.meta.url);
  const pageModule = await import(moduleUrl.href);
  return {
    pageModule,
    restore() { globalThis.window = previousWindow; },
  };
}

test('侧边栏折叠开关必须位于不会被路由替换的侧边栏内', async () => {
  const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  const sidebar = html.match(/<aside class="sidebar"[^>]*>([\s\S]*?)<\/aside>/u)?.[1] || '';
  const main = html.match(/<main class="main-content"[^>]*>([\s\S]*?)<\/main>/u)?.[1] || '';

  assert.match(sidebar, /id="sidebar-toggle-btn"/u);
  assert.doesNotMatch(main, /sidebar-(?:collapse|expand|toggle)-btn/u);
  const icons = await readFile(new URL('../src/js/icons.js', import.meta.url), 'utf8');
  assert.match(icons, /'panel-left-close':/u);
  assert.match(icons, /'panel-left-open':/u);
});

test('查询统计页复用系统设置的下划线 Tab，并且空态不包含去生图引导', async () => {
  const source = await readFile(new URL('../src/js/pages/history.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8');

  assert.match(source, /class="settings-tabs history-page-tabs"/u);
  assert.doesNotMatch(source, /去生图|立即生图|data-history-empty-action|navigate\('\/generate'\)/u);
  assert.doesNotMatch(css, /\.history-page-tabs\s+\.settings-tab/u);
  assert.match(css, /\.history-empty\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/u);
});

test('统计数据模型提供近 30 天趋势、来源占比、模型排行、提示词与热力图', async () => {
  const { pageModule, restore } = await loadHistoryPageModule();
  try {
    assert.equal(typeof pageModule.buildStatisticsData, 'function');
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date(2026, 7, 4, 12).getTime();
    const items = [
      { source: 'quick', model: '模型 A', prompt: '赛博城市', createdAt: now },
      { source: 'quick', model: '模型 A', prompt: '赛博城市', createdAt: now - dayMs },
      { source: 'project', model: '模型 B', prompt: '产品海报', createdAt: now - 3 * dayMs },
      { source: 'project', model: '模型 B', prompt: '产品海报', createdAt: now - 10 * dayMs },
      { source: 'project', model: '模型 C', prompt: '远古数据', createdAt: now - 45 * dayMs },
    ];

    const data = pageModule.buildStatisticsData(items, now);

    assert.equal(data.total, 5);
    assert.equal(data.last7Days, 3);
    assert.equal(data.quickCount, 2);
    assert.equal(data.projectCount, 3);
    assert.equal(data.trend.length, 30);
    assert.equal(data.trend.at(-1).count, 1);
    assert.deepEqual(data.models.slice(0, 2).map(({ name, count }) => [name, count]), [['模型 A', 2], ['模型 B', 2]]);
    assert.deepEqual(data.prompts.slice(0, 2).map(({ text, count }) => [text, count]), [['产品海报', 2], ['赛博城市', 2]]);
    assert.equal(data.heatmap.length, 105);
  } finally {
    restore();
  }
});

test('统计分析输出趋势图、环形图、模型数据条、提示词气泡和活跃热力图', async () => {
  const { pageModule, restore } = await loadHistoryPageModule();
  try {
    assert.equal(typeof pageModule.createStatisticsDashboardHtml, 'function');
    const html = pageModule.createStatisticsDashboardHtml(pageModule.buildStatisticsData([], Date.now()));

    assert.match(html, /stats-trend-chart/u);
    assert.match(html, /stats-donut/u);
    assert.match(html, /stats-model-bars/u);
    assert.match(html, /stats-prompt-cloud/u);
    assert.match(html, /stats-heatmap/u);
    assert.match(html, /<svg/u);
  } finally {
    restore();
  }
});
