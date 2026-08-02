// 应用状态管理：供应商→模型层级结构，持久化到 localStorage
// 版本 v5：统一供应商模型（支持 image/text/video 分类模型），新增默认模型选择

const STORAGE_KEY = 'miaos.state.v5';
const LEGACY_KEYS = ['miaos.state.v4', 'miaos.state.v3'];

const RANDOM_PROMPTS = [
  '清晨的湖边，薄雾缭绕，极简风格，远山倒影在水面上',
  '未来感女性肖像，霓虹光影，赛博朋克',
  '白色耳机极简渲染，柔和阴影，电商主图',
  '抽象几何流体，靛蓝渐变，艺术海报',
  '雪山脚下宁静湖面，雾气弥漫，极简构图',
  '玻璃香水瓶特写，纯净背景，高端质感',
  '液态金属与霓虹线条交织，未来主义背景',
  '日式枯山水庭院，樱花飘落，禅意极简',
  '深空星云，紫色调，超现实数字艺术',
  '复古胶片质感的城市街景，暖色调，雨夜',
];

// Grsai 内置已知模型（生图）
const GRSAI_IMAGE_MODELS = [
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
];

const DEFAULT_ENABLED_IMAGE = ['gpt-image-2', 'nano-banana-2', 'nano-banana-pro'];

const DEFAULT_PROVIDERS = [
  {
    id: 'p_grsai',
    name: 'Grsai',
    type: 'grsai',
    endpoint: 'https://grsaiapi.com/v1/api/generate',
    apiKey: '',
    capabilities: ['image'],
    imageModels: GRSAI_IMAGE_MODELS.map((m) => ({
      ...m,
      enabled: DEFAULT_ENABLED_IMAGE.includes(m.id),
    })),
    textModels: [],
    videoModels: [],
    lastTestResult: null,
  },
];

let state = load();

function migrate(parsed) {
  // 如果已经是 v5 格式（providers 有 imageModels 字段），直接返回，不做迁移
  if (parsed.providers && parsed.providers.length && parsed.providers[0].imageModels) {
    // 确保每个 provider 都有完整的 v5 字段
    return {
      ...parsed,
      providers: parsed.providers.map((p) => ({
        ...p,
        capabilities: p.capabilities || ['image'],
        imageModels: p.imageModels || [],
        textModels: p.textModels || [],
        videoModels: p.videoModels || [],
        lastTestResult: p.lastTestResult || null,
      })),
    };
  }

  // 从 v4 迁移：旧版 providers 只有 models 数组（全是生图模型），textProvider 独立
  const providers = parsed.providers && parsed.providers.length
    ? parsed.providers.map((p) => {
      const oldModels = Array.isArray(p.models) ? p.models : [];
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        endpoint: p.endpoint,
        apiKey: p.apiKey || '',
        capabilities: ['image'],
        imageModels: oldModels.map((m) => ({ id: m.id, name: m.name || m.id, enabled: !!m.enabled })),
        textModels: [],
        videoModels: [],
        lastTestResult: null,
      };
    })
    : structuredClone(DEFAULT_PROVIDERS);

  // 旧版 textProvider 迁移为一个独立的文本模型供应商
  if (parsed.textProvider && parsed.textProvider.endpoint) {
    const tp = parsed.textProvider;
    const textModelId = tp.model || 'text-model';
    providers.push({
      id: 'p_text_migrated',
      name: '文本模型',
      type: 'openai',
      endpoint: tp.endpoint,
      apiKey: tp.apiKey || '',
      capabilities: ['text'],
      imageModels: [],
      textModels: [{ id: textModelId, name: textModelId, enabled: true }],
      videoModels: [],
      lastTestResult: null,
    });
  }

  // 默认模型选择
  const defaults = parsed.defaults || {};
  let defaultImageProvider = defaults.defaultImageProvider || '';
  let defaultImageModel = defaults.defaultImageModel || '';
  let defaultTextProvider = defaults.defaultTextProvider || '';
  let defaultTextModel = defaults.defaultTextModel || '';
  let defaultVideoProvider = defaults.defaultVideoProvider || '';
  let defaultVideoModel = defaults.defaultVideoModel || '';

  // 如果没设置默认生图模型，用第一个有启用模型的
  if (!defaultImageProvider) {
    const firstWithImg = providers.find((p) => p.imageModels.some((m) => m.enabled));
    if (firstWithImg) {
      defaultImageProvider = firstWithImg.id;
      defaultImageModel = firstWithImg.imageModels.find((m) => m.enabled)?.id || '';
    }
  }
  // 如果迁移了文本模型，设为默认文本
  if (!defaultTextProvider && parsed.textProvider && parsed.textProvider.endpoint) {
    defaultTextProvider = 'p_text_migrated';
    defaultTextModel = parsed.textProvider.model || '';
  }

  return {
    providers,
    history: parsed.history || [],
    lastSettings: parsed.lastSettings || null,
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    defaults: {
      defaultImageProvider,
      defaultImageModel,
      defaultTextProvider,
      defaultTextModel,
      defaultVideoProvider,
      defaultVideoModel,
    },
    updateRepo: typeof parsed.updateRepo === 'string' ? parsed.updateRepo : 'dick86114/miaos',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
    for (const k of LEGACY_KEYS) {
      const legacyRaw = localStorage.getItem(k);
      if (legacyRaw) {
        const s = migrate(JSON.parse(legacyRaw));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) {}
        return s;
      }
    }
  } catch (e) {
    console.warn('状态读取失败，使用默认值', e);
  }
  // 全新安装：Grsai 作为默认
  return {
    providers: structuredClone(DEFAULT_PROVIDERS),
    history: [],
    lastSettings: null,
    projects: [],
    defaults: {
      defaultImageProvider: 'p_grsai',
      defaultImageModel: 'gpt-image-2',
      defaultTextProvider: '',
      defaultTextModel: '',
      defaultVideoProvider: '',
      defaultVideoModel: '',
    },
    updateRepo: 'dick86114/miaos',
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('状态保存失败', e);
  }
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== 时间格式化 =====
export function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return '昨天';
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== 供应商操作 =====
function cloneProvider(p) {
  return {
    ...p,
    imageModels: p.imageModels.map((m) => ({ ...m })),
    textModels: p.textModels.map((m) => ({ ...m })),
    videoModels: p.videoModels.map((m) => ({ ...m })),
  };
}

