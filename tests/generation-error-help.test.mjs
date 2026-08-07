import assert from 'node:assert/strict';
import test from 'node:test';

async function loadHelp() {
  return import(`../src/js/generation-error-help.js?generation-error-help=${Date.now()}-${Math.random()}`);
}

test('图片下载阶段的 ECONNRESET 会解释为已生成后下载中断，并给出网络排查步骤', async () => {
  const { getGenerationErrorHelp } = await loadHelp();
  const help = getGenerationErrorHelp({
    message: '生图失败，请查看诊断日志（诊断编号：diag-example）',
    code: 'GENERATION_FAILED',
    stage: 'image_download',
    reasonCode: 'ECONNRESET',
    diagnosticId: 'diag-example',
  });

  assert.equal(help.title, '图片已生成，但下载结果时连接中断');
  assert.match(help.summary, /供应商已返回图片结果/);
  assert.ok(help.steps.some((step) => step.includes('切换手机热点')));
  assert.equal(help.retryable, true);
});

test('认证、限流与未知错误均提供不会泄露密钥的可执行说明', async () => {
  const { getGenerationErrorHelp } = await loadHelp();
  const auth = getGenerationErrorHelp({ code: 'AUTH_FAILED', message: '认证失败，请检查 API Key 是否有效' });
  const rate = getGenerationErrorHelp({ code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' });
  const unknown = getGenerationErrorHelp({ message: '内部异常 token=secret-value' });

  assert.match(auth.summary, /API Key/);
  assert.ok(auth.steps.some((step) => step.includes('重新保存')));
  assert.ok(rate.steps.some((step) => step.includes('稍后')));
  assert.doesNotMatch(unknown.summary, /secret-value/);
  assert.match(unknown.summary, /未能完成/);
});
