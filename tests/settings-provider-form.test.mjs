import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('切换供应商能力时保留正在输入的 API Key，并使用语义化字段网格排版', async () => {
  const [settings, css] = await Promise.all([
    source('src/js/pages/settings.js'),
    source('src/css/pages.css'),
  ]);

  assert.match(settings, /provider-basic-grid/u);
  assert.match(settings, /provider-field/u);
  assert.match(settings, /const typedApiKey = inner\.querySelector\('#pf-key'\)\?\.value \|\| '';/u);
  assert.match(settings, /restoreTypedApiKey\(getInner\(\), typedApiKey\);/u);
  assert.match(settings, /capabilityInput\.addEventListener\('change'/u);
  assert.match(settings, /getProviderSecretLocal/u);
  assert.match(settings, /pageState\.secretStorageMode === 'local'/u);
  assert.match(settings, /已保存到系统钥匙串/u);
  assert.match(settings, /密钥保存在妙生应用本地/u);
  assert.match(css, /\.provider-basic-grid/u);
  assert.match(css, /\.provider-field/u);
});
