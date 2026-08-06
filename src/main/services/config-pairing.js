// 局域网一次性配置配对服务：只传输已经加密的 `.miaos` 信封。
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const { URL } = require('url');

function makeToken(randomBytes = crypto.randomBytes) {
  return randomBytes(32).toString('base64url');
}

/**
 * 仅用于用户肉眼核对同一配对会话；由一次性 token 派生，不能反推出 token 或 API Key。
 * Android 使用同一 SHA-256 前 3 字节算法计算，不需要向二维码新增字段。
 */
function pairingConfirmationCode(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{8,256}$/.test(token)) throw new Error('配对凭据不正确');
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 6).toUpperCase();
}

function getLanAddresses(networkInterfaces = os.networkInterfaces()) {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces || {})) {
    for (const entry of entries || []) {
      const isV4 = entry.family === 'IPv4' || entry.family === 4;
      if (isV4 && !entry.internal && entry.address) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

function writeJson(res, statusCode, body) {
  const content = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Length': Buffer.byteLength(content),
  });
  res.end(content);
}

function createConfigPairingServer({
  encryptedConfig,
  ttlMs = 5 * 60 * 1000,
  httpImpl = http,
  networkInterfaces,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  onStopped = () => {},
} = {}) {
  if (typeof encryptedConfig !== 'string' || encryptedConfig.length === 0) throw new Error('配对配置不能为空');
  const token = makeToken(randomBytes);
  const confirmationCode = pairingConfirmationCode(token);
  const expiresAt = now() + ttlMs;
  let consumed = false;
  let server;
  let expirationTimer;
  let stopPromise = null;

  function notifyStopped(reason) {
    try {
      onStopped(reason);
    } catch (_) {
      // 配对服务关闭不应被 UI 通知回调阻塞。
    }
  }

  function stop(reason = 'cancelled') {
    consumed = true;
    if (stopPromise) return stopPromise;
    if (expirationTimer) {
      clearTimeout(expirationTimer);
      expirationTimer = null;
    }
    if (!server) {
      notifyStopped(reason);
      return Promise.resolve();
    }
    const current = server;
    server = null;
    stopPromise = new Promise((resolve) => current.close(() => {
      notifyStopped(reason);
      resolve();
    }));
    return stopPromise;
  }

  const requestHandler = (req, res) => {
    let requestUrl;
    try {
      requestUrl = new URL(req.url || '/', 'http://miaos.local');
    } catch (_) {
      writeJson(res, 400, { ok: false, error: '配对地址不正确' });
      return;
    }
    if (req.method !== 'GET' || requestUrl.pathname !== '/miaos/pair') {
      writeJson(res, 404, { ok: false, error: '配对地址不存在' });
      return;
    }
    if (consumed || now() >= expiresAt) {
      writeJson(res, 410, { ok: false, error: '配对已失效，请重新发起' });
      return;
    }
    if (requestUrl.searchParams.get('token') !== token) {
      writeJson(res, 403, { ok: false, error: '配对凭据不正确' });
      return;
    }
    consumed = true;
    // 响应成功写入后立即关闭监听端口：已完成的会话不保留到 TTL 结束。
    res.once?.('finish', () => { void stop('consumed'); });
    writeJson(res, 200, {
      ok: true,
      protocol: 'miaos-config-pair',
      version: 1,
      expiresAt,
      encryptedConfig,
    });
  };

  return {
    token,
    confirmationCode,
    expiresAt,
    getUrls(port) {
      return getLanAddresses(networkInterfaces).map((address) => `http://${address}:${port}/miaos/pair?token=${encodeURIComponent(token)}`);
    },
    start() {
      if (server) return Promise.reject(new Error('配对服务已经启动'));
      server = httpImpl.createServer(requestHandler);
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server?.off?.('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off?.('error', onError);
          const address = server.address();
          const port = typeof address === 'object' && address ? address.port : 0;
          expirationTimer = setTimeout(() => { void stop('expired'); }, Math.max(0, ttlMs));
          expirationTimer.unref?.();
          resolve({ port, urls: this.getUrls(port), expiresAt });
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(0, '0.0.0.0');
      });
    },
    stop,
  };
}

module.exports = { createConfigPairingServer, getLanAddresses, pairingConfirmationCode };
