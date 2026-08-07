const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { createSecretsVault } = require('../src/main/secrets-vault');

function createSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (buffer) => {
      const value = buffer.toString();
      if (!value.startsWith('encrypted:')) throw new Error('密文无效');
      return value.slice('encrypted:'.length);
    },
  };
}

function writeLock(lockPath, { ownerToken, pid = process.pid, createdAt = Date.now(), raw = null } = {}) {
  fs.mkdirSync(lockPath, { mode: 0o700 });
  if (raw !== null) {
    fs.writeFileSync(path.join(lockPath, 'owner.json'), raw);
  } else {
    fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({ ownerToken, pid, createdAt }));
  }
}

function readLock(lockPath) {
  return JSON.parse(readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
}

function createVault() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-'));
  const filePath = path.join(dir, 'secrets.json');
  return { dir, filePath, vault: createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs }) };
}

test('密钥文件只包含密文且可按 providerId 读取', () => {
  const { filePath, vault } = createVault();
  vault.set('p_test', 'sk-secret');
  assert.equal(vault.get('p_test'), 'sk-secret');
  assert.equal(vault.has('p_test'), true);
  assert.doesNotMatch(readFileSync(filePath, 'utf8'), /sk-secret/);
});

test('删除密钥后不再存在且文件不保留对应记录', () => {
  const { filePath, vault } = createVault();
  vault.set('p_test', 'sk-secret');
  assert.equal(vault.delete('p_test'), true);
  assert.equal(vault.has('p_test'), false);
  assert.equal(vault.get('p_test'), null);
  assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), { version: 1, storageMode: 'keychain', secrets: {}, providers: {} });
});

test('写入严格经过临时文件、fsync 和 rename', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-atomic-'));
  const filePath = path.join(dir, 'secrets.json');
  const calls = [];
  const fsImpl = {
    ...fs,
    writeFileSync(target, value, options) {
      calls.push(['write', target]);
      return fs.writeFileSync(target, value, options);
    },
    fsyncSync(fd) {
      calls.push(['fsync']);
      return fs.fsyncSync(fd);
    },
    renameSync(from, to) {
      calls.push(['rename', from, to]);
      return fs.renameSync(from, to);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });

  vault.set('p_test', 'sk-secret');

  assert.deepEqual(calls.map(([name]) => name), [
    'write', 'fsync', 'rename', 'fsync',
    'write', 'fsync', 'rename', 'fsync', 'rename',
  ]);
  const documentWrite = calls.findIndex(([name, target]) => name === 'write' && String(target).startsWith(`${filePath}.tmp-`));
  const documentRename = calls.findIndex(([name, from, to]) => name === 'rename' && to === filePath);
  assert.ok(documentWrite >= 0);
  assert.match(calls[documentWrite][1], new RegExp(`^${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.tmp-[a-f0-9]+$`));
  assert.equal(calls[documentRename][1], calls[documentWrite][1]);
  assert.equal(calls[documentRename][2], filePath);
  assert.equal(existsSync(`${filePath}.tmp`), false);
});

test('损坏的密钥文件或密文以公开错误拒绝读取', () => {
  const { filePath, vault } = createVault();
  fs.writeFileSync(filePath, '{bad-json');
  assert.throws(() => vault.get('p_test'), (error) => error.code === 'SECRET_VAULT_CORRUPTED');

  fs.writeFileSync(filePath, JSON.stringify({ p_test: Buffer.from('not-encrypted').toString('base64') }));
  assert.throws(() => vault.get('p_test'), (error) => error.code === 'SECRET_VAULT_CORRUPTED');
});

test('系统加密不可用时绝不回退为明文', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-unavailable-'));
  const filePath = path.join(dir, 'secrets.json');
  const unavailable = {
    isEncryptionAvailable: () => false,
    encryptString: () => { throw new Error('不应调用'); },
    decryptString: () => { throw new Error('不应调用'); },
  };
  const vault = createSecretsVault({ filePath, safeStorage: unavailable, fsImpl: fs });

  assert.throws(() => vault.set('p_test', 'sk-secret'), (error) => error.code === 'SECRET_ENCRYPTION_UNAVAILABLE');
  assert.equal(existsSync(filePath), false);
});

test('特殊 providerId 不会污染 records，也不能作为密钥 ID', () => {
  const { vault } = createVault();
  for (const providerId of ['__proto__', 'constructor', 'p/escape', '-invalid']) {
    assert.throws(() => vault.set(providerId, 'sk-secret'), (error) => error.code === 'SECRET_PROVIDER_ID_INVALID');
  }
  assert.equal(vault.has('p_test'), false);
});

