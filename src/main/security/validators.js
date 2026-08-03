const path = require('path');
const { detectImageMime } = require('./image-binary');

const MAX_DATA_URL_BYTES = 50 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/;
const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

function validationError(message) {
  const error = new Error(message);
  error.code = 'IPC_VALIDATION_FAILED';
  return error;
}

function validateString(value, {
  field = '字段',
  minLength = 0,
  maxLength = Infinity,
  allowedValues,
  trim = false,
} = {}) {
  if (typeof value !== 'string') {
    throw validationError(`${field}必须是文本`);
  }

  const normalized = trim ? value.trim() : value;
  if (normalized.length < minLength) {
    throw validationError(`${field}不能为空`);
  }
  if (normalized.length > maxLength) {
    throw validationError(`${field}长度不能超过 ${maxLength}`);
  }
  if (allowedValues && !allowedValues.includes(normalized)) {
    throw validationError(`${field}不支持该值`);
  }
  return normalized;
}

function validateHttpUrl(value) {
  const urlText = validateString(value, { field: 'API 地址', minLength: 1, maxLength: 2000, trim: true });
  let parsed;
  try {
    parsed = new URL(urlText);
  } catch (_) {
    throw validationError('API 地址格式不正确');
  }

  if (parsed.protocol === 'https:') return parsed.toString();
  if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
    return parsed.toString();
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw validationError('仅支持 HTTP 或 HTTPS API 地址');
  }
  throw validationError('非本地 API 地址必须使用 HTTPS');
}

function validateRepoSlug(value) {
  const slug = validateString(value, { field: '仓库', minLength: 3, maxLength: 401, trim: true });
  const parts = slug.split('/');
  if (parts.length !== 2 || parts.some((part) => !part || part.length > 200 || !REPO_SEGMENT_PATTERN.test(part))) {
    throw validationError('仓库格式必须为 owner/repo');
  }
  return slug;
}

async function validateDataUrl(value, { decodeImageBuffer } = {}) {
  const dataUrl = validateString(value, { field: '图片数据', minLength: 1, maxLength: Math.ceil(MAX_DATA_URL_BYTES * 4 / 3) + 128 });
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    if (/^data:image\/(?!png;|jpeg;|webp;)/i.test(dataUrl)) {
      throw validationError('图片数据声明仅允许 PNG、JPEG 或 WebP');
    }
    throw validationError('图片数据 base64 格式不正确');
  }

  const base64 = match[2];
  if (base64.length % 4 !== 0) {
    throw validationError('图片数据 base64 格式不正确');
  }
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.toString('base64') !== base64) {
    throw validationError('图片数据 base64 格式不正确');
  }
  if (buffer.length === 0) {
    throw validationError('图片数据不能为空');
  }
  if (buffer.length > MAX_DATA_URL_BYTES) {
    throw validationError('图片数据不能超过 50 MiB');
  }
  const detectedMime = detectImageMime(buffer);
  if (!detectedMime) {
    throw validationError('图片数据不是完整的受支持图片');
  }
  if (detectedMime !== match[1]) {
    throw validationError('图片声明的 MIME 与实际内容不一致');
  }
  if (typeof decodeImageBuffer !== 'function') {
    throw validationError('图片解码器不可用');
  }
  try {
    await decodeImageBuffer(buffer, { mime: detectedMime, allowSipsFallback: true });
  } catch (error) {
    throw validationError(error && error.message ? error.message : '图片内容不是可解码的有效图片');
  }
  return dataUrl;
}

function validateSuggestedName(value) {
  if (value === undefined || value === null || value === '') return 'miaos-image.png';
  const original = validateString(value, { field: '文件名', minLength: 1, maxLength: 4096 });
  const basename = path.basename(original.replace(/\\/g, '/'));
  if (basename === '.' || basename === '..' || !basename) {
    throw validationError('文件名不合法');
  }
  return validateString(basename, { field: '文件名', minLength: 1, maxLength: 128 });
}

module.exports = {
  MAX_DATA_URL_BYTES,
  validateString,
  validateHttpUrl,
  validateRepoSlug,
  validateDataUrl,
  validateSuggestedName,
};
