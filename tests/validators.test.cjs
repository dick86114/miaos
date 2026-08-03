const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateString,
  validateHttpUrl,
  validateRepoSlug,
  validateDataUrl,
  validateSuggestedName,
} = require('../src/main/security/validators');
const { createImageDecoder } = require('../src/main/security/image-decoder');

const {
  REAL_IMAGE_BYTES,
  FAKE_IMAGE_BYTES,
  createNativeImageMock,
  dataUrl,
} = require('./image-fixtures.cjs');

const decodeImageBuffer = createImageDecoder({
  nativeImageImpl: createNativeImageMock(),
  platform: 'linux',
});

async function validateImageDataUrl(value) {
  return validateDataUrl(value, { decodeImageBuffer });
}

test('拒绝危险协议和非法仓库名', () => {
  assert.throws(() => validateHttpUrl('file:///etc/passwd'), /仅支持 HTTP/);
  assert.throws(() => validateRepoSlug('../owner/repo'), /仓库格式/);
  assert.equal(validateRepoSlug('dick86114/miaos'), 'dick86114/miaos');
});

test('仅本地地址允许使用 HTTP', () => {
  assert.equal(validateHttpUrl('https://api.example.com/v1'), 'https://api.example.com/v1');
  assert.equal(validateHttpUrl('http://localhost:3000/v1'), 'http://localhost:3000/v1');
  assert.equal(validateHttpUrl('http://127.0.0.1:3000/v1'), 'http://127.0.0.1:3000/v1');
  assert.throws(() => validateHttpUrl('http://api.example.com/v1'), /HTTPS/);
});

test('字符串校验限制长度和枚举值', () => {
  assert.equal(validateString('高清', { field: '质量', maxLength: 200, allowedValues: ['标准', '高清', '超高清'] }), '高清');
  assert.throws(() => validateString('', { field: '提示词', minLength: 1, maxLength: 100000 }), /不能为空/);
  assert.throws(() => validateString('x'.repeat(201), { field: '模型', maxLength: 200 }), /长度不能超过 200/);
  assert.throws(() => validateString('4:3', { field: '比例', allowedValues: ['1:1'] }), /不支持/);
});

test('图片 data URL 仅允许完整且 MIME 一致的受支持图片，并按解码后体积限制', async () => {
  const png = dataUrl('image/png', REAL_IMAGE_BYTES.png);
  const jpeg = dataUrl('image/jpeg', REAL_IMAGE_BYTES.jpeg);
  const progressiveJpeg = dataUrl('image/jpeg', REAL_IMAGE_BYTES.progressiveJpeg);
  const adam7Png = dataUrl('image/png', REAL_IMAGE_BYTES.adam7Png);
  const webp = dataUrl('image/webp', REAL_IMAGE_BYTES.webp);
  assert.equal(await validateImageDataUrl(png), png);
  assert.equal(await validateImageDataUrl(jpeg), jpeg);
  assert.equal(await validateImageDataUrl(progressiveJpeg), progressiveJpeg);
  assert.equal(await validateImageDataUrl(adam7Png), adam7Png);
  await assert.rejects(() => validateImageDataUrl(webp), /WebP/);
  await assert.rejects(() => validateImageDataUrl('data:image/png;base64,'), /不能为空|有效/);
  await assert.rejects(() => validateImageDataUrl('data:image/png;base64,aGVsbG8='), /完整|有效/);
  await assert.rejects(() => validateImageDataUrl(dataUrl('image/jpeg', REAL_IMAGE_BYTES.png)), /MIME/);
  await assert.rejects(() => validateImageDataUrl(dataUrl('image/png', FAKE_IMAGE_BYTES.png)), /有效/);
  await assert.rejects(() => validateImageDataUrl(dataUrl('image/jpeg', FAKE_IMAGE_BYTES.jpeg)), /有效/);
  await assert.rejects(() => validateImageDataUrl(dataUrl('image/webp', FAKE_IMAGE_BYTES.webp)), /WebP/);
  await assert.rejects(() => validateImageDataUrl(dataUrl('image/png', FAKE_IMAGE_BYTES.missingPltePng)), /有效/);
  await assert.rejects(() => validateImageDataUrl(dataUrl('image/jpeg', FAKE_IMAGE_BYTES.invalidSofSosJpeg)), /有效/);
  await assert.rejects(() => validateImageDataUrl(dataUrl('image/webp', FAKE_IMAGE_BYTES.zeroVp8Webp)), /WebP/);
  await assert.rejects(() => validateImageDataUrl(dataUrl('image/bmp', REAL_IMAGE_BYTES.bmp)), /图片.*允许/);
  await assert.rejects(() => validateImageDataUrl('data:image/gif;base64,aGVsbG8='), /图片.*允许/);
  await assert.rejects(() => validateImageDataUrl('data:image/png;base64,%%%'), /base64/);
  const tooLarge = `data:image/png;base64,${Buffer.alloc(50 * 1024 * 1024 + 1).toString('base64')}`;
  await assert.rejects(() => validateImageDataUrl(tooLarge), /50 MiB/);
});

test('下载文件名移除路径字符并限制长度', () => {
  assert.equal(validateSuggestedName('../../secret.png'), 'secret.png');
  assert.equal(validateSuggestedName(''), 'miaos-image.png');
  assert.throws(() => validateSuggestedName('a'.repeat(129)), /长度不能超过 128/);
});
