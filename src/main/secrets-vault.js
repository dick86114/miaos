const crypto = require('crypto');
const path = require('path');
const { assertProviderId } = require('./provider-id');

const LOCK_RETRY_COUNT = 5;
const LOCK_RETRY_MS = 10;
const LOCK_STALE_TTL_MS = 5 * 60 * 1000;

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

  function readLockInfo(lockPath) {
    try {
      const parsed = JSON.parse(fsImpl.readFileSync(lockPath, 'utf8'));
      if (!parsed || typeof parsed.pid !== 'number' || typeof parsed.createdAt !== 'number') return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error && error.code === 'EPERM';
    }
  }

  function reclaimStaleLock(lockPath) {
    const lock = readLockInfo(lockPath);
    if (!lock || Date.now() - lock.createdAt <= LOCK_STALE_TTL_MS || isProcessAlive(lock.pid)) return false;
    try {
      fsImpl.unlinkSync(lockPath);
      return true;
    } catch (_) {
      throw createVaultError('SECRET_VAULT_LOCK_RECLAIM_FAILED', '密钥仓库锁回收失败，请稍后重试');
    }
  }

  function acquireLock() {
    const lockPath = `${filePath}.lock`;
    for (let attempt = 0; attempt <= LOCK_RETRY_COUNT; attempt += 1) {
      let fd = null;
      try {
        fd = fsImpl.openSync(lockPath, 'wx', 0o600);
        fsImpl.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), 'utf8');
        fsImpl.fsyncSync(fd);
        return { lockPath, fd };
      } catch (error) {
        if (fd !== null) {
          try { fsImpl.closeSync(fd); } catch (_) {}
          try { fsImpl.unlinkSync(lockPath); } catch (_) {}
        }
        if (!error || error.code !== 'EEXIST') {
          throw createVaultError('SECRET_VAULT_LOCK_FAILED', '密钥仓库锁创建失败');
        }
        if (reclaimStaleLock(lockPath)) continue;
        if (attempt === LOCK_RETRY_COUNT) throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库正被其他进程使用，请稍后重试');
        waitForLockRetry();
      }
    }
    throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库正被其他进程使用，请稍后重试');
  }

  function releaseLock(lock) {
    let failed = false;
    try { fsImpl.closeSync(lock.fd); } catch (_) { failed = true; }
    try { fsImpl.unlinkSync(lock.lockPath); } catch (_) { failed = true; }
    if (failed) throw createVaultError('SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED', '密钥仓库已写入，但锁释放状态不确定');
  }

  function writeDocument(document) {
    const directory = path.dirname(filePath);
    const tempPath = `${filePath}.tmp-${crypto.randomBytes(12).toString('hex')}`;
    let tempFd = null;
    let directoryFd = null;
    let renamed = false;
    try {
      fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
      tempFd = fsImpl.openSync(tempPath, 'wx', 0o600);
      fsImpl.writeFileSync(tempPath, JSON.stringify(document), { encoding: 'utf8', mode: 0o600 });
      fsImpl.fsyncSync(tempFd);
      fsImpl.closeSync(tempFd);
      tempFd = null;
      fsImpl.renameSync(tempPath, filePath);
      renamed = true;
      directoryFd = fsImpl.openSync(directory, 'r');
      fsImpl.fsyncSync(directoryFd);
      fsImpl.closeSync(directoryFd);
      directoryFd = null;
    } catch (_) {
      if (tempFd !== null) {
        try { fsImpl.closeSync(tempFd); } catch (_) {}
      }
      if (directoryFd !== null) {
        try { fsImpl.closeSync(directoryFd); } catch (_) {}
      }
      if (!renamed) {
        try { fsImpl.unlinkSync(tempPath); } catch (_) {}
        throw createVaultError('SECRET_VAULT_WRITE_FAILED', '密钥仓库写入失败');
      }
      throw createVaultError('SECRET_VAULT_APPLIED_DURABILITY_UNCERTAIN', '密钥仓库已写入，但持久化状态不确定');
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
        assertEncryptionAvailable();
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
    let operationError = null;
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
      try {
        writeDocument(draft);
      } catch (error) {
        if (error && error.code === 'SECRET_VAULT_APPLIED_DURABILITY_UNCERTAIN') {
          error.snapshot = document;
        }
        throw error;
      }
    } catch (error) {
      operationError = error;
    }
    try {
      releaseLock(lock);
    } catch (releaseError) {
      if (!operationError) operationError = releaseError;
    }
    if (operationError) throw operationError;
  }

  function restoreSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !snapshot.secrets || !snapshot.providers
      || typeof snapshot.secrets !== 'object' || typeof snapshot.providers !== 'object') {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库快照格式不正确');
    }
    const document = {
      version: 1,
      secrets: cloneDictionary(snapshot.secrets),
      providers: cloneDictionary(snapshot.providers),
    };
    const lock = acquireLock();
    let operationError = null;
    try {
      writeDocument(document);
    } catch (error) {
      operationError = error;
    }
    try {
      releaseLock(lock);
    } catch (error) {
      if (!operationError) operationError = error;
    }
    if (operationError) throw operationError;
  }

  function set(providerId, value) {
    applyEntries([{ providerId, value }]);
  }

  function setMany(entries) {
    applyEntries(entries);
  }

  function get(providerId) {
    assertProviderId(providerId);
    const encrypted = readDocument().secrets[providerId];
    if (!encrypted) return null;
    assertEncryptionAvailable();
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch (_) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库已损坏，请重新保存密钥');
    }
  }

  function has(providerId) {
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
    restoreSnapshot,
    get,
    has,
    delete: remove,
    getProviderMetadata,
  };
}

module.exports = { createSecretsVault };
