const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGrsaiImageRequest,
  resolveGrsaiEndpoints,
  parseGrsaiPayload,
} = require('../src/main/services/grsai-image-adapter');

test('GRSai gpt-image-2 使用新版 images 数组、异步回复和三档质量', () => {
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

    assert.deepEqual(body, {
      model: 'gpt-image-2',
      prompt: '一只猫',
      images: [],
      aspectRatio: '1:1',
      quality: apiQuality,
      replyType: 'async',
    });
  }
});

test('GRSai gpt-image-2-vip 将新版接口比例转换为 1K、2K、4K 像素值', () => {
  assert.deepEqual(
    buildGrsaiImageRequest({ model: 'gpt-image-2-vip', prompt: '风景', ratio: '16:9', quality: '标准' }),
    {
      model: 'gpt-image-2-vip',
      prompt: '风景',
      images: [],
      aspectRatio: '1280x720',
      quality: 'low',
      replyType: 'async',
    },
  );
  assert.equal(buildGrsaiImageRequest({ model: 'gpt-image-2-vip', prompt: '风景', ratio: '16:9', quality: '高清' }).aspectRatio, '2048x1152');
  const high = buildGrsaiImageRequest({ model: 'gpt-image-2-vip', prompt: '人物', ratio: '9:16', quality: '超高清' });
  assert.equal(high.aspectRatio, '2160x3840');
  assert.equal(high.quality, 'high');
});

test('GRSai gpt-image-2.5 保留比例并默认使用 auto 质量', () => {
  assert.deepEqual(
    buildGrsaiImageRequest({ model: 'gpt-image-2.5', prompt: '一只猫', ratio: '1:1', quality: '标准' }),
    {
      model: 'gpt-image-2.5',
      prompt: '一只猫',
      images: [],
      aspectRatio: '1:1',
      quality: 'auto',
      replyType: 'async',
    },
  );
});

test('GRSai gpt-image-2.5 flare 与 sunburst 按质量转换为像素值和 quality', () => {
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
        assert.equal(body.replyType, 'async');
        assert.equal('urls' in body, false);
      }
    }
  }
});

test('GRSai 扩展比例和 nano-banana 分辨率仍然生效', () => {
  const sunburst = buildGrsaiImageRequest({
    model: 'gpt-image-2.5-sunburst',
    prompt: '一只猫',
    ratio: '21:9',
    quality: '高清',
  });
  assert.equal(sunburst.aspectRatio, '2912x1248');

  const nano = buildGrsaiImageRequest({
    model: 'nano-banana-2',
    prompt: '一只猫',
    ratio: '8:1',
    quality: '标准',
  });
  assert.equal(nano.aspectRatio, '8:1');
  assert.equal(nano.imageSize, '1K');
  assert.equal(nano.quality, undefined);
  assert.deepEqual(nano.images, []);
  assert.equal(nano.replyType, 'async');
});

test('GRSai 其它模型也使用统一新版请求字段', () => {
  const body = buildGrsaiImageRequest({
    model: '其它模型',
    prompt: '一只猫',
    ratio: '4:3',
    quality: '超高清',
    sourceImage: 'data:image/png;base64,abc',
  });

  assert.deepEqual(body, {
    model: '其它模型',
    prompt: '一只猫',
    images: ['data:image/png;base64,abc'],
    aspectRatio: '4:3',
    replyType: 'async',
  });
});

test('GRSai 所有模型都路由到新版生成与查询接口', () => {
  for (const model of ['nano-banana-2-4k-cl', 'gpt-image-2', 'gpt-image-2.5']) {
    const { generateUrl, resultUrl } = resolveGrsaiEndpoints(
      'https://grsai.dakka.com.cn/v1/api/generate', model,
    );
    assert.equal(generateUrl, 'https://grsai.dakka.com.cn/v1/api/generate');
    assert.equal(resultUrl, 'https://grsai.dakka.com.cn/v1/api/result');
  }
});

test('GRSai 配置旧路径时仍从 origin 迁移到新版接口', () => {
  const { generateUrl, resultUrl } = resolveGrsaiEndpoints(
    'https://grsaiapi.com/v1/draw/nano-banana', 'nano-banana-2',
  );
  assert.equal(generateUrl, 'https://grsaiapi.com/v1/api/generate');
  assert.equal(resultUrl, 'https://grsaiapi.com/v1/api/result');
});

test('GRSai 新端点 {code, data, msg} 包装格式正确解包', () => {
  const payload = parseGrsaiPayload({ code: 0, data: { status: 'running', id: 'abc' }, msg: 'success' });
  assert.deepEqual(payload, { status: 'running', id: 'abc' });
});

test('GRSai 直接返回格式保持兼容', () => {
  const payload = parseGrsaiPayload({ id: 'abc', status: 'succeeded', results: [{ url: 'https://x/y.png' }] });
  assert.equal(payload.status, 'succeeded');
  assert.equal(payload.results[0].url, 'https://x/y.png');
});

test('GRSai 多参考图按原顺序写入 images，并兼容旧 sourceImage 字段', () => {
  const sourceImages = ['data:image/png;base64,one', 'data:image/png;base64,two'];
  const multiple = buildGrsaiImageRequest({
    model: 'gpt-image-2',
    prompt: '融合两张参考图',
    ratio: '1:1',
    quality: '高清',
    sourceImages,
  });
  assert.deepEqual(multiple.images, sourceImages);

  const legacy = buildGrsaiImageRequest({
    model: 'gpt-image-2',
    prompt: '旧调用',
    ratio: '1:1',
    quality: '高清',
    sourceImage: sourceImages[0],
  });
  assert.deepEqual(legacy.images, [sourceImages[0]]);
});