export function getProviders() {
  return state.providers.map(cloneProvider);
}

export function getProvider(id) {
  const p = state.providers.find((p) => p.id === id);
  return p ? cloneProvider(p) : null;
}

export function saveProvider(data) {
  const existing = data.id ? state.providers.find((p) => p.id === data.id) : null;
  if (existing) {
    existing.name = data.name ?? existing.name;
    existing.type = data.type ?? existing.type;
    existing.endpoint = data.endpoint ?? existing.endpoint;
    existing.apiKey = data.apiKey ?? existing.apiKey;
    if (data.capabilities) existing.capabilities = [...data.capabilities];
    if (data.imageModels) existing.imageModels = data.imageModels.map((m) => ({ ...m }));
    if (data.textModels) existing.textModels = data.textModels.map((m) => ({ ...m }));
    if (data.videoModels) existing.videoModels = data.videoModels.map((m) => ({ ...m }));
    if (data.lastTestResult !== undefined) existing.lastTestResult = data.lastTestResult;
    save();
    return cloneProvider(existing);
  }
  const provider = {
    id: uid('p'),
    name: data.name || '新供应商',
    type: data.type || 'openai',
    endpoint: data.endpoint || '',
    apiKey: data.apiKey || '',
    capabilities: data.capabilities || ['image'],
    imageModels: (data.imageModels || []).map((m) => ({ ...m })),
    textModels: (data.textModels || []).map((m) => ({ ...m })),
    videoModels: (data.videoModels || []).map((m) => ({ ...m })),
    lastTestResult: data.lastTestResult || null,
  };
  // Grsai 新建时自动填充默认生图模型
  if (provider.type === 'grsai' && provider.imageModels.length === 0) {
    provider.imageModels = GRSAI_IMAGE_MODELS.map((m) => ({
      ...m,
      enabled: DEFAULT_ENABLED_IMAGE.includes(m.id),
    }));
    provider.capabilities = ['image'];
  }
  state.providers.push(provider);
  save();
  return cloneProvider(provider);
}

