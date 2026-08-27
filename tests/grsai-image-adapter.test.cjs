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
