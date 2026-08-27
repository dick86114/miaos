import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('失败详情在宽屏下保持纵向信息流，并限制提示词区域高度', async () => {
  const css = await readFile(new URL('../src/css/pages.css', import.meta.url), 'utf8');

  assert.match(css, /\.image-preview-panel-failure \.image-preview-content\s*\{[^}]*flex-direction:\s*column/u);
  assert.match(css, /\.image-preview-failure-guidance\s*\{[^}]*grid-template-columns:/u);
  assert.match(css, /\.image-preview-prompt-content\s*\{[^}]*max-height:/u);
  assert.match(css, /\.image-preview-prompt-content\s*\{[^}]*overflow:\s*auto/u);
});
