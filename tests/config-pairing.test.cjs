const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createConfigPairingServer, getLanAddresses, pairingConfirmationCode } = require('../src/main/services/config-pairing');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    }).on('error', reject);
  });
}

test('局域网地址只返回非内部 IPv4 地址并去重', () => {
  assert.deepEqual(getLanAddresses({
    en0: [
      { family: 'IPv4', address: '192.168.1.10', internal: false },
      { family: 'IPv6', address: 'fe80::1', internal: false },
    ],
    lo0: [{ family: 4, address: '127.0.0.1', internal: true }],
    bridge0: [{ family: 4, address: '192.168.1.10', internal: false }],
  }), ['192.168.1.10']);
});

test('配对地址只能成功读取一次，错误 token 不消耗会话', async () => {
  let stoppedReason = null;
  const session = createConfigPairingServer({
    encryptedConfig: '{"format":"miaos-config"}',
    networkInterfaces: { en0: [{ family: 4, address: '192.168.1.10', internal: false }] },
    onStopped: (reason) => { stoppedReason = reason; },
  });
  const started = await session.start();
  const url = `http://127.0.0.1:${started.port}/miaos/pair?token=${encodeURIComponent(session.token)}`;
  try {
    const wrong = await getJson(url.replace('token=', 'token=wrong-'));
    assert.equal(wrong.status, 403);

    const first = await getJson(url);
    assert.equal(first.status, 200);
    assert.equal(first.body.encryptedConfig, '{"format":"miaos-config"}');
    // 成功传输后服务会主动关闭监听端口，而不是在剩余 TTL 内继续保留 410 可探测端点。
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(stoppedReason, 'consumed');
    await assert.rejects(() => getJson(url), { code: 'ECONNREFUSED' });
  } finally {
    await session.stop();
  }
});

test('配对服务过期后拒绝读取', async () => {
  let currentTime = 1000;
  const session = createConfigPairingServer({
    encryptedConfig: '密文',
    ttlMs: 100,
    now: () => currentTime,
    networkInterfaces: { en0: [{ family: 4, address: '192.168.1.10', internal: false }] },
  });
  const started = await session.start();
  currentTime = 1100;
  const url = `http://127.0.0.1:${started.port}/miaos/pair?token=${encodeURIComponent(session.token)}`;
  const response = await getJson(url);
  assert.equal(response.status, 410);
  await session.stop();
});


test('同一一次性 token 在 macOS 与 Android 可核对的确认码稳定且不包含密钥', async () => {
  const token = 'abc_DEF-123';
  assert.equal(pairingConfirmationCode(token), '5CD61B');
  const session = createConfigPairingServer({
    encryptedConfig: '加密配置，不是 API Key',
    randomBytes: () => Buffer.from('abc_DEF-123'.padEnd(32, '_')),
    networkInterfaces: { en0: [{ family: 4, address: '192.168.1.10', internal: false }] },
  });
  assert.match(session.confirmationCode, /^[0-9A-F]{6}$/);
  assert.notEqual(session.confirmationCode, '加密配置，不是 API Key');
  await session.stop();
});
