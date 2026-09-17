const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 30 * 1000;
const DEFAULT_MAX_REDIRECTS = 4;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 750;
const DEFAULT_MAX_RESPONSE_BYTES = 100 * 1024 * 1024;
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNABORTED',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'ENOTFOUND',
]);

function createDownloadError(message, options = {}) {
  const error = new Error(message);
  if (options.cause) error.cause = options.cause;
  if (options.code) error.code = options.code;
  if (options.status) error.status = options.status;
  return error;
}

function isRetryableError(error) {
  if (error?.name === 'NETWORK_TIMEOUT') return true;
  if (RETRYABLE_NETWORK_CODES.has(error?.code)) return true;
  const status = Number(error?.status || 0);
  return status === 429 || status >= 500;
}

async function downloadImageToFile(url, targetPath, options = {}) {
  const settings = {
    httpImpl: http,
    httpsImpl: https,
    fsImpl: fs,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRedirects: DEFAULT_MAX_REDIRECTS,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
    headers: {},
    ...options,
  };

  const initialUrl = new URL(url);
  if (!['http:', 'https:'].includes(initialUrl.protocol)) {
    throw createDownloadError('仅支持 HTTP 或 HTTPS 图片地址');
  }
  settings.fsImpl.mkdirSync(path.dirname(targetPath), { recursive: true });

  let lastError = null;
  for (let attempt = 0; attempt <= settings.maxRetries; attempt += 1) {
    try {
      const bytes = await performDownload(initialUrl, targetPath, settings);
      return { path: targetPath, bytes };
    } catch (error) {
      lastError = error;
      try { settings.fsImpl.unlinkSync(targetPath); } catch (_) {}
      if (attempt >= settings.maxRetries || !isRetryableError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, settings.retryDelayMs));
    }
  }
  throw lastError;
}

function performDownload(url, targetPath, settings, redirects = 0) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? settings.httpsImpl : settings.httpImpl;
    let settled = false;
    let req;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      req?.destroy?.();
      callback(value);
    };

    try {
      req = lib.request(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'image/png,image/jpeg,image/*;q=0.8,*/*;q=0.8',
          ...settings.headers,
        },
      }, (response) => {
        const status = Number(response.statusCode || 0);
        const location = response.headers?.location;
        if (status >= 300 && status < 400 && location) {
          response.resume?.();
          if (redirects >= settings.maxRedirects) {
            settle(reject, createDownloadError('图片下载重定向次数过多', { status }));
            return;
          }
          try {
            const nextUrl = new URL(location, url);
            if (!['http:', 'https:'].includes(nextUrl.protocol)) {
              settle(reject, createDownloadError('图片下载返回不安全的重定向地址', { status }));
              return;
            }
            performDownload(nextUrl, targetPath, settings, redirects + 1)
              .then(resolve, reject);
            return;
          } catch (error) {
            settle(reject, createDownloadError('图片下载返回无效重定向地址', { cause: error, status }));
            return;
          }
        }

        if (status < 200 || status >= 300) {
          response.resume?.();
          settle(reject, createDownloadError(`下载图片失败：HTTP ${status}`, { status }));
          return;
        }

        const contentLength = Number(response.headers?.['content-length']);
        if (Number.isFinite(contentLength) && contentLength > settings.maxResponseBytes) {
          response.resume?.();
          settle(reject, createDownloadError('图片超过下载大小限制', { status }));
          return;
        }

        let received = 0;
        const chunks = [];
        response.on('data', (chunk) => {
          const buffer = Buffer.from(chunk);
          received += chunk.length;
          if (received > settings.maxResponseBytes) {
            response.destroy?.();
            settle(reject, createDownloadError('图片超过下载大小限制', { status }));
            return;
          }
          chunks.push(buffer);
        });
        response.on('error', (error) => settle(reject, error));
        response.on('end', () => {
          if (settled) return;
          try {
            settings.fsImpl.writeFileSync(targetPath, Buffer.concat(chunks), { mode: 0o600 });
          } catch (error) {
            settle(reject, error);
            return;
          }
          settled = true;
          resolve(received);
        });
      });
    } catch (error) {
      settle(reject, error);
      return;
    }

    req.on('error', (error) => settle(reject, error));
    req.setTimeout(settings.timeoutMs, () => {
      settle(reject, createDownloadError('下载图片超时', { code: 'ETIMEDOUT' }));
    });
    req.end();
  });
}

module.exports = {
  downloadImageToFile,
  isRetryableImageDownloadError: isRetryableError,
};
