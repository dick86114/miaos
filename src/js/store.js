// 应用状态管理：供应商→模型层级结构，持久化到 localStorage
// 版本 v4：新增「项目」概念，项目内含版本树（提示词+模型为版本定义，比例/质量为单次生成参数）

const STORAGE_KEY = 'miaos.state.v4';
const LEGACY_KEYS = ['miaos.state.v3'];

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

// Grsai 内置已知模型
const GRSAI_BUILTIN_MODELS = [
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

const DEFAULT_PROVIDERS = [
  {
    id: 'p_grsai',
    name: 'Grsai',
    type: 'grsai',
    endpoint: 'https://grsaiapi.com/v1/api/generate',
    apiKey: '',
    isDefault: true,
    models: GRSAI_BUILTIN_MODELS.map((m) => ({
      ...m,
      enabled: ['gpt-image-2', 'nano-banana-2', 'nano-banana-pro'].includes(m.id),
    })),
  },
];

let state = load();

function migrate(parsed) {
  return {
    providers: parsed.providers && parsed.providers.length ? parsed.providers : structuredClone(DEFAULT_PROVIDERS),
    history: parsed.history || [],
    lastSettings: parsed.lastSettings || null,
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    textProvider: parsed.textProvider || null,
    updateRepo: typeof parsed.updateRepo === 'string' ? parsed.updateRepo : '',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
    // 迁移旧版本数据
    for (const k of LEGACY_KEYS) {
      const legacyRaw = localStorage.getItem(k);
      if (legacyRaw) {
        const state = migrate(JSON.parse(legacyRaw));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
        return state;
      }
    }
  } catch (e) {
    console.warn('状态读取失败，使用默认值', e);
  }
  return {
    providers: structuredClone(DEFAULT_PROVIDERS),
    history: [],
    lastSettings: null,
    projects: [],
    textProvider: null,
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
export function getProviders() {
  return state.providers.map((p) => ({
    ...p,
    models: p.models.map((m) => ({ ...m })),
  }));
}

export function getProvider(id) {
  const p = state.providers.find((p) => p.id === id);
  if (!p) return null;
  return { ...p, models: p.models.map((m) => ({ ...m })) };
}

export function getDefaultProvider() {
  return state.providers.find((p) => p.isDefault) || state.providers[0] || null;
}

export function saveProvider(data) {
  if (data.id) {
    const idx = state.providers.findIndex((p) => p.id === data.id);
    if (idx >= 0) {
      const existing = state.providers[idx];
      state.providers[idx] = {
        ...existing,
        ...data,
        models: data.models || existing.models,
      };
      save();
      return state.providers[idx];
    }
  }
  const provider = {
    id: uid('p'),
    name: data.name || '新供应商',
    type: data.type || 'custom',
    endpoint: data.endpoint || '',
    apiKey: data.apiKey || '',
    isDefault: data.isDefault || false,
    models: data.models || [],
  };
  if (state.providers.length === 0) provider.isDefault = true;
  state.providers.push(provider);
  save();
  return provider;
}

export function deleteProvider(id) {
  const wasDefault = (getProvider(id) || {}).isDefault;
  state.providers = state.providers.filter((p) => p.id !== id);
  if (wasDefault && state.providers.length > 0) state.providers[0].isDefault = true;
  save();
}

export function setDefaultProvider(id) {
  state.providers.forEach((p) => (p.isDefault = p.id === id));
  save();
}

// ===== 供应商下模型操作 =====
export function toggleModel(providerId, modelId, enabled) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return;
  const m = p.models.find((m) => m.id === modelId);
  if (m) {
    m.enabled = enabled !== undefined ? enabled : !m.enabled;
    save();
  }
}

export function setProviderModels(providerId, models) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return;
  // 合并已有 enabled 状态
  const existing = new Map(p.models.map((m) => [m.id, m.enabled]));
  p.models = models.map((m) => ({
    id: m.id,
    name: m.name || m.id,
    enabled: existing.has(m.id) ? existing.get(m.id) : true,
  }));
  save();
}

export function addCustomModel(providerId, modelName) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return null;
  const name = modelName.trim();
  if (!name) return null;
  // 去重
  if (p.models.some((m) => m.id === name)) {
    const m = p.models.find((m) => m.id === name);
    m.enabled = true;
    save();
    return m;
  }
  const m = { id: name, name, enabled: true };
  p.models.push(m);
  save();
  return m;
}

export function removeModel(providerId, modelId) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return;
  p.models = p.models.filter((m) => m.id !== modelId);
  save();
}

// 获取供应商下已启用的模型
export function getEnabledModels(providerId) {
  const p = state.providers.find((p) => p.id === providerId);
  if (!p) return [];
  return p.models.filter((m) => m.enabled).map((m) => ({ ...m }));
}

