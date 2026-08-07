import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('..', import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('通用设置将主题、默认模型与钥匙串开关暂存到草稿，并由保存按钮统一提交', async () => {
  const settings = await source('src/js/pages/settings.js');
  assert.match(settings, /id="btn-save-general"/u);
  assert.match(settings, /function isGeneralDirty\(\)/u);
  assert.match(settings, /pageState\.themeMode = mode/u);
  assert.match(settings, /pageState\.secretStorageMode = secretStorageToggle\.checked \? 'keychain' : 'local'/u);
  assert.match(settings, /await window\.api\.setProviderSecretStorage\(pageState\.secretStorageMode\)/u);
  assert.match(settings, /pageState\.secretStorageMode = result\.mode/u);
  assert.match(settings, /pageState\.savedSecretStorageMode = result\.mode/u);
  assert.match(settings, /if \(pageState\.tab === 'general'\) refresh\(\);/u);
  assert.match(settings, /toast\('通用设置已保存', 'success'\)/u);
  assert.doesNotMatch(settings, /toast\('主题已切换', 'success'\)/u);
});