export function deleteProvider(id) {
  state.providers = state.providers.filter((p) => p.id !== id);
  // 清理默认引用
  const d = state.defaults;
  if (d.defaultImageProvider === id) { d.defaultImageProvider = ''; d.defaultImageModel = ''; }
  if (d.defaultTextProvider === id) { d.defaultTextProvider = ''; d.defaultTextModel = ''; }
  if (d.defaultVideoProvider === id) { d.defaultVideoProvider = ''; d.defaultVideoModel = ''; }
  // 自动选择新的默认
  ensureDefaults();
  save();
}

function ensureDefaults() {
  const d = state.defaults;
  if (!d.defaultImageProvider || !state.providers.find((p) => p.id === d.defaultImageProvider && p.imageModels.some((m) => m.enabled))) {
    const first = state.providers.find((p) => p.imageModels.some((m) => m.enabled));
    d.defaultImageProvider = first ? first.id : '';
    d.defaultImageModel = first ? first.imageModels.find((m) => m.enabled)?.id || '' : '';
  }
  if (!d.defaultTextProvider || !state.providers.find((p) => p.id === d.defaultTextProvider && p.textModels.some((m) => m.enabled))) {
    const first = state.providers.find((p) => p.textModels.some((m) => m.enabled));
    d.defaultTextProvider = first ? first.id : '';
    d.defaultTextModel = first ? first.textModels.find((m) => m.enabled)?.id || '' : '';
  }
  if (!d.defaultVideoProvider || !state.providers.find((p) => p.id === d.defaultVideoProvider && p.videoModels.some((m) => m.enabled))) {
    const first = state.providers.find((p) => p.videoModels.some((m) => m.enabled));
    d.defaultVideoProvider = first ? first.id : '';
    d.defaultVideoModel = first ? first.videoModels.find((m) => m.enabled)?.id || '' : '';
  }
}

// ===== 模型操作（按分类） =====
const CAT_KEYS = { image: 'imageModels', text: 'textModels', video: 'videoModels' };

function toggleModelByCat(providerId, category, modelId, enabled) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return;
  const key = CAT_KEYS[category];
  if (!key) return;
  const m = p[key].find((m) => m.id === modelId);
  if (m) { m.enabled = enabled !== undefined ? enabled : !m.enabled; save(); }
}

export function toggleImageModel(pid, mid, en) { toggleModelByCat(pid, 'image', mid, en); }
export function toggleTextModel(pid, mid, en) { toggleModelByCat(pid, 'text', mid, en); }
export function toggleVideoModel(pid, mid, en) { toggleModelByCat(pid, 'video', mid, en); }

export function setProviderModelsByCat(providerId, category, models) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return;
  const key = CAT_KEYS[category];
  if (!key) return;
  const existing = new Map(p[key].map((m) => [m.id, m.enabled]));
  p[key] = models.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    enabled: existing.has(m.id) ? existing.get(m.id) : true,
  }));
  save();
}

export function addCustomModelByCat(providerId, category, modelName) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return null;
  const key = CAT_KEYS[category];
  if (!key) return null;
  const name = modelName.trim();
  if (!name) return null;
  if (p[key].some((m) => m.id === name)) {
    const m = p[key].find((m) => m.id === name);
    m.enabled = true;
    save();
    return m;
  }
  const m = { id: name, name, enabled: true };
  p[key].push(m);
  save();
  return m;
}

export function removeModelByCat(providerId, category, modelId) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return;
  const key = CAT_KEYS[category];
  if (!key) return;
  p[key] = p[key].filter((m) => m.id !== modelId);
  save();
}

// 获取某供应商某分类下已启用的模型
export function getEnabledModelsByCat(providerId, category) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return [];
  const key = CAT_KEYS[category];
  return p[key].filter((m) => m.enabled).map((m) => ({ ...m }));
}

// 兼容旧 API
export function getEnabledModels(providerId) {
  return getEnabledModelsByCat(providerId, 'image');
}

// 获取所有供应商下某分类已启用模型（聚合）
export function getAllEnabledModels(category = 'image') {
  const result = [];
  state.providers.forEach((p) => {
    const key = CAT_KEYS[category];
    if (!key) return;
    p[key].filter((m) => m.enabled).forEach((m) => {
      result.push({ ...m, providerId: p.id, providerName: p.name, providerType: p.type, providerEndpoint: p.endpoint, providerApiKey: p.apiKey });
    });
  });
  return result;
}

