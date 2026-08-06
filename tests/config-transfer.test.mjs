import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_FORMAT,
  CONFIG_VERSION,
  createConfigPayload,
  encryptConfig,
  decryptConfig,
} from '../src/js/config-transfer.js';

function createState() {
  return {
    schemaVersion: 6,
    providers: [
      {
        id: 'p_grsai',
        name: 'Grsai',
        type: 'grsai',
        endpoint: 'https://example.test/v1/api/generate',
        capabilities: ['image'],
        imageModels: [{ id: 'gpt-image-2', name: 'gpt-image-2', enabled: true }],
        textModels: [],
        videoModels: [],
        hasApiKey: true,
        apiKey: '不应该进入状态快照',
        lastTestResult: { ok: true },
      },
    ],
    defaults: { defaultImageProvider: 'p_grsai', defaultImageModel: 'gpt-image-2' },
    themeMode: 'dark',
    history: [{ id: 'history-secret', imagePath: '/Users/private/image.png' }],
    projects: [{ id: 'project-secret', versions: [] }],
    updateRepo: 'owner/repo',
  };
}

test('配置快照只包含跨平台白名单字段，并单独注入密钥', () => {
  const payload = createConfigPayload(createState(), { p_grsai: '真实 API Key' });

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.providers[0].id, 'p_grsai');
  assert.equal(payload.secrets.p_grsai, '真实 API Key');
  assert.equal(payload.themeMode, 'dark');
  assert.equal(payload.defaults.defaultImageModel, 'gpt-image-2');
  assert.equal('history' in payload, false);
  assert.equal('projects' in payload, false);
  assert.equal('updateRepo' in payload, false);
  assert.equal(JSON.stringify(payload).includes('不应该进入状态快照'), false);
  assert.equal(JSON.stringify(payload).includes('/Users/private'), false);
});

test('配置加密后可用同一密码往返解密', () => {
  const payload = createConfigPayload(createState(), { p_grsai: '真实 API Key' });
  const raw = encryptConfig(payload, '迁移密码-123');
  const envelope = JSON.parse(raw);
  const decoded = decryptConfig(raw, '迁移密码-123');

  assert.equal(envelope.format, CONFIG_FORMAT);
  assert.equal(envelope.version, CONFIG_VERSION);
  assert.equal(envelope.kdf.name, 'PBKDF2-HMAC-SHA256');
  assert.equal(envelope.cipher.name, 'AES-256-GCM');
  assert.deepEqual(decoded, payload);
  assert.equal(raw.includes('真实 API Key'), false);
});

test('每次加密都使用新的 salt 和 iv', () => {
  const payload = createConfigPayload(createState(), { p_grsai: '真实 API Key' });
  const first = JSON.parse(encryptConfig(payload, '迁移密码-123'));
  const second = JSON.parse(encryptConfig(payload, '迁移密码-123'));

  assert.notEqual(first.kdf.salt, second.kdf.salt);
  assert.notEqual(first.cipher.iv, second.cipher.iv);
  assert.notEqual(first.payload, second.payload);
});

test('错误密码和篡改内容统一解密失败', () => {
  const raw = encryptConfig(createConfigPayload(createState(), { p_grsai: '真实 API Key' }), '正确密码');

  assert.throws(() => decryptConfig(raw, '错误密码'), /配置解密失败/);
  const tampered = JSON.parse(raw);
  tampered.payload = `${tampered.payload.slice(0, -1)}${tampered.payload.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => decryptConfig(JSON.stringify(tampered), '正确密码'), /配置解密失败/);
});

test('未知格式和未来版本不会被导入', () => {
  const raw = encryptConfig(createConfigPayload(createState(), { p_grsai: '真实 API Key' }), '正确密码');
  const future = JSON.parse(raw);
  future.version = CONFIG_VERSION + 1;

  assert.throws(() => decryptConfig(JSON.stringify({ ...future, format: 'other' }), '正确密码'), /配置格式不支持/);
  assert.throws(() => decryptConfig(JSON.stringify(future), '正确密码'), /配置版本过高/);
});
