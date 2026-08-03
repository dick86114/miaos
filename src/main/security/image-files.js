const crypto = require('crypto');
const { fileURLToPath } = require('url');
const { MAX_DATA_URL_BYTES, validateDataUrl } = require('./validators');
const { detectImageMime } = require('./image-binary');

function createFileError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createImageFileAccess({ fsImpl, pathImpl, getUserDataPath, decodeImageBuffer }) {
  const authorizedPaths = new Map();

  function isWithinPath(candidatePath, parentPath, allowParent = false) {
    return (allowParent && candidatePath === parentPath)
      || candidatePath.startsWith(`${parentPath}${pathImpl.sep}`);
  }

  function normalizePathReference(value) {
    if (typeof value !== 'string' || !value) {
      throw createFileError('参考图路径未获主进程授权', 'IPC_SOURCE_IMAGE_UNAUTHORIZED');
    }
    if (value.startsWith('file://')) {
      try {
        return fileURLToPath(value);
      } catch (_) {
        throw createFileError('参考图路径格式不正确', 'IPC_SOURCE_IMAGE_UNAUTHORIZED');
      }
    }
    return value;
  }

  function lstatRegularFile(filePath, { sourceImage = false } = {}) {
    let stat;
    try {
      stat = fsImpl.lstatSync(filePath);
    } catch (_) {
      throw createFileError(
        sourceImage ? '参考图路径未获主进程授权' : '文件路径不在应用生成目录内',
        sourceImage ? 'IPC_SOURCE_IMAGE_UNAUTHORIZED' : 'IPC_FILE_PATH_NOT_ALLOWED',
      );
    }
    if (stat.isSymbolicLink()) {
      throw createFileError(
        sourceImage ? '参考图不允许使用符号链接' : '不允许使用符号链接文件',
        sourceImage ? 'IPC_SOURCE_IMAGE_SYMLINK' : 'IPC_FILE_SYMLINK_NOT_ALLOWED',
      );
    }
    if (!stat.isFile()) {
      throw createFileError(
        sourceImage ? '参考图必须是普通文件' : '只能打开普通文件',
        sourceImage ? 'IPC_SOURCE_IMAGE_NOT_REGULAR' : 'IPC_FILE_NOT_REGULAR',
      );
    }
    return stat;
  }

  function getGeneratedRoot() {
    const lexicalRoot = pathImpl.resolve(getUserDataPath(), 'generated');
    let rootStat;
    try {
      rootStat = fsImpl.lstatSync(lexicalRoot);
    } catch (_) {
      throw createFileError('应用生成目录不存在', 'IPC_FILE_PATH_NOT_ALLOWED');
    }
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw createFileError('应用生成目录不是可信目录', 'IPC_FILE_ROOT_NOT_ALLOWED');
    }
    return {
      lexicalRoot,
      canonicalRoot: fsImpl.realpathSync(lexicalRoot),
    };
  }

  function resolveGeneratedFile(value, { sourceImage = false } = {}) {
    const candidatePath = pathImpl.resolve(normalizePathReference(value));
    const root = getGeneratedRoot();
    if (!isWithinPath(candidatePath, root.lexicalRoot, true)) {
      throw createFileError(
        sourceImage ? '参考图路径未获主进程授权' : '文件路径不在应用生成目录内',
        sourceImage ? 'IPC_SOURCE_IMAGE_UNAUTHORIZED' : 'IPC_FILE_PATH_NOT_ALLOWED',
      );
    }

    lstatRegularFile(candidatePath, { sourceImage });
    const canonicalPath = fsImpl.realpathSync(candidatePath);
    if (!isWithinPath(canonicalPath, root.canonicalRoot)) {
      throw createFileError(
        sourceImage ? '参考图路径未获主进程授权' : '文件路径不在应用生成目录内',
        sourceImage ? 'IPC_SOURCE_IMAGE_UNAUTHORIZED' : 'IPC_FILE_PATH_NOT_ALLOWED',
      );
    }
    return canonicalPath;
  }

  function createIdentity(stat, buffer) {
    return {
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
  }

  function sameMetadata(left, right) {
    return left.dev === right.dev
      && left.ino === right.ino
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs;
  }

  async function readRegularFileSafely(filePath, { expectedIdentity } = {}) {
    const beforeOpenStat = lstatRegularFile(filePath, { sourceImage: true });
    const constants = fsImpl.constants || {};
    const flags = (constants.O_RDONLY || 0) | (constants.O_NOFOLLOW || 0);
    let fd;
    try {
      fd = fsImpl.openSync(filePath, flags);
    } catch (error) {
      if (error && error.code === 'ELOOP') {
        throw createFileError('参考图不允许使用符号链接', 'IPC_SOURCE_IMAGE_SYMLINK');
      }
      throw createFileError('参考图无法安全打开', 'IPC_SOURCE_IMAGE_UNAUTHORIZED');
    }

    try {
      const openedStat = fsImpl.fstatSync(fd);
      if (!openedStat.isFile()) {
        throw createFileError('参考图必须是普通文件', 'IPC_SOURCE_IMAGE_NOT_REGULAR');
      }
      if (!sameMetadata(beforeOpenStat, openedStat)) {
        throw createFileError('参考图在安全打开前已被替换', 'IPC_SOURCE_IMAGE_REPLACED');
      }
      if (expectedIdentity && !sameMetadata(expectedIdentity, openedStat)) {
        throw createFileError('参考图已被替换，请重新选择', 'IPC_SOURCE_IMAGE_REPLACED');
      }
      if (openedStat.size > MAX_DATA_URL_BYTES) {
        throw createFileError('参考图不能超过 50 MiB', 'IPC_SOURCE_IMAGE_TOO_LARGE');
      }

      const buffer = fsImpl.readFileSync(fd);
      const afterReadStat = fsImpl.fstatSync(fd);
      if (!sameMetadata(openedStat, afterReadStat) || buffer.length !== afterReadStat.size) {
        throw createFileError('参考图在读取过程中发生变化', 'IPC_SOURCE_IMAGE_REPLACED');
      }

      const identity = createIdentity(afterReadStat, buffer);
      if (expectedIdentity && identity.sha256 !== expectedIdentity.sha256) {
        throw createFileError('参考图内容已被替换，请重新选择', 'IPC_SOURCE_IMAGE_REPLACED');
      }
      const mime = detectImageMime(buffer, { allowBmp: true });
      if (!mime) {
        throw createFileError('参考图不是受支持的 PNG、JPEG、WebP 或 BMP 图片', 'IPC_SOURCE_IMAGE_INVALID_IMAGE');
      }
      try {
        const decoded = await decodeImageBuffer(buffer, { mime, allowBmpFileFallback: true });
        if (decoded && decoded.decoder === 'sips' && Buffer.isBuffer(decoded.buffer)) {
          return { buffer: decoded.buffer, identity, mime: decoded.mime || 'image/png' };
        }
      } catch (error) {
        throw createFileError(
          error && error.message ? error.message : '参考图内容不是可解码的有效图片',
          'IPC_SOURCE_IMAGE_INVALID_IMAGE',
        );
      }
      return { buffer, identity, mime };
    } finally {
      fsImpl.closeSync(fd);
    }
  }

  async function authorizeFile(value) {
    const candidatePath = pathImpl.resolve(normalizePathReference(value));
    lstatRegularFile(candidatePath, { sourceImage: true });
    const canonicalPath = fsImpl.realpathSync(candidatePath);
    const { identity } = await readRegularFileSafely(canonicalPath);
    authorizedPaths.set(canonicalPath, identity);
    return canonicalPath;
  }

  function resolveAuthorizedSourceFile(value) {
    const candidatePath = pathImpl.resolve(normalizePathReference(value));
    const generatedDir = pathImpl.resolve(getUserDataPath(), 'generated');
    if (isWithinPath(candidatePath, generatedDir, true)) {
      return { canonicalPath: resolveGeneratedFile(candidatePath, { sourceImage: true }) };
    }

    lstatRegularFile(candidatePath, { sourceImage: true });
    const canonicalPath = fsImpl.realpathSync(candidatePath);
    const identity = authorizedPaths.get(canonicalPath);
    if (!identity) {
      throw createFileError('参考图路径未获主进程授权', 'IPC_SOURCE_IMAGE_UNAUTHORIZED');
    }
    return { canonicalPath, identity };
  }

  async function readSourceImageAsDataUrl(value) {
    if (typeof value === 'string' && value.startsWith('data:')) {
      await validateDataUrl(value, { decodeImageBuffer });
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
      const mime = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const decoded = await decodeImageBuffer(buffer, { mime, allowSipsFallback: true });
      if (decoded && decoded.decoder === 'sips' && Buffer.isBuffer(decoded.buffer)) {
        return `data:${decoded.mime || 'image/png'};base64,${decoded.buffer.toString('base64')}`;
      }
      return value;
    }

    const { canonicalPath, identity } = resolveAuthorizedSourceFile(value);
    const { buffer, mime } = await readRegularFileSafely(canonicalPath, { expectedIdentity: identity });
    return `data:${mime};base64,${buffer.toString('base64')}`;
  }

  return {
    authorizePickedImage: authorizeFile,
    authorizePastedImage: authorizeFile,
    readSourceImageAsDataUrl,
    resolveGeneratedFile,
  };
}

module.exports = {
  createImageFileAccess,
};
