const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, safeStorage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { autoUpdater } = require('electron-updater');
const { resolveAppDataPath } = require('./src/main/app-data');
const {
  validateString,
  validateHttpUrl,
  validateRepoSlug,
  validateDataUrl,
  validateSuggestedName,
} = require('./src/main/security/validators');
const { registerSecureHandler } = require('./src/main/security/ipc');
const { isAllowedExternalUrl } = require('./src/main/security/external-links');
const { requestJson } = require('./src/main/services/http-client');
const { createImageFileAccess } = require('./src/main/security/image-files');
const { createImageDecoder } = require('./src/main/security/image-decoder');
const { createSecretsVault } = require('./src/main/secrets-vault');
const { assertProviderId } = require('./src/main/provider-id');
const { getRuntimeSecurityConfig } = require('./src/main/runtime-security');
const { buildAipingImageRequest } = require('./src/main/services/aiping-image-adapter');
const crypto = require('crypto');

let mainWindow = null;
let updateInfoCache = null;
let secretsVault = null;
const providerTransactions = new Map();
const decodeImageBuffer = createImageDecoder({ nativeImageImpl: nativeImage });
const imageFileAccess = createImageFileAccess({
  fsImpl: fs,
  pathImpl: path,
  getUserDataPath: () => app.getPath('userData'),
  decodeImageBuffer,
});

// GitHub Release 页面地址
const RELEASE_URL = 'https://github.com/dick86114/miaos/releases/latest';

// ===== 自动更新初始化（仅检测，不自动下载/安装） =====
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  // 默认绑定到 dick86114/miaos GitHub 仓库
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'dick86114',
      repo: 'miaos',
      releaseType: 'release',
    });
  } catch (_) {}

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('checking', { info: '正在检查更新…' });
  });

  autoUpdater.on('update-available', (info) => {
    updateInfoCache = info;
    sendUpdateStatus('available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    updateInfoCache = info;
    sendUpdateStatus('not-available', {
      version: info?.version || app.getVersion(),
    });
  });

  autoUpdater.on('error', (err) => {
    sendUpdateStatus('error', {
      message: err && err.message ? err.message : '更新时发生未知错误',
    });
  });
}

function sendUpdateStatus(state, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update-status', { state, ...payload });
}

// ===== 对外更新 API =====
registerSecureHandler({
  ipcMain,
  channel: 'update-get-current-version',
  getMainWindow: () => mainWindow,
  validate: () => {},
  handle: () => {
  return {
    version: app.getVersion(),
    name: '妙生',
    isPackaged: !!app.isPackaged,
  };
  },
});

registerSecureHandler({
  ipcMain,
  channel: 'update-check',
  getMainWindow: () => mainWindow,
  validate: () => {},
  handle: async () => {
  if (!app.isPackaged) {
    return { ok: false, error: '开发环境不支持自动更新，请打包后使用' };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || '检查更新失败' };
  }
  },
});

// 打开 GitHub Release 页面，由用户手动下载安装
registerSecureHandler({
  ipcMain,
  channel: 'update-open-release-page',
  getMainWindow: () => mainWindow,
  validate: () => {},
  handle: async () => {
  try {
    if (!isAllowedExternalUrl(RELEASE_URL)) {
      return { ok: false, error: '发布页面地址不受信任' };
    }
    await shell.openExternal(RELEASE_URL);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || '打开页面失败' };
  }
  },
});

// 动态配置更新源（owner/repo），允许用户自定义 GitHub 仓库
registerSecureHandler({
  ipcMain,
  channel: 'update-configure',
  getMainWindow: () => mainWindow,
  validate: (opts) => {
    if (opts === undefined || opts === null) return;
    if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw new Error('更新配置格式不正确');
    const { owner, repo } = opts;
    if (!owner && !repo) return;
    validateRepoSlug(`${validateString(owner, { field: '仓库 owner', minLength: 1, maxLength: 200, trim: true })}/${validateString(repo, { field: '仓库 repo', minLength: 1, maxLength: 200, trim: true })}`);
  },
  handle: async (_event, opts) => {
  try {
    const { owner, repo } = opts || {};
    if (owner && repo) {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: String(owner).trim(),
        repo: String(repo).trim(),
        releaseType: 'release',
      });
    } else {
      // 使用 package.json 中的默认 publish 配置（electron-updater 会自动读取 app-update.yml）
      autoUpdater.setFeedURL(autoUpdater.currentVersionString ? '' : undefined);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || '配置更新源失败' };
  }
  },
});

// 使用独立的应用数据目录。若目录不可写，立即阻止启动，避免静默降级到临时目录导致数据丢失。
let shouldStartApp = true;
const homePath = app.getPath('home');
let userDataPath = null;
try {
  userDataPath = resolveAppDataPath({ homePath, fsImpl: fs });
} catch (error) {
  if (!error || error.code !== 'APP_DATA_UNWRITABLE') {
    throw error;
  }
  shouldStartApp = false;
  process.exitCode = 1;
  dialog.showErrorBox('妙生无法启动', '应用数据目录不可写，请检查 ~/.miaos 权限。');
  app.exit(1);
}

if (!shouldStartApp) {
  // 启动前数据目录不可写属于安全边界错误，退出后不再注册 IPC 或创建窗口。
  return;
}
app.setPath('userData', userDataPath);
secretsVault = createSecretsVault({
  filePath: path.join(userDataPath, 'secrets.json'),
  safeStorage,
  fsImpl: fs,
});

// 默认面向 macOS 12+ Apple Silicon 启用 sandbox 和硬件加速。
// 仅当用户明确设置 MIAOS_LEGACY_RENDERER=1 时，才为历史环境临时降级。
const runtimeSecurityConfig = getRuntimeSecurityConfig(process.env);
if (runtimeSecurityConfig.disableHardwareAcceleration) {
  app.disableHardwareAcceleration();
}
if (runtimeSecurityConfig.appendNoSandbox) {
  app.commandLine.appendSwitch('no-sandbox');
}

// 加载应用图标（兼容开发环境与打包后路径）
function loadAppIcon() {
  const candidates = [];
  if (app.isPackaged) {
    // 打包后：icon.icns 位于 Contents/Resources/（app.asar 外部）
    candidates.push(path.join(process.resourcesPath, 'icon.icns'));
  } else {
    // 开发环境
    candidates.push(path.join(__dirname, 'build', 'icon.icns'));
  }
  candidates.push(path.join(__dirname, 'src', 'assets', 'logo.png'));

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img;
      }
    } catch {}
  }
  return null;
}

