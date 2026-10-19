const path = require('path');

const MAX_PENDING_FILE_BYTES = 2 * 1024 * 1024;
const MAX_RELEASE_NOTES_LENGTH = 500000;

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/i, '').slice(0, 64);
}

function normalizeReleaseNotes(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item : item?.note || ''))
      .filter(Boolean)
      .join('\n\n')
      .slice(0, MAX_RELEASE_NOTES_LENGTH);
  }
  return String(value || '').slice(0, MAX_RELEASE_NOTES_LENGTH);
}

function normalizeText(value, maxLength = 2000) {
  return String(value || '').slice(0, maxLength);
}

function normalizePendingUpdate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const version = normalizeVersion(value.version);
  if (!version) return null;
  return {
    version,
    previousVersion: normalizeVersion(value.previousVersion),
    releaseNotes: normalizeReleaseNotes(value.releaseNotes),
    releaseDate: normalizeText(value.releaseDate, 100),
    releaseUrl: normalizeText(value.releaseUrl, 2000),
    installedAt: Number(value.installedAt) || Date.now(),
  };
}

/**
 * 记录即将安装的更新，并在新版本启动后消费一次，用于展示更新完成弹窗。
 * 数据只保存在本机应用数据目录，不进入配置或备份。
 */
function createPendingUpdateStore({ filePath, fsImpl, now = Date.now }) {
  if (!filePath) throw new Error('更新状态文件路径不能为空');
  if (!fsImpl) throw new Error('更新状态文件系统不可用');

  const clear = () => {
    try { fsImpl.unlinkSync(filePath); } catch (_) {}
  };

  const read = () => {
    try {
      if (!fsImpl.existsSync(filePath)) return null;
      const stat = fsImpl.statSync(filePath);
      if (Number(stat?.size) > MAX_PENDING_FILE_BYTES) {
        clear();
        return null;
      }
      const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
      const pending = normalizePendingUpdate(parsed);
      if (!pending) clear();
      return pending;
    } catch (_) {
      clear();
      return null;
    }
  };

  const save = (update) => {
    const pending = normalizePendingUpdate({ ...update, installedAt: now() });
    if (!pending) throw new Error('更新记录格式不正确');
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${process.pid}-${now()}`;
    try {
      fsImpl.writeFileSync(tempPath, `${JSON.stringify(pending)}\n`, { encoding: 'utf8', mode: 0o600 });
      fsImpl.renameSync(tempPath, filePath);
    } catch (error) {
      try { fsImpl.unlinkSync(tempPath); } catch (_) {}
      throw error;
    }
    return pending;
  };

  const consumeForVersion = (currentVersion) => {
    const pending = read();
    if (!pending) return null;
    if (normalizeVersion(pending.version) !== normalizeVersion(currentVersion)) {
      clear();
      return null;
    }
    clear();
    return pending;
  };

  return { save, read, clear, consumeForVersion };
}

module.exports = {
  createPendingUpdateStore,
  normalizePendingUpdate,
  normalizeVersion,
};
