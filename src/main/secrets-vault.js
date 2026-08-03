const crypto = require('crypto');
const path = require('path');
const { assertProviderId } = require('./provider-id');

const LOCK_RETRY_COUNT = 5;
const LOCK_RETRY_MS = 10;

function createVaultError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createDictionary() {
  return Object.create(null);
}

function cloneDictionary(source) {
  const target = createDictionary();
  for (const [key, value] of Object.entries(source || {})) target[key] = value;
  return target;
}

function cloneMetadata(metadata) {
  return metadata === null ? null : JSON.parse(JSON.stringify(metadata));
}

function waitForLockRetry() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
}

function createSecretsVault({ filePath, safeStorage, fsImpl }) {
  if (typeof filePath !== 'string' || !filePath) throw new TypeError('密钥文件路径不能为空');
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function'
    || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function') {
    throw new TypeError('系统加密服务不可用');
  }
  if (!fsImpl || typeof fsImpl.existsSync !== 'function' || typeof fsImpl.readFileSync !== 'function'
    || typeof fsImpl.writeFileSync !== 'function' || typeof fsImpl.openSync !== 'function'
    || typeof fsImpl.fsyncSync !== 'function' || typeof fsImpl.closeSync !== 'function'
    || typeof fsImpl.renameSync !== 'function' || typeof fsImpl.unlinkSync !== 'function'
    || typeof fsImpl.mkdirSync !== 'function') {
    throw new TypeError('文件系统服务不可用');
  }

  function assertEncryptionAvailable() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw createVaultError('SECRET_ENCRYPTION_UNAVAILABLE', '系统密钥加密不可用，请检查系统钥匙串');
    }
  }

  function createEmptyDocument() {
    return { version: 1, secrets: createDictionary(), providers: createDictionary() };
  }

  function readDocument() {
    if (!fsImpl.existsSync(filePath)) return createEmptyDocument();
    let parsed;
    try {
      parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
    } catch (_) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库已损坏，请重新保存密钥');
    }

    if (parsed && parsed.version === 1 && parsed.secrets && parsed.providers
      && typeof parsed.secrets === 'object' && typeof parsed.providers === 'object'
      && !Array.isArray(parsed.secrets) && !Array.isArray(parsed.providers)
      && Object.values(parsed.secrets).every((value) => typeof value === 'string')) {
      return {
        version: 1,
        secrets: cloneDictionary(parsed.secrets),
        providers: cloneDictionary(parsed.providers),
      };
    }

    // 兼容本任务前一轮已经落盘的纯密文映射，读取后在下一次写入转换为 v1 文档。
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && Object.values(parsed).every((value) => typeof value === 'string')) {
      return { version: 1, secrets: cloneDictionary(parsed), providers: createDictionary() };
    }

    throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库已损坏，请重新保存密钥');
  }

  function acquireLock() {
    const lockPath = `${filePath}.lock`;
    for (let attempt = 0; attempt <= LOCK_RETRY_COUNT; attempt += 1) {
      try {
        return { lockPath, fd: fsImpl.openSync(lockPath, 'wx', 0o600) };
      } catch (error) {
        if (!error || error.code !== 'EEXIST') {
          throw createVaultError('SECRET_VAULT_WRITE_FAILED', '密钥仓库写入失败');
        }
        if (attempt === LOCK_RETRY_COUNT) {
          throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库正被其他进程使用，请稍后重试');
        }
        waitForLockRetry();
      }
    }
    throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库正被其他进程使用，请稍后重试');
  }

  function releaseLock(lock) {
    try { fsImpl.closeSync(lock.fd); } catch (_) {}
    try { fsImpl.unlinkSync(lock.lockPath); } catch (_) {}
  }

  function writeDocument(document) {
    const directory = path.dirname(filePath);
    const tempPath = `${filePath}.tmp-${crypto.randomBytes(12).toString('hex')}`;
    let tempFd = null;
    let directoryFd = null;
    try {
      fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
      tempFd = fsImpl.openSync(tempPath, 'wx', 0o600);
      fsImpl.writeFileSync(tempPath, JSON.stringify(document), { encoding: 'utf8', mode: 0o600 });
      fsImpl.fsyncSync(tempFd);
      fsImpl.closeSync(tempFd);
      tempFd = null;
      fsImpl.renameSync(tempPath, filePath);
      directoryFd = fsImpl.openSync(directory, 'r');
      fsImpl.fsyncSync(directoryFd);
      fsImpl.closeSync(directoryFd);
      directoryFd = null;
    } catch (error) {
      if (tempFd !== null) {
        try { fsImpl.closeSync(tempFd); } catch (_) {}
      }
      if (directoryFd !== null) {
        try { fsImpl.closeSync(directoryFd); } catch (_) {}
      }
      try { fsImpl.unlinkSync(tempPath); } catch (_) {}
      throw createVaultError('SECRET_VAULT_WRITE_FAILED', '密钥仓库写入失败');
    }
  }

  function validateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
      || Object.prototype.hasOwnProperty.call(metadata, 'apiKey')) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '供应商元数据格式不正确');
    }
    return cloneMetadata(metadata);
  }

  function applyEntries(entries) {
    assertEncryptionAvailable();
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥更新数据格式不正确');
    }
    const ids = new Set();
    const prepared = [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥更新数据格式不正确');
      }
      const providerId = assertProviderId(entry.providerId);
      if (ids.has(providerId)) throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥更新包含重复供应商');
      ids.add(providerId);
      const next = { providerId };
      if (Object.prototype.hasOwnProperty.call(entry, 'value')) {
        if (typeof entry.value !== 'string' || entry.value.length === 0) {
          throw createVaultError('SECRET_VAULT_CORRUPTED', 'API Key 格式不正确');
        }
        try {
          next.encryptedValue = safeStorage.encryptString(entry.value).toString('base64');
        } catch (_) {
          throw createVaultError('SECRET_ENCRYPTION_UNAVAILABLE', '系统密钥加密不可用，请检查系统钥匙串');
        }
      }
      if (entry.deleteSecret === true) next.deleteSecret = true;
      if (Object.prototype.hasOwnProperty.call(entry, 'metadata')) {
        next.metadata = entry.metadata === null ? null : validateMetadata(entry.metadata);
      }
      if (!next.encryptedValue && !next.deleteSecret && !Object.prototype.hasOwnProperty.call(next, 'metadata')) {
        throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥更新数据格式不正确');
      }
      prepared.push(next);
    }

    const lock = acquireLock();
    try {
      const document = readDocument();
      const draft = {
        version: 1,
        secrets: cloneDictionary(document.secrets),
        providers: cloneDictionary(document.providers),
      };
      for (const entry of prepared) {
        if (entry.encryptedValue) draft.secrets[entry.providerId] = entry.encryptedValue;
        if (entry.deleteSecret) delete draft.secrets[entry.providerId];
        if (Object.prototype.hasOwnProperty.call(entry, 'metadata')) {
          if (entry.metadata === null) delete draft.providers[entry.providerId];
          else draft.providers[entry.providerId] = entry.metadata;
        }
      }
      writeDocument(draft);
    } finally {
      releaseLock(lock);
    }
  }

  function set(providerId, value) {
    applyEntries([{ providerId, value }]);
  }

  function setMany(entries) {
    applyEntries(entries);
  }

  function get(providerId) {
    assertEncryptionAvailable();
    assertProviderId(providerId);
    const encrypted = readDocument().secrets[providerId];
    if (!encrypted) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (_) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库已损坏，请重新保存密钥');
    }
  }

  function has(providerId) {
    assertEncryptionAvailable();
    assertProviderId(providerId);
    return Object.prototype.hasOwnProperty.call(readDocument().secrets, providerId);
  }

  function remove(providerId) {
    assertProviderId(providerId);
    if (!has(providerId)) return false;
    applyEntries([{ providerId, deleteSecret: true }]);
    return true;
  }

  function getProviderMetadata(providerId) {
    assertProviderId(providerId);
    const metadata = readDocument().providers[providerId];
    return metadata ? cloneMetadata(metadata) : null;
  }

  return {
    set,
    setMany,
    get,
    has,
    delete: remove,
    getProviderMetadata,
  };
}

module.exports = { createSecretsVault };
