const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const mainPath = path.resolve(__dirname, '..', 'main.js');
const {
  REAL_IMAGE_BYTES,
  FAKE_IMAGE_BYTES,
  createNativeImageMock,
  dataUrl,
} = require('./image-fixtures.cjs');

const EXPECTED_CHANNELS = [
  'update-get-current-version',
  'update-check',
  'update-open-release-page',
  'update-configure',
  'provider-secret-set',
  'provider-secret-has',
  'provider-secret-delete',
  'provider-secret-migrate',
  'save-image',
  'show-in-folder',
  'test-connection',
  'fetch-models',
  'generate-image',
  'save-pasted-image',
  'pick-image-file',
  'pick-text-file',
  'optimize-prompt',
  'summarize-prompt',
];
const PNG_BYTES = REAL_IMAGE_BYTES.png;
const PNG_REPLACEMENT_BYTES = REAL_IMAGE_BYTES.pngReplacement;
const PNG_DATA_URL = dataUrl('image/png', PNG_BYTES);
const JPEG_BYTES = REAL_IMAGE_BYTES.jpeg;
const PROGRESSIVE_JPEG_BYTES = REAL_IMAGE_BYTES.progressiveJpeg;
const ADAM7_PNG_BYTES = REAL_IMAGE_BYTES.adam7Png;
const WEBP_BYTES = REAL_IMAGE_BYTES.webp;
const BMP_BYTES = REAL_IMAGE_BYTES.bmp;
const TOP_DOWN_BMP_BYTES = REAL_IMAGE_BYTES.topDownBmp;

function createTempHome(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempHome(homePath) {
  try {
    fs.chmodSync(path.join(homePath, '.miaos'), 0o700);
  } catch (_) {}
  fs.rmSync(homePath, { recursive: true, force: true });
}

function createNetworkMock(calls) {
  function request(urlOrOptions, optionsOrCallback, maybeCallback) {
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    const options = typeof optionsOrCallback === 'function' ? urlOrOptions : optionsOrCallback;
    const requestRecord = { url: typeof urlOrOptions === 'string' ? urlOrOptions : '', options, chunks: [] };
    calls.networkRequests.push(requestRecord);
    const req = new EventEmitter();
    req.setTimeout = () => {};
    req.setHeader = () => {};
    req.write = (chunk) => requestRecord.chunks.push(Buffer.from(chunk));
    req.destroy = () => {};
    req.end = () => {
      process.nextTick(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.headers = {};
        callback(res);
        res.emit('data', Buffer.from(JSON.stringify({ status: 'failed', error: '下游模拟失败' })));
        res.emit('end');
      });
    };
    return req;
  }

  return {
    request,
    get(url, callback) {
      const req = request(url, {}, callback);
      req.end();
      return req;
    },
  };
}

function createElectronMock({ homePath, setPathImpl, openDialogResult, fsImpl, safeStorageImpl } = {}) {
  const tempPath = path.join(homePath, 'temp');
  let userDataPath = null;
  const calls = {
    sequence: [],
    errorBox: [],
    exit: [],
    setPath: [],
    whenReady: 0,
    browserWindow: 0,
    loadFile: [],
    tmpdirModuleLoads: 0,
    failures: [],
    ipcHandlers: {},
    showItemInFolder: [],
    openDialogOptions: [],
    networkRequests: [],
  };

  class BrowserWindowMock {
    constructor() {
      calls.browserWindow += 1;
      calls.sequence.push('createWindow');
      this.webContents = {
        id: 100,
        send() {},
        setWindowOpenHandler() {},
      };
    }

    loadFile(filePath) {
      calls.loadFile.push(filePath);
    }

    isDestroyed() {
      return false;
    }

    static getAllWindows() {
      return calls.browserWindow ? [{}] : [];
    }
  }

  const electronMock = {
    app: {
      isPackaged: false,
      getVersion() { return 'test'; },
      getPath(name) {
        if (name === 'home') return homePath;
        if (name === 'temp') return tempPath;
        if (name === 'userData' && userDataPath) return userDataPath;
        throw Object.assign(new Error(`unexpected getPath:${name}`), { code: 'GET_PATH_BROKEN' });
      },
      setPath(name, value) {
        calls.setPath.push([name, value]);
        calls.sequence.push('setPath');
        if (name === 'userData') userDataPath = value;
        if (setPathImpl) setPathImpl(name, value);
      },
      exit(code) { calls.exit.push(code); },
      quit() { calls.quit = true; },
      whenReady() {
        calls.whenReady += 1;
        calls.sequence.push('whenReady');
        return Promise.resolve();
      },
      on(name) { calls.appOn = calls.appOn || []; calls.appOn.push(name); },
      disableHardwareAcceleration() { calls.disableHardwareAcceleration = true; },
      commandLine: { appendSwitch(name) { calls.appendSwitch = calls.appendSwitch || []; calls.appendSwitch.push(name); } },
      dock: { setIcon() {} },
    },
    BrowserWindow: BrowserWindowMock,
    ipcMain: {
      handle(channel, handler) {
        calls.ipcHandle = calls.ipcHandle || [];
        calls.ipcHandle.push(channel);
        calls.ipcHandlers[channel] = handler;
      },
    },
    dialog: {
      showErrorBox(title, message) { calls.errorBox.push([title, message]); },
      showSaveDialog() {},
      showOpenDialog(windowOrOptions, maybeOptions) {
        calls.openDialogOptions.push(maybeOptions || windowOrOptions);
        return Promise.resolve(openDialogResult || { canceled: true, filePaths: [] });
      },
    },
    shell: {
      openExternal() {},
      showItemInFolder(filePath) { calls.showItemInFolder.push(filePath); },
    },
    safeStorage: safeStorageImpl || {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`encrypted:${value}`),
      decryptString: (buffer) => {
        const value = buffer.toString();
        if (!value.startsWith('encrypted:')) throw new Error('密文无效');
        return value.slice('encrypted:'.length);
      },
    },
    nativeImage: {
      ...createNativeImageMock(),
      createFromPath() { return { isEmpty() { return true; } }; },
    },
  };

  return { electronMock, calls, networkMock: createNetworkMock(calls) };
}

