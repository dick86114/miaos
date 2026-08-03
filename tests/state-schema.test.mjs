import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_STORAGE_KEY,
  BACKUP_STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  createDefaultState,
  migrateState,
  createStatePersistence,
  validateState,
  migrateLegacyProviderSecrets,
} from '../src/js/state-schema.js';

function createMemoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

test('默认状态包含 Grsai 供应商、默认模型和更新仓库', () => {
  const state = createDefaultState();
  assert.equal(state.providers[0].id, 'p_grsai');
  assert.equal(state.providers[0].imageModels.find((m) => m.id === 'gpt-image-2')?.enabled, true);
  assert.equal(state.defaults.defaultImageProvider, 'p_grsai');
  assert.equal(state.defaults.defaultImageModel, 'gpt-image-2');
  assert.equal(state.updateRepo, 'dick86114/miaos');
  assert.equal(validateState(state).ok, true);
});

test('损坏主状态时恢复备份且不覆盖备份', () => {
  const backup = createDefaultState();
  backup.history.push({ id: 'h_backup', createdAt: 1 });
  const storage = createMemoryStorage({
    [CURRENT_STORAGE_KEY]: '{bad-json',
    [BACKUP_STORAGE_KEY]: JSON.stringify(backup),
  });
  const persistence = createStatePersistence(storage);
  const result = persistence.load();
  assert.equal(result.source, 'backup');
  assert.equal(result.state.history[0].id, 'h_backup');
  assert.equal(storage.getItem(BACKUP_STORAGE_KEY), JSON.stringify(backup));
  assert.equal(storage.getItem(CURRENT_STORAGE_KEY), JSON.stringify(backup));
});

test('主状态缺失且备份和旧状态都有效时优先恢复备份', () => {
  const backup = createDefaultState();
  backup.history.push({ id: 'h_backup_missing_current', createdAt: 3 });
  const legacy = createDefaultState();
  legacy.history.push({ id: 'h_legacy_should_not_use', createdAt: 4 });
  const storage = createMemoryStorage({
    [BACKUP_STORAGE_KEY]: JSON.stringify(backup),
    [LEGACY_STORAGE_KEYS[0]]: JSON.stringify(legacy),
  });
  const persistence = createStatePersistence(storage);
  const result = persistence.load();
  assert.equal(result.source, 'backup');
  assert.equal(result.state.history[0].id, 'h_backup_missing_current');
  assert.equal(storage.getItem(BACKUP_STORAGE_KEY), JSON.stringify(backup));
});

test('写入新状态前保留上一个合法状态', () => {
  const oldState = createDefaultState();
  const storage = createMemoryStorage({ [CURRENT_STORAGE_KEY]: JSON.stringify(oldState) });
  const persistence = createStatePersistence(storage);
  const nextState = createDefaultState();
  nextState.updateRepo = 'owner/repo';
  persistence.saveNow(nextState);
  assert.deepEqual(JSON.parse(storage.getItem(BACKUP_STORAGE_KEY)), oldState);
  assert.equal(validateState(JSON.parse(storage.getItem(CURRENT_STORAGE_KEY))).ok, true);
});

test('迁移 v4 状态时保留旧模型、文本供应商、项目和 updateRepo 默认值', () => {
  const legacy = {
    providers: [{
      id: 'p_old',
      name: '旧供应商',
      type: 'openai',
      endpoint: 'https://example.test/v1/images',
      apiKey: 'sk-old',
      models: [{ id: 'image-a', enabled: true }],
    }],
    textProvider: {
      endpoint: 'https://example.test/v1/chat',
      apiKey: 'sk-text',
      model: 'text-a',
    },
    history: [{ id: 'h1', createdAt: 1 }],
    projects: [{ id: 'proj1', versions: [] }],
  };
  const migrated = migrateState(legacy);
  assert.equal(validateState(migrated).ok, true);
  assert.equal(migrated.providers[0].imageModels[0].id, 'image-a');
  assert.equal(migrated.providers[1].id, 'p_text_migrated');
  assert.equal(migrated.defaults.defaultTextProvider, 'p_text_migrated');
  assert.equal(migrated.defaults.defaultTextModel, 'text-a');
  assert.equal(migrated.projects[0].id, 'proj1');
  assert.equal(migrated.updateRepo, 'dick86114/miaos');
});