// ===== 测试连接 =====
export async function testConnection(provider) {
  if (!window.api || !window.api.testConnection) {
    await delay(500);
    if (!/^https?:\/\//i.test(provider.endpoint || '')) throw new Error('API 地址格式不正确');
    return { ok: true };
  }
  const result = await window.api.testConnection(provider);
  if (result && result.ok) return result;
  throw new Error((result && result.error) || '连接失败');
}

// ===== 获取模型列表 =====
export async function fetchModels(provider, category = 'image') {
  if (!window.api || !window.api.fetchModels) {
    if ((provider.type || '').toLowerCase() === 'grsai' && category === 'image') {
      return GRSAI_IMAGE_MODELS.map((m) => ({ ...m }));
    }
    return [];
  }
  const result = await window.api.fetchModels(provider, category);
  if (result && result.ok) return result.models || [];
  if (result && result.models && result.models.length) return result.models;
  throw new Error((result && result.error) || '获取模型列表失败');
}

// ===== 历史操作 =====
export function getHistory() { return state.history.slice(); }
export function getHistoryItem(id) { return state.history.find((h) => h.id === id) || null; }
export function deleteHistory(id) { state.history = state.history.filter((h) => h.id !== id); save(); }
export function clearHistory() { state.history = []; save(); }

// ===== 生图 =====
export async function generateImage({ prompt, providerId, modelId, ratio, quality, sourceImage }) {
  if (!prompt || !prompt.trim()) throw new Error('请输入提示词');
  const provider = state.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error('请选择供应商');
  if (!provider.endpoint) throw new Error('该供应商尚未配置 API 地址');
  const model = provider.imageModels.find((m) => m.id === modelId && m.enabled);
  if (!model) throw new Error('请选择模型');
  const size = ratioToSize(ratio);
  if (!window.api || !window.api.generateImage) throw new Error('运行环境异常：无法调用主进程生图接口');

  const result = await window.api.generateImage({
    prompt: prompt.trim(),
    provider: provider.type,
    modelName: model.id,
    ratio, quality, size,
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    sourceImage: sourceImage || null,
  });
  if (!result || !result.ok) throw new Error((result && result.error) || '生图失败');

  const imageSrc = result.fileUrl || result.imagePath;
  const record = {
    id: uid('h'),
    prompt: prompt.trim(),
    providerId: provider.id,
    providerName: provider.name,
    model: model.id,
    ratio, quality,
    image: imageSrc,
    createdAt: Date.now(),
  };
  state.history.unshift(record);
  if (state.history.length > 200) state.history = state.history.slice(0, 200);
  save();
  return record;
}

export function getRandomPrompt() {
  return RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
}

// ===== 默认模型设置 =====
export function getDefaults() {
  ensureDefaults();
  return { ...state.defaults };
}

export function setDefaults(d) {
  state.defaults = { ...state.defaults, ...d };
  ensureDefaults();
  save();
}

// 兼容旧 API
export function getDefaultProvider() {
  const d = getDefaults();
  const p = state.providers.find((p) => p.id === d.defaultImageProvider);
  return p ? cloneProvider(p) : null;
}

// 获取默认生图模型信息
export function getDefaultImageModel() {
  const d = getDefaults();
  if (!d.defaultImageProvider || !d.defaultImageModel) return null;
  const p = state.providers.find((x) => x.id === d.defaultImageProvider);
  if (!p) return null;
  const m = p.imageModels.find((x) => x.id === d.defaultImageModel && x.enabled);
  if (!m) return null;
  return { providerId: p.id, providerName: p.name, providerType: p.type, providerEndpoint: p.endpoint, providerApiKey: p.apiKey, modelId: m.id, modelName: m.name };
}

// 获取默认文本模型信息
export function getDefaultTextModel() {
  const d = getDefaults();
  if (!d.defaultTextProvider || !d.defaultTextModel) return null;
  const p = state.providers.find((x) => x.id === d.defaultTextProvider);
  if (!p) return null;
  const m = p.textModels.find((x) => x.id === d.defaultTextModel && x.enabled);
  if (!m) return null;
  return { providerId: p.id, providerName: p.name, providerType: p.type, providerEndpoint: p.endpoint, providerApiKey: p.apiKey, modelId: m.id, modelName: m.name };
}

// 兼容旧 getTextProvider API
export function getTextProvider() {
  const m = getDefaultTextModel();
  if (!m) return null;
  return { endpoint: m.providerEndpoint, apiKey: m.providerApiKey, model: m.modelId };
}

// ===== 优化提示词 =====
export async function optimizePrompt(prompt, language = 'zh') {
  const tm = getDefaultTextModel();
  if (!tm) throw new Error('请先在「设置 → 模型供应商」中配置并启用文本模型');
  if (!window.api || !window.api.optimizePrompt) throw new Error('运行环境异常：无法调用优化提示词接口');
  const result = await window.api.optimizePrompt({
    endpoint: tm.providerEndpoint,
    apiKey: tm.providerApiKey,
    model: tm.modelId,
    prompt,
    language,
  });
  if (!result || !result.optimized) throw new Error('优化失败：返回为空');
  return result.optimized;
}

export function ratioToSize(ratio) {
  const map = { '1:1': '1024x1024', '4:3': '1024x768', '16:9': '1024x576', '9:16': '576x1024' };
  return map[ratio] || '1024x1024';
}

export function saveLastSettings(settings) { state.lastSettings = settings; save(); }
export function getLastSettings() { return state.lastSettings; }

export async function imageToDataUrl(src) {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ===== 项目操作 =====
// 项目结构：
//   { id, name, description, createdAt, updatedAt, coverImageId, currentVersionId,
//     versions: [ { id, parentId, parentImageId, name, prompt, providerId, providerName, modelId, createdAt,
//                   images: [ { id, image, ratio, quality, createdAt } ] } ] }

function cloneProject(p) { return structuredClone(p); }

export function getProjects() { return state.projects.map(cloneProject); }
export function getProject(id) {
  const p = state.projects.find((p) => p.id === id);
  return p ? cloneProject(p) : null;
}

export function createProject({ name, description, prompt, providerId, providerName, modelId }) {
  const now = Date.now();
  const rootVersion = {
    id: uid('ver'),
    parentId: null,
    parentImageId: null,
    name: (name || '').trim() ? name : (prompt || '').trim().slice(0, 10) || '主线1',
    prompt: (prompt || '').trim(),
    providerId: providerId || '',
    providerName: providerName || '',
    modelId: modelId || '',
    createdAt: now,
    images: [],
  };
  const project = {
    id: uid('proj'),
    name: (name || '未命名项目').trim(),
    description: (description || '').trim(),
    createdAt: now,
    updatedAt: now,
    coverImageId: null,
    currentVersionId: rootVersion.id,
    versions: [rootVersion],
  };
  state.projects.unshift(project);
  save();
  return cloneProject(project);
}

export function updateProject(id, { name, description }) {
  const p = state.projects.find((p) => p.id === id);
  if (!p) return null;
  if (name !== undefined) p.name = name.trim();
  if (description !== undefined) p.description = description.trim();
  p.updatedAt = Date.now();
  save();
  return cloneProject(p);
}

export function deleteProject(id) { state.projects = state.projects.filter((p) => p.id !== id); save(); }

export function setCurrentVersion(projectId, versionId) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p) return;
  if (p.versions.some((v) => v.id === versionId)) {
    p.currentVersionId = versionId;
    p.updatedAt = Date.now();
    save();
  }
}

