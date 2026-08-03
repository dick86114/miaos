const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateString,
  validateHttpUrl,
  validateRepoSlug,
  validateDataUrl,
  validateSuggestedName,
} = require('../src/main/security/validators');

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

test('图片 data URL 仅允许受支持格式且按解码后体积限制', () => {
  assert.equal(
    validateDataUrl('data:image/png;base64,aGVsbG8='),
    'data:image/png;base64,aGVsbG8=',
  );
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
