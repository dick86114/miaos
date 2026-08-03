const test = require('node:test');
const assert = require('node:assert/strict');
const { getRuntimeSecurityConfig } = require('../src/main/runtime-security');

const SECURE_DEFAULT = {
  legacyMode: false,
  sandbox: true,
  disableHardwareAcceleration: false,
  appendNoSandbox: false,
};

const LEGACY_MODE = {
  legacyMode: true,
  sandbox: false,
  disableHardwareAcceleration: true,
  appendNoSandbox: true,
};

test('默认启用 sandbox 和硬件加速', () => {
  assert.deepEqual(getRuntimeSecurityConfig({}), SECURE_DEFAULT);
});

test('只有自有环境变量且值精确为字符串 1 时进入兼容模式', () => {
  assert.deepEqual(getRuntimeSecurityConfig({ MIAOS_LEGACY_RENDERER: '1' }), LEGACY_MODE);

  const inheritedLegacy = Object.create({ MIAOS_LEGACY_RENDERER: '1' });
  assert.deepEqual(getRuntimeSecurityConfig(inheritedLegacy), SECURE_DEFAULT);
});

test('Object.prototype 污染不能开启兼容模式', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'MIAOS_LEGACY_RENDERER');
  try {
    Object.defineProperty(Object.prototype, 'MIAOS_LEGACY_RENDERER', {
      configurable: true,
      enumerable: true,
      value: '1',
      writable: true,
    });
    assert.deepEqual(getRuntimeSecurityConfig({}), SECURE_DEFAULT);
    assert.deepEqual(getRuntimeSecurityConfig(Object.create(null)), SECURE_DEFAULT);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(Object.prototype, 'MIAOS_LEGACY_RENDERER', originalDescriptor);
    } else {
      delete Object.prototype.MIAOS_LEGACY_RENDERER;
    }
  }
});

test('非对象和其他 truthy 值不能降低安全默认值', () => {
  for (const env of [null, undefined, true, 1, 'env', [], () => {}]) {
    assert.deepEqual(getRuntimeSecurityConfig(env), SECURE_DEFAULT);
  }

  for (const legacyValue of ['', '0', 'true', 'yes', ' 1', '1 ', true, 1]) {
    assert.deepEqual(getRuntimeSecurityConfig({ MIAOS_LEGACY_RENDERER: legacyValue }), SECURE_DEFAULT);
  }
});
