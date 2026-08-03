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

function createElectronMock({ homePath, setPathImpl, openDialogResult } = {}) {
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

function createGenerateParams(sourceImage) {
  return {
    prompt: '测试提示词',
    provider: 'grsai',
    modelName: 'gpt-image-2',
    ratio: '1:1',
    quality: '高清',
    size: '1024x1024',
    endpoint: 'https://example.invalid/generate',
    apiKey: 'test-key',
    sourceImage,
  };
}

function getRequestBody(calls, index = -1) {
  const request = calls.networkRequests.at(index);
  return JSON.parse(Buffer.concat(request.chunks).toString('utf8'));
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

test('正常启动精确注册 14 个真实安全 handler，未知 sender 全部被拒绝', async () => {
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
    assert.deepEqual(getRequestBody(calls).images, [dataUrl('image/bmp', BMP_BYTES)]);

    const topDownBmpImage = path.join(generatedDir, 'top-down.bmp');
    fs.writeFileSync(topDownBmpImage, TOP_DOWN_BMP_BYTES);
    const topDownBmpResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(topDownBmpImage));
    assert.equal(topDownBmpResult.code, 'IPC_HANDLER_FAILED');
    assert.deepEqual(getRequestBody(calls).images, [dataUrl('image/bmp', TOP_DOWN_BMP_BYTES)]);
  } finally {
    cleanupTempHome(homePath);
  }
});

test('真实 generate handler 对 nativeImage 不支持的 WebP 明确拒绝且不请求网络', async () => {
  const homePath = createTempHome('miaos-webp-unsupported-');
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
    assert.equal(directResult.code, 'IPC_VALIDATION_FAILED');
    assert.match(directResult.error, /WebP/);
    assert.equal(calls.networkRequests.length, 0);

    const generatedDir = path.join(homePath, '.miaos', 'generated');
    fs.mkdirSync(generatedDir, { recursive: true });
    const webpPath = path.join(generatedDir, 'real.webp');
    fs.writeFileSync(webpPath, WEBP_BYTES);
    const fileResult = await calls.ipcHandlers['generate-image'](trustedEvent(), createGenerateParams(webpPath));
    assert.equal(fileResult.code, 'IPC_SOURCE_IMAGE_INVALID_IMAGE');
    assert.match(fileResult.error, /WebP/);
    assert.equal(calls.networkRequests.length, 0);

    const pickedResult = await calls.ipcHandlers['pick-image-file'](trustedEvent());
    assert.equal(pickedResult.code, 'IPC_SOURCE_IMAGE_INVALID_IMAGE');
    assert.match(pickedResult.error, /WebP/);
    assert.equal(calls.openDialogOptions.length, 1);
    assert.deepEqual(calls.openDialogOptions[0].filters[0].extensions, ['png', 'jpg', 'jpeg', 'bmp']);
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
