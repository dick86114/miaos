const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const mainPath = path.resolve(__dirname, '..', 'main.js');

function createTempHome(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempHome(homePath) {
  try {
    fs.chmodSync(path.join(homePath, '.miaos'), 0o700);
  } catch (_) {}
  fs.rmSync(homePath, { recursive: true, force: true });
}

function createElectronMock({ homePath, setPathImpl } = {}) {
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
  };

  class BrowserWindowMock {
    constructor() {
      calls.browserWindow += 1;
      calls.sequence.push('createWindow');
      this.webContents = {
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
        if (name === 'temp') return os.tmpdir();
        throw Object.assign(new Error(`unexpected getPath:${name}`), { code: 'GET_PATH_BROKEN' });
      },
      setPath(name, value) {
        calls.setPath.push([name, value]);
        calls.sequence.push('setPath');
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
    ipcMain: { handle(channel) { calls.ipcHandle = calls.ipcHandle || []; calls.ipcHandle.push(channel); } },
    dialog: {
      showErrorBox(title, message) { calls.errorBox.push([title, message]); },
      showSaveDialog() {},
      showOpenDialog() {},
    },
    shell: { openExternal() {}, showItemInFolder() {} },
    nativeImage: { createFromPath() { return { isEmpty() { return true; } }; } },
  };

  return { electronMock, calls };
}

async function runMainWithMock(options = {}) {
  const { electronMock, calls } = createElectronMock(options);
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