function createWindow() {
  const icon = loadAppIcon();
  // 根据系统偏好设置初始背景色，避免深色模式下白闪
  const bg = (nativeTheme && nativeTheme.shouldUseDarkColors) ? '#111827' : '#f5f5f7';

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: bg,
    title: '妙生',
    fullscreenable: true,
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: runtimeSecurityConfig.sandbox,
      spellcheck: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // 设置 Dock 图标（macOS）
  if (process.platform === 'darwin' && icon) {
    app.dock.setIcon(icon);
  }

  // 打开外部链接在系统浏览器中
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
}


function validateObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field}格式不正确`);
  }
  return value;
}

function validateOptionalString(value, field, options = {}) {
  if (value === undefined || value === null || value === '') return;
  return validateString(value, { field, ...options });
}

function validateProviderId(providerId) {
  validateString(providerId, { field: '供应商 ID', minLength: 1, maxLength: 128, trim: true });
  try {
    return assertProviderId(providerId);
  } catch (error) {
    error.code = 'IPC_VALIDATION_FAILED';
    throw error;
  }
}

function validateModels(models, field) {
  if (!Array.isArray(models) || models.length > 500) throw new Error(`${field}格式不正确`);
  return models.map((model) => {
    validateObject(model, field);
    const id = validateString(model.id, { field: '模型', minLength: 1, maxLength: 200, trim: true });
    validateOptionalString(model.name, '模型名称', { maxLength: 200, trim: true });
    if (typeof model.enabled !== 'boolean') throw new Error('模型启用状态必须是布尔值');
    return { id, name: model.name || id, enabled: model.enabled };
  });
}

function normalizeProviderMetadata(metadata) {
  validateObject(metadata, '供应商元数据');
  const id = validateProviderId(metadata.id);
  const endpoint = validateHttpUrl(metadata.endpoint);
  const type = validateString(metadata.type, { field: '供应商类型', minLength: 1, maxLength: 200, trim: true });
  const name = validateOptionalString(metadata.name, '供应商名称', { maxLength: 200, trim: true }) || '';
  if (!Array.isArray(metadata.capabilities) || metadata.capabilities.some((item) => !['image', 'text', 'video'].includes(item))) {
    throw new Error('供应商能力格式不正确');
  }
  return {
    id, name, type, endpoint,
    capabilities: [...new Set(metadata.capabilities)],
    imageModels: validateModels(metadata.imageModels || [], '生图模型'),
    textModels: validateModels(metadata.textModels || [], '文本模型'),
    videoModels: validateModels(metadata.videoModels || [], '视频模型'),
  };
}

function isBindingChanged(previous, next) {
  return !!previous && (previous.endpoint !== next.endpoint || previous.type !== next.type);
}

function getTrustedProvider(providerId, supplied = {}, { category, modelName } = {}) {
  const metadata = secretsVault.getProviderMetadata(providerId);
  if (!metadata) throw new Error('该供应商尚未安全保存配置');
  if (supplied.endpoint !== undefined && validateHttpUrl(supplied.endpoint) !== metadata.endpoint) {
    throw new Error('供应商 API 地址与已保存配置不一致');
  }
  const suppliedType = supplied.type || supplied.provider;
  if (suppliedType !== undefined && String(suppliedType).trim() !== metadata.type) {
    throw new Error('供应商类型与已保存配置不一致');
  }
  if (category && modelName) {
    const models = metadata[`${category}Models`] || [];
    if (!models.some((model) => model.id === modelName && model.enabled)) {
      throw new Error('所选模型未在已保存供应商中启用');
    }
  }
  return { ...metadata, apiKey: secretsVault.get(providerId) || '' };
}

function validateProvider(provider, { allowApiKeyOverride = false } = {}) {
  validateObject(provider, '供应商');
  const hasProviderId = provider.providerId !== undefined && provider.providerId !== null && provider.providerId !== '';
  if (hasProviderId) validateProviderId(provider.providerId);
  if (provider.endpoint !== undefined) validateHttpUrl(provider.endpoint);
  if (provider.type !== undefined) validateOptionalString(provider.type, '供应商类型', { maxLength: 200, trim: true });
  if (provider.provider !== undefined) validateOptionalString(provider.provider, '供应商类型', { maxLength: 200, trim: true });
  validateOptionalString(provider.name, '供应商名称', { maxLength: 200, trim: true });
  if (!hasProviderId) {
    validateHttpUrl(provider.endpoint);
    validateString(provider.type || provider.provider, { field: '供应商类型', minLength: 1, maxLength: 200, trim: true });
  }
  if (provider.apiKey !== undefined) throw new Error('不允许传递持久化 API Key');
  if (provider.apiKeyOverride !== undefined && provider.apiKeyOverride !== null && provider.apiKeyOverride !== '') {
    if (!allowApiKeyOverride || hasProviderId) throw new Error('一次性 API Key 仅允许用于未保存的供应商');
    validateString(provider.apiKeyOverride, { field: '一次性 API Key', minLength: 1, maxLength: 10000 });
  }
}

function createProviderMetadataFromRenderer(provider) {
  return normalizeProviderMetadata(provider);
}

function scheduleTransactionRecovery(transactionId, delayMs = 60 * 1000) {
  const transaction = providerTransactions.get(transactionId);
  if (!transaction) return;
  if (transaction.timer) clearTimeout(transaction.timer);
  transaction.timer = setTimeout(() => { rollbackTransaction(transactionId, { automatic: true }); }, delayMs);
  transaction.timer.unref?.();
}

function createTransaction(entries) {
  const snapshots = entries.map(({ providerId }) => ({
    providerId,
    apiKey: secretsVault.get(providerId),
    metadata: secretsVault.getProviderMetadata(providerId),
  }));
  const transactionId = crypto.randomUUID();
  const transaction = { snapshots, lockOwnerToken: crypto.randomUUID(), timer: null, status: 'pending', retryCount: 0, lastCode: null };
  providerTransactions.set(transactionId, transaction);
  scheduleTransactionRecovery(transactionId);
  try {
    secretsVault.setMany(entries, { ownerToken: transaction.lockOwnerToken });
    transaction.status = 'applied';
    return { ok: true, transactionId };
  } catch (error) {
    if (error && (error.code === 'SECRET_VAULT_APPLIED_DURABILITY_UNCERTAIN' || error.code === 'SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED')) {
      transaction.status = 'applied_uncertain';
      transaction.lastCode = error.code;
      return {
        ok: false,
        code: error.code,
        transactionId,
        error: '配置已可能写入，但持久化状态不确定，请重试/检查',
      };
    }
    clearTimeout(transaction.timer);
    providerTransactions.delete(transactionId);
    throw error;
  }
}

function rollbackTransaction(transactionId, { automatic = false } = {}) {
  const transaction = providerTransactions.get(transactionId);
  if (!transaction) return { ok: false, code: 'SECRET_TRANSACTION_NOT_FOUND', error: '密钥事务不存在或已结束' };
  if (transaction.timer) clearTimeout(transaction.timer);
  const entries = transaction.snapshots.map((snapshot) => ({
    providerId: snapshot.providerId,
    ...(snapshot.apiKey ? { value: snapshot.apiKey } : { deleteSecret: true }),
    metadata: snapshot.metadata || null,
  }));
  try {
    secretsVault.setMany(entries, { ownerToken: transaction.lockOwnerToken });
    providerTransactions.delete(transactionId);
    return { ok: true };
  } catch (error) {
    transaction.status = 'rollback_failed';
    transaction.lastCode = error?.code || 'SECRET_TRANSACTION_ROLLBACK_FAILED';
    transaction.retryCount += 1;
    scheduleTransactionRecovery(transactionId, Math.min(5 * 60 * 1000, 60 * 1000 * transaction.retryCount));
    return {
      ok: false,
      code: 'SECRET_TRANSACTION_ROLLBACK_FAILED',
      transactionId,
      error: automatic ? '配置状态不确定，自动回滚失败，请检查后重试' : '配置状态不确定，请重试/检查',
    };
  }
}

function commitTransaction(transactionId) {
  const transaction = providerTransactions.get(transactionId);
  if (!transaction) return { ok: false, code: 'SECRET_TRANSACTION_NOT_FOUND', error: '密钥事务不存在或已结束' };
  if (transaction.status !== 'applied') {
    return {
      ok: false,
      code: 'SECRET_TRANSACTION_DURABILITY_UNCERTAIN',
      transactionId,
      error: '配置持久化状态不确定，请先重试回滚或检查',
    };
  }
  clearTimeout(transaction.timer);
  providerTransactions.delete(transactionId);
  return { ok: true };
}

function validateSecretEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) throw new Error('密钥迁移数据格式不正确');
  const ids = new Set();
  return entries.map((entry) => {
    validateObject(entry, '密钥迁移项');
    const providerId = validateProviderId(entry.providerId);
    if (ids.has(providerId)) throw new Error('密钥迁移包含重复供应商');
    ids.add(providerId);
    const normalized = { providerId };
    if (entry.apiKey !== undefined && entry.apiKey !== null && entry.apiKey !== '') {
      normalized.value = validateString(entry.apiKey, { field: 'API Key', minLength: 1, maxLength: 10000 });
    }
    if (entry.metadata !== undefined) {
      normalized.metadata = normalizeProviderMetadata(entry.metadata);
      if (normalized.metadata.id !== providerId) throw new Error('供应商元数据 ID 不匹配');
    }
    if (!normalized.value && normalized.metadata === undefined) throw new Error('密钥迁移项不能为空');
    return normalized;
  });
}

function validateOptionalCategory(category) {
  if (category === undefined || category === null || category === '') return;
  validateString(category, { field: '模型分类', allowedValues: ['image', 'text', 'video'], trim: true });
}

async function validateGenerateParams(params) {
  validateObject(params, '生图参数');
  validateString(params.prompt, { field: '提示词', minLength: 1, maxLength: 100000, trim: true });
  validateProviderId(params.providerId);
  validateString(params.modelName, { field: '模型', minLength: 1, maxLength: 200, trim: true });
  validateString(params.ratio, { field: '比例', allowedValues: ['1:1', '4:3', '16:9', '9:16'] });
  validateString(params.quality, { field: '质量', allowedValues: ['标准', '高清', '超高清'] });
  validateString(params.size, { field: '图片尺寸', minLength: 1, maxLength: 200, trim: true });
  if (params.endpoint !== undefined) validateHttpUrl(params.endpoint);
  if (params.provider !== undefined) validateOptionalString(params.provider, '供应商类型', { maxLength: 200, trim: true });
  if (params.apiKey !== undefined || params.apiKeyOverride !== undefined) throw new Error('生图请求不允许传递 API Key');
  if (params.sourceImage !== undefined && params.sourceImage !== null && typeof params.sourceImage !== 'string') throw new Error('参考图路径必须是文本');
  if (typeof params.sourceImage === 'string' && params.sourceImage.startsWith('data:')) await validateDataUrl(params.sourceImage, { decodeImageBuffer });
}

function validateTextPromptParams(params) {
  validateObject(params, '文本模型参数');
  validateProviderId(params.providerId);
  validateString(params.model, { field: '文本模型', minLength: 1, maxLength: 200, trim: true });
  validateString(params.prompt, { field: '提示词', minLength: 1, maxLength: 100000, trim: true });
  validateOptionalString(params.imageModel, '生图模型', { maxLength: 200, trim: true });
  if (params.ratio !== undefined && params.ratio !== null && params.ratio !== '') validateString(params.ratio, { field: '比例', allowedValues: ['1:1', '4:3', '16:9', '9:16'] });
  if (params.quality !== undefined && params.quality !== null && params.quality !== '') validateString(params.quality, { field: '质量', allowedValues: ['标准', '高清', '超高清'] });
  if (params.language !== undefined && params.language !== null && params.language !== '') validateString(params.language, { field: '语言', allowedValues: ['zh', 'en'] });
  if (params.endpoint !== undefined) validateHttpUrl(params.endpoint);
  if (params.apiKey !== undefined || params.apiKeyOverride !== undefined) throw new Error('文本请求不允许传递 API Key');
}

// ===== 安全密钥仓库 =====
registerSecureHandler({
  ipcMain,
  channel: 'provider-secret-set',
  getMainWindow: () => mainWindow,
  validate: (providerId, value, metadata, options) => {
    validateProviderId(providerId);
    if (value !== undefined && value !== null && value !== '') validateString(value, { field: 'API Key', minLength: 1, maxLength: 10000 });
    if (metadata !== undefined && metadata !== null) {
      const normalized = createProviderMetadataFromRenderer(metadata);
      if (normalized.id !== providerId) throw new Error('供应商元数据 ID 不匹配');
    }
    if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) throw new Error('密钥事务选项格式不正确');
  },
  handle: async (_event, providerId, value, metadata, options = {}) => {
    const normalizedMetadata = metadata === undefined || metadata === null ? undefined : createProviderMetadataFromRenderer(metadata);
    const previousMetadata = secretsVault.getProviderMetadata(providerId);
    if (normalizedMetadata && isBindingChanged(previousMetadata, normalizedMetadata) && secretsVault.has(providerId) && !value) {
      throw new Error('修改已保存供应商的地址或类型时，请重新输入 API Key');
    }
    const entry = { providerId, ...(value ? { value } : {}), ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}) };
    if (options.transactional) return createTransaction([entry]);
    secretsVault.setMany([entry]);
    return { ok: true };
  },
});

registerSecureHandler({
  ipcMain,
  channel: 'provider-secret-has',
  getMainWindow: () => mainWindow,
  validate: (providerId) => { validateProviderId(providerId); },
  handle: async (_event, providerId) => ({ ok: true, has: secretsVault.has(providerId) }),
});

registerSecureHandler({
  ipcMain,
  channel: 'provider-secret-delete',
  getMainWindow: () => mainWindow,
  validate: (providerId, options) => {
    validateProviderId(providerId);
    if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) throw new Error('密钥事务选项格式不正确');
  },
  handle: async (_event, providerId, options = {}) => {
    const entry = { providerId, deleteSecret: true, metadata: null };
    if (options.transactional) return createTransaction([entry]);
    secretsVault.setMany([entry]);
    return { ok: true };
  },
});

registerSecureHandler({
  ipcMain,
  channel: 'provider-secret-migrate',
  getMainWindow: () => mainWindow,
  validate: (payload) => {
    if (payload && !Array.isArray(payload) && typeof payload === 'object') {
      if (!['commit', 'rollback'].includes(payload.operation) || typeof payload.transactionId !== 'string') throw new Error('密钥事务操作格式不正确');
      return;
    }
    validateSecretEntries(payload);
  },
  handle: async (_event, payload) => {
    if (payload && !Array.isArray(payload) && typeof payload === 'object') {
      return payload.operation === 'commit' ? commitTransaction(payload.transactionId) : rollbackTransaction(payload.transactionId);
    }
    const entries = validateSecretEntries(payload);
    return createTransaction(entries);
  },
});

// 保存图片到磁盘（下载）
registerSecureHandler({
  ipcMain,
  channel: 'save-image',
  getMainWindow: () => mainWindow,
  validate: async (dataUrl, suggestedName) => { await validateDataUrl(dataUrl, { decodeImageBuffer }); validateSuggestedName(suggestedName); },
  handle: async (_event, dataUrl, suggestedName) => {
  try {
    const safeSuggestedName = validateSuggestedName(suggestedName);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存图片',
      defaultPath: safeSuggestedName,
      filters: [
        { name: 'PNG 图片', extensions: ['png'] },
        { name: 'JPEG 图片', extensions: ['jpg'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    // 解析 data URL
    const match = /^data:(image\/(\w+));base64,(.*)$/.exec(dataUrl);
    let buffer;
    if (match) {
      buffer = Buffer.from(match[3], 'base64');
    } else {
      // 本地文件路径：直接读取
      buffer = fs.readFileSync(dataUrl);
    }
    fs.writeFileSync(filePath, buffer);
    return { ok: true, filePath: await imageFileAccess.authorizePastedImage(filePath) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
  },
});

// 在系统中显示文件（下载完成后定位）
registerSecureHandler({
  ipcMain,
  channel: 'show-in-folder',
  getMainWindow: () => mainWindow,
  validate: (filePath) => { imageFileAccess.resolveGeneratedFile(filePath); },
  handle: async (_event, filePath) => {
  const canonicalPath = imageFileAccess.resolveGeneratedFile(filePath);
  shell.showItemInFolder(canonicalPath);
  return { ok: true };
  },
});

// ===== 测试供应商连接（统一复用安全 HTTP 客户端） =====
registerSecureHandler({
  ipcMain,
  channel: 'test-connection',
  getMainWindow: () => mainWindow,
  validate: (provider) => { validateProvider(provider, { allowApiKeyOverride: true }); },
  handle: async (_event, provider) => {
    if (!provider || (!provider.providerId && !provider.endpoint)) throw new Error('请填写 API 地址');

    const trustedProvider = provider.providerId
      ? getTrustedProvider(provider.providerId, provider)
      : { endpoint: provider.endpoint, type: provider.type || provider.provider || '', apiKey: provider.apiKeyOverride || '' };
    const headers = {};
    if (trustedProvider.apiKey) headers.Authorization = `Bearer ${trustedProvider.apiKey}`;

    if (String(trustedProvider.type).toLowerCase() === 'aiping') {
      if (!trustedProvider.apiKey) throw new Error('请填写 Aiping API Key');
      const result = await requestJson({
        url: buildAipingBalanceUrl(trustedProvider.endpoint),
        method: 'GET',
        headers,
        timeoutMs: 8000,
      });
      const payload = result.data;
      const balance = Number(payload?.data?.total_remain);
      if (payload?.code !== 0 || !Number.isFinite(balance)) {
        throw new Error('Aiping API Key 验证失败：余额接口返回异常');
      }
      const formattedBalance = Number.isInteger(balance)
        ? String(balance)
        : balance.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return { ok: true, status: result.status, message: `认证成功，当前余额 ${formattedBalance} 元` };
    }

    if (String(trustedProvider.type).toLowerCase() === 'grsai') {
      const result = await requestJson({
        url: trustedProvider.endpoint,
        method: 'POST',
        headers,
        body: { model: 'gpt-image-2', prompt: 'test' },
        timeoutMs: 10000,
      });
      if (result.data && ['failed', 'violation'].includes(result.data.status)) {
        throw new Error(result.data.status === 'violation' ? '供应商拒绝了测试请求' : '供应商未能完成测试请求');
      }
      return { ok: true, status: result.status };
    }

    const result = await requestJson({
      url: buildModelsUrl(trustedProvider.endpoint),
      method: 'GET',
      headers,
      timeoutMs: 8000,
    });
    return { ok: true, status: result.status };
  },
});

// ===== 读取本地图片为 dataURL（图生图参考图） =====
async function readLocalImageAsDataUrl(imageRef) {
  return imageFileAccess.readSourceImageAsDataUrl(imageRef);
}

// ===== 保存 base64/URL 图片到用户数据目录 =====
function saveGeneratedImage(input, id) {
  const dir = path.join(app.getPath('userData'), 'generated');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `gen_${id}_${Date.now()}.png`);

  // 1) 已经是 dataURL
  if (typeof input === 'string' && input.startsWith('data:image')) {
    const match = /^data:image\/(\w+);base64,(.*)$/.exec(input);
    if (!match) throw new Error('图片 dataURL 格式不正确');
    fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
    return filePath;
  }

  // 2) HTTP(S) URL → 下载
  if (typeof input === 'string' && /^https?:\/\//i.test(input)) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(input);
      const lib = parsedUrl.protocol === 'https:' ? https : http;
      const req = lib.get(input, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // 简单重定向
          saveGeneratedImage(res.headers.location, id).then(resolve).catch(reject);
          req.destroy();
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`下载图片失败：HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          fs.writeFileSync(filePath, Buffer.concat(chunks));
          resolve(filePath);
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('下载图片超时')); });
      req.setTimeout(30000);
    });
  }

  throw new Error('无法识别的图片返回格式');
}