test('setMany 会在全部加密成功前保持正式文件不变', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-set-many-'));
  const filePath = path.join(dir, 'secrets.json');
  let calls = 0;
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      calls += 1;
      if (calls === 3) throw new Error('第二条加密失败');
      return Buffer.from(`encrypted:${value}`);
    },
    decryptString: (buffer) => buffer.toString().slice('encrypted:'.length),
  };
  const vault = createSecretsVault({ filePath, safeStorage, fsImpl: fs });
  vault.set('p_existing', 'sk-existing');
  const before = readFileSync(filePath, 'utf8');

  assert.throws(() => vault.setMany([
    { providerId: 'p_one', value: 'sk-one' },
    { providerId: 'p_two', value: 'sk-two' },
  ]), /系统密钥加密不可用/);
  assert.equal(readFileSync(filePath, 'utf8'), before);
  assert.equal(vault.get('p_existing'), 'sk-existing');
});

test('setMany 文件写入失败时正式文件保持不变', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-set-many-write-'));
  const filePath = path.join(dir, 'secrets.json');
  const initial = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs });
  initial.set('p_existing', 'sk-existing');
  const before = readFileSync(filePath, 'utf8');
  const fsImpl = {
    ...fs,
    writeFileSync(target, value, options) {
      if (String(target).startsWith(`${filePath}.tmp-`)) throw new Error('写入失败');
      return fs.writeFileSync(target, value, options);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });

  assert.throws(() => vault.setMany([{ providerId: 'p_one', value: 'sk-one' }]), /写入失败/);
  assert.equal(readFileSync(filePath, 'utf8'), before);
});

test('原子写入使用随机临时文件、fsync 文件和父目录，并拒绝已占用锁', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-durability-'));
  const filePath = path.join(dir, 'secrets.json');
  const calls = [];
  const fsImpl = {
    ...fs,
    openSync(target, flags, mode) {
      calls.push(['open', target, flags]);
      return fs.openSync(target, flags, mode);
    },
    fsyncSync(fd) {
      calls.push(['fsync']);
      return fs.fsyncSync(fd);
    },
    renameSync(from, to) {
      calls.push(['rename', from, to]);
      return fs.renameSync(from, to);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  vault.set('p_test', 'sk-secret');

  const tempOpen = calls.find((call) => String(call[1]).includes('.tmp-'));
  assert.ok(tempOpen, '应以随机后缀创建临时文件');
  assert.equal(tempOpen[2], 'wx');
  assert.equal(calls.filter(([name]) => name === 'fsync').length, 4);
  assert.ok(calls.some(([name, from, to]) => name === 'rename' && to === filePath));

  writeLock(`${filePath}.lock`, { ownerToken: 'owner-busy' });
  assert.throws(() => vault.set('p_other', 'sk-other'), (error) => error.code === 'SECRET_VAULT_LOCKED');
  fs.rmSync(`${filePath}.lock`, { recursive: true, force: true });
});

test('父目录 fsync 在 rename 后失败时标记已应用但 durability 不确定，并保留可回滚快照', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-durability-uncertain-'));
  const filePath = path.join(dir, 'secrets.json');
  const initial = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs });
  initial.set('p_test', 'sk-old');
  const before = readFileSync(filePath, 'utf8');
  const fdPaths = new Map();
  const fsImpl = {
    ...fs,
    openSync(target, flags, mode) {
      const fd = fs.openSync(target, flags, mode);
      fdPaths.set(fd, target);
      return fd;
    },
    closeSync(fd) {
      fdPaths.delete(fd);
      return fs.closeSync(fd);
    },
    fsyncSync(fd) {
      if (fdPaths.get(fd) === dir) throw Object.assign(new Error('目录 fsync 失败'), { code: 'EIO' });
      return fs.fsyncSync(fd);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });

  let snapshot;
  assert.throws(() => vault.setMany([{ providerId: 'p_test', value: 'sk-new' }]), (error) => {
    assert.equal(error.code, 'SECRET_VAULT_APPLIED_DURABILITY_UNCERTAIN');
    snapshot = error.snapshot;
    assert.ok(snapshot);
    return true;
  });
  assert.notEqual(readFileSync(filePath, 'utf8'), before);
  const recoveryVault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs });
  recoveryVault.restoreSnapshot(snapshot);
  assert.equal(readFileSync(filePath, 'utf8'), before);
});