export function getVersionLabels(project) {
  const childrenMap = new Map();
  project.versions.forEach((v) => {
    const k = v.parentId || 'ROOT';
    if (!childrenMap.has(k)) childrenMap.set(k, []);
    childrenMap.get(k).push(v);
  });
  childrenMap.forEach((arr) => arr.sort((a, b) => a.createdAt - b.createdAt));
  const labels = new Map();
  const roots = (childrenMap.get('ROOT') || []).slice();
  roots.forEach((root, idx) => {
    const label = `v${idx + 1}`;
    labels.set(root.id, label);
    walk(root.id, label);
  });
  function walk(parentId, parentLabel) {
    const children = childrenMap.get(parentId) || [];
    children.forEach((child, idx) => {
      const label = `${parentLabel}.${idx + 1}`;
      labels.set(child.id, label);
      walk(child.id, label);
    });
  }
  return labels;
}

export function createRootVersion(projectId, { name, prompt, providerId, providerName, modelId }) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p) return null;
  const version = {
    id: uid('ver'),
    parentId: null,
    parentImageId: null,
    name: (name || '').trim() || (prompt || '').trim().slice(0, 10) || '新主线',
    prompt: (prompt || '').trim(),
    providerId: providerId || '',
    providerName: providerName || '',
    modelId: modelId || '',
    createdAt: Date.now(),
    images: [],
  };
  p.versions.push(version);
  p.currentVersionId = version.id;
  p.updatedAt = Date.now();
  save();
  return cloneProject(p);
}

