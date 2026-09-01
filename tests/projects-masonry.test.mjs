import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('项目列表使用按封面比例排列的瀑布流卡片', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/js/pages/projects.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /class="project-masonry-grid"/u);
  assert.match(source, /project-masonry-column/u);
  assert.match(source, /class="projects-page"/u);
  assert.match(css, /\.project-masonry-grid\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--project-columns\)/u);
  assert.match(css, /\.project-masonry-column\s*\{[^}]*flex-direction:\s*column/u);
  assert.match(css, /\.project-cover\s*\{[^}]*height:\s*auto/u);
  assert.match(source, /getProjectMasonryColumnCount/u);
  assert.match(source, /ResizeObserver/u);
});

test('项目瀑布流按实际列表宽度分配一到五列', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hash: '#/projects' }, addEventListener() {}, removeEventListener() {} };
  try {
    const moduleUrl = new URL(`../src/js/pages/projects.js?masonry-columns=${Date.now()}-${Math.random()}`, import.meta.url);
    const { getProjectMasonryColumnCount } = await import(moduleUrl.href);
    assert.equal(getProjectMasonryColumnCount(1800), 5);
    assert.equal(getProjectMasonryColumnCount(1450), 4);
    assert.equal(getProjectMasonryColumnCount(1050), 3);
    assert.equal(getProjectMasonryColumnCount(700), 2);
    assert.equal(getProjectMasonryColumnCount(400), 1);
  } finally {
    globalThis.window = previousWindow;
  }
});
