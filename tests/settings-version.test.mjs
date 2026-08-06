import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/js/pages/settings.js', import.meta.url), 'utf8');

test('关于页面从已加载版本状态渲染当前版本，而不是每次回退为破折号', () => {
  assert.match(source, /const currentVersion = u\.current\?\.version \|\| '—';/u);
  assert.match(source, /当前版本：<span id="cur-ver">\$\{escapeHtml\(currentVersion\)\}<\/span>/u);
  assert.match(source, /pageState\.update\.current = info \|\| null;/u);
  assert.match(source, /if \(pageState\.tab === 'about'\) refresh\(\);/u);
});