export function createVersion(projectId, parentId, parentImageId, { name, prompt, providerId, providerName, modelId }) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p) return null;
  const parent = p.versions.find((v) => v.id === parentId);
  if (!parent) return null;
  const parentImage = parent.images.find((i) => i.id === parentImageId);
  if (!parentImage) return null;
  const defaultName = (prompt || parent.prompt || '').trim().slice(0, 10) || '分支';
  const version = {
    id: uid('ver'),
    parentId,
    parentImageId,
    name: (name || '').trim() || defaultName,
    prompt: (prompt || parent.prompt || '').trim(),
    providerId: providerId || parent.providerId || '',
    providerName: providerName || parent.providerName || '',
    modelId: modelId || parent.modelId || '',
    createdAt: Date.now(),
    images: [],
  };
  p.versions.push(version);
  p.currentVersionId = version.id;
  p.updatedAt = Date.now();
  save();
  return cloneProject(p);
}

export function updateVersionFields(versionId, { name, prompt, modelId, providerId, providerName }) {
  const p = state.projects.find((proj) => proj.versions.some((v) => v.id === versionId));
  if (!p) return null;
  const v = p.versions.find((x) => x.id === versionId);
  if (!v) return null;
  if (name !== undefined) v.name = String(name).trim();
  if (prompt !== undefined) v.prompt = prompt.trim();
  if (modelId !== undefined) v.modelId = modelId;
  if (providerId !== undefined) v.providerId = providerId;
  if (providerName !== undefined) v.providerName = providerName;
  p.updatedAt = Date.now();
  save();
  return cloneProject(p);
}

export function deleteVersion(projectId, versionId) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p) return;
  if (p.versions.length <= 1) return;
  const target = p.versions.find((v) => v.id === versionId);
  if (!target) return;
  const toDelete = new Set();
  const stack = [versionId];
  while (stack.length) {
    const cur = stack.pop();
    toDelete.add(cur);
    p.versions.filter((v) => v.parentId === cur).forEach((v) => stack.push(v.id));
  }
  p.versions = p.versions.filter((v) => !toDelete.has(v.id));
  if (toDelete.has(p.currentVersionId)) {
    const root = p.versions.find((v) => v.parentId === null) || p.versions[0];
    p.currentVersionId = root.id;
  }
  if (p.coverImageId) {
    const stillExists = p.versions.some((v) => v.images.some((i) => i.id === p.coverImageId));
    if (!stillExists) p.coverImageId = null;
  }
  p.updatedAt = Date.now();
  save();
}

