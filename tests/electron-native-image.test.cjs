const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const entryPath = path.join(__dirname, 'fixtures', 'electron-native-image-check.cjs');

function assertDecoded(results, name) {
  assert.deepEqual(results[name], { empty: false, width: 1, height: 1 }, name);
}

function assertUnsupportedOrInvalid(results, name) {
  assert.deepEqual(results[name], { empty: true, width: 0, height: 0 }, name);
}

test('Electron 43.2.0 nativeImage 真实解码支持矩阵固定且拒绝语义伪容器', () => {
  const result = spawnSync('pnpm', ['exec', 'electron', entryPath], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    shell: false,
    timeout: 30000,
  });
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const outputLine = result.stdout.trim().split('\n').at(-1);
  const results = JSON.parse(outputLine);

  for (const name of ['png', 'baselineJpeg', 'progressiveJpeg', 'adam7Png']) {
    assertDecoded(results, name);
  }
  for (const name of [
    'webp',
    'normalBmp',
    'topDownBmp',
    'missingPltePng',
    'invalidSofSosJpeg',
    'zeroVp8Webp',
    'invalidBitfieldsBmp',
  ]) {
    assertUnsupportedOrInvalid(results, name);
  }
});
