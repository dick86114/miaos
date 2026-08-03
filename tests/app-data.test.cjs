const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveAppDataPath } = require('../src/main/app-data');

test('数据目录不可写时抛出明确错误且不回退临时目录', () => {
  const fsImpl = {
    mkdirSync() {},
    accessSync() { throw Object.assign(new Error('denied'), { code: 'EACCES' }); },
    constants: { W_OK: 2 },
  };

  assert.throws(
    () => resolveAppDataPath({ homePath: '/Users/test', fsImpl }),
    (error) => error.code === 'APP_DATA_UNWRITABLE' && error.path === '/Users/test/.miaos',
  );
});