function redactProviderSecret(value, apiKey) {
  if (typeof value !== 'string' || !apiKey) return value;
  return value.split(apiKey).join('[已隐藏]');
}

// ===== 从用户填写的 endpoint 推导出 /models 列表 URL =====
function buildModelsUrl(endpoint) {
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return endpoint.replace(/\/+$/, '') + '/models';
  }
  let path = u.pathname.replace(/\/+$/, ''); // 去掉尾部斜杠
  // 如果路径以具体 API 端点结尾，替换为 /models
  path = path.replace(/\/(images\/generations|generate|chat\/completions|completions|videos|responses)$/i, '/models');
  // 如果路径不以 /models 结尾
  if (!path.endsWith('/models')) {
    // 如果路径已经包含 /v1，直接追加 /models
    if (/\/v1$/i.test(path)) {
      path = path + '/models';
    } else if (/\/v\d+$/i.test(path)) {
      // 其他版本号如 /v2
      path = path + '/models';
    } else {
      // 没有 /v1，追加 /v1/models
      path = path + '/v1/models';
    }
  }
  u.pathname = path;
  return u.toString();
}

// Aiping 的模型列表是公开接口；连接测试必须改用强制 Bearer 鉴权的余额查询接口。
function buildAipingBalanceUrl(endpoint) {
  const u = new URL(endpoint);
  const path = u.pathname.replace(/\/+$/, '');
  const apiV1Index = path.toLowerCase().indexOf('/api/v1');
  if (apiV1Index >= 0) {
    u.pathname = path.slice(0, apiV1Index) + '/api/v1/user/remain/points';
  } else if (/\/v1$/i.test(path)) {
    u.pathname = path + '/user/remain/points';
  } else {
    u.pathname = path + '/api/v1/user/remain/points';
  }
  u.search = '';
  u.hash = '';
  return u.toString();
}

