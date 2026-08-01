const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let updateInfoCache = null;

// ===== 自动更新初始化 =====
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  // 使用 ad-hoc 签名（--sign -），跳过更新安装时的签名验证
  autoUpdater.verifyUpdateCodeSignature = false;

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
      fileSize: info.files && info.files[0] ? info.files[0].size : 0,
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

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('downloading', {
      percent: Number(progress.percent.toFixed(2)),
      bytesPerSecond: progress.bytesPerSecond,
      totalBytes: progress.total,
      transferredBytes: progress.transferred,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateInfoCache = info;
    sendUpdateStatus('downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });
}

function sendUpdateStatus(state, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update-status', { state, ...payload });
}

// ===== 对外更新 API =====
ipcMain.handle('update-get-current-version', () => {
  return {
    version: app.getVersion(),
    name: '妙生',
    isPackaged: !!app.isPackaged,
  };
});

ipcMain.handle('update-check', async () => {
  if (!app.isPackaged) {
    return { ok: false, error: '开发环境不支持自动更新，请打包后使用' };
  }
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || '检查更新失败' };
  }
});

ipcMain.handle('update-download', async () => {
  if (!app.isPackaged) {
    return { ok: false, error: '开发环境不支持自动更新，请打包后使用' };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || '下载更新失败' };
  }
});

ipcMain.handle('update-quit-and-install', () => {
  try {
    setImmediate(() => {
      autoUpdater.quitAndInstall(true, true);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || '安装更新失败' };
  }
});

// 动态配置更新源（owner/repo），允许用户自定义 GitHub 仓库
ipcMain.handle('update-configure', async (_event, opts) => {
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
});

const os = require('os');

// 使用独立的应用数据目录。优先使用用户主目录下 .miaos；
// 若主目录被 TCC 限制（ad-hoc 签名环境），回退到系统临时目录以保证可写。
let userDataPath = path.join(app.getPath('home'), '.miaos');
try {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.accessSync(userDataPath, fs.W_OK);
} catch {
  userDataPath = path.join(os.tmpdir(), 'miaos');
  fs.mkdirSync(userDataPath, { recursive: true });
}
app.setPath('userData', userDataPath);

// 本应用为本地 file:// 应用，禁用硬件加速与渲染沙箱，
// 避免 ad-hoc 签名环境下 GPU/Helper 进程因缺少 entitlements 而崩溃。
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

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

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#f5f5f7',
    title: '妙生',
    fullscreenable: true,
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// 保存图片到磁盘（下载）
ipcMain.handle('save-image', async (_event, dataUrl, suggestedName) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: '保存图片',
      defaultPath: suggestedName || 'miaos-image.png',
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
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 在系统中显示文件（下载完成后定位）
ipcMain.handle('show-in-folder', async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return { ok: true };
  }
  return { ok: false };
});

// ===== 工具函数：发送 HTTP 请求 =====
function requestJson({ url, method = 'POST', headers = {}, body, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (e) {
      reject(new Error('无效的 API 地址：' + e.message));
      return;
    }

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: timeoutMs,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (e) {
          // 可能是纯文本错误或 HTML
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: json, raw: data });
        } else {
          const msg = json && (json.error?.message || json.message || json.error)
            ? (json.error?.message || json.message || JSON.stringify(json.error))
            : `HTTP ${res.statusCode}: ${data.slice(0, 300)}`;
          reject(new Error(msg));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.setHeader('Content-Length', Buffer.byteLength(bodyStr));
      req.write(bodyStr);
    }
    req.end();
  });
}

