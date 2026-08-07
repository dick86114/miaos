const crypto = require('crypto');
const path = require('path');
const { assertProviderId } = require('./provider-id');
const { validateHttpUrl } = require('./security/validators');

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

function createSecretsVault({ filePath, safeStorage, fsImpl, defaultStorageMode = 'keychain' }) {
  if (typeof filePath !== 'string' || !filePath) throw new TypeError('密钥文件路径不能为空');
  if (!['local', 'keychain'].includes(defaultStorageMode)) throw new TypeError('默认密钥存储方式不正确');
  if (!fsImpl || typeof fsImpl.existsSync !== 'function' || typeof fsImpl.readFileSync !== 'function'
    || typeof fsImpl.writeFileSync !== 'function' || typeof fsImpl.openSync !== 'function'
    || typeof fsImpl.fsyncSync !== 'function' || typeof fsImpl.closeSync !== 'function'
    || typeof fsImpl.renameSync !== 'function' || typeof fsImpl.unlinkSync !== 'function'
    || typeof fsImpl.mkdirSync !== 'function' || typeof fsImpl.statSync !== 'function'
    || typeof fsImpl.readdirSync !== 'function' || typeof fsImpl.rmSync !== 'function') {
    throw new TypeError('文件系统服务不可用');
  }

  function assertEncryptionAvailable() {
    if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function'
      || typeof safeStorage.encryptString !== 'function' || typeof safeStorage.decryptString !== 'function'
      || !safeStorage.isEncryptionAvailable()) {
      throw createVaultError('SECRET_ENCRYPTION_UNAVAILABLE', '系统密钥加密不可用，请检查系统钥匙串');
    }
  }

  function createEmptyDocument() {
    return { version: 1, storageMode: defaultStorageMode, secrets: createDictionary(), providers: createDictionary() };
  }

  function inferStorageMode(storedMode, secrets) {
    if (['local', 'keychain'].includes(storedMode)) return storedMode;
    // 旧版文件没有 storageMode，且其中保存的是系统钥匙串密文；必须如实标记，交由用户明确迁移。
    if (Object.values(secrets || {}).some((value) => typeof value === 'string' && !value.startsWith('local:'))) return 'keychain';
    return defaultStorageMode;
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
        storageMode: inferStorageMode(parsed.storageMode, parsed.secrets),
        secrets: cloneDictionary(parsed.secrets),
        providers: cloneDictionary(parsed.providers),
      };
    }

    // 兼容本任务前一轮已经落盘的纯密文映射，读取后在下一次写入转换为 v1 文档。
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && Object.values(parsed).every((value) => typeof value === 'string')) {
      return { version: 1, storageMode: inferStorageMode(null, parsed), secrets: cloneDictionary(parsed), providers: createDictionary() };
    }

    throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库已损坏，请重新保存密钥');
  }

  function lockOwnerPath(lockPath) {
    return path.join(lockPath, 'owner.json');
  }

  function lockReadError(error) {
    if (error && error.code === 'ENOENT') return null;
    throw createVaultError('SECRET_VAULT_LOCK_READ_FAILED', '密钥仓库锁读取失败，请稍后重试');
  }

  function readLockState(lockPath) {
    let stat;
    try {
      stat = fsImpl.statSync(lockPath);
    } catch (error) {
      if (error && error.code === 'ENOENT') return null;
      return lockReadError(error);
    }

    const isDirectory = typeof stat.isDirectory === 'function' ? stat.isDirectory() : true;
    const statePath = isDirectory ? lockOwnerPath(lockPath) : lockPath;
    let raw = null;
    try {
      raw = fsImpl.readFileSync(statePath, 'utf8');
    } catch (error) {
      if (!isDirectory && error && error.code === 'ENOENT') return null;
      if (error && error.code === 'ENOENT') raw = null;
      else return lockReadError(error);
    }

    let info = null;
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.ownerToken === 'string' && typeof parsed.pid === 'number'
          && typeof parsed.createdAt === 'number') {
          info = parsed;
        }
      } catch (_) {}
    }
    return {
      raw,
      info,
      isDirectory,
      signature: `${stat.dev}:${stat.ino}:${stat.mtimeMs}:${stat.size}:${isDirectory}:${raw || ''}`,
      mtimeMs: stat.mtimeMs,
    };
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

  function isSameLock(lockPath, expected) {
    const current = readLockState(lockPath);
    return !!current && current.signature === expected.signature;
  }

  function canReclaimLock(lock, ownerToken) {
    if (!lock) return false;
    if (lock.info?.ownerToken === ownerToken) return true;
    if (lock.info) {
      return Date.now() - lock.info.createdAt > LOCK_STALE_TTL_MS && !isProcessAlive(lock.info.pid);
    }
    return Date.now() - lock.mtimeMs > LOCK_STALE_TTL_MS;
  }

  function quarantinePathFor(lockPath, ownerToken) {
    const ownerHash = crypto.createHash('sha256').update(String(ownerToken)).digest('hex').slice(0, 16);
    return `${lockPath}.quarantine-${ownerHash}-${crypto.randomBytes(8).toString('hex')}`;
  }

  function listQuarantines(lockPath) {
    const directory = path.dirname(lockPath);
    const prefix = `${path.basename(lockPath)}.quarantine-`;
    let entries;
    try {
      entries = fsImpl.readdirSync(directory);
    } catch (error) {
      return lockReadError(error);
    }

    const quarantines = [];
    for (const entry of entries) {
      if (typeof entry !== 'string' || !entry.startsWith(prefix)) continue;
      const quarantinePath = path.join(directory, entry);
      const state = readLockState(quarantinePath);
      if (state) quarantines.push({ path: quarantinePath, state });
    }
    return quarantines;
  }

  function createQuarantinedLockError(removeError, restoreError) {
    const error = createVaultError('SECRET_VAULT_LOCK_QUARANTINED', '密钥仓库锁清理失败，quarantine 保护仍然存在');
    error.cleanupFailureCode = removeError?.code || 'SECRET_VAULT_LOCK_REMOVE_FAILED';
    error.restoreFailureCode = restoreError?.code || 'SECRET_VAULT_LOCK_RESTORE_FAILED';
    error.cause = restoreError;
    return error;
  }

  function restoreQuarantine(quarantinePath, lockPath, expected, ownerToken) {
    const current = readLockState(lockPath);
    if (current) return null;

    const quarantined = readLockState(quarantinePath);
    if (!quarantined || quarantined.signature !== expected.signature
      || (expected.info && quarantined.info?.ownerToken !== ownerToken)) {
      return null;
    }

    try {
      fsImpl.renameSync(quarantinePath, lockPath);
    } catch (error) {
      if (error && error.code === 'EEXIST') return null;
      throw error;
    }

    const restored = readLockState(lockPath);
    if (!restored || restored.signature !== expected.signature
      || (expected.info && restored.info?.ownerToken !== ownerToken)) {
      return null;
    }
    return restored;
  }

  function recoverOwnedQuarantine(lockPath, ownerToken) {
    const quarantines = listQuarantines(lockPath);
    if (quarantines.length === 0) return null;

    // quarantine 是锁的明确保护状态：未知、其他 owner 或多个残留状态都不能绕过。
    if (quarantines.length !== 1 || quarantines[0].state.info?.ownerToken !== ownerToken) {
      throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库锁正在恢复，请稍后重试');
    }

    const quarantine = quarantines[0];
    try {
      const restored = restoreQuarantine(quarantine.path, lockPath, quarantine.state, ownerToken);
      if (restored) return restored;
    } catch (error) {
      if (error && error.code === 'SECRET_VAULT_LOCK_READ_FAILED') throw error;
      const recoveryError = createVaultError('SECRET_VAULT_LOCKED', '密钥仓库锁恢复失败，请稍后重试');
      recoveryError.restoreFailureCode = error?.code || 'SECRET_VAULT_LOCK_RESTORE_FAILED';
      recoveryError.cause = error;
      throw recoveryError;
    }
    throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库锁正在恢复，请稍后重试');
  }

  function openRecoveredLock(lockPath, ownerToken, snapshot) {
    let fd = null;
    try {
      fd = fsImpl.openSync(lockPath, 'r');
      fsImpl.fsyncSync(fd);
      const current = readLockState(lockPath);
      if (!current || current.signature !== snapshot.signature || current.info?.ownerToken !== ownerToken) {
        throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库锁已被其他进程接管，请稍后重试');
      }
      return { lockPath, fd, ownerToken, snapshot: current };
    } catch (error) {
      if (fd !== null) {
        try { fsImpl.closeSync(fd); } catch (_) {}
      }
      if (error && (error.code === 'SECRET_VAULT_LOCKED' || error.code === 'SECRET_VAULT_LOCK_READ_FAILED')) throw error;
      throw createVaultError('SECRET_VAULT_LOCK_FAILED', '密钥仓库锁恢复后无法打开');
    }
  }

  function moveAndRemoveLock(lockPath, expected, ownerToken) {
    const current = readLockState(lockPath);
    if (!current) return { status: 'gone' };
    if (current.signature !== expected.signature
      || (expected.info && current.info?.ownerToken !== ownerToken)) {
      return { status: 'replaced' };
    }

    const quarantinePath = quarantinePathFor(lockPath, ownerToken);
    try {
      fsImpl.renameSync(lockPath, quarantinePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') return { status: 'gone' };
      throw error;
    }

    const quarantined = readLockState(quarantinePath);
    if (!quarantined || quarantined.signature !== expected.signature
      || (expected.info && quarantined.info?.ownerToken !== ownerToken)) {
      restoreQuarantine(quarantinePath, lockPath, quarantined || expected, ownerToken);
      return { status: 'replaced' };
    }

    // 只删除已经原子移入 owner-specific quarantine、且再次验证过 inode/owner 的对象；
    // 不会对原始可替换路径直接 recursive remove。
    try {
      fsImpl.rmSync(quarantinePath, { recursive: true, force: false });
      return { status: 'removed' };
    } catch (removeError) {
      let restored;
      try {
        restored = restoreQuarantine(quarantinePath, lockPath, quarantined, ownerToken);
      } catch (restoreError) {
        throw createQuarantinedLockError(removeError, restoreError);
      }
      if (!restored) {
        throw createQuarantinedLockError(removeError, createVaultError(
          'SECRET_VAULT_LOCK_RESTORE_BLOCKED',
          '密钥仓库锁无法从 quarantine 恢复',
        ));
      }
      throw removeError;
    }
  }

  function reclaimLock(lockPath, expected, ownerToken) {
    if (!canReclaimLock(expected, ownerToken)) return false;
    if (!isSameLock(lockPath, expected)) return false;
    let result;
    try {
      result = moveAndRemoveLock(lockPath, expected, expected.info?.ownerToken || ownerToken);
    } catch (error) {
      if (error && error.code === 'SECRET_VAULT_LOCK_READ_FAILED') throw error;
      throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库正被其他进程使用，请稍后重试');
    }
    return result.status === 'removed' || result.status === 'gone';
  }

  function writeLockOwner(lockPath, ownerToken) {
    const ownerPath = lockOwnerPath(lockPath);
    const tempPath = `${ownerPath}.tmp-${crypto.randomBytes(8).toString('hex')}`;
    let fd = null;
    try {
      fd = fsImpl.openSync(tempPath, 'wx', 0o600);
      fsImpl.writeFileSync(tempPath, JSON.stringify({ ownerToken, pid: process.pid, createdAt: Date.now() }), 'utf8');
      fsImpl.fsyncSync(fd);
      fsImpl.closeSync(fd);
      fd = null;
      fsImpl.renameSync(tempPath, ownerPath);
    } catch (error) {
      if (fd !== null) {
        try { fsImpl.closeSync(fd); } catch (_) {}
      }
      throw error;
    }
  }

  function acquireLock(ownerToken) {
    const lockPath = `${filePath}.lock`;
    const recovered = recoverOwnedQuarantine(lockPath, ownerToken);
    if (recovered) return openRecoveredLock(lockPath, ownerToken, recovered);

    for (let attempt = 0; attempt <= LOCK_RETRY_COUNT; attempt += 1) {
      let createdLock = false;
      try {
        fsImpl.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
        fsImpl.mkdirSync(lockPath, { mode: 0o700 });
        createdLock = true;
        writeLockOwner(lockPath, ownerToken);
        const fd = fsImpl.openSync(lockPath, 'r');
        fsImpl.fsyncSync(fd);
        const snapshot = readLockState(lockPath);
        if (!snapshot || snapshot.info?.ownerToken !== ownerToken) {
          try { fsImpl.closeSync(fd); } catch (_) {}
          throw createVaultError('SECRET_VAULT_LOCK_FAILED', '密钥仓库锁 owner 写入失败');
        }
        return { lockPath, fd, ownerToken, snapshot };
      } catch (error) {
        let cleanupError = null;
        if (createdLock) {
          try {
            const partial = readLockState(lockPath);
            if (partial) moveAndRemoveLock(lockPath, partial, ownerToken);
          } catch (cleanupFailure) {
            cleanupError = cleanupFailure;
          }
        }
        if (cleanupError) {
          const lockError = createVaultError('SECRET_VAULT_LOCK_CLEANUP_FAILED', '密钥仓库锁创建失败且安全清理未完成');
          lockError.cleanupFailureCode = cleanupError.code || 'SECRET_VAULT_LOCK_REMOVE_FAILED';
          if (cleanupError.restoreFailureCode) lockError.restoreFailureCode = cleanupError.restoreFailureCode;
          lockError.cause = cleanupError;
          throw lockError;
        }
        if (error && error.code !== 'EEXIST') {
          if (error.code === 'SECRET_VAULT_LOCK_READ_FAILED') throw error;
          throw createVaultError('SECRET_VAULT_LOCK_FAILED', '密钥仓库锁创建失败');
        }

        const existing = readLockState(lockPath);
        if (!existing) continue;
        if (reclaimLock(lockPath, existing, ownerToken)) continue;
        if (attempt === LOCK_RETRY_COUNT) {
          throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库正被其他进程使用，请稍后重试');
        }
        waitForLockRetry();
      }
    }
    throw createVaultError('SECRET_VAULT_LOCKED', '密钥仓库正被其他进程使用，请稍后重试');
  }

  function releaseLock(lock) {
    const failures = [];
    let releaseFailure = null;
    try { fsImpl.closeSync(lock.fd); } catch (_) { failures.push('close'); }

    let current;
    try {
      current = readLockState(lock.lockPath);
      if (!current || current.info?.ownerToken !== lock.ownerToken
        || current.signature !== lock.snapshot.signature) {
        failures.push('owner');
      } else {
        const result = moveAndRemoveLock(lock.lockPath, current, lock.ownerToken);
        if (result.status !== 'removed') failures.push('owner');
      }
    } catch (error) {
      releaseFailure = error;
      failures.push(error && error.code === 'SECRET_VAULT_LOCK_READ_FAILED' ? 'read' : 'remove');
    }

    if (failures.length > 0) {
      const error = createVaultError('SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED', '密钥仓库已写入，但锁释放状态不确定');
      if (releaseFailure?.code) error.releaseFailureCode = releaseFailure.code;
      if (releaseFailure?.cleanupFailureCode) error.cleanupFailureCode = releaseFailure.cleanupFailureCode;
      if (releaseFailure?.restoreFailureCode) error.restoreFailureCode = releaseFailure.restoreFailureCode;
      if (releaseFailure) error.cause = releaseFailure;
      throw error;
    }
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

    const normalized = cloneMetadata(metadata);
    if (Object.prototype.hasOwnProperty.call(normalized, 'endpoint')) {
      try {
        normalized.endpoint = validateHttpUrl(normalized.endpoint);
      } catch (_) {
        throw createVaultError('SECRET_VAULT_CORRUPTED', '供应商元数据中的 API 地址不安全');
      }
    }
    return normalized;
  }

  function applyEntries(entries, { ownerToken = crypto.randomUUID() } = {}) {
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥更新数据格式不正确');
    }
    const storageMode = readDocument().storageMode;
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
        if (storageMode === 'local') {
          // 本地保存模式不调用系统钥匙串；base64 仅用于稳定的文件编码，不能视为加密。
          next.localValue = Buffer.from(entry.value, 'utf8').toString('base64');
        } else {
          assertEncryptionAvailable();
          try {
            next.encryptedValue = safeStorage.encryptString(entry.value).toString('base64');
          } catch (_) {
            throw createVaultError('SECRET_ENCRYPTION_UNAVAILABLE', '系统密钥加密不可用，请检查系统钥匙串');
          }
        }
      }
      if (entry.deleteSecret === true) next.deleteSecret = true;
      if (Object.prototype.hasOwnProperty.call(entry, 'metadata')) {
        next.metadata = entry.metadata === null ? null : validateMetadata(entry.metadata);
      }
      if (!next.encryptedValue && !next.localValue && !next.deleteSecret && !Object.prototype.hasOwnProperty.call(next, 'metadata')) {
        throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥更新数据格式不正确');
      }
      prepared.push(next);
    }

    const lock = acquireLock(ownerToken);
    let operationError = null;
    try {
      const document = readDocument();
      const draft = {
        version: 1,
        storageMode: document.storageMode,
        secrets: cloneDictionary(document.secrets),
        providers: cloneDictionary(document.providers),
      };
      for (const entry of prepared) {
        if (entry.encryptedValue) draft.secrets[entry.providerId] = entry.encryptedValue;
        if (entry.localValue) draft.secrets[entry.providerId] = `local:${entry.localValue}`;
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

  function restoreSnapshot(snapshot, { ownerToken = crypto.randomUUID() } = {}) {
    if (!snapshot || snapshot.version !== 1 || !snapshot.secrets || !snapshot.providers
      || typeof snapshot.secrets !== 'object' || typeof snapshot.providers !== 'object') {
      throw createVaultError('SECRET_VAULT_CORRUPTED', '密钥仓库快照格式不正确');
    }
    const document = {
      version: 1,
      storageMode: ['local', 'keychain'].includes(snapshot.storageMode) ? snapshot.storageMode : defaultStorageMode,
      secrets: cloneDictionary(snapshot.secrets),
      providers: cloneDictionary(snapshot.providers),
    };
    const lock = acquireLock(ownerToken);
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

  function set(providerId, value, options) {
    applyEntries([{ providerId, value }], options);
  }

  function setMany(entries, options) {
    applyEntries(entries, options);
  }

  function get(providerId) {
    assertProviderId(providerId);
    const stored = readDocument().secrets[providerId];
    if (!stored) return null;
    if (stored.startsWith('local:')) {
      try {
        return Buffer.from(stored.slice('local:'.length), 'base64').toString('utf8');
      } catch (_) {
        throw createVaultError('SECRET_VAULT_CORRUPTED', '本地保存的 API Key 已损坏，请重新保存密钥');
      }
    }
    assertEncryptionAvailable();
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
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
    return metadata ? validateMetadata(metadata) : null;
  }

  function getStorageMode() {
    return readDocument().storageMode;
  }

  function setStorageMode(mode, { ownerToken = crypto.randomUUID() } = {}) {
    if (!['local', 'keychain'].includes(mode)) throw createVaultError('SECRET_STORAGE_MODE_INVALID', '密钥存储方式不正确');
    const lock = acquireLock(ownerToken);
    let operationError = null;
    try {
      const document = readDocument();
      if (document.storageMode !== mode) {
        const draft = { version: 1, storageMode: mode, secrets: createDictionary(), providers: cloneDictionary(document.providers) };
        for (const [providerId, stored] of Object.entries(document.secrets)) {
          const value = stored.startsWith('local:')
            ? Buffer.from(stored.slice('local:'.length), 'base64').toString('utf8')
            : (() => { assertEncryptionAvailable(); return safeStorage.decryptString(Buffer.from(stored, 'base64')); })();
          if (mode === 'local') draft.secrets[providerId] = `local:${Buffer.from(value, 'utf8').toString('base64')}`;
          else {
            assertEncryptionAvailable();
            draft.secrets[providerId] = safeStorage.encryptString(value).toString('base64');
          }
        }
        writeDocument(draft);
      }
    } catch (error) {
      operationError = error;
    }
    try { releaseLock(lock); } catch (error) { if (!operationError) operationError = error; }
    if (operationError) throw operationError;
    return mode;
  }

  return {
    set,
    setMany,
    restoreSnapshot,
    get,
    has,
    delete: remove,
    getProviderMetadata,
    getStorageMode,
    setStorageMode,
  };
}

module.exports = { createSecretsVault };