async function runMainWithMock(options = {}) {
  const { electronMock, calls, networkMock } = createElectronMock(options);
  const updaterMock = {
    autoUpdater: {
      on() {},
      setFeedURL() {},
      checkForUpdates() { return Promise.resolve(); },
    },
  };

  const originalLoad = Module._load;
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  delete require.cache[mainPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return electronMock;
    if ((request === 'fs' || request === 'node:fs') && options.fsImpl) return options.fsImpl;
    if (request === 'electron-updater') return updaterMock;
    if (request === 'https' || request === 'node:https' || request === 'http' || request === 'node:http') return networkMock;
    if (request === 'node:os' || request === 'os') {
      calls.tmpdirModuleLoads += 1;
      return os;
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    require(mainPath);
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    if (options.seedProviderSecret !== false && calls.ipcHandlers['provider-secret-migrate']) {
      const seeded = await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), [{
        providerId: 'p_grsai',
        apiKey: 'test-key',
        metadata: createGrsaiMetadata('https://example.invalid/generate'),
      }]);
      await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'commit', transactionId: seeded.transactionId });
    }
    return { calls, exitCode: process.exitCode };
  } catch (error) {
    error.startupCalls = calls;
    throw error;
  } finally {
    Module._load = originalLoad;
    delete require.cache[mainPath];
    process.exitCode = originalExitCode;
  }
}

function trustedEvent() {
  return { sender: { id: 100 } };
}

function createGrsaiMetadata(endpoint) {
  return {
    id: 'p_grsai', name: 'Grsai', type: 'grsai', endpoint,
    capabilities: ['image'],
    imageModels: [{ id: 'gpt-image-2', name: 'gpt-image-2', enabled: true }],
    textModels: [{ id: 'text-model', name: 'text-model', enabled: true }],
    videoModels: [],
  };
}

function createGenerateParams(sourceImage) {
  return {
    prompt: '测试提示词',
    modelName: 'gpt-image-2',
    ratio: '1:1',
    quality: '高清',
    size: '1024x1024',
    providerId: 'p_grsai',
    sourceImage,
  };
}

function getRequestBody(calls, index = -1) {
  const request = calls.networkRequests.at(index);
  return JSON.parse(Buffer.concat(request.chunks).toString('utf8'));
}

