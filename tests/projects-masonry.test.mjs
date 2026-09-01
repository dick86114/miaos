import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('项目列表使用按封面比例排列的瀑布流卡片', async () => {
  const [source, css] = await Promise.all([
    readFile(new URL('../src/js/pages/projects.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /class="project-grid"/u);
  assert.match(css, /\.project-grid\s*\{[^}]*column-width:/u);
  assert.match(css, /\.project-grid\s*\{[^}]*column-count:\s*auto/u);
  assert.match(css, /\.project-grid\s*\{[^}]*width:\s*100%/u);
  assert.match(css, /\.project-card\s*\{[^}]*break-inside:\s*avoid/u);
  assert.match(css, /\.project-cover\s*\{[^}]*height:\s*auto/u);
  assert.match(source, /columnCount/u);
  assert.match(source, /ResizeObserver/u);
});