export async function generateSmart(projectId, versionId, { prompt, modelId, ratio, quality, sourceImage }) {
  const p = state.projects.find((proj) => proj.id === projectId);
  if (!p) throw new Error('项目不存在');
  const v = p.versions.find((x) => x.id === versionId);
  if (!v) throw new Error('版本不存在');
  const trimmedPrompt = (prompt || '').trim();
  if (!trimmedPrompt) throw new Error('请输入提示词');
  if (!modelId) throw new Error('请选择模型');

  let targetVersionId = versionId;
  if (v.parentId === null) {
    const curSourceImg = v.sourceImage || '';
    const changed = trimmedPrompt !== v.prompt.trim() || modelId !== v.modelId || (sourceImage || '') !== curSourceImg;
    if (changed) {
      const provider = state.providers.find((pr) => pr.imageModels.some((m) => m.id === modelId && m.enabled));
      const newVer = {
        id: uid('ver'),
        parentId: null,
        parentImageId: null,
        name: trimmedPrompt.slice(0, 10) || '新主线',
        prompt: trimmedPrompt,
        providerId: provider ? provider.id : v.providerId,
        providerName: provider ? provider.name : v.providerName,
        modelId,
        createdAt: Date.now(),
        images: [],
        sourceImage: sourceImage || '',
      };
      p.versions.push(newVer);
      targetVersionId = newVer.id;
      p.currentVersionId = newVer.id;
    } else {
      v.prompt = trimmedPrompt;
      v.modelId = modelId;
    }
  } else {
    v.prompt = trimmedPrompt;
    v.modelId = modelId;
    const provider = state.providers.find((pr) => pr.imageModels.some((m) => m.id === modelId && m.enabled));
    if (provider) { v.providerId = provider.id; v.providerName = provider.name; }
  }
  p.updatedAt = Date.now();
  save();

  const target = p.versions.find((x) => x.id === targetVersionId);
  if (!target) throw new Error('目标版本不存在');
  const provider0 = state.providers.find((pr) => pr.id === target.providerId);
  if (!provider0) throw new Error('该版本所用供应商已被删除，请重新选择模型');
  if (!provider0.endpoint) throw new Error('该供应商尚未配置 API 地址');
  const model0 = provider0.imageModels.find((m) => m.id === target.modelId && m.enabled);
  if (!model0) throw new Error('该版本所用模型不可用，请重新选择');

  let finalSourceImage = null;
  if (target.parentId && target.parentImageId) {
    const parent = p.versions.find((pv) => pv.id === target.parentId);
    const parentImg = parent && parent.images.find((i) => i.id === target.parentImageId);
    if (!parentImg) throw new Error('父版本的参考图已被删除，无法进行图生图');
    finalSourceImage = parentImg.image;
  } else if (target.sourceImage) {
    finalSourceImage = target.sourceImage;
  }

  const size = ratioToSize(ratio);
  if (!window.api || !window.api.generateImage) throw new Error('运行环境异常：无法调用主进程生图接口');
  const result = await window.api.generateImage({
    prompt: target.prompt.trim(),
    provider: provider0.type,
    modelName: model0.id,
    ratio, quality, size,
    endpoint: provider0.endpoint,
    apiKey: provider0.apiKey,
    sourceImage: finalSourceImage,
  });
  if (!result || !result.ok) throw new Error((result && result.error) || '生图失败');
  const img = {
    id: uid('img'),
    image: result.fileUrl || result.imagePath,
    ratio, quality,
    createdAt: Date.now(),
  };
  target.images.unshift(img);
  p.updatedAt = Date.now();
  save();
  return { project: cloneProject(p), versionId: targetVersionId, image: img };
}

export function getImageBranchCount(projectId, imageId) {
  const p = state.projects.find((proj) => proj.id === projectId);
  if (!p) return 0;
  return p.versions.filter((v) => v.parentImageId === imageId).length;
}

export function deleteImage(projectId, versionId, imageId) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p) return;
  const v = p.versions.find((v) => v.id === versionId);
  if (!v) return;
  v.images = v.images.filter((img) => img.id !== imageId);
  if (p.coverImageId === imageId) p.coverImageId = null;
  p.updatedAt = Date.now();
  save();
}

export function setProjectCover(projectId, imageId) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p) return;
  p.coverImageId = imageId;
  p.updatedAt = Date.now();
  save();
}

export function getProjectCover(project) {
  if (project.coverImageId) {
    for (const v of project.versions) {
      const img = v.images.find((i) => i.id === project.coverImageId);
      if (img) return img.image;
    }
  }
  let latest = null;
  for (const v of project.versions) {
    for (const img of v.images) {
      if (!latest || img.createdAt > latest.createdAt) latest = img;
    }
  }
  return latest ? latest.image : null;
}

export function getProjectStats(project) {
  let imageCount = 0;
  project.versions.forEach((v) => (imageCount += v.images.length));
  return { versionCount: project.versions.length, imageCount };
}

export function getProjectImagesFlat(project) {
  const all = [];
  project.versions.forEach((v) => {
    v.images.forEach((img) => all.push({ ...img, versionId: v.id }));
  });
  all.sort((a, b) => b.createdAt - a.createdAt);
  return all;
}

// ===== 设置相关 =====
export function getUpdateRepo() { return state.updateRepo || ''; }
export function saveUpdateRepo(repo) { state.updateRepo = String(repo || '').trim(); save(); }
export function getSettings() {
  return {
    isPackaged: (window.api && window.api.updateGetCurrentVersion) ? undefined : false,
    updateRepo: state.updateRepo || '',
  };
}
