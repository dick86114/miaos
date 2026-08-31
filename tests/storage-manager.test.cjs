const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createStorageManager } = require('../src/main/services/storage-manager');

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-storage-'));
  const generated = path.join(home, 'generated');
  fs.mkdirSync(path.join(generated, 'nested'), { recursive: true });
  const write = (name, value) => {
    const filePath = path.join(generated, name);
    fs.writeFileSync(filePath, value);
    return filePath;
  };
  const active = write('active.png', 'active');
  const trash = write('trash.png', 'trash');
  const orphan = write('nested/orphan.webp', 'orphan');
  const changed = write('changed.jpg', 'before');
  fs.writeFileSync(changed, 'after');
  fs.mkdirSync(path.join(generated, 'directory'));
  const outside = write('outside-target.png', 'outside');
  const symlink = path.join(generated, 'linked.png');
  try { fs.symlinkSync(outside, symlink); } catch (_) {}
  return { home, generated, active, trash, orphan, changed, symlink, outside };
}

function manager(home) {
  return createStorageManager({
    fsImpl: fs,
    pathImpl: path,
    cryptoImpl: crypto,
    getUserDataPath: () => home,
  });
}

test('扫描 generated 下的普通文件并分类、统计字节，忽略符号链接和目录', async () => {
  const files = fixture();
  try {
    const result = await manager(files.home).scan({
      activeRefs: [{ path: files.active }],
      trashRefs: [{ path: files.trash }],
    });
    assert.equal(result.generatedDir, fs.realpathSync(files.generated));
    assert.deepEqual(result.files.map((item) => item.name).sort(), ['active.png', 'changed.jpg', 'orphan.webp', 'outside-target.png', 'trash.png']);
    const byName = Object.fromEntries(result.files.map((item) => [item.name, item]));
    assert.equal(byName['active.png'].category, 'active');
    assert.deepEqual(byName['active.png'].referencedBy, ['active']);
    assert.equal(byName['trash.png'].category, 'trash');
    assert.deepEqual(byName['trash.png'].referencedBy, ['trash']);
    assert.equal(byName['orphan.webp'].category, 'orphan');
    assert.deepEqual(byName['orphan.webp'].referencedBy, []);
    assert.equal(byName['active.png'].extension, '.png');
    assert.equal(byName['active.png'].checksum, crypto.createHash('sha256').update('active').digest('hex'));
    assert.equal(result.totals.files, 5);
    assert.equal(result.totals.bytes, 6 + 5 + 6 + 7 + 5);
    assert.equal(result.totals.byCategory.active.bytes, 6);
    assert.equal(result.totals.byCategory.trash.bytes, 5);
    assert.equal(result.totals.byCategory.orphan.bytes, 6 + 5 + 7);
  } finally {
    fs.rmSync(files.home, { recursive: true, force: true });
  }
});

test('删除逐文件校验 generated 边界、符号链接和 checksum，并继续处理后续文件', async () => {
  const files = fixture();
  const expected = crypto.createHash('sha256').update('active').digest('hex');
  const activeCanonical = fs.realpathSync(files.active);
  const orphanCanonical = fs.realpathSync(files.orphan);
  try {
    const result = await manager(files.home).deleteFiles([
      { path: files.active, checksum: expected },
      { path: files.trash, checksum: '错误 checksum' },
      { path: files.symlink },
      { path: path.join(files.home, 'elsewhere.png') },
      { path: path.join(files.generated, 'missing.png') },
      { path: files.orphan },
    ]);
    assert.deepEqual(result.deleted.map((item) => item.path), [activeCanonical, orphanCanonical]);
    assert.deepEqual(result.missing.map((item) => item.path), [path.join(files.generated, 'missing.png')]);
    assert.equal(result.failed.length, 3);
    assert.equal(fs.existsSync(files.active), false);
    assert.equal(fs.existsSync(files.orphan), false);
    assert.equal(fs.existsSync(files.trash), true);
    assert.match(result.failed.find((item) => item.path.endsWith('/trash.png')).error, /checksum/i);
  } finally {
    fs.rmSync(files.home, { recursive: true, force: true });
  }
});

