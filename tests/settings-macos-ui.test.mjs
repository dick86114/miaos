import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('设置页主题与密钥保存使用 macOS 风格控件，并移除设置内容额外横向留白', async () => {
  const [settings, css] = await Promise.all([
    source('src/js/pages/settings.js'),
    source('src/css/pages.css'),
  ]);

  assert.match(settings, /theme-mode-control/u);
  assert.match(settings, /macos-switch/u);
  assert.match(settings, /settings-security-row/u);
  assert.match(settings, /正在迁移 API Key/u);
  assert.match(settings, /已取消更改 API Key 保存方式/u);
  assert.match(settings, /旧版钥匙串密钥，当前未读取/u);
  assert.match(css, /\.theme-mode-control/u);
  assert.match(css, /\.macos-switch/u);
  assert.match(css, /\.settings-content\s*\{[^}]*padding:\s*24px 0 40px/u);
});

test('统计分析 Tab 使用已注册的柱状图图标', async () => {
  const [history, icons] = await Promise.all([
    source('src/js/pages/history.js'),
    source('src/js/icons.js'),
  ]);
  assert.match(history, /icon\('bar-chart-2', 16\)/u);
  assert.match(icons, /'bar-chart-2':/u);
});
