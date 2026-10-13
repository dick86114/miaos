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

test('图片下载的 HTTP 状态会映射为具体的用户可读原因', async () => {
  const { getGenerationErrorHelp } = await loadHelp();
  const expired = getGenerationErrorHelp({
    stage: 'image_download',
    reasonCode: 'HTTP_404',
  });
  assert.equal(expired.title, '图片已生成，但结果图链接不可用');
  assert.match(expired.summary, /HTTP 404/);
  assert.match(expired.summary, /已过期|不可访问/);
  assert.equal(expired.retryable, false);

  const rateLimited = getGenerationErrorHelp({
    stage: 'image_download',
    reasonCode: 'HTTP_429',
  });
  assert.equal(rateLimited.title, '图片已生成，但下载结果被限流');
  assert.match(rateLimited.summary, /HTTP 429/);

  const upstream = getGenerationErrorHelp({
    stage: 'image_download',
    reasonCode: 'HTTP_503',
  });
  assert.equal(upstream.title, '图片已生成，但图片服务暂时异常');
  assert.match(upstream.summary, /HTTP 503/);

  const timeout = getGenerationErrorHelp({
    stage: 'image_download',
    reasonCode: 'ETIMEDOUT',
  });
  assert.equal(timeout.title, '图片已生成，但下载结果超时');
  assert.match(timeout.summary, /超时/);
});

test('供应商维护错误会显示模型状态和其他模型切换步骤', async () => {
  const { getGenerationErrorHelp } = await loadHelp();
  const help = getGenerationErrorHelp({
    message: '供应商任务执行失败：维护中，模型正在修复',
    code: 'IPC_HANDLER_FAILED',
  });

  assert.equal(help.title, '模型正在维护，暂时不可调用');
  assert.match(help.summary, /维护中，模型正在修复/);
  assert.ok(help.reasons.some((reason) => reason.includes('维护')));
  assert.ok(help.steps.some((step) => step.includes('其他可用生图模型')));
  assert.equal(help.retryable, true);
});

test('供应商异步任务失败会保留已脱敏的供应商原因', async () => {
  const { getGenerationErrorHelp } = await loadHelp();
  const help = getGenerationErrorHelp({
    message: '供应商任务执行失败：供应商上游容量不足（诊断编号：diag-example）',
    code: 'IPC_HANDLER_FAILED',
  });

  assert.equal(help.title, '供应商模型执行失败');
  assert.match(help.summary, /供应商上游容量不足/);
  assert.doesNotMatch(help.summary, /diag-example/);
  assert.ok(help.steps.some((step) => step.includes('其他模型')));
});

test('内容违规、查询失败和轮询超时都有明确的处理建议', async () => {
  const { getGenerationErrorHelp } = await loadHelp();

  const violation = getGenerationErrorHelp({
    message: '供应商拒绝了生成任务（内容违规）',
    code: 'IPC_HANDLER_FAILED',
  });
  assert.equal(violation.title, '生成内容被供应商拦截');
  assert.ok(violation.steps.some((step) => step.includes('提示词')));

  const query = getGenerationErrorHelp({
    message: 'Grsai 查询结果失败：任务已过期（诊断编号：diag-example）',
    code: 'IPC_HANDLER_FAILED',
  });
  assert.equal(query.title, '供应商结果查询失败');
  assert.match(query.summary, /任务已过期/);
  assert.doesNotMatch(query.summary, /diag-example/);

  const timeout = getGenerationErrorHelp({
    message: '轮询超时，任务仍未完成',
    code: 'IPC_HANDLER_FAILED',
  });
  assert.equal(timeout.title, '供应商任务执行超时');
  assert.equal(timeout.retryable, true);
});
