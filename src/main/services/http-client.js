const http = require('http');
const https = require('https');
const { URL } = require('url');
const { AppError } = require('./app-error');

const DEFAULT_TIMEOUT_MS = 60 * 1000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

function createHttpStatusError(status) {
  if (status === 401 || status === 403) {
    return new AppError('AUTH_FAILED', '认证失败，请检查 API Key 是否有效', { status, retryable: false });
  }
  if (status === 429) {
    return new AppError('RATE_LIMITED', '请求过于频繁，请稍后再试', { status, retryable: true });
  }
  if (status >= 500) {
    return new AppError('UPSTREAM_ERROR', '上游服务暂时不可用，请稍后重试', { status, retryable: true });
  }
  return new AppError('UPSTREAM_REJECTED', '请求被服务拒绝，请检查 API 地址和请求参数', { status, retryable: false });
}

function createNetworkError(error) {
  if (error instanceof AppError) return error;
  return new AppError('NETWORK_ERROR', '网络请求失败，请检查网络或 API 地址', {
    cause: error,
    retryable: true,
  });
}

function toBodyBuffer(body) {
  if (body === undefined || body === null) return null;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  try {
    return Buffer.from(JSON.stringify(body));
  } catch (error) {
    throw new AppError('REQUEST_BODY_INVALID', '请求内容格式不正确', { cause: error, retryable: false });
  }
}

function getRedirectHeaders(headers, currentUrl, nextUrl, method) {
  const normalized = { ...headers };
  if (currentUrl.origin !== nextUrl.origin) {
    delete normalized.Authorization;
    delete normalized.authorization;
  }
  if (method === 'GET' || method === 'HEAD') {
    delete normalized['Content-Length'];
    delete normalized['content-length'];
  }
  return normalized;
}

