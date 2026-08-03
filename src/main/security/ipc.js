const { AppError, toPublicError } = require('../services/app-error');

function createPublicError(error, fallbackCode) {
  if (error instanceof AppError) {
    return { ok: false, ...toPublicError(error) };
  }
  const message = error && typeof error.message === 'string' && error.message.trim()
    ? error.message.trim()
    : '请求处理失败';
  return {
    ok: false,
    error: message,
    code: error && typeof error.code === 'string' ? error.code : fallbackCode,
  };
}

function assertTrustedSender(event, mainWindow) {
  if (!mainWindow || (typeof mainWindow.isDestroyed === 'function' && mainWindow.isDestroyed())
    || !mainWindow.webContents || !event || !event.sender
    || event.sender.id !== mainWindow.webContents.id) {
    const error = new Error('IPC 来源不受信任');
    error.code = 'IPC_UNTRUSTED_SENDER';
    throw error;
  }
}

function registerSecureHandler({ ipcMain, channel, getMainWindow, validate, handle }) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      assertTrustedSender(event, getMainWindow());
    } catch (error) {
      return createPublicError(error, 'IPC_UNTRUSTED_SENDER');
    }

    try {
      if (validate) await validate(...args);
    } catch (error) {
      return createPublicError(error, 'IPC_VALIDATION_FAILED');
    }

    try {
      const result = await handle(event, ...args);
      if (result && result.ok === false && typeof result.error === 'string' && !result.code) {
        return { ...result, code: 'IPC_HANDLER_FAILED' };
      }
      return result;
    } catch (error) {
      return createPublicError(error, 'IPC_HANDLER_FAILED');
    }
  });
}

module.exports = {
  assertTrustedSender,
  registerSecureHandler,
};
