const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AIPING_IMAGE_MODEL_IDS,
  buildAipingImageRequest,
} = require('../src/main/services/aiping-image-adapter');

const EXPECTED_MODELS = [
  'Qwen-Image', 'Qwen-Image-Edit', 'HunyuanImage-3.0', '即梦文生图 3.0', '即梦文生图 3.1',
  'Doubao-Seedream-4.0', 'Kling-V2.1', 'Kling-V1', 'glm-image', 'Doubao-Seedream-5.0-lite',
  'Doubao-Seedream-4.5', '即梦图片生成 4.0', 'Kolors', 'Qwen-Image-Plus', 'Qwen-Image-Edit-Plus',
  'Wan2.5-T2I-Preview', 'Wan2.5-I2I-Preview',
];

function build(modelId, overrides = {}) {
  return buildAipingImageRequest({
    modelId,
    prompt: '测试提示词',
    ratio: '16:9',
    quality: '高清',
    size: '1024x576',
    sourceImage: null,
    ...overrides,
  });
}

test('Aiping 适配矩阵覆盖全部内置图像模型', () => {
  assert.deepEqual(AIPING_IMAGE_MODEL_IDS, EXPECTED_MODELS);
  for (const modelId of EXPECTED_MODELS) {
    if (['Qwen-Image-Edit', 'Qwen-Image-Edit-Plus', 'Wan2.5-I2I-Preview'].includes(modelId)) continue;
    const body = build(modelId);
    assert.equal(body.model, modelId);
    assert.equal(body.prompt, '测试提示词');
    assert.deepEqual(body.extra_body.provider, {
      enable_image_base64: false,
      enable_image_origin_data: false,
    });
  }
});

test('Seedream、Kling 和 GLM 使用各自文档要求的参数', () => {
  assert.deepEqual(build('Doubao-Seedream-5.0-lite'), {
    model: 'Doubao-Seedream-5.0-lite', prompt: '测试提示词', size: '2848*1600',
    output_format: 'png', watermark: false, sequential_image_generation: 'disabled',
    extra_body: { provider: { enable_image_base64: false, enable_image_origin_data: false } },
  });
  assert.deepEqual(build('Kling-V2.1'), {
    model: 'Kling-V2.1', prompt: '测试提示词', resolution: '2k', n: 1, aspect_ratio: '16:9',
    extra_body: { provider: { enable_image_base64: false, enable_image_origin_data: false } },
  });
  assert.deepEqual(build('glm-image'), {
    model: 'glm-image', prompt: '测试提示词', size: '1728x960', quality: 'hd',
    extra_body: { provider: { enable_image_base64: false, enable_image_origin_data: false } },
  });
});

test('即梦、Kolors、Qwen、Wan 使用对应尺寸字段，编辑模型强制要求参考图', () => {
  assert.equal(build('即梦文生图 3.1').width, 2560);
  assert.equal(build('即梦文生图 3.1').height, 1440);
  assert.equal(build('Kolors').image_size, '1280x720');
  assert.equal(build('Qwen-Image').size, '1280*720');
  assert.equal(build('Wan2.5-T2I-Preview').size, '1280*720');

  for (const modelId of ['Qwen-Image-Edit', 'Qwen-Image-Edit-Plus', 'Wan2.5-I2I-Preview']) {
    assert.throws(() => build(modelId), /需要先上传参考图/u);
    assert.equal(build(modelId, { sourceImage: 'data:image/png;base64,AA==' }).image, 'data:image/png;base64,AA==');
  }
});