function assertPngSourceImage(calls, index = -1) {
  const sourceImage = getRequestBody(calls, index).images[0];
  assert.match(sourceImage, /^data:image\/png;base64,/);
  assert.equal(Buffer.from(sourceImage.split(',')[1], 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
}

test('无权限时显示数据目录错误并阻断启动', async () => {
  const homePath = createTempHome('miaos-home-denied-');
  try {
    const appDataPath = path.join(homePath, '.miaos');
    fs.mkdirSync(appDataPath);
    fs.chmodSync(appDataPath, 0o500);

    const { calls, exitCode } = await runMainWithMock({ homePath });

    assert.deepEqual(calls.errorBox, [['妙生无法启动', '应用数据目录不可写，请检查 ~/.miaos 权限。']]);
    assert.deepEqual(calls.exit, [1]);
    assert.equal(exitCode, 1);
    assert.deepEqual(calls.setPath, []);
    assert.equal(calls.whenReady, 0);
    assert.equal(calls.browserWindow, 0);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('正常路径先设置用户数据目录再启动窗口', async () => {
  const homePath = createTempHome('miaos-home-ok-');
  try {
    const { calls, exitCode } = await runMainWithMock({ homePath });

    assert.deepEqual(calls.errorBox, []);
    assert.deepEqual(calls.exit, []);
    assert.equal(exitCode, undefined);
    assert.deepEqual(calls.setPath, [['userData', path.join(homePath, '.miaos')]]);
    assert.equal(calls.whenReady, 1);
    assert.equal(calls.browserWindow, 1);
    assert.deepEqual(calls.sequence.slice(0, 3), ['setPath', 'whenReady', 'createWindow']);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('app.setPath 非预期异常会传播且不显示数据目录错误', async () => {
  const homePath = createTempHome('miaos-home-setpath-broken-');
  try {
    const expected = Object.assign(new Error('setPath broken'), { code: 'SET_PATH_BROKEN' });

    await assert.rejects(
      () => runMainWithMock({
        homePath,
        setPathImpl() { throw expected; },
      }),
      (error) => {
        assert.equal(error, expected);
        assert.equal(error.code, 'SET_PATH_BROKEN');
        assert.deepEqual(error.startupCalls.errorBox, []);
        assert.deepEqual(error.startupCalls.exit, []);
        return true;
      },
    );
  } finally {
    cleanupTempHome(homePath);
  }
});

test('正常启动精确注册 18 个真实安全 handler（原 14 个加 4 个密钥 handler），未知 sender 全部被拒绝', async () => {
  const homePath = createTempHome('miaos-ipc-registrations-');
  try {
    const { calls } = await runMainWithMock({ homePath });
    assert.deepEqual(calls.ipcHandle, EXPECTED_CHANNELS);
    assert.deepEqual(Object.keys(calls.ipcHandlers), EXPECTED_CHANNELS);

    const results = await Promise.all(
      EXPECTED_CHANNELS.map((channel) => calls.ipcHandlers[channel]({ sender: { id: 999 } })),
    );
    for (const result of results) {
      assert.deepEqual(result, { ok: false, error: 'IPC 来源不受信任', code: 'IPC_UNTRUSTED_SENDER' });
    }
    assert.deepEqual(calls.networkRequests, []);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('密钥 IPC 通过安全 wrapper 保存、查询、迁移和删除密文', async () => {
  const homePath = createTempHome('miaos-provider-secret-ipc-');
  try {
    const { calls } = await runMainWithMock({ homePath, seedProviderSecret: false });
    assert.deepEqual(await calls.ipcHandlers['provider-secret-set'](trustedEvent(), 'p_one', 'sk-one'), { ok: true });
    assert.deepEqual(await calls.ipcHandlers['provider-secret-has'](trustedEvent(), 'p_one'), { ok: true, has: true });
    const migrated = await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), [
      { providerId: 'p_two', apiKey: 'sk-two' },
    ]);
    assert.equal(migrated.ok, true);
    assert.ok(migrated.transactionId);
    assert.deepEqual(await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'commit', transactionId: migrated.transactionId }), { ok: true });
    assert.deepEqual(await calls.ipcHandlers['provider-secret-has'](trustedEvent(), 'p_two'), { ok: true, has: true });
    assert.deepEqual(await calls.ipcHandlers['provider-secret-delete'](trustedEvent(), 'p_one'), { ok: true });
    assert.deepEqual(await calls.ipcHandlers['provider-secret-has'](trustedEvent(), 'p_one'), { ok: true, has: false });
    assert.doesNotMatch(fs.readFileSync(path.join(homePath, '.miaos', 'secrets.json'), 'utf8'), /sk-one|sk-two/);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('供应商密钥事务在本地元数据失败时可回滚新增、编辑与删除的 vault 绑定', async () => {
  const homePath = createTempHome('miaos-provider-transaction-');
  try {
    const { calls } = await runMainWithMock({ homePath, seedProviderSecret: false });
    const created = await calls.ipcHandlers['provider-secret-set'](trustedEvent(), 'p_tx', 'sk-new', {
      ...createGrsaiMetadata('https://new.invalid/generate'), id: 'p_tx',
    }, { transactional: true });
    assert.equal(created.ok, true);
    assert.deepEqual(await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'rollback', transactionId: created.transactionId }), { ok: true });
    assert.deepEqual(await calls.ipcHandlers['provider-secret-has'](trustedEvent(), 'p_tx'), { ok: true, has: false });

    const seeded = await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), [{
      providerId: 'p_grsai', apiKey: 'sk-old', metadata: createGrsaiMetadata('https://old.invalid/generate'),
    }]);
    await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'commit', transactionId: seeded.transactionId });
    const edited = await calls.ipcHandlers['provider-secret-set'](trustedEvent(), 'p_grsai', 'sk-new', createGrsaiMetadata('https://new.invalid/generate'), { transactional: true });
    await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'rollback', transactionId: edited.transactionId });
    const request = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(null));
    assert.equal(request.ok, false);
    assert.equal(calls.networkRequests.at(-1).options.hostname, 'old.invalid');
    assert.equal(calls.networkRequests.at(-1).options.headers.Authorization, 'Bearer sk-old');

    const deleted = await calls.ipcHandlers['provider-secret-delete'](trustedEvent(), 'p_grsai', { transactional: true });
    await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'rollback', transactionId: deleted.transactionId });
    assert.deepEqual(await calls.ipcHandlers['provider-secret-has'](trustedEvent(), 'p_grsai'), { ok: true, has: true });
  } finally {
    cleanupTempHome(homePath);
  }
});