test('缺少主状态时从旧 key 迁移为当前状态', () => {
  const legacyState = createDefaultState();
  legacyState.history.push({ id: 'h_legacy', createdAt: 2 });
  const storage = createMemoryStorage({ [LEGACY_STORAGE_KEYS[0]]: JSON.stringify(legacyState) });
  const persistence = createStatePersistence(storage);
  const result = persistence.load();
  assert.equal(result.source, 'legacy');
  assert.equal(result.state.history[0].id, 'h_legacy');
  assert.equal(validateState(JSON.parse(storage.getItem(CURRENT_STORAGE_KEY))).ok, true);
});

test('scheduleSave 防抖并可由 flush 立即写入', () => {
  const storage = createMemoryStorage();
  const persistence = createStatePersistence(storage);
  const state = createDefaultState();
  state.lastSettings = { prompt: '延迟保存' };
  persistence.scheduleSave(state);
  assert.equal(storage.getItem(CURRENT_STORAGE_KEY), null);
  persistence.flush();
  assert.equal(JSON.parse(storage.getItem(CURRENT_STORAGE_KEY)).lastSettings.prompt, '延迟保存');
});


test('旧密钥仅在主进程迁移全部成功后从状态清理', async () => {
  const state = createDefaultState();
  state.providers = [
    { ...state.providers[0], id: 'p_one', apiKey: 'sk-one', hasApiKey: false },
    { ...state.providers[0], id: 'p_two', apiKey: 'sk-two', hasApiKey: false },
  ];
  let received = null;

  const result = await migrateLegacyProviderSecrets(state, async (secrets) => {
    received = secrets;
    return { ok: true };
  });

  assert.deepEqual(received.map((entry) => ({ providerId: entry.providerId, apiKey: entry.apiKey })), [
    { providerId: 'p_one', apiKey: 'sk-one' },
    { providerId: 'p_two', apiKey: 'sk-two' },
  ]);
  assert.equal(received.every((entry) => entry.metadata && entry.metadata.apiKey === undefined), true);
  assert.equal(result.ok, true);
  assert.deepEqual(state.providers.map((provider) => provider.hasApiKey), [true, true]);
  assert.equal('apiKey' in state.providers[0], false);
  assert.equal('apiKey' in state.providers[1], false);
  const storage = createMemoryStorage();
  createStatePersistence(storage).saveNow(state);
  assert.doesNotMatch(storage.getItem(CURRENT_STORAGE_KEY), /sk-one|sk-two/);
});

test('旧密钥迁移失败时状态保持原样', async () => {
  const state = createDefaultState();
  state.providers[0].apiKey = 'sk-keep';
  state.providers[0].hasApiKey = false;

  const result = await migrateLegacyProviderSecrets(state, async () => ({
    ok: false,
    error: '系统钥匙串不可用',
  }));

  assert.deepEqual(result, { ok: false, error: '系统钥匙串不可用' });
  assert.equal(state.providers[0].apiKey, 'sk-keep');
  assert.equal(state.providers[0].hasApiKey, false);
});


test('非法 providerId 的迁移失败时旧状态密钥不会被清理', async () => {
  const state = createDefaultState();
  state.providers[0].id = '__proto__';
  state.providers[0].apiKey = 'sk-legacy';
  const result = await migrateLegacyProviderSecrets(state, async () => ({ ok: false, error: '供应商 ID 格式不正确' }));
  assert.equal(result.ok, false);
  assert.equal(state.providers[0].apiKey, 'sk-legacy');
});
