const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function createDecodeError(message) {
  const error = new Error(message);
  error.code = 'IMAGE_DECODE_FAILED';
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

function readBmpSizeWithSips(buffer, {
  fsImpl,
  osImpl,
  pathImpl,
  spawnSyncImpl,
}) {
  let tempDir = null;
  try {
    tempDir = fsImpl.mkdtempSync(pathImpl.join(osImpl.tmpdir(), 'miaos-bmp-decode-'));
    const tempPath = pathImpl.join(tempDir, 'image.bmp');
    const decodedPath = pathImpl.join(tempDir, 'decoded.png');
    fsImpl.writeFileSync(tempPath, buffer, { flag: 'wx', mode: 0o600 });
    const sizeResult = spawnSyncImpl('/usr/bin/sips', [
      '-g', 'pixelWidth',
      '-g', 'pixelHeight',
      tempPath,
    ], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
      shell: false,
      timeout: 5000,
      windowsHide: true,
    });
    if (sizeResult.error || sizeResult.status !== 0) return null;

    const widthMatch = /pixelWidth:\s*(\d+)/.exec(sizeResult.stdout || '');
    const heightMatch = /pixelHeight:\s*(\d+)/.exec(sizeResult.stdout || '');
    const width = widthMatch ? Number(widthMatch[1]) : 0;
    const height = heightMatch ? Number(heightMatch[1]) : 0;
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) return null;

    const decodeResult = spawnSyncImpl('/usr/bin/sips', [
      '-s', 'format', 'png',
      tempPath,
      '--out', decodedPath,
    ], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
      shell: false,
      timeout: 5000,
      windowsHide: true,
    });
    if (decodeResult.error || decodeResult.status !== 0 || !fsImpl.existsSync(decodedPath)) return null;
    const decodedStat = fsImpl.statSync(decodedPath);
    if (!decodedStat.isFile() || decodedStat.size < 1) return null;
    return { width, height, decoder: 'sips' };
  } catch (_) {
    return null;
  } finally {
    if (tempDir) {
      try {
        fsImpl.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

function createImageDecoder({
  nativeImageImpl,
  fsImpl = fs,
  osImpl = os,
  pathImpl = path,
  spawnSyncImpl = spawnSync,
  platform = process.platform,
}) {
  return function decodeImageBuffer(buffer, { mime, allowBmpFileFallback = false } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw createDecodeError('图片内容为空或无法解码');
    }

    const nativeSize = readNativeImageSize(nativeImageImpl, buffer);
    if (nativeSize) return nativeSize;

    if (mime === 'image/bmp' && allowBmpFileFallback && platform === 'darwin') {
      const sipsSize = readBmpSizeWithSips(buffer, {
        fsImpl,
        osImpl,
        pathImpl,
        spawnSyncImpl,
      });
      if (sipsSize) return sipsSize;
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