test('事务 rollback 写入失败时保留 transaction，明确返回不确定状态并允许重试', async () => {
  const homePath = createTempHome('miaos-provider-rollback-failure-');
  let failRollback = false;
  const fsImpl = {
    ...fs,
    writeFileSync(target, value, options) {
      if (failRollback && String(target).includes('.tmp-')) throw Object.assign(new Error('回滚写入失败'), { code: 'EIO' });
      return fs.writeFileSync(target, value, options);
    },
  };
  try {
    const { calls } = await runMainWithMock({ homePath, seedProviderSecret: false, fsImpl });
    const started = await calls.ipcHandlers['provider-secret-set'](trustedEvent(), 'p_tx', 'sk-new', {
      ...createGrsaiMetadata('https://new.invalid/generate'), id: 'p_tx',
    }, { transactional: true });
    failRollback = true;
    const failed = await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'rollback', transactionId: started.transactionId });
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 'SECRET_TRANSACTION_ROLLBACK_FAILED');
    assert.equal(failed.transactionId, started.transactionId);
    failRollback = false;
    assert.deepEqual(await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'rollback', transactionId: started.transactionId }), { ok: true });
  } finally {
    cleanupTempHome(homePath);
  }
});

test('自身残留 lock 的事务 rollback 仅凭 transaction owner token 可恢复成功', async () => {
  const homePath = createTempHome('miaos-owner-rollback-');
  let failRelease = true;
  const fsImpl = {
    ...fs,
    rmSync(target, options) {
      if (failRelease && String(target).includes('.lock.quarantine-')) throw Object.assign(new Error('残留 lock'), { code: 'EACCES' });
      return fs.rmSync(target, options);
    },
  };
  try {
    const { calls } = await runMainWithMock({ homePath, seedProviderSecret: false, fsImpl });
    const started = await calls.ipcHandlers['provider-secret-set'](trustedEvent(), 'p_tx', 'sk-new', {
      ...createGrsaiMetadata('https://owner-lock.invalid/generate'), id: 'p_tx',
    }, { transactional: true });
    assert.equal(started.ok, false);
    assert.equal(started.code, 'SECRET_VAULT_APPLIED_LOCK_RELEASE_FAILED');
    failRelease = false;
    assert.deepEqual(await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'rollback', transactionId: started.transactionId }), { ok: true });
    assert.deepEqual(await calls.ipcHandlers['provider-secret-has'](trustedEvent(), 'p_tx'), { ok: true, has: false });
  } finally {
    cleanupTempHome(homePath);
  }
});

test('已保存供应商的所有请求路径都通过 providerId 从 vault 读取密钥', async () => {
  const homePath = createTempHome('miaos-provider-secret-all-requests-');
  try {
    const { calls } = await runMainWithMock({ homePath });
    const provider = {
      providerId: 'p_grsai',
      type: 'grsai',
      endpoint: 'https://example.invalid/generate',
    };

    await calls.ipcHandlers['test-connection'](trustedEvent(), provider);
    assert.equal(calls.networkRequests.at(-1).options.headers.Authorization, 'Bearer test-key');

    const models = await calls.ipcHandlers['fetch-models'](trustedEvent(), provider, 'image');
    assert.equal(models.ok, true);
    assert.ok(models.models.length > 0);

    await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(null));
    assert.equal(calls.networkRequests.at(-1).options.headers.Authorization, 'Bearer test-key');

    await calls.ipcHandlers['optimize-prompt'](trustedEvent(), {
      providerId: 'p_grsai',
      endpoint: 'https://example.invalid/v1',
      model: 'text-model',
      prompt: '测试提示词',
      language: 'zh',
    });
    assert.equal(calls.networkRequests.at(-1).options.headers.Authorization, 'Bearer test-key');

    await calls.ipcHandlers['summarize-prompt'](trustedEvent(), {
      providerId: 'p_grsai',
      endpoint: 'https://example.invalid/v1',
      model: 'text-model',
      prompt: '测试提示词',
      ratio: '1:1',
      quality: '高清',
      imageModel: 'gpt-image-2',
      isImageToImage: false,
    });
    assert.equal(calls.networkRequests.at(-1).options.headers.Authorization, 'Bearer test-key');
  } finally {
    cleanupTempHome(homePath);
  }
});

