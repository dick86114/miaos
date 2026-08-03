const path = require('node:path');

class AppDataError extends Error {
  constructor(targetPath, cause) {
    super(`应用数据目录不可写：${targetPath}`);
    this.name = 'AppDataError';
    this.code = 'APP_DATA_UNWRITABLE';
    this.path = targetPath;
    this.cause = cause;
  }
}

function resolveAppDataPath({ homePath, fsImpl }) {
  const targetPath = path.join(homePath, '.miaos');
  try {
    fsImpl.mkdirSync(targetPath, { recursive: true });
    fsImpl.accessSync(targetPath, fsImpl.constants.W_OK);
    return targetPath;
  } catch (error) {
    throw new AppDataError(targetPath, error);
  }
}

module.exports = { AppDataError, resolveAppDataPath };