// ===== 测试连接 =====
export async function testConnection(provider) {
  if (!window.api || !window.api.testConnection) {
    await delay(500);
    if (!/^https?:\/\//i.test(provider.endpoint || '')) throw new Error('API 地址格式不正确');
    return true;
  }
  const result = await window.api.testConnection(provider);
  return !!(result && result.ok);
}

// ===== 获取模型列表 =====
export async function fetchModels(provider) {
  if (!window.api || !window.api.fetchModels) {
    // 降级：Grsai 返回内置列表
    if ((provider.type || '').toLowerCase() === 'grsai') {
      return GRSAI_BUILTIN_MODELS.map((m) => ({ ...m }));
    }
    return [];
  }
  const result = await window.api.fetchModels(provider);
  if (result && result.ok) {
    return result.models || [];
  }
  if (result && result.models && result.models.length) {
    return result.models;
  }
  throw new Error((result && result.error) || '获取模型列表失败');
}

// ===== 历史操作 =====
export function getHistory() {
  return state.history.slice();
}
export function getHistoryItem(id) {
  return state.history.find((h) => h.id === id) || null;
}
export function deleteHistory(id) {
  state.history = state.history.filter((h) => h.id !== id);
  save();
}
export function clearHistory() {
  state.history = [];
  save();
}

// ===== 生图 =====
export async function generateImage({ prompt, providerId, modelId, ratio, quality, sourceImage }) {
  if (!prompt || !prompt.trim()) throw new Error('请输入提示词');
  const provider = state.providers.find((p) => p.id === providerId);
  if (!provider) throw new Error('请选择供应商');
  if (!provider.endpoint) throw new Error('该供应商尚未配置 API 地址');

  const model = provider.models.find((m) => m.id === modelId && m.enabled);
  if (!model) throw new Error('请选择模型');

  const size = ratioToSize(ratio);

  if (!window.api || !window.api.generateImage) {
    throw new Error('运行环境异常：无法调用主进程生图接口');
  }

  const result = await window.api.generateImage({
    prompt: prompt.trim(),
    provider: provider.type,
    modelName: model.id,
    ratio,
    quality,
    size,
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    sourceImage: sourceImage || null,
  });
  if (!result || !result.ok) {
    throw new Error((result && result.error) || '生图失败');
  }

  const imageSrc = result.fileUrl || result.imagePath;
  const record = {
    id: uid('h'),
    prompt: prompt.trim(),
    providerId: provider.id,
    providerName: provider.name,
    model: model.id,
    ratio,
    quality,
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

// ===== 文本模型配置（用于优化提示词） =====
export function getTextProvider() {
  return state.textProvider ? { ...state.textProvider } : null;
}
export function setTextProvider(config) {
  state.textProvider = {
    endpoint: (config.endpoint || '').trim(),
    apiKey: (config.apiKey || '').trim(),
    model: (config.model || '').trim(),
  };
  save();
}

// ===== 优化提示词（调 IPC → 文本模型 chat 接口） =====
export async function optimizePrompt(prompt, language = 'zh') {
  const tp = state.textProvider;
  if (!tp || !tp.endpoint || !tp.model) {
    throw new Error('请先在「供应商配置」页配置文本模型');
  }
  if (!window.api || !window.api.optimizePrompt) {
    throw new Error('运行环境异常：无法调用优化提示词接口');
  }
  const result = await window.api.optimizePrompt({
    endpoint: tp.endpoint,
    apiKey: tp.apiKey,
    model: tp.model,
    prompt,
    language,
  });
  if (!result || !result.optimized) throw new Error('优化失败：返回为空');
  return result.optimized;
}

export function ratioToSize(ratio) {
  const map = {
    '1:1': '1024x1024',
    '4:3': '1024x768',
    '16:9': '1024x576',
    '9:16': '576x1024',
  };
  return map[ratio] || '1024x1024';
}

export function saveLastSettings(settings) {
  state.lastSettings = settings;
  save();
}
export function getLastSettings() {
  return state.lastSettings;
}

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
// 根版本（parentId=null）：横向时间轴上的主线节点，名称可自定义
// 子版本（parentId 非 null）：主线下的分支卡片，基于父图图生图派生

function cloneProject(p) {
  return structuredClone(p);
}

export function getProjects() {
  return state.projects.map(cloneProject);
}

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

export function deleteProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  save();
}

export function setCurrentVersion(projectId, versionId) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p) return;
  if (p.versions.some((v) => v.id === versionId)) {
    p.currentVersionId = versionId;
    p.updatedAt = Date.now();
    save();
  }
}

