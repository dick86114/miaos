const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { downloadImageToFile } = require('../src/main/services/image-downloader');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-image-download-'));
  try {
    await run(`http://127.0.0.1:${port}`, directory);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('瞬时网络中断后重试并保存图片', async () => {
  let attempts = 0;
  await withServer((req, res) => {
    attempts += 1;
    if (attempts === 1) {
      req.socket.destroy();
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end('image-body');
  }, async (baseUrl, directory) => {
    const targetPath = path.join(directory, 'image.png');
    const result = await downloadImageToFile(baseUrl, targetPath, {
      retryDelayMs: 1,
    });

    assert.equal(attempts, 2);
    assert.equal(result.path, targetPath);
    assert.equal(result.bytes, Buffer.byteLength('image-body'));
    assert.equal(fs.readFileSync(targetPath, 'utf8'), 'image-body');
  });
});

test('HTTP 状态错误不重试，且不留下空文件', async () => {
  let attempts = 0;
  await withServer((_req, res) => {
    attempts += 1;
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('missing');
  }, async (baseUrl, directory) => {
    const targetPath = path.join(directory, 'missing.png');
    await assert.rejects(
      downloadImageToFile(`${baseUrl}/image.png`, targetPath),
      (error) => error.message.includes('HTTP 404'),
    );
    assert.equal(attempts, 1);
    assert.equal(fs.existsSync(targetPath), false);
  });
});

test('429 与 5xx 会按有限次数重试', async () => {
  let attempts = 0;
  await withServer((_req, res) => {
    attempts += 1;
    if (attempts < 3) {
      res.writeHead(attempts === 1 ? 429 : 503, { 'content-type': 'text/plain' });
      res.end('busy');
      return;
    }
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end('image-body');
  }, async (baseUrl, directory) => {
    const targetPath = path.join(directory, 'image.png');
    const result = await downloadImageToFile(baseUrl, targetPath, { retryDelayMs: 1 });
    assert.equal(attempts, 3);
    assert.equal(result.bytes, Buffer.byteLength('image-body'));
  });
});
