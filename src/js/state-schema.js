// 状态 schema 与持久化：纯 ES Module，不依赖浏览器 DOM
// 版本 v6：新增 Aiping 内置供应商，并保证旧用户仅在迁移时补入一次。

export const STATE_SCHEMA_VERSION = 6;
export const CURRENT_STORAGE_KEY = 'miaos.state.v6';
export const BACKUP_STORAGE_KEY = 'miaos.state.backup.v6';
export const LEGACY_STORAGE_KEYS = ['miaos.state.v5', 'miaos.state.v4', 'miaos.state.v3'];

// Grsai 内置已知模型（生图）
export const GRSAI_IMAGE_MODELS = [
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

export const DEFAULT_ENABLED_IMAGE = ['gpt-image-2', 'nano-banana-2', 'nano-banana-pro'];

// Aiping 文档中列出的图像模型。图片编辑模型默认关闭，避免在没有参考图时误选。
export const AIPING_IMAGE_MODELS = [
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
];

export const AIPING_TEXT_MODELS = [
  { id: 'DeepSeek-V3.1', name: 'DeepSeek-V3.1' },
  { id: 'DeepSeek-R1-0528', name: 'DeepSeek-R1-0528' },
];

const AIPING_DISABLED_IMAGE_MODELS = new Set([
  'Qwen-Image-Edit',
  'Qwen-Image-Edit-Plus',
  'Wan2.5-I2I-Preview',
]);

export const DEFAULT_PROVIDERS = [
  {
    id: 'p_grsai',
    name: 'Grsai',
    type: 'grsai',
    endpoint: 'https://grsaiapi.com/v1/api/generate',
    hasApiKey: false,
    capabilities: ['image'],
    imageModels: GRSAI_IMAGE_MODELS.map((m) => ({
      ...m,
      enabled: DEFAULT_ENABLED_IMAGE.includes(m.id),
    })),
    textModels: [],
    videoModels: [],
    lastTestResult: null,
  },
  {
    id: 'p_aiping',
    name: 'Aiping',
    type: 'aiping',
    endpoint: 'https://aiping.cn/api/v1',
    hasApiKey: false,
    capabilities: ['image', 'text'],
    imageModels: AIPING_IMAGE_MODELS.map((model) => ({
      ...model,
      enabled: !AIPING_DISABLED_IMAGE_MODELS.has(model.id),
    })),
    textModels: AIPING_TEXT_MODELS.map((model) => ({ ...model, enabled: true })),
    videoModels: [],
    lastTestResult: null,
  },
];

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    providers: clone(DEFAULT_PROVIDERS),
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
    themeMode: 'system',
    updateRepo: 'dick86114/miaos',
  };
}

function normalizeProvider(provider) {
  return {
    ...provider,
    capabilities: provider.capabilities || ['image'],
    imageModels: provider.imageModels || [],
    textModels: provider.textModels || [],
    videoModels: provider.videoModels || [],
    lastTestResult: provider.lastTestResult || null,
    hasApiKey: !!provider.hasApiKey,
  };
}

function appendAipingIfMissing(providers) {
  const normalized = providers.map(normalizeProvider);
  if (!normalized.some((provider) => provider.id === 'p_aiping')) {
    normalized.push(clone(DEFAULT_PROVIDERS.find((provider) => provider.id === 'p_aiping')));
  }
  return normalized;
}