// 计算版本标签：
// 根版本（parentId=null）按创建顺序：v1, v2, v3...
// 子版本按父版本标签 + 在父下的序号：v1.1, v1.2, v1.1.1...
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

// 新建根版本（独立，不基于任何父版本，对应时间轴上的新主线节点）
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

// 从指定父版本+父图派生子版本（图生图迭代，子版本默认继承父的 prompt/model）
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

// 直接更新某版本的字段（不建新节点）
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

// 删除版本及其子树（根版本和子版本都可删除，至少保留一个版本）
export function deleteVersion(projectId, versionId) {
  const p = state.projects.find((p) => p.id === projectId);
  if (!p) return;
  if (p.versions.length <= 1) return; // 至少保留一个版本
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

// 在版本下生图（核心逻辑：如果是根版本且 prompt/model 与当前版本不同，则先建新主线再生图）
// 返回 { project, versionId, image }：最终实际出图的版本 id 与图片对象（以及新 project）
export async function generateSmart(projectId, versionId, { prompt, modelId, ratio, quality, sourceImage }) {
  const p = state.projects.find((proj) => proj.id === projectId);
  if (!p) throw new Error('项目不存在');
  const v = p.versions.find((x) => x.id === versionId);
  if (!v) throw new Error('版本不存在');

  const trimmedPrompt = (prompt || '').trim();
  if (!trimmedPrompt) throw new Error('请输入提示词');
  if (!modelId) throw new Error('请选择模型');

  let targetVersionId = versionId;

  // 根版本：如果 prompt/model/sourceImage 与当前版本不一致，自动建新主线节点
  if (v.parentId === null) {
    const curSourceImg = v.sourceImage || '';
    const changed = trimmedPrompt !== v.prompt.trim() || modelId !== v.modelId || (sourceImage || '') !== curSourceImg;
    if (changed) {
      const provider = state.providers.find((pr) => pr.models.some((m) => m.id === modelId && m.enabled));
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
      // 没变更，保证参数与最新一致
      v.prompt = trimmedPrompt;
      v.modelId = modelId;
    }
  } else {
    // 子版本：直接覆盖参数（用户调优），不建新节点
    v.prompt = trimmedPrompt;
    v.modelId = modelId;
    const provider = state.providers.find((pr) => pr.models.some((m) => m.id === modelId && m.enabled));
    if (provider) { v.providerId = provider.id; v.providerName = provider.name; }
  }

  p.updatedAt = Date.now();
  save();

  // 用 targetVersionId 出图（不重复做 prompt/model 校验，已在上文做过）
  const target = p.versions.find((x) => x.id === targetVersionId);
  if (!target) throw new Error('目标版本不存在');

  const provider0 = state.providers.find((pr) => pr.id === target.providerId);
  if (!provider0) throw new Error('该版本所用供应商已被删除，请重新选择模型');
  if (!provider0.endpoint) throw new Error('该供应商尚未配置 API 地址');
  const model0 = provider0.models.find((m) => m.id === target.modelId && m.enabled);
  if (!model0) throw new Error('该版本所用模型不可用，请重新选择');

  // 图生图：优先用根版本上传的 sourceImage；子版本用 parentImageId 对应的父图
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
    ratio,
    quality,
    size,
    endpoint: provider0.endpoint,
    apiKey: provider0.apiKey,
    sourceImage: finalSourceImage,
  });
  if (!result || !result.ok) throw new Error((result && result.error) || '生图失败');

  const img = {
    id: uid('img'),
    image: result.fileUrl || result.imagePath,
    ratio,
    quality,
    createdAt: Date.now(),
  };
  target.images.unshift(img);
  p.updatedAt = Date.now();
  save();
  return { project: cloneProject(p), versionId: targetVersionId, image: img };
}

// 某张图被多少个子版本作为父图引用（用于画廊「N 分支」徽章）
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

// 获取项目封面：手动钉选优先，否则取最新图
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

// 把项目所有图片扁平化（按时间倒序），用于画廊总览
export function getProjectImagesFlat(project) {
  const all = [];
  project.versions.forEach((v) => {
    v.images.forEach((img) => all.push({ ...img, versionId: v.id }));
  });
  all.sort((a, b) => b.createdAt - a.createdAt);
  return all;
}

// ===== 设置相关 =====
export function getUpdateRepo() {
  return state.updateRepo || '';
}
export function saveUpdateRepo(repo) {
  state.updateRepo = String(repo || '').trim();
  save();
}
export function getSettings() {
  const isPackaged = (window.api && window.api.updateGetCurrentVersion)
    ? undefined
    : false;
  return {
    isPackaged,
    updateRepo: state.updateRepo || '',
  };
}
