const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOG_FILE_NAME = 'network-diagnostics.jsonl';
const MAX_LOG_BYTES = 1024 * 1024;

function sanitizeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch (_) {
    return '[无效地址]';
  }
}

function redactText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/https?:\/\/[^\s'"`<>]+/gi, (url) => sanitizeUrl(url) || '[已隐藏地址]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [已隐藏]')
    .replace(/((?:api[_-]?key|token|secret|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[已隐藏]')
    .slice(0, 600);
}

function errorDetails(error) {
  const cause = error && error.cause;
  return {
    name: String(error?.name || 'Error'),
    code: typeof error?.code === 'string' ? error.code : null,
    message: redactText(String(error?.message || '未知错误')),
    status: Number.isFinite(error?.status) ? error.status : null,
    retryable: typeof error?.retryable === 'boolean' ? error.retryable : null,
    errno: typeof error?.errno === 'string' ? error.errno : null,
    syscall: typeof error?.syscall === 'string' ? error.syscall : null,
    cause: cause ? {
      name: String(cause.name || 'Error'),
      code: typeof cause.code === 'string' ? cause.code : null,
      message: redactText(String(cause.message || '未知错误')),
      errno: typeof cause.errno === 'string' ? cause.errno : null,
      syscall: typeof cause.syscall === 'string' ? cause.syscall : null,
    } : null,
  };
}

function normalizeText(value, maxLength = 200) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function createDiagnosticLogger({
  directoryPath,
  fsImpl = fs,
  pathImpl = path,
  now = () => new Date(),
  createId = () => `diag-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
  maxLogBytes = MAX_LOG_BYTES,
} = {}) {
  const baseDirectory = String(directoryPath || '');
  const filePath = baseDirectory ? pathImpl.join(baseDirectory, LOG_FILE_NAME) : '';
  const rotatedFilePath = filePath ? `${filePath}.1` : '';

  function rotateIfNeeded() {
    if (!filePath) return;
    let size = 0;
    try {
      size = fsImpl.statSync(filePath).size;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (size < maxLogBytes) return;
    try { fsImpl.unlinkSync(rotatedFilePath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    fsImpl.renameSync(filePath, rotatedFilePath);
  }

  function recordFailure(details = {}) {
    try {
      if (!filePath) return null;
      fsImpl.mkdirSync(baseDirectory, { recursive: true, mode: 0o700 });
      rotateIfNeeded();
      const id = createId();
      const entry = {
        schema: 1,
        id,
        timestamp: now().toISOString(),
        event: 'image_generation_failed',
        stage: normalizeText(details.stage, 80) || 'unknown',
        provider: {
          id: normalizeText(details.providerId),
          type: normalizeText(details.providerType),
        },
        model: normalizeText(details.modelName),
        sourceImage: details.sourceImage === true,
        target: {
          endpoint: sanitizeUrl(details.endpoint),
          imageUrl: sanitizeUrl(details.imageUrl),
        },
        error: errorDetails(details.error),
      };
      fsImpl.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
      return { id, filePath };
    } catch (_) {
      return null;
    }
  }

  return { recordFailure, filePath };
}

module.exports = {
  createDiagnosticLogger,
  LOG_FILE_NAME,
  MAX_LOG_BYTES,
};
