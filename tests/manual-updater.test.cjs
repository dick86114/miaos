const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const {
  compareVersions,
  selectDmgAsset,
  buildInstallScript,
  downloadFile,
} = require('../src/main/services/manual-updater');

test('手动更新器正确比较版本并选择 DMG 资产', () => {
  assert.equal(compareVersions('v1.2.0', '1.1.9'), 1);
  assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
  assert.equal(compareVersions('1.1.9', '1.2.0'), -1);
  assert.deepEqual(selectDmgAsset({ assets: [
    { name: 'miaos.zip', browser_download_url: 'https://example.invalid/a.zip' },
    { name: 'miaos.dmg', browser_download_url: 'https://example.invalid/a.dmg' },
  ] }), { name: 'miaos.dmg', browser_download_url: 'https://example.invalid/a.dmg' });
});

test('更新安装脚本先等待旧进程退出，再复制、校验并回滚替换', () => {
  const script = buildInstallScript({
    dmgPath: '/tmp/miaos.dmg',
    appPath: '/Applications/miaos.app',
    pid: 123,
    version: '2.0.0',
    scriptPath: '/tmp/miaos-update.sh',
  });
  assert.match(script, /while kill -0/);
  assert.match(script, /ditto/);
  assert.match(script, /plutil -extract CFBundleShortVersionString/);
  assert.match(script, /EXPECTED='2\.0\.0'/);
  assert.match(script, /if \[ "\$ACTUAL" != "\$EXPECTED" \]/);
  assert.match(script, /if ! mv/);
  assert.match(script, /TMP="\$APP\.new-\$PID"/);
});

test('GitHub API 限流时回退到 Releases Atom feed', async () => {
  const { checkForUpdate } = require('../src/main/services/manual-updater');
  const { EventEmitter } = require('node:events');
  const responses = [
    { statusCode: 403, body: '{}' },
    { statusCode: 200, body: '<feed><entry><id>tag:github.com,2008:Repository/1/v2.0.0</id><updated>2026-09-01T00:00:00Z</updated><link href="https://github.com/acme/miaos/releases/tag/v2.0.0"/><title>v2.0.0</title><content>&lt;code&gt;miaos-2.0.0-arm64.dmg&lt;/code&gt;</content></entry></feed>' },
  ];
  const httpsImpl = {
    get(_url, _options, callback) {
      const request = new EventEmitter();
      request.setTimeout = () => {};
      process.nextTick(() => {
        const data = responses.shift();
        const response = new EventEmitter();
        response.statusCode = data.statusCode;
        response.headers = {};
        callback(response);
        response.emit('data', Buffer.from(data.body));
        response.emit('end');
      });
      return request;
    },
  };
  const update = await checkForUpdate({ owner: 'acme', repo: 'miaos', currentVersion: '1.0.0', httpsImpl });
  assert.equal(update.version, '2.0.0');
  assert.equal(update.isUpdateAvailable, true);
  assert.equal(update.isCurrentVersion, false);
  assert.equal(update.assetName, 'miaos-2.0.0-arm64.dmg');
});

test('当前版本已是最新时仍返回当前 Release 的更新日志', async () => {
  const { checkForUpdate } = require('../src/main/services/manual-updater');
  const { EventEmitter } = require('node:events');
  const release = {
    tag_name: 'v1.5.22',
    body: '## v1.5.22\n\n- 新增当前版本更新日志回看',
    published_at: '2026-10-19T01:46:36Z',
    html_url: 'https://github.com/acme/miaos/releases/tag/v1.5.22',
    prerelease: false,
    assets: [{ name: 'miaos-1.5.22-arm64.dmg', browser_download_url: 'https://example.invalid/miaos.dmg' }],
  };
  const httpsImpl = {
    get(_url, _options, callback) {
      const request = new EventEmitter();
      request.setTimeout = () => {};
      process.nextTick(() => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = {};
        callback(response);
        response.emit('data', Buffer.from(JSON.stringify(release)));
        response.emit('end');
      });
      return request;
    },
  };

  const result = await checkForUpdate({ owner: 'acme', repo: 'miaos', currentVersion: '1.5.22', httpsImpl });
  assert.equal(result.version, '1.5.22');
  assert.equal(result.isUpdateAvailable, false);
  assert.equal(result.isCurrentVersion, true);
  assert.match(result.releaseNotes, /当前版本更新日志回看/u);
  assert.equal(result.releaseUrl, release.html_url);
  assert.equal('downloadUrl' in result, false);
});

test('下载更新包时可通过 AbortSignal 取消并清理未完成文件', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-cancel-download-'));
  const targetPath = path.join(dir, 'miaos-update.dmg');
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-length': '1024' });
    response.write(Buffer.alloc(128, 1));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const controller = new AbortController();

  try {
    const download = downloadFile(`http://127.0.0.1:${port}/miaos.dmg`, targetPath, {
      httpsImpl: http,
      signal: controller.signal,
      timeoutMs: 10000,
      maxRetries: 0,
    });
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
          clearInterval(timer);
          resolve();
        }
      }, 10);
    });

    controller.abort();
    await assert.rejects(download, (error) => {
      assert.equal(error.code, 'UPDATE_DOWNLOAD_CANCELED');
      assert.equal(error.canceled, true);
      return true;
    });
    assert.equal(fs.existsSync(targetPath), false);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
