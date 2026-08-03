const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createImageDecoder } = require('../src/main/security/image-decoder');
const {
  REAL_IMAGE_BYTES,
  FAKE_IMAGE_BYTES,
  createNativeImageMock,
} = require('./image-fixtures.cjs');

test('nativeImage 仅在实际解码得到正尺寸时放行', () => {
  const decodeImageBuffer = createImageDecoder({
    nativeImageImpl: createNativeImageMock(),
    platform: 'linux',
  });

  assert.deepEqual(
    decodeImageBuffer(REAL_IMAGE_BYTES.progressiveJpeg, { mime: 'image/jpeg' }),
    { width: 1, height: 1, decoder: 'nativeImage' },
  );
  assert.throws(
    () => decodeImageBuffer(FAKE_IMAGE_BYTES.invalidSofSosJpeg, { mime: 'image/jpeg' }),
    /可解码的有效图片/,
  );
});

test('BMP 文件 fallback 使用私有临时副本、参数数组和正尺寸结果', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-decoder-test-'));
  const spawnCalls = [];
  try {
    const decodeImageBuffer = createImageDecoder({
      nativeImageImpl: {
        createFromBuffer() {
          return { isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) };
        },
      },
      osImpl: { tmpdir: () => tempRoot },
      spawnSyncImpl(command, args, options) {
        if (args.includes('--out')) {
          fs.writeFileSync(args.at(-1), 'decoded-png');
          spawnCalls.push({ command, args, options, bytes: fs.readFileSync(args[3]) });
          return { status: 0, stdout: '', stderr: '' };
        }
        spawnCalls.push({ command, args, options, bytes: fs.readFileSync(args.at(-1)) });
        return { status: 0, stdout: 'pixelWidth: 1\npixelHeight: 1\n', stderr: '' };
      },
      platform: 'darwin',
    });

    assert.deepEqual(
      decodeImageBuffer(REAL_IMAGE_BYTES.topDownBmp, { mime: 'image/bmp', allowBmpFileFallback: true }),
      { width: 1, height: 1, decoder: 'sips' },
    );
    assert.equal(spawnCalls.length, 2);
    assert.equal(spawnCalls[0].command, '/usr/bin/sips');
    assert.deepEqual(spawnCalls[0].args.slice(0, 4), ['-g', 'pixelWidth', '-g', 'pixelHeight']);
    assert.equal(spawnCalls[0].options.shell, false);
    assert.equal(spawnCalls[0].options.timeout, 5000);
    assert.equal(spawnCalls[0].bytes.equals(REAL_IMAGE_BYTES.topDownBmp), true);
    assert.deepEqual(spawnCalls[1].args.slice(0, 3), ['-s', 'format', 'png']);
    assert.equal(spawnCalls[1].bytes.equals(REAL_IMAGE_BYTES.topDownBmp), true);
    assert.equal(fs.readdirSync(tempRoot).length, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
