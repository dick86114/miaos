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

  assert.deepEqual(calls.map(([name]) => name), ['write', 'fsync', 'rename', 'fsync']);
  assert.match(calls[0][1], new RegExp(`^${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.tmp-[a-f0-9]+$`));
  assert.equal(calls[2][1], calls[0][1]);
  assert.equal(calls[2][2], filePath);
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
  assert.equal(calls.filter(([name]) => name === 'fsync').length, 2);
  assert.ok(calls.some(([name, from, to]) => name === 'rename' && to === filePath));

  fs.writeFileSync(`${filePath}.lock`, 'busy');
  assert.throws(() => vault.set('p_other', 'sk-other'), (error) => error.code === 'SECRET_VAULT_LOCKED');
});