// ===== Grsai 异步结果轮询 =====
async function pollGrsaiResult({ model, id }) {
  // 从 generate 端点推导出 result 端点：/v1/api/generate → /v1/api/result
  let resultUrl;
  try {
    const u = new URL(model.endpoint);
    u.pathname = u.pathname.replace(/generate\/?$/, 'result');
    u.search = '';
    resultUrl = u.toString();
  } catch (e) {
    resultUrl = model.endpoint.replace(/generate(\?.*)?$/, 'result');
  }

  const headers = {};
  if (model.apiKey) headers['Authorization'] = `Bearer ${model.apiKey}`;

  const maxAttempts = 80; // 最多轮询约 4 分钟
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    let result;
    try {
      result = await requestJson({
        url: `${resultUrl}?id=${encodeURIComponent(id)}`,
        method: 'GET',
        headers,
        timeoutMs: 30000,
      });
    } catch (e) {
      // 单次网络错误不中断，继续重试
      continue;
    }
    const data = result && result.data;
    if (!data) continue;

    if (data.status === 'succeeded') {
      const url = data.results && data.results[0] && data.results[0].url;
      if (!url) throw new Error('Grsai 返回成功但未找到图片地址');
      const filePath = await saveGeneratedImage(url, id);
      return { ok: true, imagePath: filePath, fileUrl: 'file://' + encodeURI(filePath) };
    }
    if (data.status === 'failed' || data.status === 'violation') {
      throw new Error(data.status === 'violation' ? '供应商拒绝了生成任务' : '供应商任务执行失败');
    }
    // running / 其它状态继续轮询
  }
  throw new Error('轮询超时，任务仍未完成');
}

