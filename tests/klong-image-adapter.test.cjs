const test = require('node:test');
const assert = require('node:assert/strict');

const {
  KLONG_IMAGE_MODELS,
  buildKlongImageRequest,
  resolveKlongImageModels,
  resolveKlongImageEndpoints,
} = require('../src/main/services/klong-image-adapter');

test('Klong 自动从基础地址推导文生图与编辑接口', () => {
  assert.deepEqual(resolveKlongImageEndpoints('https://api.klong.lat/v1'), {
    generationUrl: 'https://api.klong.lat/v1/images/generations',
    editUrl: 'https://api.klong.lat/v1/images/edits',
  });
  assert.deepEqual(resolveKlongImageEndpoints('https://api.klong.lat'), {
    generationUrl: 'https://api.klong.lat/v1/images/generations',
    editUrl: 'https://api.klong.lat/v1/images/edits',
  });
  assert.deepEqual(resolveKlongImageEndpoints('https://api.klong.lat/v1/images/generations'), {
    generationUrl: 'https://api.klong.lat/v1/images/generations',
    editUrl: 'https://api.klong.lat/v1/images/edits',
  });
});

test('Klong 文生图使用平台扩展比例与分辨率档位', () => {
  const body = buildKlongImageRequest({
    modelId: 'nano-banana2',
    prompt: '木桌上的红苹果',
    ratio: '16:9',
    quality: '高清',
  });

  assert.deepEqual(body, {
    model: 'nano-banana2',
    prompt: '木桌上的红苹果',
    n: 1,
    response_format: 'b64_json',
    output_format: 'png',
    aspect_ratio: '16:9',
    image_size: '2K',
  });
});

test('Klong 精确尺寸模型按画幅和清晰度发送明确像素', () => {
  const body = buildKlongImageRequest({
    modelId: 'gpt-image-2.5-exact',
    prompt: '未来城市',
    ratio: '9:16',
    quality: '超高清',
  });

  assert.equal(body.size, '2304x4096');
  assert.equal(body.aspect_ratio, undefined);
  assert.equal(body.image_size, undefined);
});

test('Klong 图生图使用 edits 并写入 reference_images 数组', () => {
  const sourceImages = ['data:image/png;base64,one', 'data:image/png;base64,two'];
  const body = buildKlongImageRequest({
    modelId: 'gpt-image-2-high',
    prompt: '融合两张参考图',
    ratio: '4:3',
    quality: '标准',
    sourceImages,
  });

  assert.deepEqual(body.reference_images, sourceImages);
  assert.equal(body.aspect_ratio, '4:3');
  assert.equal(body.image_size, '1K');
});

test('Klong Nano 与 Grok 使用文档示例中的 image 字段', () => {
  const nano = buildKlongImageRequest({
    modelId: 'nano-banana2',
    prompt: '改成水彩风',
    sourceImage: 'data:image/png;base64,nano',
  });
  assert.equal(nano.image, 'data:image/png;base64,nano');
  assert.equal(nano.reference_images, undefined);

  const grok = buildKlongImageRequest({
    modelId: 'grok-imagine-image-2.0',
    prompt: '保留主体',
    sourceImage: 'data:image/png;base64,grok',
  });
  assert.equal(grok.image, 'data:image/png;base64,grok');
  assert.throws(
    () => buildKlongImageRequest({
      modelId: 'grok-imagine-image-2.0',
      prompt: '错误多图',
      sourceImages: ['data:image/png;base64,one', 'data:image/png;base64,two'],
    }),
    /只支持 1 张参考图/u,
  );
});

test('Klong 内置模型覆盖文档中的 OpenAI Images 可用模型', () => {
  assert.deepEqual(KLONG_IMAGE_MODELS.map((model) => model.id), [
    'gpt-image-2',
    'gpt-image-2.5',
    'gpt-image-2.5-flare',
    'gpt-image-2.5-sunburst',
    'gpt-image-2-exact',
    'gpt-image-2.5-exact',
    'gpt-image-2-1k',
    'gpt-image-2.5-1k',
    'gpt-image-2-vip',
    'gpt-image-2-high',
    'nano-banana2',
    'nano-banana-pro',
    'grok-imagine-image-2.0',
  ]);
});

test('Klong 模型分类会排除文本模型并保持内置顺序', () => {
  assert.deepEqual(resolveKlongImageModels([
    { id: 'deepseek-chat' },
    { id: 'nano-banana2' },
    { id: 'gpt-image-2.5-high' },
  ]), [
    { id: 'nano-banana2', name: 'Nano Banana 2' },
    { id: 'gpt-image-2.5-high', name: 'gpt-image-2.5-high' },
  ]);
  assert.deepEqual(resolveKlongImageModels([{ id: 'deepseek-chat' }]), []);
});
