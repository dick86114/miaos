const test = require('node:test');
const assert = require('node:assert/strict');
const { getRuntimeSecurityConfig } = require('../src/main/runtime-security');

test('默认启用 sandbox 和硬件加速', () => {
  assert.deepEqual(getRuntimeSecurityConfig({}), {
    legacyMode: false,
    sandbox: true,
    disableHardwareAcceleration: false,
    appendNoSandbox: false,
  });
});

test('只有显式环境变量才进入兼容模式', () => {
  assert.deepEqual(getRuntimeSecurityConfig({ MIAOS_LEGACY_RENDERER: '1' }), {
    legacyMode: true,
    sandbox: false,
    disableHardwareAcceleration: true,
    appendNoSandbox: true,
  });
});

test('非精确兼容值不能降低安全默认值', () => {
  for (const legacyValue of ['', '0', 'true', 'yes', ' 1', '1 ']) {
    assert.deepEqual(getRuntimeSecurityConfig({ MIAOS_LEGACY_RENDERER: legacyValue }), {
      legacyMode: false,
      sandbox: true,
      disableHardwareAcceleration: false,
      appendNoSandbox: false,
    });
  }
});
