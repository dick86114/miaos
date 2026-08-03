const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const MAX_SIPS_OUTPUT_BYTES = 64 * 1024;

function createDecodeError(message, code = 'IMAGE_DECODE_FAILED') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function readNativeImageSize(nativeImageImpl, buffer) {
  if (!nativeImageImpl || typeof nativeImageImpl.createFromBuffer !== 'function') {
    throw createDecodeError('图片解码器不可用');
  }

  try {
    const image = nativeImageImpl.createFromBuffer(buffer);
    if (!image || typeof image.isEmpty !== 'function' || image.isEmpty() || typeof image.getSize !== 'function') {
      return null;
    }

    const size = image.getSize();
    if (!size
      || !Number.isInteger(size.width)
      || size.width < 1
      || !Number.isInteger(size.height)
      || size.height < 1) {
      return null;
    }
    return { width: size.width, height: size.height, decoder: 'nativeImage' };
  } catch (_) {
    return null;
  }
}

function appendLimitedOutput(chunks, state, chunk, child) {
  const buffer = Buffer.from(chunk);
  state.length += buffer.length;
  if (state.length > MAX_SIPS_OUTPUT_BYTES) {
    if (child && typeof child.kill === 'function') child.kill('SIGKILL');
    state.overflow = true;
    return;
  }
  chunks.push(buffer);
}

function runSipsConversion(inputBuffer, mime, {
  fsImpl,
  osImpl,
  pathImpl,
  spawnImpl,
  timeoutMs,
}) {
  let tempDir = null;
  try {
    tempDir = fsImpl.mkdtempSync(pathImpl.join(osImpl.tmpdir(), 'miaos-image-decode-'));
    const extension = mime === 'image/webp' ? 'webp' : 'bmp';
    const inputPath = pathImpl.join(tempDir, `image.${extension}`);
    const outputPath = pathImpl.join(tempDir, 'decoded.png');
    fsImpl.writeFileSync(inputPath, inputBuffer, { flag: 'wx', mode: 0o600 });

    return new Promise((resolve, reject) => {
      let child;
      let settled = false;
      let timer = null;
      const stdout = [];
      const stderr = [];
      const outputState = { length: 0, overflow: false };

      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (error) reject(error);
        else resolve({ ...result, outputPath });
      };

      try {
        child = spawnImpl('/usr/bin/sips', [
          '-s', 'format', 'png',
          inputPath,
          '--out', outputPath,
        ], {
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (_) {
        finish(createDecodeError('图片转换进程无法启动'));
        return;
      }

      if (child.stdout && typeof child.stdout.on === 'function') {
        child.stdout.on('data', (chunk) => appendLimitedOutput(stdout, outputState, chunk, child));
      }
      if (child.stderr && typeof child.stderr.on === 'function') {
        child.stderr.on('data', (chunk) => appendLimitedOutput(stderr, outputState, chunk, child));
      }
      if (typeof child.once === 'function') {
        child.once('error', () => finish(createDecodeError('图片转换进程执行失败')));
        child.once('close', (code) => {
          if (outputState.overflow) {
            finish(createDecodeError('图片转换进程输出过大'));
          } else if (code !== 0) {
            finish(createDecodeError('图片转换失败'));
          } else {
            try {
              const decodedBuffer = fsImpl.readFileSync(outputPath);
              if (!decodedBuffer.length) {
                finish(createDecodeError('图片转换结果为空'));
              } else {
                finish(null, {
                  stdout: Buffer.concat(stdout),
                  stderr: Buffer.concat(stderr),
                  buffer: decodedBuffer,
                });
              }
            } catch (_) {
              finish(createDecodeError('图片转换结果不可用'));
            }
          }
        });
      } else {
        finish(createDecodeError('图片转换进程执行失败'));
      }

      timer = setTimeout(() => {
        if (settled) return;
        if (child && typeof child.kill === 'function') child.kill('SIGKILL');
        finish(createDecodeError('图片转换超时', 'IMAGE_DECODE_TIMEOUT'));
      }, timeoutMs);
    }).finally(() => {
      if (tempDir) {
        try {
          fsImpl.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
      }
    });
  } catch (_) {
    if (tempDir) {
      try {
        fsImpl.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
    return Promise.reject(createDecodeError('图片转换失败'));
  }
}

function createImageDecoder({
  nativeImageImpl,
  fsImpl = fs,
  osImpl = os,
  pathImpl = path,
  spawnImpl = spawn,
  platform = process.platform,
  sipsTimeoutMs = 5000,
}) {
  return async function decodeImageBuffer(buffer, { mime, allowBmpFileFallback = false, allowSipsFallback = false } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw createDecodeError('图片内容为空或无法解码');
    }

    const nativeSize = readNativeImageSize(nativeImageImpl, buffer);
    if (nativeSize) return nativeSize;

    const allowFallback = allowBmpFileFallback || allowSipsFallback;
    if (allowFallback && platform === 'darwin' && (mime === 'image/bmp' || mime === 'image/webp')) {
      try {
        const conversion = await runSipsConversion(buffer, mime, {
          fsImpl,
          osImpl,
          pathImpl,
          spawnImpl,
          timeoutMs: Math.min(5000, Math.max(1, sipsTimeoutMs)),
        });
        const decodedBuffer = conversion.buffer;
        const decodedSize = readNativeImageSize(nativeImageImpl, decodedBuffer);
        if (decodedSize) {
          return {
            ...decodedSize,
            decoder: 'sips',
            buffer: decodedBuffer,
            mime: 'image/png',
          };
        }
      } catch (error) {
        if (error && error.code === 'IMAGE_DECODE_TIMEOUT') throw error;
      }
    }

    if (mime === 'image/webp') {
      throw createDecodeError('当前平台无法解码 WebP 图片或图片内容无效');
    }
    if (mime === 'image/bmp') {
      throw createDecodeError('当前平台无法解码 BMP 图片或图片内容无效');
    }
    throw createDecodeError('图片内容不是可解码的有效图片');
  };
}

module.exports = {
  createImageDecoder,
};