// ===== Grsai 生图 =====
async function generateWithGrsai({ prompt, model, ratio, sourceImage }) {
  const headers = {};
  if (model.apiKey) headers['Authorization'] = `Bearer ${model.apiKey}`;

  const body = {
    model: model.model,
    prompt,
    images: sourceImage ? [sourceImage] : [],
    aspectRatio: ratio || '1:1',
    replyType: 'json',
  };

  const result = await requestJson({
    url: model.endpoint,
    method: 'POST',
    headers,
    body,
    timeoutMs: 180000,
  });

  const data = result && result.data;
  if (!data) throw new Error('Grsai 返回数据为空');

  // 同步成功
  if (data.status === 'succeeded') {
    const url = data.results && data.results[0] && data.results[0].url;
    if (!url) throw new Error('Grsai 返回成功但未找到图片地址');
    const id = data.id || Date.now().toString(36);
    const filePath = await saveGeneratedImage(url, id);
    return { ok: true, imagePath: filePath, fileUrl: 'file://' + encodeURI(filePath) };
  }

  // 异步任务，进入轮询
  if (data.status === 'running' && data.id) {
    return await pollGrsaiResult({ model, id: data.id });
  }

  // 失败 / 违规
  throw new Error(data && data.status === 'violation' ? '供应商拒绝了生成任务' : '供应商任务执行失败');
}