test('过期且所属进程已退出的 lock 会回收，存活进程的 lock 不会被删除', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-stale-lock-'));
  const filePath = path.join(dir, 'secrets.json');
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs });
  const lockPath = `${filePath}.lock`;
  writeLock(lockPath, { ownerToken: 'owner-dead', pid: 999999, createdAt: Date.now() - 10 * 60 * 1000 });
  vault.set('p_test', 'sk-secret');
  assert.equal(existsSync(lockPath), false);

  writeLock(lockPath, { ownerToken: 'owner-live', pid: process.pid, createdAt: Date.now() - 10 * 60 * 1000 });
  assert.throws(() => vault.set('p_other', 'sk-other'), (error) => error.code === 'SECRET_VAULT_LOCKED');
  fs.rmSync(lockPath, { recursive: true, force: true });
});

test('损坏的 stale lock 可回收，但检查后替换的新 owner lock 必须存活', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-corrupt-lock-'));
  const filePath = path.join(dir, 'secrets.json');
  const lockPath = `${filePath}.lock`;
  writeLock(lockPath, { raw: '{' });
  const old = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(lockPath, old, old);
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs });
  vault.set('p_stale', 'sk-stale');
  assert.equal(existsSync(lockPath), false);

  writeLock(lockPath, { raw: '{' });
  fs.utimesSync(lockPath, old, old);
  let injected = false;
  const fsImpl = {
    ...fs,
    rmSync(target, options) {
      if (!injected && String(target).includes('.lock.quarantine-')) {
        injected = true;
        writeLock(lockPath, { ownerToken: 'owner-race' });
      }
      return fs.rmSync(target, options);
    },
  };
  const racingVault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.throws(() => racingVault.set('p_race', 'sk-race'), (error) => error.code === 'SECRET_VAULT_LOCKED');
  assert.equal(readLock(lockPath).ownerToken, 'owner-race');
  fs.rmSync(lockPath, { recursive: true, force: true });
});

