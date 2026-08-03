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
  assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), { version: 1, secrets: {}, providers: {} });
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

  assert.deepEqual(calls.map(([name]) => name), ['write', 'fsync', 'write', 'fsync', 'rename', 'fsync']);
  assert.match(calls[2][1], new RegExp(`^${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.tmp-[a-f0-9]+$`));
  assert.equal(calls[4][1], calls[2][1]);
  assert.equal(calls[4][2], filePath);
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
      if (String(target).includes('.tmp-')) throw new Error('写入失败');
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
  assert.equal(calls.filter(([name]) => name === 'fsync').length, 3);
  assert.ok(calls.some(([name, from, to]) => name === 'rename' && to === filePath));

  fs.writeFileSync(`${filePath}.lock`, 'busy');
  assert.throws(() => vault.set('p_other', 'sk-other'), (error) => error.code === 'SECRET_VAULT_LOCKED');
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
  fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ ownerToken: 'owner-dead', pid: 999999, createdAt: Date.now() - 10 * 60 * 1000 }));
  vault.set('p_test', 'sk-secret');
  assert.equal(existsSync(`${filePath}.lock`), false);

  fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ ownerToken: 'owner-live', pid: process.pid, createdAt: Date.now() - 10 * 60 * 1000 }));
  assert.throws(() => vault.set('p_other', 'sk-other'), (error) => error.code === 'SECRET_VAULT_LOCKED');
  fs.unlinkSync(`${filePath}.lock`);
});

test('lock 释放失败不会被吞掉，已写入状态以明确不确定错误返回', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-lock-release-'));
  const filePath = path.join(dir, 'secrets.json');
  const fsImpl = {
    ...fs,
    unlinkSync(target) {
      if (target === `${filePath}.lock`) throw Object.assign(new Error('锁删除失败'), { code: 'EACCES' });
      return fs.unlinkSync(target);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.throws(() => vault.set('p_test', 'sk-secret'), (error) => error.code === 'SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED');
  assert.equal(vault.get('p_test'), 'sk-secret');
  fs.unlinkSync(`${filePath}.lock`);
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


test('lock close 失败不会被吞掉且仍尝试清理 lock 文件', () => {
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
  fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ ownerToken, pid: process.pid, createdAt: Date.now() }));
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs });
  vault.setMany([{ providerId: 'p_test', value: 'sk-secret' }], { ownerToken });
  assert.equal(existsSync(`${filePath}.lock`), false);

  fs.writeFileSync(`${filePath}.lock`, JSON.stringify({ ownerToken: 'owner-other', pid: process.pid, createdAt: Date.now() }));
  assert.throws(() => vault.setMany([{ providerId: 'p_other', value: 'sk-other' }], { ownerToken: 'owner-transaction-b' }), (error) => error.code === 'SECRET_VAULT_LOCKED');
  assert.equal(JSON.parse(readFileSync(`${filePath}.lock`, 'utf8')).ownerToken, 'owner-other');
  fs.unlinkSync(`${filePath}.lock`);
});

test('空或截断 lock 超过 TTL 后按 mtime 回收，检查后被替换的新活锁不会误删', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-lock-race-'));
  const filePath = path.join(dir, 'secrets.json');
  const lockPath = `${filePath}.lock`;
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl: fs });
  fs.writeFileSync(lockPath, '{');
  const old = new Date(Date.now() - 10 * 60 * 1000);
  fs.utimesSync(lockPath, old, old);
  vault.set('p_stale', 'sk-stale');
  assert.equal(existsSync(lockPath), false);

  fs.writeFileSync(lockPath, '{');
  fs.utimesSync(lockPath, old, old);
  let lockReads = 0;
  const fsImpl = {
    ...fs,
    readFileSync(target, encoding) {
      if (target === lockPath && ++lockReads === 2) {
        fs.writeFileSync(lockPath, JSON.stringify({ ownerToken: 'owner-race', pid: process.pid, createdAt: Date.now() }));
      }
      return fs.readFileSync(target, encoding);
    },
  };
  const racingVault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.throws(() => racingVault.set('p_race', 'sk-race'), (error) => error.code === 'SECRET_VAULT_LOCKED');
  assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).ownerToken, 'owner-race');
  fs.unlinkSync(lockPath);
});

test('release compare/recheck 不会删除检查后替换为其他 owner 的新 lock', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'miaos-secrets-release-race-'));
  const filePath = path.join(dir, 'secrets.json');
  const lockPath = `${filePath}.lock`;
  let lockReads = 0;
  const fsImpl = {
    ...fs,
    readFileSync(target, encoding) {
      if (target === lockPath && ++lockReads === 3) {
        fs.writeFileSync(lockPath, JSON.stringify({ ownerToken: 'owner-replaced', pid: process.pid, createdAt: Date.now() }));
      }
      return fs.readFileSync(target, encoding);
    },
  };
  const vault = createSecretsVault({ filePath, safeStorage: createSafeStorage(), fsImpl });
  assert.throws(() => vault.setMany([{ providerId: 'p_test', value: 'sk-secret' }], { ownerToken: 'owner-original' }), (error) => error.code === 'SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED');
  assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).ownerToken, 'owner-replaced');
  fs.unlinkSync(lockPath);
});
