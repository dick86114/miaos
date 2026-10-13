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

test('项目瀑布流按实际列表宽度分配一到六列', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { hash: '#/projects' }, addEventListener() {}, removeEventListener() {} };
  try {
    const moduleUrl = new URL(`../src/js/pages/projects.js?masonry-columns=${Date.now()}-${Math.random()}`, import.meta.url);
    const { getProjectMasonryColumnCount } = await import(moduleUrl.href);
    assert.equal(getProjectMasonryColumnCount(1800), 6);
    assert.equal(getProjectMasonryColumnCount(1300), 5);
    assert.equal(getProjectMasonryColumnCount(1000), 4);
    assert.equal(getProjectMasonryColumnCount(750), 3);
    assert.equal(getProjectMasonryColumnCount(550), 2);
    assert.equal(getProjectMasonryColumnCount(400), 1);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('项目卡片信息区在封面图前并使用更紧凑的高密度布局', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/js/pages/projects.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8'),
  ]);

  const cardSource = source.match(/function projectCardHtml\(\w+\)\s*\{[\s\S]*?<\/a>`;\s*\n\}/u)?.[0];
  assert.ok(cardSource, '应找到项目卡片渲染函数');
  assert.ok(cardSource.indexOf('class="project-body"') > -1);
  assert.ok(cardSource.indexOf('${coverHtml}') > -1);
  assert.ok(
    cardSource.indexOf('class="project-body"') < cardSource.indexOf('${coverHtml}'),
    '项目信息应显示在封面图之前',
  );

  const gridGap = css.match(/\.project-masonry-grid\s*\{[^}]*?gap:\s*([^;]+);/u)?.[1];
  assert.equal(gridGap?.trim(), '12px');
  assert.match(css, /\.project-cover-placeholder\s*\{[^}]*min-height:\s*120px/u);
  assert.match(css, /\.project-body\s*\{[^}]*padding:\s*12px 14px/u);
  assert.match(css, /\.project-name\s*\{[^}]*font-size:\s*18px/u);
  assert.match(css, /\.project-name\s*\{[^}]*font-weight:\s*700/u);
});