test('stale lock 无法安全回收时返回 LOCKED 且保留原锁供重试', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-lock-reclaim-failure-'));
  const filePath = path.join(dir, 'secrets.json');
  const lockPath = `${filePath}.lock`;
  writeLock(lockPath, { raw: '{' });
  const old = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(lockPath, old, old);
  const fsImpl = {
    ...fs,
    rmSync(target, options) {
      if (String(target).includes('.lock.quarantine-')) throw Object.assign(new Error('锁回收失败'), { code: 'EACCES' });
      return fs.rmSync(target, options);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.throws(() => vault.set('p_reclaim', 'sk-secret'), (error) => error.code === 'SECRET_VAULT_LOCKED');
  assert.equal(existsSync(lockPath), true);
  fs.rmSync(lockPath, { recursive: true, force: true });
});

test('锁读取 EIO/EACCES 必须明确失败，不能按不存在继续写入', () => {
  for (const code of ['EIO', 'EACCES']) {
    const dir = mkdtempSync(path.join(os.tmpdir(), `miaos-secrets-lock-read-${code}-`));
    const filePath = path.join(dir, 'secrets.json');
    const lockPath = `${filePath}.lock`;
    writeLock(lockPath, { ownerToken: 'owner-live' });
    const fsImpl = {
      ...fs,
      readFileSync(target, encoding) {
        if (target === path.join(lockPath, 'owner.json')) throw Object.assign(new Error('锁读取失败'), { code });
        return fs.readFileSync(target, encoding);
      },
    };
    const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
    assert.throws(() => vault.set('p_read-failure', 'sk-secret'), (error) => error.code === 'SECRET_VAULT_LOCK_READ_FAILED');
    assert.equal(existsSync(filePath), false);
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
});

test('锁释放读取 EIO 不会报告成功，保留锁供同 owner rollback 恢复', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-lock-release-read-'));
  const filePath = path.join(dir, 'secrets.json');
  const lockPath = `${filePath}.lock`;
  let releaseRead = false;
  let releaseReadInjected = false;
  const fsImpl = {
    ...fs,
    readFileSync(target, encoding) {
      if (releaseRead && target === path.join(lockPath, 'owner.json')) {
        throw Object.assign(new Error('锁读取失败'), { code: 'EIO' });
      }
      return fs.readFileSync(target, encoding);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  const originalRename = fsImpl.renameSync;
  fsImpl.renameSync = (...args) => {
    const result = originalRename(...args);
    if (!releaseReadInjected && args[1] === filePath) {
      releaseReadInjected = true;
      releaseRead = true;
    }
    return result;
  };
  assert.throws(() => vault.set('p_test', 'sk-secret'), (error) => error.code === 'SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED');
  assert.equal(vault.get('p_test'), 'sk-secret');
  releaseRead = false;
  vault.setMany([{ providerId: 'p_test', metadata: { id: 'p_test' } }], { ownerToken: readLock(lockPath).ownerToken });
  assert.equal(existsSync(lockPath), false);
});

test('lock 释放失败不会被吞掉，已写入状态以明确不确定错误返回', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-lock-release-'));
  const filePath = path.join(dir, 'secrets.json');
  const fsImpl = {
    ...fs,
    rmSync(target, options) {
      if (String(target).includes('.lock.quarantine-')) throw Object.assign(new Error('锁删除失败'), { code: 'EACCES' });
      return fs.rmSync(target, options);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.throws(() => vault.set('p_test', 'sk-secret'), (error) => error.code === 'SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED');
  assert.equal(vault.get('p_test'), 'sk-secret');
  for (const entry of fs.readdirSync(dir)) {
    if (entry.includes('.lock.quarantine-')) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
});

test('供应商 metadata 拒绝包含 userinfo 的 endpoint，且不会落盘凭据', () => {
  const { filePath, vault } = createVault();
  const endpoint = 'https://user:sk-review-secret@example.com/v1';

  assert.throws(() => vault.setMany([{
    providerId: 'p_test',
    metadata: { id: 'p_test', endpoint },
  }]), (error) => {
    assert.equal(error.code, 'SECRET_VAULT_CORRUPTED');
    assert.doesNotMatch(error.message, /sk-review-secret|user:/);
    return true;
  });
  assert.equal(existsSync(filePath), false);
});

test('safeStorage 不可用时纯 metadata 更新和无密钥读取仍可用', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-public-'));
  const filePath = path.join(dir, 'secrets.json');
  const unavailable = {
    isEncryptionAvailable: () => false,
    encryptString() { throw new Error('不应加密'); },
    decryptString() { throw new Error('不应解密'); },
  };
  const vault = createSecretsVault({ filePath, safeStorage: unavailable, fsImpl: fs });
  assert.doesNotThrow(() => vault.setMany([{ providerId: 'p_public', metadata: { id: 'p_public', endpoint: 'https://public.example/v1' } }]));
  assert.equal(vault.get('p_public'), null);
  assert.equal(vault.has('p_public'), false);
  assert.deepEqual(vault.getProviderMetadata('p_public'), { id: 'p_public', endpoint: 'https://public.example/v1' });
});

test('quarantine 删除与恢复同时失败时持续保护锁，同 owner 可安全重试恢复', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-quarantine-recovery-'));
  const filePath = path.join(dir, 'secrets.json');
  const lockPath = `${filePath}.lock`;
  const ownerToken = 'owner-transaction-a';
  let failRemove = true;
  let failRestore = true;
  const fsImpl = {
    ...fs,
    rmSync(target, options) {
      if (failRemove && String(target).includes('.lock.quarantine-')) {
        throw Object.assign(new Error('quarantine 删除失败'), { code: 'EACCES' });
      }
      return fs.rmSync(target, options);
    },
    renameSync(from, to) {
      if (failRestore && String(from).includes('.lock.quarantine-') && to === lockPath) {
        throw Object.assign(new Error('quarantine 恢复失败'), { code: 'EIO' });
      }
      return fs.renameSync(from, to);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });

  assert.throws(() => vault.setMany([{ providerId: 'p_owner', value: 'sk-owner' }], { ownerToken }), (error) => {
    assert.equal(error.code, 'SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED');
    assert.equal(error.releaseFailureCode, 'SECRET_VAULT_LOCK_QUARANTINED');
    assert.equal(error.restoreFailureCode, 'EIO');
    return true;
  });

  const quarantines = fs.readdirSync(dir)
    .filter((entry) => entry.includes('.lock.quarantine-'))
    .map((entry) => path.join(dir, entry));
  assert.equal(existsSync(lockPath), false);
  assert.equal(quarantines.length, 1);
  assert.equal(readLock(quarantines[0]).ownerToken, ownerToken);

  const otherOwnerVault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.throws(() => otherOwnerVault.setMany([{ providerId: 'p_other', value: 'sk-other' }], {
    ownerToken: 'owner-transaction-b',
  }), (error) => error.code === 'SECRET_VAULT_LOCKED');
  const persisted = readFileSync(filePath, 'utf8');
  assert.equal(persisted.includes('sk-owner'), false);
  assert.equal(persisted.includes('sk-other'), false);

  failRemove = false;
  failRestore = false;
  vault.restoreSnapshot({ version: 1, secrets: {}, providers: {} }, { ownerToken });
  assert.equal(existsSync(lockPath), false);
  assert.equal(fs.readdirSync(dir).some((entry) => entry.includes('.lock.quarantine-')), false);
  assert.equal(vault.has('p_owner'), false);
});

test('lock close 失败不会被吞掉且仍尝试安全清理锁目录', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-lock-close-'));
  const filePath = path.join(dir, 'secrets.json');
  let lockFd = null;
  const fsImpl = {
    ...fs,
    openSync(target, flags, mode) {
      const fd = fs.openSync(target, flags, mode);
      if (target === `${filePath}.lock`) lockFd = fd;
      return fd;
    },
    closeSync(fd) {
      if (fd === lockFd) throw Object.assign(new Error('锁关闭失败'), { code: 'EIO' });
      return fs.closeSync(fd);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.throws(() => vault.set('p_test', 'sk-secret'), (error) => error.code === 'SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED');
  assert.equal(existsSync(`${filePath}.lock`), false);
});

test('同一 owner token 可安全回收自身残留 lock，其他 owner 的活锁不会被删除', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-owner-lock-'));
  const filePath = path.join(dir, 'secrets.json');
  const ownerToken = 'owner-transaction-a';
  writeLock(`${filePath}.lock`, { ownerToken });
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs });
  vault.setMany([{ providerId: 'p_test', value: 'sk-secret' }], { ownerToken });
  assert.equal(existsSync(`${filePath}.lock`), false);

  writeLock(`${filePath}.lock`, { ownerToken: 'owner-other' });
  assert.throws(() => vault.setMany([{ providerId: 'p_other', value: 'sk-other' }], { ownerToken: 'owner-transaction-b' }), (error) => error.code === 'SECRET_VAULT_LOCKED');
  assert.equal(readLock(`${filePath}.lock`).ownerToken, 'owner-other');
  fs.rmSync(`${filePath}.lock`, { recursive: true, force: true });
});

test('释放验证后锁目录被替换时，新 owner lock 必须存活', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-release-race-'));
  const filePath = path.join(dir, 'secrets.json');
  const lockPath = `${filePath}.lock`;
  let injected = false;
  const fsImpl = {
    ...fs,
    rmSync(target, options) {
      if (!injected && String(target).includes('.lock.quarantine-')) {
        injected = true;
        writeLock(lockPath, { ownerToken: 'owner-replaced' });
      }
      return fs.rmSync(target, options);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.doesNotThrow(() => vault.setMany([{ providerId: 'p_test', value: 'sk-secret' }], { ownerToken: 'owner-original' }));
  assert.equal(readLock(lockPath).ownerToken, 'owner-replaced');
  for (const entry of fs.readdirSync(dir)) {
    if (entry.includes('.lock.quarantine-')) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
});

test('应用本地保存模式默认不调用系统钥匙串，切换时会迁移已有 API Key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-vault-local-'));
  const filePath = path.join(dir, 'secrets.json');
  let encrypted = 0;
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => { encrypted += 1; return Buffer.from(`encrypted:${value}`); },
    decryptString: (value) => value.toString().slice('encrypted:'.length),
  };
  const vault = createSecretsVault({ filePath, safeStorage, fsImpl: fs, defaultStorageMode: 'local' });
  vault.set('provider_a', 'sk-local');
  assert.equal(encrypted, 0);
  assert.equal(vault.get('provider_a'), 'sk-local');
  assert.equal(vault.getStorageMode(), 'local');
  assert.match(fs.readFileSync(filePath, 'utf8'), /local:/);

  vault.setStorageMode('keychain');
  assert.equal(vault.getStorageMode(), 'keychain');
  assert.equal(vault.get('provider_a'), 'sk-local');
  assert.equal(encrypted, 1);
});

test('旧版系统钥匙串密文会如实显示为钥匙串模式，等待用户主动迁移', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-vault-legacy-mode-'));
  const filePath = path.join(dir, 'secrets.json');
  fs.writeFileSync(filePath, JSON.stringify({
    version: 1,
    secrets: { provider_a: Buffer.from('encrypted:sk-old').toString('base64') },
    providers: {},
  }));
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs, defaultStorageMode: 'local' });
  assert.equal(vault.getStorageMode(), 'keychain');
});
