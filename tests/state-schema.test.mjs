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
