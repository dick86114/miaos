const nodeCrypto = require('crypto');
const nodeFs = require('fs');
const nodePath = require('path');
const QUARANTINE_PREFIX = '.miaos-quarantine-';

function createStorageError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createStorageManager({
  fsImpl = nodeFs,
  pathImpl = nodePath,
  cryptoImpl = nodeCrypto,
  getUserDataPath,
  beforeUnlink = null,
} = {}) {
  if (typeof getUserDataPath !== 'function') throw new TypeError('缺少 getUserDataPath');
  let quarantineSequence = 0;

  function isWithin(candidate, parent, allowParent = false) {
    const relative = pathImpl.relative(parent, candidate);
    return (allowParent && relative === '') || (relative && !relative.startsWith('..') && !pathImpl.isAbsolute(relative));
  }

  function generatedRoot() {
    const lexicalRoot = pathImpl.resolve(getUserDataPath(), 'generated');
    let stat;
    try { stat = fsImpl.lstatSync(lexicalRoot); } catch (error) {
      throw createStorageError('应用生成目录不存在', 'STORAGE_ROOT_NOT_ALLOWED');
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw createStorageError('应用生成目录不是可信目录', 'STORAGE_ROOT_NOT_ALLOWED');
    }
    let canonicalRoot;
    try { canonicalRoot = fsImpl.realpathSync(lexicalRoot); } catch (_) {
      throw createStorageError('应用生成目录无法解析', 'STORAGE_ROOT_NOT_ALLOWED');
    }
    return { lexicalRoot, canonicalRoot };
  }

  function normalizePath(value) {
    const raw = typeof value === 'string' ? value : value && value.path;
    if (typeof raw !== 'string' || !raw || raw.startsWith('file://')) return null;
    return pathImpl.resolve(raw);
  }

  function normalizedReferences(values, root) {
    const result = new Map();
    const list = values instanceof Set ? [...values] : (Array.isArray(values) ? values : []);
    for (const value of list) {
      const candidate = normalizePath(value);
      if (!candidate || !isWithin(candidate, root.lexicalRoot, false)) continue;
      let canonical = candidate;
      try {
        const stat = fsImpl.lstatSync(candidate);
        if (stat.isSymbolicLink() || !stat.isFile()) continue;
        canonical = fsImpl.realpathSync(candidate);
      } catch (_) {
        // 缺失引用仍保留词法路径，便于扫描结果正确显示为未命中。
      }
      if (!isWithin(canonical, root.canonicalRoot, false)) continue;
      const categories = result.get(canonical) || new Set();
      const category = value && typeof value === 'object' && value.category;
      if (category === 'active' || category === 'trash') categories.add(category);
      else if (value && typeof value === 'object' && value.referencedBy) {
        for (const item of [].concat(value.referencedBy)) if (item === 'active' || item === 'trash') categories.add(item);
      } else {
        categories.add('active');
      }
      result.set(canonical, categories);
    }
    return result;
  }

  function checksum(buffer) {
    return cryptoImpl.createHash('sha256').update(buffer).digest('hex');
  }

  function stableFile(filePath) {
    const before = fsImpl.lstatSync(filePath);
    if (before.isSymbolicLink() || !before.isFile()) return null;
    const buffer = fsImpl.readFileSync(filePath);
    const after = fsImpl.lstatSync(filePath);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || buffer.length !== after.size) {
      throw createStorageError('文件在读取过程中发生变化', 'STORAGE_FILE_REPLACED');
    }
    return { stat: after, checksum: checksum(buffer) };
  }

  function sameIdentity(left, right) {
    return left.dev === right.dev
      && left.ino === right.ino
      && left.size === right.size
      && left.mtimeMs === right.mtimeMs;
  }

  async function scan({ activeRefs = [], trashRefs = [] } = {}) {
    const root = generatedRoot();
    const references = new Map();
    for (const [filePath, categories] of normalizedReferences(activeRefs, root)) references.set(filePath, new Set(categories));
    for (const [filePath, categories] of normalizedReferences(trashRefs, root)) {
      const current = references.get(filePath) || new Set();
      current.add('trash');
      references.set(filePath, current);
    }

    const files = [];
    const visit = (directory) => {
      let entries;
      try { entries = fsImpl.readdirSync(directory, { withFileTypes: true }); } catch (error) {
        throw createStorageError('无法读取应用生成目录', 'STORAGE_SCAN_FAILED');
      }
      for (const entry of entries) {
        if (entry.name.startsWith(QUARANTINE_PREFIX)) continue;
        const candidate = pathImpl.join(directory, entry.name);
        let stat;
        try { stat = fsImpl.lstatSync(candidate); } catch (_) { continue; }
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
          visit(candidate);
          continue;
        }
        if (!stat.isFile()) continue;
        const canonical = fsImpl.realpathSync(candidate);
        if (!isWithin(canonical, root.canonicalRoot, false)) continue;
        const metadata = stableFile(canonical);
        if (!metadata) continue;
        const referencedBy = [...(references.get(canonical) || [])].sort();
        const category = referencedBy.includes('active') ? 'active' : (referencedBy.includes('trash') ? 'trash' : 'orphan');
        files.push({
          path: canonical,
          name: pathImpl.basename(canonical),
          extension: pathImpl.extname(canonical),
          size: metadata.stat.size,
          mtimeMs: metadata.stat.mtimeMs,
          checksum: metadata.checksum,
          category,
          referencedBy,
        });
      }
    };
    visit(root.canonicalRoot);
    files.sort((left, right) => left.path.localeCompare(right.path));
    const byCategory = {
      active: { files: 0, bytes: 0 },
      trash: { files: 0, bytes: 0 },
      orphan: { files: 0, bytes: 0 },
    };
    for (const file of files) {
      byCategory[file.category].files += 1;
      byCategory[file.category].bytes += file.size;
    }
    return {
      generatedDir: root.canonicalRoot,
      totals: {
        files: files.length,
        bytes: files.reduce((sum, file) => sum + file.size, 0),
        byCategory,
      },
      files,
    };
  }

  function failure(path, error) {
    return { path, error: error && error.message ? error.message : '文件删除失败', code: error && error.code };
  }

  function createQuarantinePath(root, originalPath) {
    const base = pathImpl.basename(originalPath);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      quarantineSequence += 1;
      const suffix = `${Date.now().toString(36)}-${quarantineSequence.toString(36)}`;
      const candidate = pathImpl.join(root.canonicalRoot, `${QUARANTINE_PREFIX}${suffix}-${base}`);
      try { fsImpl.lstatSync(candidate); } catch (error) {
        if (error && error.code === 'ENOENT') return candidate;
        throw error;
      }
    }
    throw createStorageError('无法创建安全隔离文件名', 'STORAGE_QUARANTINE_FAILED');
  }

  async function deleteFiles(fileRefs = []) {
    let root;
    try { root = generatedRoot(); } catch (error) {
      return { deleted: [], missing: [], failed: (Array.isArray(fileRefs) ? fileRefs : []).map((ref) => failure(normalizePath(ref) || String(ref && ref.path || ''), error)) };
    }
    const deleted = [];
    const missing = [];
    const failed = [];
    for (const ref of Array.isArray(fileRefs) ? fileRefs : []) {
      const candidate = normalizePath(ref);
      if (!candidate || !isWithin(candidate, root.lexicalRoot, false)) {
        failed.push(failure(candidate || String(ref && ref.path || ''), createStorageError('文件路径不在应用生成目录内', 'STORAGE_PATH_NOT_ALLOWED')));
        continue;
      }
      let stat;
      try { stat = fsImpl.lstatSync(candidate); } catch (error) {
        if (error && error.code === 'ENOENT') missing.push({ path: candidate });
        else failed.push(failure(candidate, error));
        continue;
      }
      if (stat.isSymbolicLink()) {
        failed.push(failure(candidate, createStorageError('不允许删除符号链接文件', 'STORAGE_FILE_SYMLINK_NOT_ALLOWED')));
        continue;
      }
      if (!stat.isFile()) {
        failed.push(failure(candidate, createStorageError('只能删除普通文件', 'STORAGE_FILE_NOT_REGULAR')));
        continue;
      }
      let canonical;
      try { canonical = fsImpl.realpathSync(candidate); } catch (error) {
        if (error && error.code === 'ENOENT') missing.push({ path: candidate });
        else failed.push(failure(candidate, error));
        continue;
      }
      if (!isWithin(canonical, root.canonicalRoot, false)) {
        failed.push(failure(candidate, createStorageError('文件路径不在应用生成目录内', 'STORAGE_PATH_NOT_ALLOWED')));
        continue;
      }
      let quarantinePath = null;
      let savedQuarantineStat = null;
      let savedQuarantineChecksum = null;
      let finalChecksum = null;
      try {
        const metadata = stableFile(canonical);
        const expected = ref && typeof ref === 'object' ? (ref.checksum || ref.sha256) : null;
        if (expected && expected !== metadata.checksum) throw createStorageError('文件 checksum 不匹配', 'STORAGE_CHECKSUM_MISMATCH');
        // unlink 前再次从词法路径检查类型、规范路径和身份，缩短替换竞态窗口。
        let finalStat;
        try { finalStat = fsImpl.lstatSync(candidate); } catch (error) {
          if (error && error.code === 'ENOENT') { missing.push({ path: candidate }); continue; }
          throw error;
        }
        if (finalStat.isSymbolicLink()) throw createStorageError('不允许删除符号链接文件', 'STORAGE_FILE_SYMLINK_NOT_ALLOWED');
        if (!finalStat.isFile()) throw createStorageError('只能删除普通文件', 'STORAGE_FILE_NOT_REGULAR');
        let finalCanonical;
        try { finalCanonical = fsImpl.realpathSync(candidate); } catch (error) {
          if (error && error.code === 'ENOENT') { missing.push({ path: candidate }); continue; }
          throw error;
        }
        if (!isWithin(finalCanonical, root.canonicalRoot, false)) throw createStorageError('文件路径不在应用生成目录内', 'STORAGE_PATH_NOT_ALLOWED');
        if (!sameIdentity(metadata.stat, finalStat)) throw createStorageError('文件在删除前已被替换', 'STORAGE_FILE_REPLACED');
        const finalBuffer = fsImpl.readFileSync(finalCanonical);
        const afterFinalRead = fsImpl.lstatSync(finalCanonical);
        finalChecksum = checksum(finalBuffer);
        if (!sameIdentity(finalStat, afterFinalRead) || finalBuffer.length !== afterFinalRead.size || finalChecksum !== metadata.checksum) {
          throw createStorageError('文件在删除前已被替换', 'STORAGE_FILE_REPLACED');
        }
        if (expected && expected !== finalChecksum) throw createStorageError('文件 checksum 不匹配', 'STORAGE_CHECKSUM_MISMATCH');
        quarantinePath = createQuarantinePath(root, finalCanonical);
        try {
          fsImpl.renameSync(finalCanonical, quarantinePath);
        } catch (error) {
          if (error && error.code === 'ENOENT') { missing.push({ path: candidate }); continue; }
          throw error;
        }
        let quarantineStat;
        try { quarantineStat = fsImpl.lstatSync(quarantinePath); } catch (error) {
          if (error && error.code === 'ENOENT') { missing.push({ path: candidate }); continue; }
          throw error;
        }
        if (quarantineStat.isSymbolicLink()) throw createStorageError('隔离文件不允许是符号链接', 'STORAGE_FILE_SYMLINK_NOT_ALLOWED');
        if (!quarantineStat.isFile()) throw createStorageError('隔离文件必须是普通文件', 'STORAGE_FILE_NOT_REGULAR');
        savedQuarantineStat = quarantineStat;
        const quarantineCanonical = fsImpl.realpathSync(quarantinePath);
        if (!isWithin(quarantineCanonical, root.canonicalRoot, false)) throw createStorageError('隔离文件路径不在应用生成目录内', 'STORAGE_PATH_NOT_ALLOWED');
        if (!sameIdentity(finalStat, quarantineStat)) throw createStorageError('文件在隔离后已被替换', 'STORAGE_FILE_REPLACED');
        const quarantineBuffer = fsImpl.readFileSync(quarantineCanonical);
        const afterQuarantineRead = fsImpl.lstatSync(quarantineCanonical);
        const quarantineChecksum = checksum(quarantineBuffer);
        savedQuarantineChecksum = quarantineChecksum;
        if (!sameIdentity(quarantineStat, afterQuarantineRead) || quarantineBuffer.length !== afterQuarantineRead.size || quarantineChecksum !== finalChecksum) {
          throw createStorageError('文件在隔离后已被替换', 'STORAGE_FILE_REPLACED');
        }
        if (typeof beforeUnlink === 'function') await beforeUnlink({ path: quarantinePath, originalPath: finalCanonical });
        // 最后一轮检查只针对隔离路径；原始目录项已被 rename 原子摘除。
        const beforeUnlinkStat = fsImpl.lstatSync(quarantinePath);
        if (beforeUnlinkStat.isSymbolicLink()) throw createStorageError('隔离文件不允许是符号链接', 'STORAGE_FILE_SYMLINK_NOT_ALLOWED');
        if (!beforeUnlinkStat.isFile() || !sameIdentity(quarantineStat, beforeUnlinkStat)) throw createStorageError('文件在删除前已被替换', 'STORAGE_FILE_REPLACED');
        fsImpl.unlinkSync(quarantinePath);
        deleted.push({ path: finalCanonical, checksum: quarantineChecksum });
      } catch (error) {
        if (error && error.code === 'ENOENT') missing.push({ path: canonical });
        else {
          failed.push(failure(canonical, error));
          // 仅在隔离文件仍是可信普通文件且原始路径为空时尝试恢复；不恢复可疑替换对象。
          if (quarantinePath) {
            try {
              const quarantined = fsImpl.lstatSync(quarantinePath);
              const originalMissing = (() => { try { fsImpl.lstatSync(canonical); return false; } catch (restoreError) { return restoreError && restoreError.code === 'ENOENT'; } })();
              if (originalMissing && quarantined.isFile() && !quarantined.isSymbolicLink() && savedQuarantineStat && sameIdentity(savedQuarantineStat, quarantined)) {
                const restoreBuffer = fsImpl.readFileSync(quarantinePath);
                const restoreAfterStat = fsImpl.lstatSync(quarantinePath);
                const restoreChecksum = checksum(restoreBuffer);
                if (sameIdentity(quarantined, restoreAfterStat) && restoreChecksum === savedQuarantineChecksum && restoreChecksum === finalChecksum) {
                  fsImpl.renameSync(quarantinePath, canonical);
                }
              }
            } catch (_) {
              // 保留隔离文件，避免恢复一个已被替换的对象。
            }
          }
        }
      }
    }
    return { deleted, missing, failed };
  }

  return { scan, deleteFiles };
}

module.exports = { createStorageManager };
