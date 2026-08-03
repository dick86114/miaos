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
  assert.deepEqual(JSON.parse(readFileSync(filePath, 'utf8')), {});
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

  assert.deepEqual(calls.map(([name]) => name), ['write', 'fsync', 'rename']);
  assert.equal(calls[0][1], `${filePath}.tmp`);
  assert.equal(calls[2][1], `${filePath}.tmp`);
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
