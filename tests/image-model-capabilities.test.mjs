import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getImageParameterOptions,
  normalizeImageParameters,
} from '../src/js/image-model-capabilities.js';
import { AIPING_IMAGE_MODELS } from '../src/js/state-schema.js';

function values(qualities) {
  return qualities.map((quality) => quality.value);
}

test('Grsai GPT Image 2.5 按模型区分像素分辨率与比例', () => {
  const flare = getImageParameterOptions('grsai', 'gpt-image-2.5-flare');
  assert.deepEqual(values(flare.qualities), ['标准', '高清', '超高清']);
  for (const ratio of ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9']) {
    assert.ok(flare.ratios.includes(ratio));
  }

  const base = getImageParameterOptions('grsai', 'gpt-image-2.5');
  assert.deepEqual(values(base.qualities), ['标准']);
});

test('Grsai nano-banana 不同通道只显示支持的清晰度', () => {
  assert.deepEqual(values(getImageParameterOptions('grsai', 'nano-banana-2').qualities), ['标准', '高清', '超高清']);
  assert.ok(getImageParameterOptions('grsai', 'nano-banana-2').ratios.includes('8:1'));
  assert.deepEqual(values(getImageParameterOptions('grsai', 'nano-banana-2-2k-cl').qualities), ['高清']);
  assert.deepEqual(values(getImageParameterOptions('grsai', 'nano-banana-pro-4k-vip').qualities), ['超高清']);
  assert.deepEqual(values(getImageParameterOptions('grsai', 'nano-banana-pro-vip').qualities), ['标准', '高清']);
});

test('Aiping 全部内置模型都有比例和质量能力', () => {
  for (const modelId of AIPING_IMAGE_MODELS.map((model) => model.id)) {
    const options = getImageParameterOptions('aiping', modelId);
    assert.ok(options.ratios.length > 0, `${modelId} 缺少比例`);
    assert.ok(options.qualities.length > 0, `${modelId} 缺少质量`);
    for (const quality of options.qualities) {
      assert.ok(['自动', '标准', '高清', '超高清'].includes(quality.value));
    }
  }

  assert.deepEqual(values(getImageParameterOptions('aiping', 'Doubao-Seedream-4.5').qualities), ['高清', '超高清']);
  assert.deepEqual(values(getImageParameterOptions('aiping', 'glm-image').qualities), ['自动']);
  assert.deepEqual(values(getImageParameterOptions('aiping', 'Kling-V2.1').qualities), ['标准', '高清']);
});

test('旧参数切换模型时会收敛到第一个受支持值', () => {
  assert.deepEqual(
    normalizeImageParameters('grsai', 'gpt-image-2.5', '21:9', '超高清'),
    {
      ratio: '21:9',
      quality: '标准',
      options: getImageParameterOptions('grsai', 'gpt-image-2.5'),
    },
  );
  assert.deepEqual(
    normalizeImageParameters('grsai', 'nano-banana-2-2k-cl', '1:8', '标准'),
    {
      ratio: '1:1',
      quality: '高清',
      options: getImageParameterOptions('grsai', 'nano-banana-2-2k-cl'),
    },
  );
});

test('未知 OpenAI 兼容模型保持原有兜底参数', () => {
  const options = getImageParameterOptions('custom', 'private-model');
  assert.deepEqual(options.ratios, ['1:1', '4:3', '16:9', '9:16']);
  assert.deepEqual(values(options.qualities), ['标准', '高清', '超高清']);
});
