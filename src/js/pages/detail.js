// 图片详情页
import { icon } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog } from '../ui.js';
import {
  getHistoryItem,
  deleteHistory,
  formatDateTime,
  ratioToSize,
  imageToDataUrl,
} from '../store.js';
import { navigate } from '../router.js';

export function renderDetail(container, params) {
  const id = params[0];
  const item = getHistoryItem(id);

  if (!item) {
    const notFound = htmlToElement(`
      <div class="detail-not-found">
        ${icon('image-off', 40)}
        <span>未找到该图片，可能已被删除</span>
        <button class="btn btn-primary" id="back-history2">${icon('arrow-left', 16)}<span>返回历史</span></button>
      </div>
    `);
    mountPage(container, notFound);
    notFound.querySelector('#back-history2').addEventListener('click', () => navigate('/history'));
    return;
  }

  const root = htmlToElement(`
    <div>
      <div class="detail-top-bar">
        <button class="back-btn" id="back-history">${icon('arrow-left', 16)}<span>返回历史</span></button>
        <div class="top-action-right">
          <button type="button" class="detail-icon-btn" id="btn-download" title="下载">${icon('download', 16)}</button>
          <button type="button" class="detail-icon-btn danger" id="btn-delete" title="删除">${icon('trash-2', 16)}</button>
        </div>
      </div>
      <div class="detail-layout">
        <div class="detail-image-col">
          <img src="${item.image}" alt="${escapeHtml(item.prompt)}" class="detail-image" />
        </div>
        <div class="detail-panel-col">
          <div class="detail-panel">
            <div class="detail-section">
              <div class="detail-section-title">提示词</div>
              <textarea class="detail-textarea" id="detail-prompt" spellcheck="false">${escapeHtml(item.prompt)}</textarea>
            </div>
            <div class="detail-section">
              <div class="detail-section-title">参数</div>
              <div class="param-chips">
                ${item.providerName ? `<span class="param-chip"><span class="param-chip-label">供应商</span>${escapeHtml(item.providerName)}</span>` : ''}
                <span class="param-chip"><span class="param-chip-label">模型</span>${escapeHtml(item.model)}</span>
                <span class="param-chip"><span class="param-chip-label">尺寸</span>${ratioToSize(item.ratio)}</span>
                <span class="param-chip"><span class="param-chip-label">比例</span>${escapeHtml(item.ratio)}</span>
                <span class="param-chip"><span class="param-chip-label">质量</span>${escapeHtml(item.quality)}</span>
                <span class="param-chip"><span class="param-chip-label">生成时间</span>${formatDateTime(item.createdAt)}</span>
              </div>
            </div>
            <div class="detail-section">
              <div class="detail-section-title">操作</div>
              <div class="action-row">
                <button type="button" class="btn btn-primary" id="btn-regenerate">${icon('sparkles', 16)}<span>基于提示词再次生成</span></button>
                <button type="button" class="btn btn-secondary" id="btn-copy">${icon('copy', 16)}<span>复制提示词</span></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
  mountPage(container, root);

  root.querySelector('#back-history').addEventListener('click', () => navigate('/history'));

  // 下载
  root.querySelector('#btn-download').addEventListener('click', async () => {
    try {
      const dataUrl = await imageToDataUrl(item.image);
      const res = await window.api.saveImage(dataUrl, `miaos-${item.id}.png`);
      if (res.ok) toast('图片已保存', 'success');
      else if (!res.canceled) toast('保存失败：' + (res.error || '未知错误'), 'error');
    } catch (e) {
      toast('保存失败：' + e.message, 'error');
    }
  });

  // 删除
  root.querySelector('#btn-delete').addEventListener('click', async () => {
    if (!await confirmDialog('确定删除这张图片吗？')) return;
    deleteHistory(item.id);
    toast('已删除', 'success');
    navigate('/history');
  });

  // 基于提示词再次生成 → 跳转生图页并预填
  root.querySelector('#btn-regenerate').addEventListener('click', () => {
    const prompt = root.querySelector('#detail-prompt').value;
    import('../store.js').then(({ saveLastSettings }) => {
      saveLastSettings({ prompt, providerId: item.providerId, modelId: undefined, ratio: item.ratio, quality: item.quality });
      navigate('/generate');
    });
  });

  // 复制提示词
  root.querySelector('#btn-copy').addEventListener('click', async () => {
    const prompt = root.querySelector('#detail-prompt').value;
    try {
      await navigator.clipboard.writeText(prompt);
      toast('提示词已复制', 'success');
    } catch {
      toast('复制失败', 'error');
    }
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