export function migrateState(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};

  // v5/v6 都已使用分类模型；只有旧于 v6 的状态需要补入一次 Aiping。
  const hasCategorizedProviderState = Array.isArray(source.providers)
    && (source.schemaVersion === STATE_SCHEMA_VERSION
      || source.providers.some((provider) => Array.isArray(provider?.imageModels)));
  if (hasCategorizedProviderState) {
    const defaults = source.defaults || {};
    const providers = source.schemaVersion === STATE_SCHEMA_VERSION
      ? source.providers.map(normalizeProvider)
      : appendAipingIfMissing(source.providers);
    return {
      ...source,
      schemaVersion: STATE_SCHEMA_VERSION,
      providers,
      history: Array.isArray(source.history) ? source.history : [],
      projects: Array.isArray(source.projects) ? source.projects : [],
      defaults: {
        defaultImageProvider: defaults.defaultImageProvider || '',
        defaultImageModel: defaults.defaultImageModel || '',
        defaultTextProvider: defaults.defaultTextProvider || '',
        defaultTextModel: defaults.defaultTextModel || '',
        defaultVideoProvider: defaults.defaultVideoProvider || '',
        defaultVideoModel: defaults.defaultVideoModel || '',
      },
      updateRepo: typeof source.updateRepo === 'string' ? source.updateRepo : 'dick86114/miaos',
      themeMode: source.themeMode || 'system',
    };
  }

  // 从 v4/v3 迁移：旧版 providers 只有 models 数组（全是生图模型），textProvider 独立
  const providers = source.providers && source.providers.length
    ? source.providers.map((p) => {
      const oldModels = Array.isArray(p.models) ? p.models : [];
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        endpoint: p.endpoint,
        apiKey: p.apiKey || '',
        hasApiKey: !!p.hasApiKey,
        capabilities: ['image'],
        imageModels: oldModels.map((m) => ({ id: m.id, name: m.name || m.id, enabled: !!m.enabled })),
        textModels: [],
        videoModels: [],
        lastTestResult: null,
      };
    })
    : clone(DEFAULT_PROVIDERS);

  // 旧版 textProvider 迁移为一个独立的文本模型供应商
  if (source.textProvider && source.textProvider.endpoint) {
    const tp = source.textProvider;
    const textModelId = tp.model || 'text-model';
    providers.push({
      id: 'p_text_migrated',
      name: '文本模型',
      type: 'openai',
      endpoint: tp.endpoint,
      apiKey: tp.apiKey || '',
      hasApiKey: !!tp.hasApiKey,
      capabilities: ['text'],
      imageModels: [],
      textModels: [{ id: textModelId, name: textModelId, enabled: true }],
      videoModels: [],
      lastTestResult: null,
    });
  }

  // 默认模型选择
  const defaults = source.defaults || {};
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
  if (!defaultTextProvider && source.textProvider && source.textProvider.endpoint) {
    defaultTextProvider = 'p_text_migrated';
    defaultTextModel = source.textProvider.model || '';
  }

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    providers: appendAipingIfMissing(providers),
    history: source.history || [],
    lastSettings: source.lastSettings || null,
    projects: Array.isArray(source.projects) ? source.projects : [],
    defaults: {
      defaultImageProvider,
      defaultImageModel,
      defaultTextProvider,
      defaultTextModel,
      defaultVideoProvider,
      defaultVideoModel,
    },
    updateRepo: typeof source.updateRepo === 'string' ? source.updateRepo : 'dick86114/miaos',
    themeMode: source.themeMode || 'system',
  };
}


// 构造不包含明文密钥的可信供应商元数据，用于主进程一次性绑定网络目标。
function providerMetadata(provider) {
  return {
    id: provider.id,
    name: provider.name || '',
    type: provider.type || '',
    endpoint: provider.endpoint || '',
    capabilities: Array.isArray(provider.capabilities) ? [...provider.capabilities] : [],
    imageModels: Array.isArray(provider.imageModels) ? provider.imageModels.map((model) => ({ ...model })) : [],
    textModels: Array.isArray(provider.textModels) ? provider.textModels.map((model) => ({ ...model })) : [],
    videoModels: Array.isArray(provider.videoModels) ? provider.videoModels.map((model) => ({ ...model })) : [],
  };
}

