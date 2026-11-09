import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { KLONG_IMAGE_MODELS: adapterModels } = require('../src/main/services/klong-image-adapter.js');

test('设置页将 Klong 作为带默认地址的内置供应商类型', async () => {
  const source = await readFile(new URL('../src/js/pages/settings.js', import.meta.url), 'utf8');
  assert.match(source, /value:\s*'klong'/u);
  assert.match(source, /label:\s*'Klong'/u);
  assert.match(source, /defaultEndpoint:\s*'https:\/\/api\.klong\.lat\/v1'/u);
  assert.match(source, /defaultCaps:\s*\['image'\]/u);
});

test('默认状态与主进程适配器使用同一份 Klong 模型清单', async () => {
  const { KLONG_IMAGE_MODELS: stateModels } = await import('../src/js/state-schema.js');
  assert.deepEqual(
    stateModels.map((model) => model.id),
    adapterModels.map((model) => model.id),
  );
});

test('主进程按 Klong 专用协议调用 generations 与 edits', async () => {
  const [source, adapter] = await Promise.all([
    readFile(new URL('../main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main/services/klong-image-adapter.js', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /async function generateWithKlong/u);
  assert.match(source, /ptype === 'klong'/u);
  assert.match(source, /buildKlongImageRequest/u);
  assert.match(source, /resolveKlongImageEndpoints/u);
  assert.match(adapter, /reference_images/u);
  assert.match(adapter, /body\.image = images\.length === 1/u);
  assert.match(adapter, /images\/edits/u);
  assert.match(adapter, /response_format:\s*'b64_json'/u);
});

test('Android 包含 Klong 类型、尺寸和编辑请求适配', async () => {
  const [requestFactory, settings] = await Promise.all([
    readFile(new URL('../android/app/src/main/java/com/miaos/android/generation/ImageRequestFactory.kt', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/java/com/miaos/android/ui/SettingsScreen.kt', import.meta.url), 'utf8'),
  ]);
  assert.match(settings, /"klong"/u);
  assert.match(requestFactory, /"klong" -> buildKlong/u);
  assert.match(requestFactory, /body\["reference_images"\] = listOf\(sourceImage\)/u);
  assert.match(requestFactory, /body\["image"\] = sourceImage/u);
  assert.match(requestFactory, /body\["size"\]/u);
});