test('已保存供应商将 key 绑定到可信 metadata，不能被 renderer 指向任意 HTTPS', async () => {
  const homePath = createTempHome('miaos-provider-binding-');
  try {
    const { calls } = await runMainWithMock({ homePath, seedProviderSecret: false });
    const trustedEndpoint = 'https://trusted.invalid/v1/api/generate';
    const migrate = await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), [{
      providerId: 'p_grsai',
      apiKey: 'test-key',
      metadata: createGrsaiMetadata(trustedEndpoint),
    }]);
    assert.equal(migrate.ok, true);
    assert.deepEqual(await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'commit', transactionId: migrate.transactionId }), { ok: true });

    const tampered = await calls.ipcHandlers['generate-image'](trustedEvent(), {
      ...createGenerateParams(null),
        provider: 'openai',
    });
    assert.equal(tampered.ok, false);
    assert.equal(calls.networkRequests.length, 0);

    const result = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(null));
    assert.equal(result.ok, false);
    assert.equal(calls.networkRequests.length, 1);
    assert.equal(calls.networkRequests[0].options.hostname, 'trusted.invalid');
    assert.equal(calls.networkRequests[0].options.path, '/v1/api/generate');
    assert.equal(calls.networkRequests[0].options.headers.Authorization, 'Bearer test-key');
  } finally {
    cleanupTempHome(homePath);
  }
});

