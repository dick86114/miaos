// 生图失败说明：只消费主进程已脱敏的公开字段，绝不展示原始网络异常或密钥。

function normalize(input = {}) {
  return {
    code: String(input.code || ''),
    stage: String(input.stage || ''),
    reasonCode: String(input.reasonCode || ''),
    diagnosticId: String(input.diagnosticId || ''),
    message: String(input.message || ''),
  };
}

function createHelp({ title, summary, reasons, steps, retryable = false }) {
  return { title, summary, reasons, steps, retryable };
}

// 只解析应用自身生成的错误前缀；未知消息不回显，避免把敏感日志展示到帮助区。
function extractKnownReason(message, prefix) {
  if (!message.startsWith(prefix)) return '';
  return message
    .slice(prefix.length)
    .replace(/（诊断编号：[^）]*）/u, '')
    .replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 240);
}

function createProviderTaskHelp(reason) {
  if (/维护中|正在修复/u.test(reason)) {
    return createHelp({
      title: '模型正在维护，暂时不可调用',
      summary: `供应商在执行任务时返回：${reason}。该模型当前不可调用。`,
      reasons: ['供应商已将模型置为维护状态', '模型服务暂时关闭或正在修复'],
      steps: ['切换到同一供应商的其他可用生图模型', '等待供应商恢复后再点击“再次生成”', '若长期未恢复，在供应商后台确认模型状态'],
      retryable: true,
    });
  }

  return createHelp({
    title: '供应商模型执行失败',
    summary: reason
      ? `供应商已受理生图任务，但执行阶段返回失败：${reason}。`
      : '供应商已受理生图任务，但执行阶段未成功完成。',
    reasons: ['供应商模型或上游算力执行异常', '供应商返回了应用未分类的业务错误'],
    steps: ['查看下方错误和诊断编号确认供应商原因', '尝试同一供应商的其他模型', '稍后点击“再次生成”，或联系供应商确认模型状态'],
    retryable: true,
  });
}

export function getGenerationErrorHelp(input) {
  const error = normalize(input);

  if (error.stage === 'image_download') {
    const reset = error.reasonCode === 'ECONNRESET';
    const statusMatch = /^HTTP_(\d{3})$/u.exec(error.reasonCode);
    const httpStatus = statusMatch ? Number(statusMatch[1]) : 0;
    if (httpStatus === 404 || httpStatus === 410) {
      return createHelp({
        title: '图片已生成，但结果图链接不可用',
        summary: `供应商已返回图片结果，但结果图地址返回 HTTP ${httpStatus}，链接可能已过期或不可访问。`,
        reasons: ['供应商的结果图链接有过期时间', '图片 CDN 已移除该文件', '供应商地址或资源策略异常'],
        steps: ['点击“再次生成”重新生成一张', '若多次出现，在生成后立即保存并观察是否仍失败', '复制诊断信息并联系供应商确认链接有效期'],
        retryable: false,
      });
    }
    if (httpStatus === 429) {
      return createHelp({
        title: '图片已生成，但下载结果被限流',
        summary: '供应商已返回图片结果，但下载结果图时收到 HTTP 429，当前下载请求过多或超过频率限制。',
        reasons: ['短时间批量生成触发了图片服务限流', '当前账户或 IP 的下载额度受限'],
        steps: ['等待一两分钟后点击“再次生成”', '减少同时批量生成的数量', '若持续出现，复制诊断信息并联系供应商'],
        retryable: true,
      });
    }
    if (httpStatus >= 500) {
      return createHelp({
        title: '图片已生成，但图片服务暂时异常',
        summary: `供应商已返回图片结果，但下载结果图时收到 HTTP ${httpStatus}，图片服务当前处理异常。`,
        reasons: ['图片 CDN 或供应商服务临时故障', '图片服务正在维护或过载'],
        steps: ['等待几分钟后点击“再次生成”', '尝试供应商或网络可用时的其他生成任务', '持续出现时复制诊断信息并联系供应商'],
        retryable: true,
      });
    }
    if (error.reasonCode === 'ETIMEDOUT') {
      return createHelp({
        title: '图片已生成，但下载结果超时',
        summary: '供应商已返回图片结果，但连接图片地址或读取图片内容超时。',
        reasons: ['当前网络到图片服务的延迟过高', '图片文件较大且网络不稳定', 'VPN、代理或防火墙拖慢了连接'],
        steps: ['检查网络后点击“再次生成”', '关闭 VPN 或代理后重试', '切换手机热点或其他网络后重试'],
        retryable: true,
      });
    }
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

  const taskReason = extractKnownReason(error.message, '供应商任务执行失败：');
  if (taskReason) return createProviderTaskHelp(taskReason);

  if (error.message === '供应商拒绝了生成任务（内容违规）') {
    return createHelp({
      title: '生成内容被供应商拦截',
      summary: '供应商内容审核拒绝了本次提示词或参考图，任务没有生成结果。',
      reasons: ['提示词触发了供应商内容策略', '参考图内容触发了供应商内容策略'],
      steps: ['调整或简化提示词后重试', '移除参考图或更换参考图后重试', '确认内容符合供应商使用政策'],
    });
  }

  const queryReason = extractKnownReason(error.message, 'Grsai 查询结果失败：');
  if (queryReason) {
    return createHelp({
      title: '供应商结果查询失败',
      summary: `供应商在查询生成结果时返回：${queryReason}。`,
      reasons: ['异步任务已被供应商移除或过期', '供应商结果服务返回业务错误'],
      steps: ['点击“再次生成”创建新任务', '尝试同一供应商的其他模型', '持续失败时复制诊断信息联系供应商'],
    });
  }

  if (error.message === '轮询超时，任务仍未完成') {
    return createHelp({
      title: '供应商任务执行超时',
      summary: '供应商已受理任务，但长时间未返回最终结果，应用已停止等待。',
      reasons: ['供应商算力繁忙或任务排队过长', '模型服务响应缓慢'],
      steps: ['稍后点击“再次生成”', '减少同时提交的生成数量', '尝试同一供应商的其他模型'],
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
    record?.error ? `错误：${record.error}` : '',
    record?.errorDetails?.diagnosticId ? `诊断编号：${record.errorDetails.diagnosticId}` : '',
    record?.providerName ? `供应商：${record.providerName}` : '',
    record?.modelId ? `模型：${record.modelId}` : '',
    record?.ratio ? `比例：${record.ratio}` : '',
    record?.quality ? `质量：${record.quality}` : '',
    record?.prompt ? `提示词：${record.prompt}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}