// ===== OpenAI 兼容生图 =====
async function generateWithOpenAI({ prompt, model, size, providerType }) {
  const headers = {};
  if (model.apiKey) headers['Authorization'] = `Bearer ${model.apiKey}`;

  // agnes-ai: response_format 需放在 extra_body 内部
  const isAgnes = (providerType || '').toLowerCase() === 'agnes-ai';
  const body = isAgnes
    ? {
        model: model.model,
        prompt,
        n: 1,
        size: size || '1024x1024',
        return_base64: true,
      }
    : {
        model: model.model,
        prompt,
        n: 1,
        size: size || '1024x1024',
        response_format: 'b64_json',
      };

  let result;
  try {
    result = await requestJson({
      url: model.endpoint,
      method: 'POST',
      headers,
      body,
      timeoutMs: 120000,
    });
  } catch (e) {
    if (e && e.status === 400) {
      // 去掉格式相关字段重试
      const retryBody = { model: model.model, prompt, n: 1, size: size || '1024x1024' };
      result = await requestJson({
        url: model.endpoint,
        method: 'POST',
        headers,
        body: retryBody,
        timeoutMs: 120000,
      });
    } else {
      throw e;
    }
  }

  const data = result && result.data;
  const item = data && data.data && data.data[0];
  if (!item) throw new Error('API 返回格式不正确：未找到图片数据');

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let source = null;
  if (item.b64_json) {
    const prefix = /^data:image\//.test(item.b64_json) ? '' : 'data:image/png;base64,';
    source = prefix + item.b64_json;
  } else if (item.url) {
    source = item.url;
  } else {
    throw new Error('API 返回中未找到 b64_json 或 url 字段');
  }

  const filePath = await saveGeneratedImage(source, id);
  return { ok: true, imagePath: filePath, fileUrl: 'file://' + encodeURI(filePath) };
}

// ===== Aiping 生图：使用 OpenAI 标准端点，但按平台文档传递调度参数与顶层参考图。 =====
async function generateWithAiping({ prompt, model, size, ratio, quality, sourceImage }) {
  const headers = {};
  if (model.apiKey) headers.Authorization = `Bearer ${model.apiKey}`;

  const body = buildAipingImageRequest({
    modelId: model.model,
    prompt,
    size,
    ratio,
    quality,
    sourceImage,
  });

  const result = await requestJson({
    url: model.endpoint,
    method: 'POST',
    headers,
    body,
    timeoutMs: 180000,
  });

  const item = result?.data?.data?.[0];
  if (!item) throw new Error('Aiping 返回格式不正确：未找到图片数据');

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let source = null;
  if (item.url) {
    source = item.url;
  } else if (item.b64_json) {
    const prefix = /^data:image\//.test(item.b64_json) ? '' : 'data:image/png;base64,';
    source = prefix + item.b64_json;
  } else {
    throw new Error('Aiping 返回中未找到 url 或 b64_json 字段');
  }

  const filePath = await saveGeneratedImage(source, id);
  return { ok: true, imagePath: filePath, fileUrl: 'file://' + encodeURI(filePath) };
}

// ===== Agnes-ai 图生图 =====
async function generateWithAgnesImage({ prompt, model, size, sourceImage }) {
  const headers = {};
  if (model.apiKey) headers['Authorization'] = `Bearer ${model.apiKey}`;

  const body = {
    model: model.model,
    prompt,
    size: size || '1024x1024',
    extra_body: {
      image: [sourceImage],
      response_format: 'b64_json',
    },
  };

  const result = await requestJson({
    url: model.endpoint,
    method: 'POST',
    headers,
    body,
    timeoutMs: 120000,
  });

  const data = result && result.data;
  const item = data && data.data && data.data[0];
  if (!item) throw new Error('API 返回格式不正确：未找到图片数据');

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  let source = null;
  if (item.b64_json) {
    const prefix = /^data:image\//.test(item.b64_json) ? '' : 'data:image/png;base64,';
    source = prefix + item.b64_json;
  } else if (item.url) {
    source = item.url;
  } else {
    throw new Error('API 返回中未找到 b64_json 或 url 字段');
  }

  const filePath = await saveGeneratedImage(source, id);
  return { ok: true, imagePath: filePath, fileUrl: 'file://' + encodeURI(filePath) };
}

// ===== 已知模型列表（无 list-models API 的供应商内置） =====
const KNOWN_MODELS = {
  grsai: [
    { id: 'gpt-image-2', name: 'gpt-image-2' },
    { id: 'gpt-image-2-vip', name: 'gpt-image-2-vip' },
    { id: 'nano-banana', name: 'nano-banana' },
    { id: 'nano-banana-fast', name: 'nano-banana-fast' },
    { id: 'nano-banana-2', name: 'nano-banana-2' },
    { id: 'nano-banana-2-cl', name: 'nano-banana-2-cl' },
    { id: 'nano-banana-pro', name: 'nano-banana-pro' },
    { id: 'nano-banana-pro-vt', name: 'nano-banana-pro-vt' },
    { id: 'nano-banana-pro-cl', name: 'nano-banana-pro-cl' },
    { id: 'nano-banana-pro-vip', name: 'nano-banana-pro-vip' },
  ],
  'agnes-ai': {
    image: [
      { id: 'agnes-image-2.0-flash', name: 'Agnes Image 2.0 Flash' },
      { id: 'agnes-image-2.1-flash', name: 'Agnes Image 2.1 Flash' },
    ],
    text: [
      { id: 'agnes-2.0-flash', name: 'Agnes 2.0 Flash' },
      { id: 'agnes-2.5-flash', name: 'Agnes 2.5 Flash' },
      { id: 'agnes-2.5-pro', name: 'Agnes 2.5 Pro' },
      { id: 'agnes-2.5-pro-alpha', name: 'Agnes 2.5 Pro Alpha' },
    ],
    video: [
      { id: 'agnes-video-v2.0', name: 'Agnes Video V2.0' },
    ],
  },
  aiping: {
    image: [
      { id: 'Qwen-Image', name: 'Qwen-Image' },
      { id: 'Qwen-Image-Edit', name: 'Qwen-Image-Edit' },
      { id: 'HunyuanImage-3.0', name: 'HunyuanImage-3.0' },
      { id: '即梦文生图 3.0', name: '即梦文生图 3.0' },
      { id: '即梦文生图 3.1', name: '即梦文生图 3.1' },
      { id: 'Doubao-Seedream-4.0', name: 'Doubao-Seedream-4.0' },
      { id: 'Kling-V2.1', name: 'Kling-V2.1' },
      { id: 'Kling-V1', name: 'Kling-V1' },
      { id: 'glm-image', name: 'glm-image' },
      { id: 'Doubao-Seedream-5.0-lite', name: 'Doubao-Seedream-5.0-lite' },
      { id: 'Doubao-Seedream-4.5', name: 'Doubao-Seedream-4.5' },
      { id: '即梦图片生成 4.0', name: '即梦图片生成 4.0' },
      { id: 'Kolors', name: 'Kolors' },
      { id: 'Qwen-Image-Plus', name: 'Qwen-Image-Plus' },
      { id: 'Qwen-Image-Edit-Plus', name: 'Qwen-Image-Edit-Plus' },
      { id: 'Wan2.5-T2I-Preview', name: 'Wan2.5-T2I-Preview' },
      { id: 'Wan2.5-I2I-Preview', name: 'Wan2.5-I2I-Preview' },
    ],
    text: [
      { id: 'DeepSeek-V3.1', name: 'DeepSeek-V3.1' },
      { id: 'DeepSeek-R1-0528', name: 'DeepSeek-R1-0528' },
    ],
  },
  deepseek: {
    text: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' },
    ],
  },
};

