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

test('默认状态包含 Grsai 与 Aiping 内置供应商，并保持 Grsai 为默认生图模型', () => {
  const state = createDefaultState();
  assert.equal(state.schemaVersion, 6);
  assert.equal(CURRENT_STORAGE_KEY, 'miaos.state.v6');
  assert.equal(BACKUP_STORAGE_KEY, 'miaos.state.backup.v6');
  assert.ok(LEGACY_STORAGE_KEYS.includes('miaos.state.v5'));
  assert.equal(state.providers[0].id, 'p_grsai');
  assert.equal(state.providers[0].imageModels.find((m) => m.id === 'gpt-image-2')?.enabled, true);
  const aiping = state.providers.find((provider) => provider.id === 'p_aiping');
  assert.equal(aiping?.type, 'aiping');
  assert.equal(aiping?.endpoint, 'https://aiping.cn/api/v1');
  assert.deepEqual(aiping?.capabilities, ['image', 'text']);
  assert.equal(aiping?.imageModels.find((model) => model.id === 'Qwen-Image')?.enabled, true);
  assert.equal(aiping?.imageModels.find((model) => model.id === 'Qwen-Image-Edit')?.enabled, false);
  assert.equal(aiping?.textModels.find((model) => model.id === 'DeepSeek-V3.1')?.enabled, true);
  assert.equal(state.defaults.defaultImageProvider, 'p_grsai');
  assert.equal(state.defaults.defaultImageModel, 'gpt-image-2');
  assert.equal(state.updateRepo, 'dick86114/miaos');
  assert.equal(validateState(state).ok, true);
});

test('v5 状态迁移到 v6 时只补入一次 Aiping，v6 中主动删除后不会重新出现', () => {
  const legacyV5 = createDefaultState();
  delete legacyV5.schemaVersion;
  legacyV5.providers = legacyV5.providers.filter((provider) => provider.id !== 'p_aiping');
  legacyV5.history.push({ id: 'h_keep', createdAt: 1 });
  legacyV5.projects.push({ id: 'p_keep', versions: [] });

  const migrated = migrateState(legacyV5);
  assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.providers.filter((provider) => provider.id === 'p_aiping').length, 1);
  assert.equal(migrated.history[0].id, 'h_keep');
  assert.equal(migrated.projects[0].id, 'p_keep');

  const deletedByUser = {
    ...migrated,
    providers: migrated.providers.filter((provider) => provider.id !== 'p_aiping'),
  };
  const normalizedAgain = migrateState(deletedByUser);
  assert.equal(normalizedAgain.providers.some((provider) => provider.id === 'p_aiping'), false);

  const deletedAllProviders = migrateState({ ...migrated, providers: [] });
  assert.deepEqual(deletedAllProviders.providers, []);
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
