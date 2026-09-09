const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGrsaiImageRequest,
} = require('../src/main/services/grsai-image-adapter');

test('GRSai gpt-image-2 将三档质量映射为 low、medium、high，并保留比例参数', () => {
  const expected = [
    ['标准', 'low'],
    ['高清', 'medium'],
    ['超高清', 'high'],
  ];

  for (const [quality, apiQuality] of expected) {
    const body = buildGrsaiImageRequest({
      model: 'gpt-image-2',
      prompt: '一只猫',
      ratio: '1:1',
      quality,
    });

    assert.equal(body.quality, apiQuality);
    assert.equal(body.aspectRatio, '1:1');
    assert.equal(body.replyType, 'json');
    assert.deepEqual(body.images, []);
  }
});

test('GRSai gpt-image-2-vip 按三档质量将比例转换为 1K、2K、4K 像素值', () => {
  assert.deepEqual(
    buildGrsaiImageRequest({ model: 'gpt-image-2-vip', prompt: '风景', ratio: '16:9', quality: '标准' }),
    { model: 'gpt-image-2-vip', prompt: '风景', images: [], aspectRatio: '1280x720', quality: 'low', replyType: 'json' },
  );
  assert.equal(buildGrsaiImageRequest({ model: 'gpt-image-2-vip', prompt: '风景', ratio: '16:9', quality: '高清' }).aspectRatio, '2048x1152');
  const high = buildGrsaiImageRequest({ model: 'gpt-image-2-vip', prompt: '人物', ratio: '9:16', quality: '超高清' });
  assert.equal(high.aspectRatio, '2160x3840');
  assert.equal(high.quality, 'high');
});

test('GRSai gpt-image-2.5 新模型按三档质量将比例转换为像素值', () => {
  const models = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'];
  const expectedSizes = {
    标准: { '1:1': '1024x1024', '4:3': '1152x864', '16:9': '1280x720', '9:16': '720x1280' },
    高清: { '1:1': '2048x2048', '4:3': '2304x1728', '16:9': '2048x1152', '9:16': '1152x2048' },
    超高清: { '1:1': '2880x2880', '4:3': '3264x2448', '16:9': '3840x2160', '9:16': '2160x3840' },
  };
  const expectedQuality = { 标准: 'low', 高清: 'medium', 超高清: 'high' };

  for (const model of models) {
    for (const [quality, sizes] of Object.entries(expectedSizes)) {
      for (const ratio of ['1:1', '4:3', '16:9', '9:16']) {
        const body = buildGrsaiImageRequest({ model, prompt: '一只猫', ratio, quality });
        assert.equal(body.aspectRatio, sizes[ratio]);
        assert.equal(body.quality, expectedQuality[quality]);
      }
    }
  }
});

test('GRSai GPT Image 2.5 支持官方扩展比例并传递 nano-banana 分辨率', () => {
  const body = buildGrsaiImageRequest({
    model: 'gpt-image-2.5-sunburst',
    prompt: '一只猫',
    ratio: '21:9',
    quality: '高清',
  });
  assert.equal(body.aspectRatio, '2912x1248');

  const nano = buildGrsaiImageRequest({
    model: 'nano-banana-2',
    prompt: '一只猫',
    ratio: '8:1',
    quality: '标准',
  });
  assert.equal(nano.aspectRatio, '8:1');
  assert.equal(nano.imageSize, '1K');
  assert.equal(nano.quality, undefined);
});

test('GRSai 非 gpt-image-2 模型保持原有请求结构', () => {
  const body = buildGrsaiImageRequest({
    model: '其它模型',
    prompt: '一只猫',
    ratio: '4:3',
    quality: '超高清',
    sourceImage: 'data:image/png;base64,abc',
  });

  assert.equal(body.aspectRatio, '4:3');
  assert.deepEqual(body.images, ['data:image/png;base64,abc']);
  assert.equal(body.quality, undefined);
  assert.equal(body.size, undefined);
});