// ===== 获取供应商下可用模型列表 =====
registerSecureHandler({
  ipcMain,
  channel: 'fetch-models',
  getMainWindow: () => mainWindow,
  validate: (provider, category) => { validateProvider(provider, { allowApiKeyOverride: true }); validateOptionalCategory(category); },
  handle: async (_event, provider, category) => {
  const trustedProvider = provider?.providerId ? getTrustedProvider(provider.providerId, provider) : { type: provider?.type, endpoint: provider?.endpoint, apiKey: provider?.apiKeyOverride || '' };
  const { type, endpoint } = trustedProvider;
  const apiKey = trustedProvider.apiKey;
  if (!type) throw new Error('缺少供应商类型');
  if (!endpoint) throw new Error('请先填写 API 地址');

  const ptype = String(type).toLowerCase();
  const cat = String(category || 'image').toLowerCase();

  // Grsai：没有 /models 端点，返回内置已知生图模型列表
  if (ptype === 'grsai') {
    if (cat === 'image') return { ok: true, models: KNOWN_MODELS.grsai };
    return { ok: true, models: [] };
  }

  // 其他所有类型（agnes-ai / deepseek / openai / custom）：
  // 统一调用 /models 端点获取真实模型列表，失败就报错
  const modelsUrl = buildModelsUrl(endpoint);
  const headers = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const result = await requestJson({
    url: modelsUrl,
    method: 'GET',
    headers,
    timeoutMs: 15000,
  });

  const data = result.data;
  if (!data || !data.data || !Array.isArray(data.data)) {
    throw new Error('API 返回格式异常：未找到 data 数组');
  }

  let models = data.data
    .filter((m) => m && m.id && m.status !== false)
    .map((m) => ({ id: m.id, name: m.id }));

  // 按分类过滤
  if (ptype === 'aiping') {
    const availableIds = new Set(models.map((model) => model.id));
    models = (KNOWN_MODELS.aiping[cat] || []).filter((model) => availableIds.has(model.id));
  } else if (cat === 'image') {
    models = models.filter((m) => m.id.includes('image'));
  } else if (cat === 'video') {
    models = models.filter((m) => m.id.includes('video'));
  } else if (cat === 'text') {
    models = models.filter((m) => !m.id.includes('image') && !m.id.includes('video'));
  }

  if (models.length === 0) {
    throw new Error(`API 返回的模型列表中没有${cat === 'image' ? '生图' : cat === 'text' ? '文本' : '视频'}类模型，可尝试手动添加`);
  }

  return { ok: true, models };
  },
});

// ===== 真正调用模型生图（按 provider 分流） =====
registerSecureHandler({
  ipcMain,
  channel: 'generate-image',
  getMainWindow: () => mainWindow,
  validate: async (params) => { await validateGenerateParams(params); },
  handle: async (_event, params) => {
  const { prompt, modelName, ratio, quality, size, sourceImage } = params;
  const trustedProvider = getTrustedProvider(params.providerId, params, { category: 'image', modelName });
  const { endpoint, type: provider, apiKey } = trustedProvider;
  if (!prompt) throw new Error('提示词不能为空');
  if (!endpoint) throw new Error('请先配置供应商 API 地址');
  if (!modelName) throw new Error('请选择模型');

  const ptype = String(provider || '').toLowerCase();

  // 读取参考图为 base64 dataURL（图生图）
  let sourceImageDataUrl = null;
  if (sourceImage) {
    sourceImageDataUrl = await readLocalImageAsDataUrl(sourceImage);
  }

  if (ptype === 'grsai') {
    const model = { endpoint, apiKey, model: modelName, provider: provider || '' };
    return await generateWithGrsai({ prompt, model, ratio, sourceImage: sourceImageDataUrl });
  }

  // Aiping / Agnes AI / OpenAI 兼容：构造 images/generations 端点。
  let imageEndpoint = endpoint;
  if (ptype === 'agnes-ai' || ptype === 'aiping') {
    // 内置平台使用 base URL，统一补充 /images/generations。
    imageEndpoint = endpoint.replace(/\/+$/, '');
    if (!/\/images\/generations$/i.test(imageEndpoint)) {
      imageEndpoint = imageEndpoint + '/images/generations';
    }
  } else if (ptype === 'openai' || ptype === 'openai 兼容' || ptype === 'custom') {
    // OpenAI 兼容：如果 endpoint 不含 /images/generations，自动追加
    imageEndpoint = endpoint.replace(/\/+$/, '');
    if (!/\/images\/generations$/i.test(imageEndpoint)) {
      // 如果已包含 /v1，只追加 /images/generations
      if (/\/v\d+$/i.test(imageEndpoint)) {
        imageEndpoint = imageEndpoint + '/images/generations';
      } else {
        imageEndpoint = imageEndpoint + '/v1/images/generations';
      }
    }
  }

  const model = { endpoint: imageEndpoint, apiKey, model: modelName, provider: provider || '' };

  if (ptype === 'aiping') {
    return await generateWithAiping({ prompt, model, size, ratio, quality, sourceImage: sourceImageDataUrl });
  }

  if (sourceImageDataUrl && ptype !== 'grsai') {
    // agnes-ai 支持图生图，通过 extra_body.image 传入
    return await generateWithAgnesImage({ prompt, model, size, sourceImage: sourceImageDataUrl });
  }

  return await generateWithOpenAI({ prompt, model, size, providerType: ptype });
  },
});

