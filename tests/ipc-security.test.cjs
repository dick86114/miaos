const test = require('node:test');
const assert = require('node:assert/strict');
const { assertTrustedSender, registerSecureHandler } = require('../src/main/security/ipc');

test('拒绝非主窗口发送的 IPC', () => {
  const mainWindow = { webContents: { id: 10 } };
  assert.throws(() => assertTrustedSender({ sender: { id: 11 } }, mainWindow), /不受信任/);
  assert.doesNotThrow(() => assertTrustedSender({ sender: { id: 10 } }, mainWindow));
});

test('主窗口不存在时拒绝 IPC', () => {
  assert.throws(() => assertTrustedSender({ sender: { id: 10 } }, null), /不受信任/);
});

test('安全注册器在未知来源时不执行校验或业务处理，并返回公开错误', async () => {
  let registeredHandler;
  let validateCalls = 0;
  let handleCalls = 0;
  registerSecureHandler({
    ipcMain: { handle(channel, handler) {
      assert.equal(channel, 'secure-channel');
      registeredHandler = handler;
    } },
    channel: 'secure-channel',
    getMainWindow: () => ({ webContents: { id: 10 } }),
    validate() { validateCalls += 1; },
    async handle() { handleCalls += 1; return { ok: true }; },
  });

  const result = await registeredHandler({ sender: { id: 11 } });
  assert.deepEqual(result, { ok: false, error: 'IPC 来源不受信任', code: 'IPC_UNTRUSTED_SENDER' });
  assert.equal(validateCalls, 0);
  assert.equal(handleCalls, 0);
});

test('安全注册器先校验参数，再返回不含堆栈的公开错误', async () => {
  let registeredHandler;
  registerSecureHandler({
    ipcMain: { handle(_channel, handler) { registeredHandler = handler; } },
    channel: 'validated-channel',
    getMainWindow: () => ({ webContents: { id: 10 } }),
    validate() { throw new Error('参数无效'); },
    async handle() { throw new Error('不应执行'); },
  });

  const result = await registeredHandler({ sender: { id: 10 } });
  assert.deepEqual(result, { ok: false, error: '参数无效', code: 'IPC_VALIDATION_FAILED' });
  assert.equal('stack' in result, false);
});

test('安全注册器将业务异常转换为不含堆栈的公开错误', async () => {
  let registeredHandler;
  registerSecureHandler({
    ipcMain: { handle(_channel, handler) { registeredHandler = handler; } },
    channel: 'failing-channel',
    getMainWindow: () => ({ webContents: { id: 10 } }),
    async handle() {
      const error = new Error('网络请求失败');
      error.stack = '敏感堆栈信息';
      throw error;
    },
  });

  const result = await registeredHandler({ sender: { id: 10 } });
  assert.deepEqual(result, { ok: false, error: '网络请求失败', code: 'IPC_HANDLER_FAILED' });
  assert.equal('stack' in result, false);
});
