// 生图失败说明：只消费主进程已脱敏的公开字段，绝不展示原始网络异常或密钥。

function normalize(input = {}) {
  return {
    code: String(input.code || ''),
    stage: String(input.stage || ''),
    reasonCode: String(input.reasonCode || ''),
    diagnosticId: String(input.diagnosticId || ''),
  };
}

function createHelp({ title, summary, reasons, steps, retryable = false }) {
  return { title, summary, reasons, steps, retryable };
}

export function getGenerationErrorHelp(input) {
  const error = normalize(input);

  if (error.stage === 'image_download') {
    const reset = error.reasonCode === 'ECONNRESET';
    return createHelp({
      title: reset ? '图片已生成，但下载结果时连接中断' : '图片已生成，但下载结果失败',
      summary: reset
        ? '供应商已返回图片结果，但客户端连接图片地址时被对端或中间网络中断。'
        : '供应商已返回图片结果，但客户端下载图片到本机时未能完成。',
      reasons: ['图片 CDN 临时异常', '当前网络、VPN 或代理拦截了图片地址', '网络出口与图片服务的连接不稳定'],
      steps: ['点击“再次生成”重试一次', '关闭 VPN 或代理后重试', '切换手机热点或其他网络后重试', '若持续失败，复制诊断信息并联系供应商'],
      retryable: true,
    });
  }

  if (error.code === 'AUTH_FAILED') {
    return createHelp({
      title: '供应商认证未通过',
      summary: '供应商拒绝了当前 API Key，未开始生成图片。',
      reasons: ['API Key 无效、已过期或已被撤销', 'API Key 与当前供应商地址不匹配', '账户余额、权限或模型授权不足'],
      steps: ['在“系统设置 → 供应商”中重新保存 API Key', '确认 API 地址和模型属于同一供应商', '在供应商后台检查余额、权限和模型授权'],
    });
  }

  if (error.code === 'RATE_LIMITED') {
    return createHelp({
      title: '请求过于频繁',
      summary: '供应商暂时限制了请求频率，本次任务没有完成。',
      reasons: ['短时间内提交了较多生成任务', '供应商账户当前并发或速率额度较低'],
      steps: ['稍后等待一两分钟，再点击“再次生成”', '减少同时提交的任务数量', '在供应商后台确认账户限流策略'],
      retryable: true,
    });
  }

  if (error.code === 'UPSTREAM_REJECTED') {
    return createHelp({
      title: '供应商拒绝了请求',
      summary: '请求已发送到供应商，但供应商未接受当前模型或参数组合。',
      reasons: ['模型不支持当前尺寸、比例或参考图', 'API 地址不是该模型对应的生图端点', '供应商策略拒绝了请求内容'],
      steps: ['确认供应商、模型和 API 地址匹配', '更换常用比例或取消参考图后重试', '尝试该供应商的其他生图模型'],
    });
  }

  if (error.code === 'UPSTREAM_ERROR') {
    return createHelp({
      title: '供应商服务暂时不可用',
      summary: '供应商服务返回了临时服务错误，本次任务可以稍后重试。',
      reasons: ['供应商服务繁忙或维护中', '模型服务临时不可用'],
      steps: ['等待几分钟后点击“再次生成”', '尝试同一供应商的其他模型', '持续失败时复制诊断信息联系供应商'],
      retryable: true,
    });
  }

  if (error.code === 'NETWORK_ERROR' || error.reasonCode === 'ETIMEDOUT' || error.reasonCode === 'ENOTFOUND') {
    return createHelp({
      title: '连接供应商时网络异常',
      summary: '客户端未能稳定连接供应商服务，生成请求可能没有送达。',
      reasons: ['网络连接不稳定', 'VPN、代理或防火墙影响了请求', 'API 地址无法从当前网络访问'],
      steps: ['确认网络可用后点击“再次生成”', '关闭 VPN 或代理后重试', '检查供应商 API 地址是否正确'],
      retryable: true,
    });
  }

  if (error.stage === 'source_image_read') {
    return createHelp({
      title: '参考图无法读取',
      summary: '生成前未能读取或验证本地参考图，供应商尚未收到生图请求。',
      reasons: ['原图已被移动或删除', '图片格式损坏或不受支持', '应用没有读取该文件的权限'],
      steps: ['重新选择原始参考图', '确认图片可以在系统预览中正常打开', '将图片复制到本机后再上传'],
    });
  }

  return createHelp({
    title: '本次生成未能完成',
    summary: '本次生成未能完成，系统未获得可安全展示的具体原因，请依据下方步骤排查。',
    reasons: ['供应商服务、网络或本机环境出现了未分类异常'],
    steps: ['点击“再次生成”重试一次', '确认供应商配置和网络连接正常', '复制诊断信息后联系技术支持'],
    retryable: true,
  });
}

export function formatDiagnosticText(record, help) {
  const parts = [
    `问题：${help.title}`,
    `说明：${help.summary}`,
    record?.errorDetails?.diagnosticId ? `诊断编号：${record.errorDetails.diagnosticId}` : '',
    record?.providerName ? `供应商：${record.providerName}` : '',
    record?.modelId ? `模型：${record.modelId}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}
