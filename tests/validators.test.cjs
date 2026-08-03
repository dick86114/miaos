const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateString,
  validateHttpUrl,
  validateRepoSlug,
  validateDataUrl,
  validateSuggestedName,
} = require('../src/main/security/validators');

function createPngBytes(width = 1) {
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(1, 12);
  ihdr[16] = 8;
  ihdr[17] = 2;
  const iend = Buffer.from('0000000049454e4400000000', 'hex');
  return Buffer.concat([signature, ihdr, iend]);
}

function createJpegBytes() {
  return Buffer.from('ffd8ffe00002ffd9', 'hex');
}

function createWebpBytes() {
  const buffer = Buffer.alloc(12);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(4, 4);
  buffer.write('WEBP', 8, 'ascii');
  return buffer;
}

function dataUrl(mime, bytes) {
  return `data:${mime};base64,${bytes.toString('base64')}`;
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

test('图片 data URL 仅允许完整且 MIME 一致的受支持图片，并按解码后体积限制', () => {
  const png = dataUrl('image/png', createPngBytes());
  const jpeg = dataUrl('image/jpeg', createJpegBytes());
  const webp = dataUrl('image/webp', createWebpBytes());
  assert.equal(validateDataUrl(png), png);
  assert.equal(validateDataUrl(jpeg), jpeg);
  assert.equal(validateDataUrl(webp), webp);
  assert.throws(() => validateDataUrl('data:image/png;base64,'), /不能为空|完整/);
  assert.throws(() => validateDataUrl('data:image/png;base64,aGVsbG8='), /完整/);
  assert.throws(() => validateDataUrl(dataUrl('image/jpeg', createPngBytes())), /MIME/);
  assert.throws(() => validateDataUrl(dataUrl('image/png', Buffer.from('89504e470d0a1a0a', 'hex'))), /完整/);
  assert.throws(() => validateDataUrl(dataUrl('image/jpeg', Buffer.from('ffd8ffe00002', 'hex'))), /完整/);
  assert.throws(() => validateDataUrl(dataUrl('image/webp', Buffer.from('52494646040000005745425000', 'hex'))), /完整/);
  assert.throws(() => validateDataUrl('data:image/gif;base64,aGVsbG8='), /图片格式/);
  assert.throws(() => validateDataUrl('data:image/png;base64,%%%'), /base64/);
  const tooLarge = `data:image/png;base64,${Buffer.alloc(50 * 1024 * 1024 + 1).toString('base64')}`;
  assert.throws(() => validateDataUrl(tooLarge), /50 MiB/);
});

test('下载文件名移除路径字符并限制长度', () => {
  assert.equal(validateSuggestedName('../../secret.png'), 'secret.png');
  assert.equal(validateSuggestedName(''), 'miaos-image.png');
  assert.throws(() => validateSuggestedName('a'.repeat(129)), /长度不能超过 128/);
});