test('generated 根目录被替换为符号链接时拒绝扫描和删除', async () => {
  const files = fixture();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-external-'));
  try {
    fs.rmSync(files.generated, { recursive: true, force: true });
    fs.symlinkSync(external, files.generated);
    await assert.rejects(() => manager(files.home).scan({ activeRefs: [], trashRefs: [] }));
    const result = await manager(files.home).deleteFiles([{ path: path.join(files.generated, 'x.png') }]);
    assert.equal(result.deleted.length, 0);
    assert.equal(result.missing.length, 0);
    assert.equal(result.failed.length, 1);
  } finally {
    fs.rmSync(files.home, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  }
});

test('删除前重新检查身份，文件被替换为符号链接时拒绝删除', async () => {
  const files = fixture();
  let candidateChecks = 0;
  const raceFs = new Proxy(fs, {
    get(target, property) {
      if (property !== 'lstatSync') return Reflect.get(target, property);
      return (filePath, ...args) => {
        const stat = target.lstatSync(filePath, ...args);
        if (filePath === files.active) {
          candidateChecks += 1;
          if (candidateChecks === 2) {
            fs.unlinkSync(files.active);
            fs.symlinkSync(files.outside, files.active);
            return target.lstatSync(filePath, ...args);
          }
        }
        return stat;
      };
    },
  });
  try {
    const result = await createStorageManager({ fsImpl: raceFs, pathImpl: path, cryptoImpl: crypto, getUserDataPath: () => files.home })
      .deleteFiles([{ path: files.active }]);
    assert.equal(result.deleted.length, 0);
    assert.equal(result.missing.length, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].code, 'STORAGE_FILE_SYMLINK_NOT_ALLOWED');
  } finally {
    fs.rmSync(files.home, { recursive: true, force: true });
  }
});

test('通过初次 lstat 后在 realpath 前消失的文件归入 missing', async () => {
  const files = fixture();
  const originalRealpath = fs.realpathSync;
  const raceFs = new Proxy(fs, {
    get(target, property) {
      if (property !== 'realpathSync') return Reflect.get(target, property);
      return (filePath, ...args) => {
        if (filePath === files.active) fs.unlinkSync(filePath);
        return originalRealpath.call(target, filePath, ...args);
      };
    },
  });
  try {
    const result = await createStorageManager({ fsImpl: raceFs, pathImpl: path, cryptoImpl: crypto, getUserDataPath: () => files.home })
      .deleteFiles([{ path: files.active }]);
    assert.deepEqual(result.deleted, []);
    assert.deepEqual(result.missing, [{ path: files.active }]);
    assert.deepEqual(result.failed, []);
  } finally {
    fs.rmSync(files.home, { recursive: true, force: true });
  }
});

test('隔离后 unlink 前对象被替换时不得删除替换对象', async () => {
  const files = fixture();
  const activeCanonical = fs.realpathSync(files.active);
  let quarantinePath = null;
  const raceFs = new Proxy(fs, {
    get(target, property) {
      if (property === 'renameSync') {
        return (from, to, ...args) => {
          const result = target.renameSync(from, to, ...args);
          if (from === activeCanonical) {
            quarantinePath = to;
            fs.unlinkSync(quarantinePath);
            fs.symlinkSync(files.outside, quarantinePath);
          }
          return result;
        };
      }
      return Reflect.get(target, property);
    },
  });
  try {
    const result = await createStorageManager({ fsImpl: raceFs, pathImpl: path, cryptoImpl: crypto, getUserDataPath: () => files.home })
      .deleteFiles([{ path: files.active }]);
    assert.equal(result.deleted.length, 0);
    assert.equal(result.missing.length, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].code, 'STORAGE_FILE_SYMLINK_NOT_ALLOWED');
    assert.equal(fs.existsSync(files.outside), true);
    assert.equal(fs.readFileSync(files.outside, 'utf8'), 'outside');
    assert.equal(fs.existsSync(files.active), false);
    assert.equal(quarantinePath.startsWith(path.join(fs.realpathSync(files.generated), '.miaos-quarantine-')), true);
  } finally {
    fs.rmSync(files.home, { recursive: true, force: true });
  }
});

test('beforeUnlink hook 替换为另一普通文件时拒绝删除或恢复替换对象', async () => {
  const files = fixture();
  let quarantinePath = null;
  const replacement = path.join(files.generated, 'replacement.bin');
  fs.writeFileSync(replacement, 'replacement-object');
  const managerWithHook = createStorageManager({
    fsImpl: fs,
    pathImpl: path,
    cryptoImpl: crypto,
    getUserDataPath: () => files.home,
    beforeUnlink: ({ path: isolatedPath }) => {
      quarantinePath = isolatedPath;
      fs.unlinkSync(isolatedPath);
      fs.copyFileSync(replacement, isolatedPath);
    },
  });
  try {
    const result = await managerWithHook.deleteFiles([{ path: files.active }]);
    assert.equal(result.deleted.length, 0);
    assert.equal(result.missing.length, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].code, 'STORAGE_FILE_REPLACED');
    assert.equal(fs.existsSync(files.active), false);
    assert.equal(fs.existsSync(replacement), true);
    assert.equal(fs.readFileSync(replacement, 'utf8'), 'replacement-object');
    assert.equal(fs.existsSync(quarantinePath), true);
    assert.equal(fs.readFileSync(quarantinePath, 'utf8'), 'replacement-object');
  } finally {
    fs.rmSync(files.home, { recursive: true, force: true });
  }
});
