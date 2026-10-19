const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPendingUpdateStore } = require('../src/main/services/update-state');

function createStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-update-state-'));
  const filePath = path.join(dir, 'pending-update.json');
  return {
    dir,
    filePath,
    store: createPendingUpdateStore({ filePath, fsImpl: fs, now: () => 1700000000000 }),
  };
}

test('待展示更新只在目标版本启动后消费一次', () => {
  const { dir, filePath, store } = createStore();
  try {
    store.save({
      version: 'v1.5.0',
      previousVersion: '1.4.3',
      releaseNotes: '## 本次更新\n- 支持取消下载',
      releaseDate: '2026-10-19T00:00:00Z',
      releaseUrl: 'https://github.com/dick86114/miaos/releases/tag/v1.5.0',
    });

    assert.equal(fs.existsSync(filePath), true);
    const notice = store.consumeForVersion('1.5.0');
    assert.equal(notice.version, '1.5.0');
    assert.equal(notice.previousVersion, '1.4.3');
    assert.match(notice.releaseNotes, /支持取消下载/u);
    assert.equal(fs.existsSync(filePath), false);
    assert.equal(store.consumeForVersion('1.5.0'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('版本未匹配或记录损坏时清理待展示更新，避免旧弹窗再次出现', () => {
  const { dir, filePath, store } = createStore();
  try {
    store.save({ version: '1.5.0', previousVersion: '1.4.3', releaseNotes: '- 新版本' });
    assert.equal(store.consumeForVersion('1.4.3'), null);
    assert.equal(fs.existsSync(filePath), false);

    fs.writeFileSync(filePath, '{ bad json', 'utf8');
    assert.equal(store.read(), null);
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
