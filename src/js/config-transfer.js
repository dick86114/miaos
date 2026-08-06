// 跨平台配置迁移：构造白名单快照，并使用 PBKDF2 + AES-256-GCM 加密。
import crypto from 'node:crypto';

export const CONFIG_FORMAT = 'miaos-config';
export const CONFIG_VERSION = 1;
export const CONFIG_SCHEMA_VERSION = 1;
export const DEFAULT_PBKDF2_ITERATIONS = 600000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 1000) {
    throw new Error('配置密码不能为空');
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeModels(models) {
  if (!Array.isArray(models)) return [];
  return models
    .filter((model) => model && typeof model.id === 'string' && model.id.length > 0)
    .map((model) => ({
      id: model.id,
      name: typeof model.name === 'string' && model.name ? model.name : model.id,
      enabled: model.enabled === true,
    }));
}

function normalizeProvider(provider) {
  return {
    id: provider.id,
    name: typeof provider.name === 'string' ? provider.name : '',
    type: typeof provider.type === 'string' ? provider.type : '',
    endpoint: typeof provider.endpoint === 'string' ? provider.endpoint : '',
    capabilities: Array.isArray(provider.capabilities) ? provider.capabilities.filter((item) => typeof item === 'string') : [],
    imageModels: normalizeModels(provider.imageModels),
    textModels: normalizeModels(provider.textModels),
    videoModels: normalizeModels(provider.videoModels),
  };
}

export function createConfigPayload(state, secrets = {}) {
  const providers = Array.isArray(state?.providers)
    ? state.providers
      .filter((provider) => provider && typeof provider.id === 'string' && provider.id.length > 0)
      .map(normalizeProvider)
    : [];
  const safeSecrets = {};
  for (const provider of providers) {
    const secret = secrets?.[provider.id];
    if (typeof secret === 'string' && secret.length > 0) safeSecrets[provider.id] = secret;
  }

  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    providers,
    secrets: safeSecrets,
    defaults: cloneJson(state?.defaults && typeof state.defaults === 'object' ? state.defaults : {}),
    themeMode: ['system', 'light', 'dark'].includes(state?.themeMode) ? state.themeMode : 'system',
  };
}

function deriveKey(password, salt, iterations) {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_BYTES, 'sha256');
}

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64Url(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`配置${field}不正确`);
  try {
    return Buffer.from(value, 'base64url');
  } catch (_) {
    throw new Error(`配置${field}不正确`);
  }
}

export function encryptConfig(payload, password, { iterations = DEFAULT_PBKDF2_ITERATIONS } = {}) {
  assertPassword(password);
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 2000000) {
    throw new Error('配置加密参数不正确');
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(password, salt, iterations);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    format: CONFIG_FORMAT,
    version: CONFIG_VERSION,
    kdf: {
      name: 'PBKDF2-HMAC-SHA256',
      iterations,
      salt: toBase64Url(salt),
    },
    cipher: {
      name: 'AES-256-GCM',
      iv: toBase64Url(iv),
      tag: toBase64Url(tag),
      tagLength: 128,
    },
    payload: toBase64Url(encrypted),
  });
}

export function decryptConfig(raw, password) {
  assertPassword(password);
  try {
    const envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!envelope || envelope.format !== CONFIG_FORMAT) throw new Error('配置格式不支持');
    if (envelope.version > CONFIG_VERSION) throw new Error('配置版本过高，请升级妙生');
    if (envelope.version !== CONFIG_VERSION) throw new Error('配置版本不支持');
    if (envelope.kdf?.name !== 'PBKDF2-HMAC-SHA256' || envelope.cipher?.name !== 'AES-256-GCM') {
      throw new Error('配置加密算法不支持');
    }
    const iterations = envelope.kdf.iterations;
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 2000000) throw new Error('配置加密参数不正确');
    const salt = fromBase64Url(envelope.kdf.salt, '盐值');
    const iv = fromBase64Url(envelope.cipher.iv, '初始化向量');
    const tag = fromBase64Url(envelope.cipher.tag, '认证标签');
    const encrypted = fromBase64Url(envelope.payload, '密文');
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || tag.length !== TAG_BYTES || encrypted.length === 0) {
      throw new Error('配置加密数据长度不正确');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt, iterations), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const payload = JSON.parse(plaintext);
    if (!payload || payload.schemaVersion !== CONFIG_SCHEMA_VERSION || !Array.isArray(payload.providers)) {
      throw new Error('配置内容不正确');
    }
    return payload;
  } catch (error) {
    if (error.message === '配置格式不支持' || error.message === '配置版本过高，请升级妙生') throw error;
    throw new Error('配置解密失败');
  }
}
