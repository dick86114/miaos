const path = require('path');

function createVaultError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createSecretsVault({ filePath, safeStorage, fsImpl }) {
  if (typeof filePath !== 'string' || !filePath) throw new TypeError('密钥文件路径不能为空');
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function'
    || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw new TypeError('系统加密服务不可用');
  }
  if (!fsImpl || typeof fsImpl.readFileSync !== 'function' || typeof fsImpl.writeFileSync !== 'function'
    || typeof fsImpl.openSync !== 'function' || typeof fsImpl.fsyncSync !== 'function'
    || typeof fsImpl.closeSync !== 'function' || typeof fsImpl.renameSync !== 'function') {
    throw new TypeError('文件系统服务不可用');
  }

  function assertEncryptionAvailable() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw createVaultError('SECRET_ENCRYPTION_UNAVAILABLE', '系统密钥加密不可用，请检查系统钥匙串');
    }
  }

  function readRecords() {
    if (!fsImpl.existsSync(filePath)) return {};
    let parsed;
    try {
      parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
    } catch (_) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库已损坏，请重新保存密钥');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || Object.values(parsed).some((value) => typeof value !== 'string')) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库已损坏，请重新保存密钥');
    }
    return parsed;
  }

  function writeRecords(records) {
    const tempPath = `${filePath}.tmp`;
    let fd = null;
    try {
      fsImpl.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
      fsImpl.writeFileSync(tempPath, JSON.stringify(records), { encoding: 'utf8', mode: 0o600 });
      fd = fsImpl.openSync(tempPath, 'r');
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd);
      fd = null;
      fsImpl.renameSync(tempPath, filePath);
    } catch (error) {
      if (fd !== null) {
        try { fsImpl.closeSync(fd); } catch (_) {}
      }
      try { fsImpl.unlinkSync(tempPath); } catch (_) {}
      throw error;
    }
  }

  function set(providerId, value) {
    assertEncryptionAvailable();
    const records = readRecords();
    try {
      records[providerId] = safeStorage.encryptString(value).toString('base64');
    } catch (_) {
      throw createVaultError('SECRET_ENCRYPTION_UNAVAILABLE', '系统密钥加密不可用，请检查系统钥匙串');
    }
    writeRecords(records);
  }

  function get(providerId) {
    assertEncryptionAvailable();
    const records = readRecords();
    const encrypted = records[providerId];
    if (!encrypted) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (_) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库已损坏，请重新保存密钥');
    }
  }

  function has(providerId) {
    assertEncryptionAvailable();
    return Object.prototype.hasOwnProperty.call(readRecords(), providerId);
  }

  function remove(providerId) {
    assertEncryptionAvailable();
    const records = readRecords();
    if (!Object.prototype.hasOwnProperty.call(records, providerId)) return false;
    delete records[providerId];
    writeRecords(records);
    return true;
  }

  return { set, get, has, delete: remove };
}

module.exports = { createSecretsVault };