function requestJson(options) {
  const settings = {
    method: 'POST',
    headers: {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRedirects: DEFAULT_MAX_REDIRECTS,
    maxResponseBytes: DEFAULT_MAX_RESPONSE_BYTES,
    ...options,
  };

  if (!Number.isFinite(settings.timeoutMs) || settings.timeoutMs <= 0) {
    return Promise.reject(new AppError('REQUEST_TIMEOUT_INVALID', '请求超时配置不正确', { retryable: false }));
  }
  if (!Number.isInteger(settings.maxRedirects) || settings.maxRedirects < 0) {
    return Promise.reject(new AppError('REDIRECT_LIMIT_INVALID', '重定向配置不正确', { retryable: false }));
  }
  if (!Number.isFinite(settings.maxResponseBytes) || settings.maxResponseBytes <= 0) {
    return Promise.reject(new AppError('RESPONSE_LIMIT_INVALID', '响应大小限制配置不正确', { retryable: false }));
  }

  let initialUrl;
  try {
    initialUrl = new URL(settings.url);
  } catch (error) {
    return Promise.reject(new AppError('INVALID_URL', 'API 地址格式不正确', { cause: error, retryable: false }));
  }
  if (!['http:', 'https:'].includes(initialUrl.protocol)) {
    return Promise.reject(new AppError('INVALID_URL', '仅支持 HTTP 或 HTTPS API 地址', { retryable: false }));
  }

  let bodyBuffer;
  try {
    bodyBuffer = toBodyBuffer(settings.body);
  } catch (error) {
    return Promise.reject(error);
  }

  return performRequest({
    url: initialUrl,
    method: String(settings.method || 'POST').toUpperCase(),
    headers: { ...settings.headers },
    bodyBuffer,
    timeoutMs: settings.timeoutMs,
    maxRedirects: settings.maxRedirects,
    maxResponseBytes: settings.maxResponseBytes,
    signal: settings.signal,
    redirects: 0,
  });
}

function performRequest(context) {
  return new Promise((resolve, reject) => {
    if (context.signal?.aborted) {
      reject(new AppError('REQUEST_ABORTED', '请求已取消', { retryable: false }));
      return;
    }

    const lib = context.url.protocol === 'https:' ? https : http;
    const headers = { ...context.headers };
    if (context.bodyBuffer) {
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = String(context.bodyBuffer.length);
    }

    let settled = false;
    let timedOut = false;
    let aborted = false;
    let req;
    let onAbort;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (context.signal && onAbort) context.signal.removeEventListener('abort', onAbort);
      callback(value);
    };

    try {
      req = lib.request({
        protocol: context.url.protocol,
        hostname: context.url.hostname,
        port: context.url.port || undefined,
        path: `${context.url.pathname}${context.url.search}`,
        method: context.method,
        headers,
      }, (res) => {
        const status = Number(res.statusCode || 0);
        const location = res.headers && res.headers.location;
        if (status >= 300 && status < 400 && location) {
          if (context.redirects >= context.maxRedirects) {
            res.resume?.();
            settle(reject, new AppError('TOO_MANY_REDIRECTS', '服务重定向次数过多', { status, retryable: false }));
            return;
          }

          let nextUrl;
          try {
            nextUrl = new URL(location, context.url);
          } catch (error) {
            res.resume?.();
            settle(reject, new AppError('REDIRECT_INVALID', '服务返回了无效重定向地址', { cause: error, status, retryable: false }));
            return;
          }
          if (!['http:', 'https:'].includes(nextUrl.protocol)) {
            res.resume?.();
            settle(reject, new AppError('REDIRECT_INVALID', '服务返回了不安全的重定向地址', { status, retryable: false }));
            return;
          }

          res.resume?.();
          const switchToGet = status === 303 || ((status === 301 || status === 302) && context.method === 'POST');
          performRequest({
            ...context,
            url: nextUrl,
            method: switchToGet ? 'GET' : context.method,
            headers: getRedirectHeaders(headers, context.url, nextUrl, switchToGet ? 'GET' : context.method),
            bodyBuffer: switchToGet ? null : context.bodyBuffer,
            redirects: context.redirects + 1,
          }).then((result) => settle(resolve, result), (error) => settle(reject, error));
          return;
        }

        const contentLength = Number(res.headers && res.headers['content-length']);
        if (Number.isFinite(contentLength) && contentLength > context.maxResponseBytes) {
          res.resume?.();
          req.destroy();
          settle(reject, new AppError('RESPONSE_TOO_LARGE', '服务响应过大，已停止读取', { status, retryable: false }));
          return;
        }

        const chunks = [];
        let received = 0;
        res.on('data', (chunk) => {
          if (settled) return;
          received += chunk.length;
          if (received > context.maxResponseBytes) {
            req.destroy();
            settle(reject, new AppError('RESPONSE_TOO_LARGE', '服务响应过大，已停止读取', { status, retryable: false }));
            return;
          }
          chunks.push(Buffer.from(chunk));
        });
        res.on('error', (error) => settle(reject, createNetworkError(error)));
        res.on('end', () => {
          if (settled) return;
          if (status < 200 || status >= 300) {
            settle(reject, createHttpStatusError(status));
            return;
          }
          const text = Buffer.concat(chunks).toString('utf8');
          let data;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (error) {
            settle(reject, new AppError('INVALID_RESPONSE', '服务返回了无法解析的数据', {
              cause: error,
              status,
              retryable: false,
            }));
            return;
          }
          settle(resolve, { status, data });
        });
      });
    } catch (error) {
      settle(reject, createNetworkError(error));
      return;
    }

    req.on('error', (error) => {
      if (timedOut || aborted) return;
      settle(reject, createNetworkError(error));
    });
    req.setTimeout?.(context.timeoutMs, () => {
      timedOut = true;
      req.destroy();
      settle(reject, new AppError('NETWORK_TIMEOUT', '请求超时，请稍后重试', { retryable: true }));
    });
    onAbort = () => {
      aborted = true;
      req.destroy();
      settle(reject, new AppError('REQUEST_ABORTED', '请求已取消', { retryable: false }));
    };
    context.signal?.addEventListener('abort', onAbort, { once: true });

    if (context.bodyBuffer) req.write(context.bodyBuffer);
    req.end();
  });
}

module.exports = {
  requestJson,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
};
