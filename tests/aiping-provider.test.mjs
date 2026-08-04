import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('设置页将 Aiping 作为带默认地址的内置供应商类型', async () => {
  const source = await readFile(new URL('../src/js/pages/settings.js', import.meta.url), 'utf8');
  assert.match(source, /value:\s*'aiping'/u);
  assert.match(source, /label:\s*'Aiping'/u);
  assert.match(source, /defaultEndpoint:\s*'https:\/\/aiping\.cn\/api\/v1'/u);
  assert.match(source, /defaultCaps:\s*\['image',\s*'text'\]/u);
});

test('主进程包含 Aiping 专用生图适配，不复用 Agnes 图生图参数', async () => {
  const [source, adapter] = await Promise.all([
    readFile(new URL('../main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main/services/aiping-image-adapter.js', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /async function generateWithAiping/u);
  assert.match(source, /ptype === 'aiping'/u);
  assert.match(source, /buildAipingImageRequest/u);
  assert.match(adapter, /enable_image_base64:\s*false/u);
  assert.match(adapter, /image:\s*sourceImage/u);
});

test('已有供应商输入新 Key 时优先做一次性验证，未输入时才使用已保存密钥', async () => {
  const { createProviderRequestData } = await import(`../src/js/pages/settings.js?aiping-key=${Date.now()}-${Math.random()}`);
  const form = {
    id: 'p_aiping',
    name: 'Aiping',
    type: 'aiping',
    endpoint: 'https://aiping.cn/api/v1',
  };

  assert.deepEqual(createProviderRequestData(form, 'sk-new-key', false), {
    name: 'Aiping',
    type: 'aiping',
    endpoint: 'https://aiping.cn/api/v1',
    apiKeyOverride: 'sk-new-key',
  });
  assert.deepEqual(createProviderRequestData(form, '', false), {
    name: 'Aiping',
    type: 'aiping',
    endpoint: 'https://aiping.cn/api/v1',
    providerId: 'p_aiping',
  });
});
