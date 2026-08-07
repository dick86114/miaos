const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createDiagnosticLogger } = require('../src/main/services/diagnostic-log');

test('生图失败诊断日志保留网络定位信息并脱敏密钥与 URL 查询参数', () => {
  const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'miaos-diagnostic-log-'));
  try {
    const logger = createDiagnosticLogger({
      directoryPath,
      now: () => new Date('2026-08-07T12:00:00.000Z'),
      createId: () => 'diag-test-001',
    });
    const error = Object.assign(new Error('read ECONNRESET Authorization: Bearer sk-secret-value'), {
      code: 'ECONNRESET',
      errno: 'ECONNRESET',
      syscall: 'read',
    });

    const result = logger.recordFailure({
      stage: 'image_download',
      providerId: 'provider-aiping',
      providerType: 'aiping',
      modelName: 'Qwen-Image',
      endpoint: 'https://api.example.com/v1?api_key=sk-secret-value',
      imageUrl: 'https://cdn.example.com/image.png?token=temporary-secret',
      sourceImage: false,
      error,
    });

    assert.equal(result.id, 'diag-test-001');
    const [line] = fs.readFileSync(result.filePath, 'utf8').trim().split('\n');
    const entry = JSON.parse(line);
    assert.deepEqual(entry.target, {
      endpoint: 'https://api.example.com/v1',
      imageUrl: 'https://cdn.example.com/image.png',
    });
    assert.equal(entry.stage, 'image_download');
    assert.equal(entry.error.code, 'ECONNRESET');
    assert.equal(entry.error.syscall, 'read');
    assert.equal(entry.error.message.includes('sk-secret-value'), false);
    assert.equal(JSON.stringify(entry).includes('temporary-secret'), false);
  } finally {
    fs.rmSync(directoryPath, { recursive: true, force: true });
  }
});

test('诊断日志写入失败不会覆盖原始生图错误', () => {
  const logger = createDiagnosticLogger({
    directoryPath: '/dev/null/miaos-diagnostics',
    createId: () => 'diag-write-failed',
  });

  assert.equal(logger.recordFailure({ stage: 'image_generation', error: new Error('ECONNRESET') }), null);
});