// ===== 保存粘贴的图片到临时文件 =====
registerSecureHandler({
  ipcMain,
  channel: 'save-pasted-image',
  getMainWindow: () => mainWindow,
  validate: async (dataUrl) => { await validateDataUrl(dataUrl, { decodeImageBuffer }); },
  handle: async (_event, dataUrl) => {
  try {
    const match = /^data:(image\/(\w+));base64,(.*)$/.exec(dataUrl);
    if (!match) throw new Error('无效的图片数据');
    const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
    const buffer = Buffer.from(match[3], 'base64');
    const tmpDir = path.join(app.getPath('temp'), 'miaos-pasted');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const fileName = `pasted-${Date.now()}.${ext}`;
    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return { ok: true, filePath: await imageFileAccess.authorizePastedImage(filePath) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
  },
});

// ===== 选择本地图片（图生图参考图） =====
registerSecureHandler({
  ipcMain,
  channel: 'pick-image-file',
  getMainWindow: () => mainWindow,
  validate: () => {},
  handle: async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择参考图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const filePath = await imageFileAccess.authorizePickedImage(result.filePaths[0]);
  return { canceled: false, filePath };
  },
});

// ===== 选择文本文件（长文本提示词） =====
registerSecureHandler({
  ipcMain,
  channel: 'pick-text-file',
  getMainWindow: () => mainWindow,
  validate: () => {},
  handle: async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择提示词文本文件',
    properties: ['openFile'],
    filters: [{ name: '文本', extensions: ['txt', 'md', 'markdown', 'json'] }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const filePath = result.filePaths[0];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { canceled: false, content, fileName: path.basename(filePath) };
  } catch (e) {
    throw new Error('读取文件失败：' + e.message);
  }
  },
});

// ===== 优化提示词（调用文本模型 chat 接口） =====
registerSecureHandler({
  ipcMain,
  channel: 'optimize-prompt',
  getMainWindow: () => mainWindow,
  validate: (params) => { validateTextPromptParams(params); },
  handle: async (_event, params) => {
  const { model, prompt, language } = params;
  const trustedProvider = getTrustedProvider(params.providerId, params, { category: 'text', modelName: model });
  const { endpoint, apiKey } = trustedProvider;
  if (!endpoint) throw new Error('请先在设置中配置文本模型 API 地址');
  if (!model) throw new Error('请先在设置中配置文本模型名称');
  if (!prompt || !prompt.trim()) throw new Error('请输入需要优化的提示词');

  // 调用 OpenAI 兼容的 /chat/completions
  let chatUrl = endpoint;
  // 如果 endpoint 是 /v1 或 /v1/ 结尾，补上 chat/completions
  if (!/\/chat\/completions\/?$/.test(chatUrl)) {
    chatUrl = chatUrl.replace(/\/+$/, '') + '/chat/completions';
  }

  const headers = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const isEnglish = language === 'en';
  const systemPrompt = isEnglish
    ? '你是一个专业的 AI 绘画提示词优化专家。请根据用户提供的原始提示词，优化为更详细、更具画面感的英文提示词。要求：1) 保留原始意图；2) 补充画质、光影、构图、风格等细节描述；3) 输出纯英文文本提示词，不要解释、不要 markdown 格式；4) 控制在 200 词以内。'
    : '你是一个专业的 AI 绘画提示词优化专家。请根据用户提供的原始提示词，优化为更详细、更具画面感的中文提示词。要求：1) 保留原始意图；2) 补充画质、光影、构图、风格等细节描述；3) 输出纯中文文本提示词，不要解释、不要 markdown 格式；4) 控制在 200 字以内。';

  const res = await requestJson({
    url: chatUrl,
    method: 'POST',
    headers,
    body: {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt.trim() },
      ],
      temperature: 0.7,
      max_tokens: 500,
    },
    timeoutMs: 60000,
  });

  const content = res.data && res.data.choices && res.data.choices[0] && res.data.choices[0].message
    ? res.data.choices[0].message.content
    : null;

  if (!content) throw new Error('文本模型返回为空');
  return { optimized: redactProviderSecret(content.trim(), apiKey) };
  },
});

// ===== 总结生图标题（5-10字，用于时间轴节点标题） =====
registerSecureHandler({
  ipcMain,
  channel: 'summarize-prompt',
  getMainWindow: () => mainWindow,
  validate: (params) => { validateTextPromptParams(params); },
  handle: async (_event, params) => {
  const { model, prompt, ratio, quality, imageModel, isImageToImage } = params;
  const trustedProvider = getTrustedProvider(params.providerId, params, { category: 'text', modelName: model });
  const { endpoint, apiKey } = trustedProvider;
  if (!endpoint) throw new Error('请先在设置中配置文本模型 API 地址');
  if (!model) throw new Error('请先在设置中配置文本模型名称');
  if (!prompt || !prompt.trim()) throw new Error('提示词为空');

  let chatUrl = endpoint;
  if (!/\/chat\/completions\/?$/.test(chatUrl)) {
    chatUrl = chatUrl.replace(/\/+$/, '') + '/chat/completions';
  }

  const headers = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const i2iDesc = isImageToImage ? '该图基于参考图图生图生成' : '';
  const extraInfo = [
    ratio ? `比例：${ratio}` : '',
    quality ? `质量：${quality}` : '',
    imageModel ? `生图模型：${imageModel}` : '',
    i2iDesc,
  ].filter(Boolean).join('，');

  const systemPrompt = `你是一个生图创作节点的标题助手。根据用户提供的生图提示词和参数信息，给出一个${prompt.includes('dog') || prompt.includes('狗') ? '简短' : ''}高度概括的中文标题，用于在时间轴上快速识别该节点的创作内容。严格要求：1) 5-10 个中文字符；2) 纯文字，不含标点或特殊符号；3) 不要解释，直接给出结果；4) 重点概括主体+关键元素+画面氛围。`;

  const userContent = extraInfo
    ? `提示词：${prompt.trim()}\n附加信息：${extraInfo}\n请输出该节点的标题（5-10字）。`
    : `提示词：${prompt.trim()}\n请输出该节点的标题（5-10字）。`;

  const res = await requestJson({
    url: chatUrl,
    method: 'POST',
    headers,
    body: {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 512,
    },
    timeoutMs: 20000,
  });

  // 兼容多种响应格式：data.choices[0] 或 choices[0]
  let choice = null;
  if (res.data && res.data.choices && res.data.choices[0]) {
    choice = res.data.choices[0];
  } else if (res.choices && res.choices[0]) {
    choice = res.choices[0];
  }

  let content = '';
  if (choice && choice.message) {
    content = (choice.message.content || '').trim();
  }

  if (!content) {
    console.warn('[Summarize] content 为空，跳过摘要，使用默认名称');
    return { title: null }; // 返回 null，调用方回退到默认名称
  }

  // 清洗：去除换行、引号、前后空格、标点
  const cleaned = content.trim().replace(/[\n\r"'""''`]/g, '').replace(/[.。！!？?、,，]$/, '');
  // 严格截断为 10 字以内
  const title = redactProviderSecret(cleaned, apiKey).slice(0, 10);
  return { title };
  },
});

if (shouldStartApp) {
  app.whenReady().then(() => {
    setupAutoUpdater();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // 窗口就绪后延迟自动检查更新（仅打包环境）
    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, 5000);
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
