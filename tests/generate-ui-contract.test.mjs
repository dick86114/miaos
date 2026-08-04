import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [generatePage, projectPage, icons, pagesCss] = await Promise.all([
  readFile(new URL('../src/js/pages/generate.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/pages/project.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/icons.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8'),
]);

test('生成入口使用向下箭头，明确结果会出现在编辑器下方', () => {
  assert.match(icons, /'arrow-down':/u);
  assert.match(generatePage, /icon\('arrow-down', 20\)/u);
  assert.match(projectPage, /icon\('arrow-down', 20\)/u);
  assert.doesNotMatch(generatePage, /icon\('arrow-up', 20\)/u);
  assert.doesNotMatch(projectPage, /icon\('arrow-up', 20\)/u);
});

test('没有活跃任务时，队列区的 hidden 属性必须压过默认 flex 布局', () => {
  assert.match(pagesCss, /\.queue-section\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/u);
});

test('提示词优化使用粒子层并移除旧波浪层', () => {
  for (const [pageName, page] of [['生成页', generatePage], ['项目页', projectPage]]) {
    assert.match(page, /class="composer-particle-field"/u, `${pageName}必须包含粒子层`);
    assert.match(page, /particleField\.classList\.add\('is-optimizing'\)/u, `${pageName}优化开始时必须激活粒子层`);
    assert.match(page, /particleField\.classList\.remove\('is-optimizing'\)/u, `${pageName}优化结束时必须停用粒子层`);
    assert.doesNotMatch(page, /composer-wave-bar/u, `${pageName}不得继续使用旧波浪层`);
  }
});