// 将旧 localStorage 中的明文密钥与供应商绑定信息交给主进程。只有主进程确认全部完成后才清理状态。
export async function migrateLegacyProviderSecrets(state, migrateSecrets) {
  const providers = Array.isArray(state?.providers) ? state.providers : [];
  const entries = providers.map((provider) => ({
    providerId: provider.id,
    metadata: providerMetadata(provider),
    ...(typeof provider.apiKey === 'string' && provider.apiKey.length > 0 ? { apiKey: provider.apiKey } : {}),
  }));

  if (entries.length > 0) {
    const result = await migrateSecrets(entries);
    if (!result || result.ok !== true) {
      return {
        ok: false,
        ...(result?.code ? { code: result.code } : {}),
        ...(result?.transactionId ? { transactionId: result.transactionId } : {}),
        error: result?.error || 'API Key 安全迁移失败',
      };
    }
    for (const provider of providers) {
      if (typeof provider.apiKey === 'string') {
        provider.hasApiKey = provider.apiKey.length > 0 || !!provider.hasApiKey;
        delete provider.apiKey;
      } else if (provider.hasApiKey === undefined) {
        provider.hasApiKey = false;
      }
    }
    return { ok: true, migrated: entries.some((entry) => !!entry.apiKey), transactionId: result.transactionId };
  }

  return { ok: true, migrated: false };
}

export function validateState(value) {
  const errors = [];
  if (!value || typeof value !== 'object') errors.push('状态必须是对象');
  if (!Array.isArray(value?.providers)) errors.push('providers 必须是数组');
  if (!Array.isArray(value?.history)) errors.push('history 必须是数组');
  if (!Array.isArray(value?.projects)) errors.push('projects 必须是数组');
  if (!value?.defaults || typeof value.defaults !== 'object') errors.push('defaults 必须是对象');
  return { ok: errors.length === 0, errors };
}

function readMigratedState(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return { state: null, error: null };
    const state = migrateState(JSON.parse(raw));
    const validation = validateState(state);
    if (!validation.ok) {
      return { state: null, error: new Error(`状态校验失败：${validation.errors.join('；')}`) };
    }
    return { state, error: null };
  } catch (error) {
    return { state: null, error };
  }
}

function stringifyState(value) {
  return JSON.stringify(value);
}

function safeWrite(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch (_) {}
}

export function createStatePersistence(storage) {
  let pendingState = null;
  let timer = null;

  function saveNow(nextState) {
    const migrated = migrateState(nextState);
    const validation = validateState(migrated);
    if (!validation.ok) {
      throw new Error(`状态校验失败：${validation.errors.join('；')}`);
    }

    const previous = readMigratedState(storage, CURRENT_STORAGE_KEY);
    if (previous.state) {
      storage.setItem(BACKUP_STORAGE_KEY, stringifyState(previous.state));
    }
    storage.setItem(CURRENT_STORAGE_KEY, stringifyState(migrated));
    return migrated;
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingState) {
      const state = pendingState;
      pendingState = null;
      saveNow(state);
    }
  }

  return {
    load() {
      const current = readMigratedState(storage, CURRENT_STORAGE_KEY);
      if (current.state) {
        return { state: current.state, source: 'current', warning: null };
      }

      const backup = readMigratedState(storage, BACKUP_STORAGE_KEY);
      if (backup.state) {
        safeWrite(storage, CURRENT_STORAGE_KEY, stringifyState(backup.state));
        return {
          state: backup.state,
          source: 'backup',
          warning: current.error ? '主状态损坏，已从备份恢复' : '主状态缺失，已从备份恢复',
        };
      }

      for (const key of LEGACY_STORAGE_KEYS) {
        const legacy = readMigratedState(storage, key);
        if (legacy.state) {
          safeWrite(storage, CURRENT_STORAGE_KEY, stringifyState(legacy.state));
          return { state: legacy.state, source: 'legacy', warning: '已从旧版状态迁移' };
        }
      }

      return { state: createDefaultState(), source: 'default', warning: current.error ? '状态读取失败，已使用默认值' : null };
    },
    scheduleSave(nextState) {
      pendingState = nextState;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const state = pendingState;
        pendingState = null;
        if (state) saveNow(state);
      }, 100);
    },
    saveNow,
    flush,
  };
}
