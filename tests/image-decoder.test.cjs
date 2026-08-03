const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createImageDecoder } = require('../src/main/security/image-decoder');
const {
  REAL_IMAGE_BYTES,
  FAKE_IMAGE_BYTES,
  createNativeImageMock,
} = require('./image-fixtures.cjs');

function createDecodedPngNativeImageMock() {
  return {
    createFromBuffer(buffer) {
      const decodable = buffer.equals(REAL_IMAGE_BYTES.png);
      return {
        isEmpty: () => !decodable,
        getSize: () => decodable ? { width: 1, height: 1 } : { width: 0, height: 0 },
      };
    },
  };
}

function createSipsAdapter({ outputBytes = REAL_IMAGE_BYTES.png, behavior = 'success' } = {}) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter();
    child.kill = () => {
      child.killed = true;
      process.nextTick(() => child.emit('close', null, 'SIGKILL'));
    };
    calls.push({ command, args, options, child });
    process.nextTick(() => {
      if (behavior === 'success') {
        fs.writeFileSync(args.at(-1), outputBytes);
        child.emit('close', 0, null);
      } else if (behavior === 'failure') {
        child.emit('close', 1, null);
      }
    });
    return child;
  };
  return { calls, spawnImpl };
}

test('nativeImage 仅在实际解码得到正尺寸时放行', async () => {
  const decodeImageBuffer = createImageDecoder({
    nativeImageImpl: createNativeImageMock(),
    platform: 'linux',
  });

  assert.deepEqual(
    await decodeImageBuffer(REAL_IMAGE_BYTES.progressiveJpeg, { mime: 'image/jpeg' }),
    { width: 1, height: 1, decoder: 'nativeImage' },
  );
  await assert.rejects(
    () => decodeImageBuffer(FAKE_IMAGE_BYTES.invalidSofSosJpeg, { mime: 'image/jpeg' }),
    /可解码的有效图片/,
  );
});

test('BMP 和 WebP fallback 使用私有临时副本、异步单次 sips 和最终 PNG 解码', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-decoder-test-'));
  const { calls, spawnImpl } = createSipsAdapter();
  try {
    const decodeImageBuffer = createImageDecoder({
      nativeImageImpl: createDecodedPngNativeImageMock(),
      osImpl: { tmpdir: () => tempRoot },
      spawnImpl,
      platform: 'darwin',
    });

    for (const [mime, bytes] of [
      ['image/bmp', REAL_IMAGE_BYTES.topDownBmp],
      ['image/webp', REAL_IMAGE_BYTES.webp],
    ]) {
      const result = await decodeImageBuffer(bytes, { mime, allowBmpFileFallback: true });
      assert.deepEqual(result, {
        width: 1,
        height: 1,
        decoder: 'sips',
        buffer: REAL_IMAGE_BYTES.png,
        mime: 'image/png',
      });
    }

    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.command, '/usr/bin/sips');
      assert.deepEqual(call.args.slice(0, 3), ['-s', 'format', 'png']);
      assert.equal(call.args[3].endsWith('.bmp') || call.args[3].endsWith('.webp'), true);
      assert.equal(call.args[4], '--out');
      assert.equal(call.options.shell, false);
      assert.equal(call.options.windowsHide, true);
      assert.equal(call.options.stdio[0], 'ignore');
      assert.equal(call.options.stdio[1], 'pipe');
      assert.equal(call.options.stdio[2], 'pipe');
    }
    assert.equal(fs.readdirSync(tempRoot).length, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('sips 超时会杀掉子进程并清理私有临时目录', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-decoder-timeout-'));
  let killCount = 0;
  const spawnImpl = (_command, _args, _options) => {
    const child = new EventEmitter();
    child.kill = () => {
      killCount += 1;
      process.nextTick(() => child.emit('close', null, 'SIGKILL'));
    };
    return child;
  };
  try {
    const decodeImageBuffer = createImageDecoder({
      nativeImageImpl: {
        createFromBuffer() {
          return { isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) };
        },
      },
      osImpl: { tmpdir: () => tempRoot },
      spawnImpl,
      sipsTimeoutMs: 20,
      platform: 'darwin',
    });

    await assert.rejects(
      () => decodeImageBuffer(REAL_IMAGE_BYTES.webp, { mime: 'image/webp', allowBmpFileFallback: true }),
      (error) => error.code === 'IMAGE_DECODE_TIMEOUT' && /超时/.test(error.message),
    );
    assert.equal(killCount, 1);
    assert.equal(fs.readdirSync(tempRoot).length, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('生产 decoder 不再引用 spawnSync', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/main/security/image-decoder.js'), 'utf8');
  assert.equal(source.includes('spawnSync'), false);
});