test('公开 provider 没有密钥时仍可使用可信 metadata 发起无 Authorization 请求', async () => {
  const homePath = createTempHome('miaos-public-provider-');
  try {
    const { calls: firstCalls } = await runMainWithMock({ homePath, seedProviderSecret: false });
    const result = await firstCalls.ipcHandlers['provider-secret-migrate'](trustedEvent(), [{
      providerId: 'p_public',
      metadata: {
        ...createGrsaiMetadata('https://public.invalid/generate'),
        id: 'p_public', name: '公开接口', textModels: [],
      },
    }]);
    assert.equal(result.ok, true);
    assert.deepEqual(await firstCalls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'commit', transactionId: result.transactionId }), { ok: true });

    const { calls } = await runMainWithMock({ homePath, seedProviderSecret: false });
    await calls.ipcHandlers['test-connection'](trustedEvent(), { providerId: 'p_public' });
    assert.equal(calls.networkRequests.at(-1).options.hostname, 'public.invalid');
    assert.equal(calls.networkRequests.at(-1).options.path, '/generate');
    assert.equal('Authorization' in calls.networkRequests.at(-1).options.headers, false);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('safeStorage 不可用时公开 provider metadata 在重启后仍可无 Authorization 请求', async () => {
  const homePath = createTempHome('miaos-public-no-keystore-');
  const unavailable = {
    isEncryptionAvailable: () => false,
    encryptString() { throw new Error('不应加密'); },
    decryptString() { throw new Error('不应解密'); },
  };
  try {
    const { calls: firstCalls } = await runMainWithMock({ homePath, seedProviderSecret: false, safeStorageImpl: unavailable });
    const started = await firstCalls.ipcHandlers['provider-secret-migrate'](trustedEvent(), [{
      providerId: 'p_public', metadata: { ...createGrsaiMetadata('https://public-no-key.invalid/generate'), id: 'p_public', textModels: [] },
    }]);
    assert.equal(started.ok, true);
    assert.deepEqual(await firstCalls.ipcHandlers['provider-secret-migrate'](trustedEvent(), { operation: 'commit', transactionId: started.transactionId }), { ok: true });
    const { calls } = await runMainWithMock({ homePath, seedProviderSecret: false, safeStorageImpl: unavailable });
    await calls.ipcHandlers['test-connection'](trustedEvent(), { providerId: 'p_public' });
    assert.equal(calls.networkRequests.at(-1).options.hostname, 'public-no-key.invalid');
    assert.equal('Authorization' in calls.networkRequests.at(-1).options.headers, false);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('密钥迁移拒绝 __proto__，旧 renderer 状态因此不会清理密钥', async () => {
  const homePath = createTempHome('miaos-provider-id-');
  try {
    const { calls } = await runMainWithMock({ homePath, seedProviderSecret: false });
    const result = await calls.ipcHandlers['provider-secret-migrate'](trustedEvent(), [{ providerId: '__proto__', apiKey: 'sk-legacy' }]);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'IPC_VALIDATION_FAILED');
  } finally {
    cleanupTempHome(homePath);
  }
});

test('已保存供应商的生图请求只传 providerId，主进程从 vault 读取密钥', async () => {
  const homePath = createTempHome('miaos-provider-secret-request-');
  try {
    const { calls } = await runMainWithMock({ homePath });
    const params = createGenerateParams(null);
    assert.equal('apiKey' in params, false);

    await calls.ipcHandlers['generate-image'](trustedEvent(), params);

    assert.equal(calls.networkRequests.length, 1);
    assert.equal(calls.networkRequests[0].options.headers.Authorization, 'Bearer test-key');
  } finally {
    cleanupTempHome(homePath);
  }
});

test('真实 generate handler 拒绝未授权、伪图像、符号链接和超限 sourceImage，且不请求网络', async () => {
  const homePath = createTempHome('miaos-source-image-reject-');
  try {
    const { calls } = await runMainWithMock({ homePath });
    const generatedDir = path.join(homePath, '.miaos', 'generated');
    fs.mkdirSync(generatedDir, { recursive: true });
    const externalImage = path.join(homePath, 'external.png');
    fs.writeFileSync(externalImage, PNG_BYTES);

    const untrusted = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(externalImage));
    assert.equal(untrusted.code, 'IPC_SOURCE_IMAGE_UNAUTHORIZED');
    assert.equal(calls.networkRequests.length, 0);

    const fakeImage = path.join(generatedDir, 'fake.png');
    fs.writeFileSync(fakeImage, 'not-an-image');
    const fakeResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(fakeImage));
    assert.equal(fakeResult.code, 'IPC_SOURCE_IMAGE_INVALID_IMAGE');
    assert.equal(calls.networkRequests.length, 0);

    const symlinkPath = path.join(generatedDir, 'linked.png');
    fs.symlinkSync(externalImage, symlinkPath);
    const symlinkResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(symlinkPath));
    assert.equal(symlinkResult.code, 'IPC_SOURCE_IMAGE_SYMLINK');
    assert.equal(calls.networkRequests.length, 0);

    const tooLargeImage = path.join(generatedDir, 'too-large.png');
    fs.writeFileSync(tooLargeImage, Buffer.concat([PNG_BYTES, Buffer.alloc(50 * 1024 * 1024)]));
    const tooLargeResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(tooLargeImage));
    assert.equal(tooLargeResult.code, 'IPC_SOURCE_IMAGE_TOO_LARGE');
    assert.equal(calls.networkRequests.length, 0);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('真实 generate handler 在网络前拒绝空、伪造、MIME 不匹配和截断 source data URL', async () => {
  const homePath = createTempHome('miaos-source-data-url-reject-');
  try {
    const { calls } = await runMainWithMock({ homePath });
    const rejectedDataUrls = [
      'data:image/png;base64,',
      'data:image/png;base64,aGVsbG8=',
      dataUrl('image/jpeg', PNG_BYTES),
      dataUrl('image/png', FAKE_IMAGE_BYTES.png),
      dataUrl('image/jpeg', FAKE_IMAGE_BYTES.jpeg),
      dataUrl('image/webp', FAKE_IMAGE_BYTES.webp),
      dataUrl('image/png', FAKE_IMAGE_BYTES.missingPltePng),
      dataUrl('image/jpeg', FAKE_IMAGE_BYTES.invalidSofSosJpeg),
      dataUrl('image/webp', FAKE_IMAGE_BYTES.zeroVp8Webp),
    ];

    for (const sourceImage of rejectedDataUrls) {
      const result = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(sourceImage));
      assert.equal(result.code, 'IPC_VALIDATION_FAILED');
      assert.equal(calls.networkRequests.length, 0);
    }
  } finally {
    cleanupTempHome(homePath);
  }
});

test('真实 generate handler 在网络前拒绝 PNG、JPEG、WebP 和 BMP 伪容器文件', async () => {
  const homePath = createTempHome('miaos-source-file-structure-reject-');
  try {
    const { calls } = await runMainWithMock({ homePath });
    const generatedDir = path.join(homePath, '.miaos', 'generated');
    fs.mkdirSync(generatedDir, { recursive: true });
    const invalidFiles = [
      ['fake.png', FAKE_IMAGE_BYTES.png],
      ['fake.jpg', FAKE_IMAGE_BYTES.jpeg],
      ['fake.webp', FAKE_IMAGE_BYTES.webp],
      ['fake.bmp', FAKE_IMAGE_BYTES.bmp],
      ['missing-plte.png', FAKE_IMAGE_BYTES.missingPltePng],
      ['invalid-sof-sos.jpg', FAKE_IMAGE_BYTES.invalidSofSosJpeg],
      ['zero-vp8.webp', FAKE_IMAGE_BYTES.zeroVp8Webp],
      ['invalid-bitfields.bmp', FAKE_IMAGE_BYTES.invalidBitfieldsBmp],
    ];

    for (const [name, contents] of invalidFiles) {
      const sourceImage = path.join(generatedDir, name);
      fs.writeFileSync(sourceImage, contents);
      const result = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(sourceImage));
      assert.equal(result.code, 'IPC_SOURCE_IMAGE_INVALID_IMAGE', name);
      assert.equal(calls.networkRequests.length, 0);
    }
  } finally {
    cleanupTempHome(homePath);
  }
});

