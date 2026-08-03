const { fileURLToPath } = require('url');
const { MAX_DATA_URL_BYTES, validateDataUrl } = require('./validators');

function createFileError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isWithinPath(candidatePath, parentPath, allowParent = false) {
  return (allowParent && candidatePath === parentPath)
    || candidatePath.startsWith(`${parentPath}${pathSeparator(parentPath)}`);
}

function pathSeparator(filePath) {
  return filePath.includes('\\') ? '\\' : '/';
}

function createImageFileAccess({ fsImpl, pathImpl, getUserDataPath }) {
  const authorizedPaths = new Set();

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

  function authorizeFile(value) {
    const candidatePath = pathImpl.resolve(normalizePathReference(value));
    lstatRegularFile(candidatePath, { sourceImage: true });
    const canonicalPath = fsImpl.realpathSync(candidatePath);
    authorizedPaths.add(canonicalPath);
    return canonicalPath;
  }

  function resolveAuthorizedSourceFile(value) {
    const candidatePath = pathImpl.resolve(normalizePathReference(value));
    const generatedDir = pathImpl.resolve(getUserDataPath(), 'generated');
    if (isWithinPath(candidatePath, generatedDir, true)) {
      return resolveGeneratedFile(candidatePath, { sourceImage: true });
    }

    lstatRegularFile(candidatePath, { sourceImage: true });
    const canonicalPath = fsImpl.realpathSync(candidatePath);
    if (!authorizedPaths.has(canonicalPath)) {
      throw createFileError('参考图路径未获主进程授权', 'IPC_SOURCE_IMAGE_UNAUTHORIZED');
    }
    return canonicalPath;
  }

  function detectImageMime(buffer) {
    if (buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'image/png';
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    // 选择器现有过滤器明确包含 bmp，保留该本地文件兼容能力并校验文件头。
    if (buffer.length >= 2 && buffer.subarray(0, 2).toString('ascii') === 'BM') {
      return 'image/bmp';
    }
    throw createFileError('参考图不是受支持的 PNG、JPEG、WebP 或 BMP 文件', 'IPC_SOURCE_IMAGE_INVALID_IMAGE');
  }

  function readSourceImageAsDataUrl(value) {
    if (typeof value === 'string' && value.startsWith('data:')) {
      return validateDataUrl(value);
    }

    const canonicalPath = resolveAuthorizedSourceFile(value);
    const stat = lstatRegularFile(canonicalPath, { sourceImage: true });
    if (stat.size > MAX_DATA_URL_BYTES) {
      throw createFileError('参考图不能超过 50 MiB', 'IPC_SOURCE_IMAGE_TOO_LARGE');
    }
    const buffer = fsImpl.readFileSync(canonicalPath);
    const mime = detectImageMime(buffer);
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
