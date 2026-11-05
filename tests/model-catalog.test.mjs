import assert from 'node:assert/strict';
import test from 'node:test';

import { getImageModelDescription, getModelDescription } from '../src/js/model-catalog.js';

test('内置生图模型提供可读的中文说明，而不是把模型 ID 重复成描述', () => {
  const description = getImageModelDescription('nano-banana-pro');
  assert.match(description, /Nano Banana Pro/u);
  assert.notEqual(description, 'nano-banana-pro');
  assert.match(getImageModelDescription('Qwen-Image-Edit'), /参考图/u);
});

test('动态拉取的模型优先使用模型自身描述，其次使用可读名称', () => {
  assert.equal(
    getImageModelDescription('custom-image', '自定义模型', '来自供应商的模型说明'),
    '来自供应商的模型说明',
  );
  assert.equal(
    getImageModelDescription('custom-image', '供应商返回的可读名称'),
    '供应商返回的可读名称',
  );
});

test('文本模型与未知模型都有安全的兜底说明', () => {
  assert.match(getModelDescription({ category: 'text', modelId: 'unknown-text' }), /提示词优化/u);
  assert.match(getImageModelDescription('unknown-image'), /生图模型/u);
});
