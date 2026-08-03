const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { requestJson } = require('../src/main/services/http-client');
const { AppError, toPublicError } = require('../src/main/services/app-error');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('成功响应会解析 JSON 并保留状态码', async () => {
  await withServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  }, async (baseUrl) => {
    const result = await requestJson({ url: baseUrl, method: 'GET' });
    assert.deepEqual(result, { status: 200, data: { ok: true } });
  });
});

test('请求超时返回统一错误码', async () => {
  await withServer((_req, _res) => {}, async (baseUrl) => {
    await assert.rejects(
      requestJson({ url: baseUrl, timeoutMs: 20 }),
      (error) => error.code === 'NETWORK_TIMEOUT' && error.retryable === true,
    );
  });
});

test('响应超过限制时中止读取', async () => {
  await withServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: 'x'.repeat(2048) }));
  }, async (baseUrl) => {
    await assert.rejects(
      requestJson({ url: baseUrl, maxResponseBytes: 100 }),
      (error) => error.code === 'RESPONSE_TOO_LARGE',
    );
  });
});

test('有限次数内跟随同源重定向，并在超限时返回安全错误', async () => {
  await withServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(302, { location: '/done' });
      res.end();
      return;
    }
    if (req.url === '/done') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ redirected: true }));
      return;
    }
    res.writeHead(302, { location: '/loop' });
    res.end();
  }, async (baseUrl) => {
    assert.deepEqual(await requestJson({ url: baseUrl, method: 'GET' }), {
      status: 200,
      data: { redirected: true },
    });
    await assert.rejects(
      requestJson({ url: `${baseUrl}/loop`, method: 'GET', maxRedirects: 1 }),
      (error) => error.code === 'TOO_MANY_REDIRECTS' && error.retryable === false,
    );
  });
});

test('401、429、5xx 与非 JSON 响应映射为不含上游正文的公开错误', async () => {
  const secret = 'sk-review-secret';
  await withServer((req, res) => {
    const responses = {
      '/401': [401, JSON.stringify({ error: { message: `Authorization: Bearer ${secret}` } })],
      '/429': [429, JSON.stringify({ error: `Bearer ${secret}` })],
      '/500': [500, JSON.stringify({ message: secret })],
      '/html': [200, '<html>Bearer sk-review-secret</html>'],
    };
    const [status, body] = responses[req.url] || [404, '{}'];
    res.statusCode = status;
    res.setHeader('content-type', req.url === '/html' ? 'text/html' : 'application/json');
    res.end(body);
  }, async (baseUrl) => {
    for (const [pathname, code, retryable] of [
      ['/401', 'AUTH_FAILED', false],
      ['/429', 'RATE_LIMITED', true],
      ['/500', 'UPSTREAM_ERROR', true],
      ['/html', 'INVALID_RESPONSE', false],
    ]) {
      await assert.rejects(requestJson({ url: `${baseUrl}${pathname}` }), (error) => {
        const publicError = toPublicError(error);
        return error.code === code
          && publicError.code === code
          && publicError.retryable === retryable
          && !JSON.stringify(publicError).includes(secret);
      });
    }
  });
});

test('用户取消请求返回统一错误码', async () => {
  await withServer((_req, _res) => {}, async (baseUrl) => {
    const controller = new AbortController();
    const promise = requestJson({ url: baseUrl, signal: controller.signal });
    controller.abort();
    await assert.rejects(
      promise,
      (error) => error.code === 'REQUEST_ABORTED' && error.retryable === false,
    );
  });
});

test('公开错误模型不暴露非受信任异常消息', () => {
  const unexpected = new Error('Authorization: Bearer sk-review-secret');
  const publicUnexpected = toPublicError(unexpected);
  assert.deepEqual(publicUnexpected, {
    code: 'INTERNAL_ERROR',
    error: '请求处理失败，请稍后重试',
    retryable: false,
  });

  const known = new AppError('NETWORK_TIMEOUT', '请求超时，请稍后重试', { retryable: true });
  assert.deepEqual(toPublicError(known), {
    code: 'NETWORK_TIMEOUT',
    error: '请求超时，请稍后重试',
    retryable: true,
  });
});
