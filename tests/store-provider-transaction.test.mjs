import test from 'node:test';
import assert from 'node:assert/strict';

function createFailingStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem() { throw new Error('localStorage 写入失败'); },
    removeItem(key) { map.delete(key); },
  };
}

async function loadStoreWithFailingStorage() {
  globalThis.window = {
    localStorage: createFailingStorage(),
    addEventListener() {},
  };
  const url = new URL(`../src/js/store.js?transaction-test=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(url.href);
}

test('新增供应商的 localStorage 落盘失败会抛出并回滚内存状态', async () => {
  const store = await loadStoreWithFailingStorage();
  assert.throws(() => store.saveProvider({
    id: 'p_new', name: '新增供应商', type: 'openai', endpoint: 'https://new.example/v1',
    capabilities: ['image'], imageModels: [{ id: 'image-a', name: 'image-a', enabled: true }],
  }), /localStorage 写入失败/);
  assert.equal(store.getProvider('p_new'), null);
});

test('编辑供应商的 localStorage 落盘失败会保留原元数据', async () => {
  const store = await loadStoreWithFailingStorage();
  const before = store.getProvider('p_grsai');
  assert.throws(() => store.saveProvider({ id: 'p_grsai', endpoint: 'https://changed.example/v1' }), /localStorage 写入失败/);
  assert.equal(store.getProvider('p_grsai').endpoint, before.endpoint);
});

test('删除供应商的 localStorage 落盘失败会保留原供应商', async () => {
  const store = await loadStoreWithFailingStorage();
  assert.throws(() => store.deleteProvider('p_grsai'), /localStorage 写入失败/);
  assert.equal(store.getProvider('p_grsai')?.id, 'p_grsai');
});

test('迁移尚未完成时普通 provider getter 也绝不返回旧 apiKey', async () => {
  const legacyState = {
    providers: [{
      id: 'p_legacy', name: '旧供应商', type: 'openai', endpoint: 'https://legacy.example/v1', apiKey: 'sk-legacy',
      capabilities: ['image'], imageModels: [{ id: 'image-a', name: 'image-a', enabled: true }], textModels: [], videoModels: [], lastTestResult: null,
    }],
    history: [], projects: [], lastSettings: null,
    defaults: { defaultImageProvider: 'p_legacy', defaultImageModel: 'image-a', defaultTextProvider: '', defaultTextModel: '', defaultVideoProvider: '', defaultVideoModel: '' },
    updateRepo: 'dick86114/miaos',
  };
  const map = new Map([['miaos.state.v5', JSON.stringify(legacyState)]]);
  globalThis.window = {
    localStorage: {
      getItem(key) { return map.has(key) ? map.get(key) : null; },
      setItem(key, value) { map.set(key, String(value)); },
      removeItem(key) { map.delete(key); },
    },
    addEventListener() {},
  };
  const url = new URL(`../src/js/store.js?getter-test=${Date.now()}-${Math.random()}`, import.meta.url);
  const store = await import(url.href);
  assert.equal('apiKey' in store.getProvider('p_legacy'), false);
  assert.equal('apiKey' in store.getProviders()[0], false);
  assert.equal('apiKey' in store.getDefaultProvider(), false);
});


test('迁移落盘失败且 vault rollback 失败时返回配置状态不确定而非声称已恢复', async () => {
  const legacy = {
    providers: [{ id: 'p_legacy', name: '旧供应商', type: 'openai', endpoint: 'https://legacy.example/v1', apiKey: 'sk-legacy', capabilities: ['image'], imageModels: [{ id: 'image-a', name: 'image-a', enabled: true }], textModels: [], videoModels: [] }],
    history: [], projects: [], lastSettings: null,
    defaults: { defaultImageProvider: 'p_legacy', defaultImageModel: 'image-a', defaultTextProvider: '', defaultTextModel: '', defaultVideoProvider: '', defaultVideoModel: '' }, updateRepo: 'dick86114/miaos',
  };
  globalThis.window = {
    localStorage: { getItem(key) { return key === 'miaos.state.v5' ? JSON.stringify(legacy) : null; }, setItem() { throw new Error('状态写入失败'); }, removeItem() {} },
    addEventListener() {},
    api: {
      migrateProviderSecrets: async () => ({ ok: true, transactionId: 'tx-uncertain' }),
      completeProviderSecretTransaction: async (operation) => operation === 'rollback'
        ? { ok: false, code: 'SECRET_TRANSACTION_ROLLBACK_FAILED', transactionId: 'tx-uncertain' }
        : { ok: true },
    },
  };
  const url = new URL(`../src/js/store.js?uncertain-test=${Date.now()}-${Math.random()}`, import.meta.url);
  const store = await import(url.href);
  const result = await store.migrateLegacyProviderSecrets();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'CONFIGURATION_STATE_UNCERTAIN');
  assert.match(result.error, /配置状态不确定/);
});

test('迁移开始阶段已应用但 durability 不确定时会尝试 rollback，并向 renderer 返回不确定状态', async () => {
  const legacy = {
    providers: [{ id: 'p_legacy', name: '旧供应商', type: 'openai', endpoint: 'https://legacy.example/v1', apiKey: 'sk-legacy', capabilities: ['image'], imageModels: [{ id: 'image-a', name: 'image-a', enabled: true }], textModels: [], videoModels: [] }],
    history: [], projects: [], lastSettings: null,
    defaults: { defaultImageProvider: 'p_legacy', defaultImageModel: 'image-a', defaultTextProvider: '', defaultTextModel: '', defaultVideoProvider: '', defaultVideoModel: '' }, updateRepo: 'dick86114/miaos',
  };
  let rollbackCalls = 0;
  globalThis.window = {
    localStorage: { getItem(key) { return key === 'miaos.state.v5' ? JSON.stringify(legacy) : null; }, setItem() {}, removeItem() {} },
    addEventListener() {},
    api: {
      migrateProviderSecrets: async () => ({ ok: false, code: 'SECRET_VAULT_APPLIED_DURABILITY_UNCERTAIN', transactionId: 'tx-applied', error: '不确定' }),
      completeProviderSecretTransaction: async (operation) => {
        if (operation === 'rollback') rollbackCalls += 1;
        return { ok: false, code: 'SECRET_TRANSACTION_ROLLBACK_FAILED', transactionId: 'tx-applied' };
      },
    },
  };
  const url = new URL(`../src/js/store.js?applied-uncertain-test=${Date.now()}-${Math.random()}`, import.meta.url);
  const store = await import(url.href);
  const result = await store.migrateLegacyProviderSecrets();
  assert.equal(rollbackCalls, 1);
  assert.equal(result.code, 'CONFIGURATION_STATE_UNCERTAIN');
});