test('真实 generate handler 拒绝授权后被同路径原子替换的参考图，且不请求网络', async () => {
  const homePath = createTempHome('miaos-source-identity-replace-');
  const pickedImage = path.join(homePath, 'picked.png');
  fs.writeFileSync(pickedImage, PNG_BYTES);
  try {
    const { calls } = await runMainWithMock({
      homePath,
      openDialogResult: { canceled: false, filePaths: [pickedImage] },
    });
    const picked = await calls.ipcHandlers['pick-image-file'](trustedEvent());
    assert.equal(picked.canceled, false);

    const replacementPath = path.join(homePath, 'replacement.png');
    fs.writeFileSync(replacementPath, PNG_REPLACEMENT_BYTES);
    fs.renameSync(replacementPath, picked.filePath);

    const result = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(picked.filePath));
    assert.equal(result.code, 'IPC_SOURCE_IMAGE_REPLACED');
    assert.equal(calls.networkRequests.length, 0);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('真实 generate handler 允许 generated、选择器授权、粘贴授权和受限 data URL 的参考图', async () => {
  const homePath = createTempHome('miaos-source-image-allow-');
  const pickedImage = path.join(homePath, 'picked.png');
  fs.writeFileSync(pickedImage, PNG_BYTES);
  try {
    const { calls } = await runMainWithMock({
      homePath,
      openDialogResult: { canceled: false, filePaths: [pickedImage] },
    });
    const generatedDir = path.join(homePath, '.miaos', 'generated');
    fs.mkdirSync(generatedDir, { recursive: true });
    const generatedImage = path.join(generatedDir, 'generated.png');
    fs.writeFileSync(generatedImage, PNG_BYTES);

    const generatedResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(generatedImage));
    assert.equal(generatedResult.code, 'IPC_HANDLER_FAILED');
    assert.deepEqual(getRequestBody(calls).images, [PNG_DATA_URL]);

    const picked = await calls.ipcHandlers['pick-image-file'](trustedEvent());
    assert.deepEqual(picked, { canceled: false, filePath: fs.realpathSync(pickedImage) });
    const pickedResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(picked.filePath));
    assert.equal(pickedResult.code, 'IPC_HANDLER_FAILED');
    assert.deepEqual(getRequestBody(calls).images, [PNG_DATA_URL]);

    const pasted = await calls.ipcHandlers['save-pasted-image'](trustedEvent(), PNG_DATA_URL);
    assert.equal(pasted.ok, true);
    const pastedResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(pasted.filePath));
    assert.equal(pastedResult.code, 'IPC_HANDLER_FAILED');
    assert.deepEqual(getRequestBody(calls).images, [PNG_DATA_URL]);

    const dataUrlResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(PNG_DATA_URL));
    assert.equal(dataUrlResult.code, 'IPC_HANDLER_FAILED');
    assert.deepEqual(getRequestBody(calls).images, [PNG_DATA_URL]);

    const baselineJpegDataUrl = dataUrl('image/jpeg', JPEG_BYTES);
    const baselineJpegResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(baselineJpegDataUrl));
    assert.equal(baselineJpegResult.code, 'IPC_HANDLER_FAILED');
    assert.deepEqual(getRequestBody(calls).images, [baselineJpegDataUrl]);

    const progressiveDataUrl = dataUrl('image/jpeg', PROGRESSIVE_JPEG_BYTES);
    const progressiveResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(progressiveDataUrl));
    assert.equal(progressiveResult.code, 'IPC_HANDLER_FAILED');
    assert.deepEqual(getRequestBody(calls).images, [progressiveDataUrl]);

    const adam7DataUrl = dataUrl('image/png', ADAM7_PNG_BYTES);
    const adam7Result = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(adam7DataUrl));
    assert.equal(adam7Result.code, 'IPC_HANDLER_FAILED');
    assert.deepEqual(getRequestBody(calls).images, [adam7DataUrl]);

    const bmpImage = path.join(generatedDir, 'generated.bmp');
    fs.writeFileSync(bmpImage, BMP_BYTES);
    const bmpResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(bmpImage));
    assert.equal(bmpResult.code, 'IPC_HANDLER_FAILED');
    assertPngSourceImage(calls);

    const topDownBmpImage = path.join(generatedDir, 'top-down.bmp');
    fs.writeFileSync(topDownBmpImage, TOP_DOWN_BMP_BYTES);
    const topDownBmpResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(topDownBmpImage));
    assert.equal(topDownBmpResult.code, 'IPC_HANDLER_FAILED');
    assertPngSourceImage(calls);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('真实 generate handler 恢复真实 WebP，转换为 PNG 后进入下游且拒绝 zero-VP8', async () => {
  const homePath = createTempHome('miaos-webp-supported-');
  const pickedWebpPath = path.join(homePath, 'picked.webp');
  fs.writeFileSync(pickedWebpPath, WEBP_BYTES);
  try {
    const { calls } = await runMainWithMock({
      homePath,
      openDialogResult: { canceled: false, filePaths: [pickedWebpPath] },
    });
    const directResult = await calls.ipcHandlers['generate-image'](
      trustedEvent(),
      createGenerateParams(dataUrl('image/webp', WEBP_BYTES)),
    );
    assert.equal(directResult.code, 'IPC_HANDLER_FAILED');
    assertPngSourceImage(calls);

    const generatedDir = path.join(homePath, '.miaos', 'generated');
    fs.mkdirSync(generatedDir, { recursive: true });
    const webpPath = path.join(generatedDir, 'real.webp');
    fs.writeFileSync(webpPath, WEBP_BYTES);
    const fileResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(webpPath));
    assert.equal(fileResult.code, 'IPC_HANDLER_FAILED');
    assertPngSourceImage(calls);

    const pickedResult = await calls.ipcHandlers['pick-image-file'](trustedEvent());
    assert.deepEqual(pickedResult, { canceled: false, filePath: fs.realpathSync(pickedWebpPath) });
    assert.deepEqual(calls.openDialogOptions[0].filters[0].extensions, ['png', 'jpg', 'jpeg', 'webp', 'bmp']);

    const zeroVp8Path = path.join(generatedDir, 'zero-vp8.webp');
    fs.writeFileSync(zeroVp8Path, FAKE_IMAGE_BYTES.zeroVp8Webp);
    const rejectedResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(zeroVp8Path));
    assert.equal(rejectedResult.code, 'IPC_SOURCE_IMAGE_INVALID_IMAGE');
    assert.equal(calls.networkRequests.length, 2);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('真实 show-in-folder 只接受 generated 内的规范普通文件并传递 canonical path', async () => {
  const homePath = createTempHome('miaos-show-in-folder-');
  try {
    const { calls } = await runMainWithMock({ homePath });
    const generatedDir = path.join(homePath, '.miaos', 'generated');
    const nestedDir = path.join(generatedDir, 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    const generatedImage = path.join(generatedDir, 'safe.png');
    fs.writeFileSync(generatedImage, PNG_BYTES);
    const lexicalGeneratedPath = path.join(nestedDir, '..', 'safe.png');

    const valid = await calls.ipcHandlers['show-in-folder'](trustedEvent(), lexicalGeneratedPath);
    assert.deepEqual(valid, { ok: true });
    assert.deepEqual(calls.showItemInFolder, [fs.realpathSync(generatedImage)]);

    const externalAlias = path.join(homePath, 'external-alias.png');
    fs.symlinkSync(generatedImage, externalAlias);
    const aliasResult = await calls.ipcHandlers['show-in-folder'](trustedEvent(), externalAlias);
    assert.equal(aliasResult.code, 'IPC_FILE_PATH_NOT_ALLOWED');

    const outsideFile = path.join(homePath, 'outside.png');
    fs.writeFileSync(outsideFile, PNG_BYTES);
    const outsideResult = await calls.ipcHandlers['show-in-folder'](trustedEvent(), outsideFile);
    assert.equal(outsideResult.code, 'IPC_FILE_PATH_NOT_ALLOWED');

    const generatedSymlink = path.join(generatedDir, 'outside-link.png');
    fs.symlinkSync(outsideFile, generatedSymlink);
    const symlinkResult = await calls.ipcHandlers['show-in-folder'](trustedEvent(), generatedSymlink);
    assert.equal(symlinkResult.code, 'IPC_FILE_SYMLINK_NOT_ALLOWED');

    const directoryResult = await calls.ipcHandlers['show-in-folder'](trustedEvent(), generatedDir);
    assert.equal(directoryResult.code, 'IPC_FILE_NOT_REGULAR');

    const prefixDir = `${generatedDir}-prefix`;
    fs.mkdirSync(prefixDir);
    const prefixFile = path.join(prefixDir, 'prefix.png');
    fs.writeFileSync(prefixFile, PNG_BYTES);
    const prefixResult = await calls.ipcHandlers['show-in-folder'](trustedEvent(), prefixFile);
    assert.equal(prefixResult.code, 'IPC_FILE_PATH_NOT_ALLOWED');
  } finally {
    cleanupTempHome(homePath);
  }
});


test('真实 show-in-folder 拒绝作为可信根的 generated 符号链接目录', async () => {
  const homePath = createTempHome('miaos-show-root-symlink-');
  try {
    const { calls } = await runMainWithMock({ homePath });
    const userDataPath = path.join(homePath, '.miaos');
    const externalGeneratedDir = path.join(homePath, 'external-generated');
    fs.mkdirSync(externalGeneratedDir);
    const externalImage = path.join(externalGeneratedDir, 'safe.png');
    fs.writeFileSync(externalImage, PNG_BYTES);
    fs.symlinkSync(externalGeneratedDir, path.join(userDataPath, 'generated'));

    const result = await calls.ipcHandlers['show-in-folder'](trustedEvent(), path.join(userDataPath, 'generated', 'safe.png'));
    assert.equal(result.code, 'IPC_FILE_ROOT_NOT_ALLOWED');
    assert.deepEqual(calls.showItemInFolder, []);
  } finally {
    cleanupTempHome(homePath);
  }
});