// ===== 读取本地图片为 dataURL（图生图参考图） =====
async function readLocalImageAsDataUrl(imageRef) {
  let filePath = imageRef;
  // file:// URL → 本地路径
  if (typeof imageRef === 'string' && imageRef.startsWith('file://')) {
    filePath = decodeURIComponent(imageRef.replace(/^file:\/\//, ''));
  }
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    throw new Error('参考图文件不存在：' + imageRef);
  }
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase().replace('.', '') || 'png';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buf.toString('base64')}`;
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

// ===== 测试供应商连接 =====
ipcMain.handle('test-connection', async (_event, provider) => {
  if (!provider || !provider.endpoint) throw new Error('请填写 API 地址');

  const headers = {};
  if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;

  const ptype = (provider.type || provider.provider || '').toLowerCase();

  if (ptype === 'grsai') {
    try {
      await requestJson({
        url: provider.endpoint,
        method: 'POST',
        headers,
        body: {
          model: 'gpt-image-2',
          prompt: 'test',
          images: [],
          aspectRatio: '1:1',
          replyType: 'json',
        },
        timeoutMs: 30000,
      });
      return { ok: true, status: 200 };
    } catch (e) {
      throw new Error(e.message || '连接失败');
    }
  }

  // OpenAI 兼容：尝试调用 /v1/models
  try {
    let modelsUrl;
    try {
      const u = new URL(provider.endpoint);
      u.pathname = u.pathname.replace(/\/(images\/generations|generate|chat\/completions|completions)\/?$/i, '/models');
      if (!u.pathname.endsWith('/models')) {
        u.pathname = u.pathname.replace(/\/+$/, '') + '/v1/models';
      }
      modelsUrl = u.toString();
    } catch {
      modelsUrl = provider.endpoint.replace(/\/+$/, '') + '/v1/models';
    }
    await requestJson({
      url: modelsUrl,
      method: 'GET',
      headers,
      timeoutMs: 15000,
    });
    return { ok: true, status: 200 };
  } catch (e) {
    throw new Error(e.message || '连接失败');
  }
});

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
      throw new Error(data.error || `任务${data.status}`);
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
  throw new Error(data.error || `任务${data.status || '失败'}`);
}

// ===== OpenAI 兼容生图 =====
async function generateWithOpenAI({ prompt, model, size }) {
  const headers = {};
  if (model.apiKey) headers['Authorization'] = `Bearer ${model.apiKey}`;

  const body = {
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
    if (e.message && /response_format|b64/i.test(e.message)) {
      delete body.response_format;
      result = await requestJson({
        url: model.endpoint,
        method: 'POST',
        headers,
        body,
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
};

// ===== 获取供应商下可用模型列表 =====
ipcMain.handle('fetch-models', async (_event, provider) => {
  const { type, endpoint, apiKey } = provider || {};
  if (!type) throw new Error('缺少供应商类型');

  const ptype = String(type).toLowerCase();

  // Grsai：返回已知模型列表
  if (ptype === 'grsai') {
    return { ok: true, models: KNOWN_MODELS.grsai };
  }

  // OpenAI 兼容：尝试调用 /v1/models
  if (ptype === 'openai' || ptype === 'openai 兼容') {
    if (!endpoint) throw new Error('请先填写 API 地址');
    try {
      // 从 generate 端点推导 models 端点
      let modelsUrl;
      try {
        const u = new URL(endpoint);
        // 如果路径包含 /images/generations 或 /generate，替换为 /models
        u.pathname = u.pathname.replace(/\/(images\/generations|generate|chat\/completions|completions)\/?$/i, '/models');
        if (!u.pathname.endsWith('/models')) {
          u.pathname = u.pathname.replace(/\/+$/, '') + '/v1/models';
        }
        modelsUrl = u.toString();
      } catch {
        modelsUrl = endpoint.replace(/\/+$/, '') + '/v1/models';
      }

      const headers = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const result = await requestJson({
        url: modelsUrl,
        method: 'GET',
        headers,
        timeoutMs: 15000,
      });

      const data = result.data;
      if (data && data.data && Array.isArray(data.data)) {
        const models = data.data
          .filter((m) => m && m.id)
          .map((m) => ({ id: m.id, name: m.id }));
        return { ok: true, models };
      }
      return { ok: true, models: [] };
    } catch (e) {
      // 获取失败时返回空，用户可以手动添加
      return { ok: false, error: e.message, models: [] };
    }
  }

  // custom：不自动获取，返回空
  return { ok: true, models: [] };
});

// ===== 真正调用模型生图（按 provider 分流） =====
ipcMain.handle('generate-image', async (_event, params) => {
  const { prompt, provider, modelName, ratio, quality, size, endpoint, apiKey, sourceImage } = params;
  if (!prompt) throw new Error('提示词不能为空');
  if (!endpoint) throw new Error('请先配置供应商 API 地址');
  if (!modelName) throw new Error('请选择模型');

  const model = { endpoint, apiKey, model: modelName, provider: provider || '' };

  // 读取参考图为 base64 dataURL（图生图）
  let sourceImageDataUrl = null;
  if (sourceImage) {
    try {
      sourceImageDataUrl = await readLocalImageAsDataUrl(sourceImage);
    } catch (e) {
      throw new Error('读取参考图失败：' + e.message);
    }
  }

  const ptype = String(provider || '').toLowerCase();
  if (ptype === 'grsai') {
    return await generateWithGrsai({ prompt, model, ratio, sourceImage: sourceImageDataUrl });
  }
  if (sourceImageDataUrl) {
    throw new Error('当前供应商暂不支持图生图（仅 Grsai 支持），请在子版本中改用 Grsai 供应商');
  }
  return await generateWithOpenAI({ prompt, model, size });
});

// ===== 保存粘贴的图片到临时文件 =====
ipcMain.handle('save-pasted-image', async (_event, dataUrl) => {
  try {
    const match = /^data:(image\/(\w+));base64,(.*)$/.exec(dataUrl);
    if (!match) throw new Error('无效的图片数据');
    const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
    const buffer = Buffer.from(match[3], 'base64');
    const tmpDir = path.join(os.tmpdir(), 'miaos-pasted');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const fileName = `pasted-${Date.now()}.${ext}`;
    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ===== 选择本地图片（图生图参考图） =====
ipcMain.handle('pick-image-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择参考图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const filePath = result.filePaths[0];
  return { canceled: false, filePath };
});

// ===== 选择文本文件（长文本提示词） =====
ipcMain.handle('pick-text-file', async () => {
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
});

// ===== 优化提示词（调用文本模型 chat 接口） =====
ipcMain.handle('optimize-prompt', async (_event, params) => {
  const { endpoint, apiKey, model, prompt, language } = params;
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
  return { optimized: content.trim() };
});

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
