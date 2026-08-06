// 统一图片详情页：快速历史、全量历史和项目图片共用图二式双栏布局。
import { icon } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog } from '../ui.js';
import {
  getHistory,
  getProjects,
  deleteHistory,
  formatDateTime,
  ratioToSize,
  saveLastSettings,
} from '../store.js';
import { navigate } from '../router.js';
import { resolveImageDetailRecord } from '../image-detail-data.js';

const DETAIL_MIN_ZOOM = 1;
const DETAIL_MAX_ZOOM = 4;
const DETAIL_ZOOM_STEP = 0.2;

function decodeRoutePart(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function getFallbackBackTarget(routeOptions = {}) {
  if (routeOptions.origin === 'generate') return { label: '返回快速生图', path: '/generate' };
  if (routeOptions.source === 'project' && routeOptions.project) {
    return {
      label: '返回项目',
      path: `/project/${encodeURIComponent(routeOptions.project)}?version=${encodeURIComponent(routeOptions.version || '')}`,
    };
  }
  return { label: '返回历史', path: '/history' };
}

function createPromptChainHtml(chain) {
  if (!Array.isArray(chain) || chain.length === 0) return '';
  return `
    <div class="detail-section detail-prompt-chain" data-detail-prompt-chain>
      <div class="detail-section-title">父节点提示词</div>
      <div class="detail-prompt-chain-list">
        ${chain.map((node, index) => `
          <article class="detail-prompt-chain-node" data-detail-prompt-chain-node="${index}">
            <div class="detail-prompt-chain-label">${escapeHtml(node.label || '未命名节点')}</div>
            <textarea class="detail-textarea detail-chain-textarea" readonly spellcheck="false">${escapeHtml(node.prompt || '（无提示词）')}</textarea>
          </article>`).join('')}
      </div>
    </div>`;
}

export function renderDetail(container, params, routeOptions = {}) {
  const item = resolveImageDetailRecord({
    imageId: decodeRoutePart(params[0]),
    source: routeOptions.source,
    origin: routeOptions.origin,
    projectId: routeOptions.project,
    versionId: routeOptions.version,
    historyPage: routeOptions.historyPage,
    historyQuery: routeOptions.historyQuery,
    historySource: routeOptions.historySource,
    historyProject: routeOptions.historyProject,
    historyScroll: routeOptions.historyScroll,
  }, {
    history: getHistory(),
    projects: getProjects(),
  });
  const fallbackBackTarget = getFallbackBackTarget(routeOptions);

  if (!item) {
    const notFound = htmlToElement(`
      <div class="detail-not-found">
        ${icon('image-off', 40)}
        <span>未找到该图片，可能已被删除</span>
        <button class="btn btn-primary" id="back-detail-not-found">${icon('arrow-left', 16)}<span>${escapeHtml(fallbackBackTarget.label)}</span></button>
      </div>
    `);
    mountPage(container, notFound);
    notFound.querySelector('#back-detail-not-found').addEventListener('click', () => navigate(fallbackBackTarget.path));
    return;
  }

  const backTarget = item.backTarget || fallbackBackTarget;
  const modelName = item.model || item.modelId || '未记录模型';
  const filePrefix = item.source === 'project' ? 'miaos-proj' : 'miaos';
  const deleteAction = item.canDelete
    ? `<button type="button" class="detail-icon-btn danger" id="btn-delete" title="删除">${icon('trash-2', 16)}</button>`
    : '';
  const root = htmlToElement(`
    <div class="detail-page">
      <div class="detail-top-bar">
        <button class="back-btn" id="back-detail">${icon('arrow-left', 16)}<span>${escapeHtml(backTarget.label)}</span></button>
        <div class="top-action-right">
          <button type="button" class="detail-icon-btn" id="btn-download" title="下载">${icon('download', 16)}</button>
          ${deleteAction}
        </div>
      </div>
      <div class="detail-layout">
        <div class="detail-image-col">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.prompt || '生成结果')}" class="detail-image" />
        </div>
        <div class="detail-panel-col">
          <div class="detail-panel">
            <div class="detail-section">
              <div class="detail-section-title">提示词</div>
              <textarea class="detail-textarea detail-current-prompt" id="detail-prompt" readonly spellcheck="false">${escapeHtml(item.prompt || '')}</textarea>
            </div>
            ${createPromptChainHtml(item.promptChain)}
            <div class="detail-section">
              <div class="detail-section-title">参数</div>
              <div class="param-chips">
                ${item.providerName ? `<span class="param-chip"><span class="param-chip-label">供应商</span>${escapeHtml(item.providerName)}</span>` : ''}
                <span class="param-chip"><span class="param-chip-label">模型</span>${escapeHtml(modelName)}</span>
                <span class="param-chip"><span class="param-chip-label">尺寸</span>${ratioToSize(item.ratio)}</span>
                <span class="param-chip"><span class="param-chip-label">比例</span>${escapeHtml(item.ratio || '未记录')}</span>
                <span class="param-chip"><span class="param-chip-label">质量</span>${escapeHtml(item.quality || '未记录')}</span>
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

  // 当前提示词与父节点提示词均按真实内容高度展开，滚动只交给右侧详情面板。
  function syncDetailPromptHeight(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
  root.querySelectorAll('.detail-textarea').forEach(syncDetailPromptHeight);

  let closeFullscreenPreview = null;
  function openDetailImageFullscreen(imageSource, altText) {
    if (closeFullscreenPreview) return;
    let zoom = DETAIL_MIN_ZOOM;
    let panX = 0;
    let panY = 0;
    let pointer = null;
    const overlay = document.createElement('div');
    overlay.className = 'detail-fullscreen-overlay';
    overlay.setAttribute('data-detail-fullscreen', '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '全屏图片预览');

    const image = document.createElement('img');
    image.className = 'detail-fullscreen-image';
    image.src = imageSource;
    image.alt = altText || '生成结果';
    image.draggable = false;
    image.setAttribute('data-detail-fullscreen-image', '');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'detail-fullscreen-close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', '关闭全屏预览');
    overlay.append(image, closeButton);
    document.body.appendChild(overlay);

    const renderTransform = () => {
      image.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
    };
    const close = () => {
      if (!closeFullscreenPreview) return;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      closeFullscreenPreview = null;
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') close();
    };
    closeFullscreenPreview = close;
    renderTransform();

    overlay.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoom = Math.min(DETAIL_MAX_ZOOM, Math.max(DETAIL_MIN_ZOOM, Number((zoom + (event.deltaY < 0 ? DETAIL_ZOOM_STEP : -DETAIL_ZOOM_STEP)).toFixed(1))));
      renderTransform();
    });
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    closeButton.addEventListener('click', close);
    image.addEventListener('pointerdown', (event) => {
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: panX, startY: panY };
      image.setPointerCapture?.(event.pointerId);
    });
    image.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      panX = pointer.startX + event.clientX - pointer.x;
      panY = pointer.startY + event.clientY - pointer.y;
      renderTransform();
    });
    const stopDragging = (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      image.releasePointerCapture?.(event.pointerId);
      pointer = null;
    };
    image.addEventListener('pointerup', stopDragging);
    image.addEventListener('pointercancel', stopDragging);
    document.addEventListener('keydown', onKeydown);
    closeButton.focus();
  }

  const detailImage = root.querySelector('.detail-image');
  detailImage.addEventListener('click', () => openDetailImageFullscreen(item.image, item.prompt || '生成结果'));
  detailImage.title = '点击全屏预览；滚轮缩放，拖拽平移';

  root.querySelector('#back-detail').addEventListener('click', () => navigate(backTarget.path));

  root.querySelector('#btn-download').addEventListener('click', async () => {
    try {
      const result = await window.api.saveImage(item.image, `${filePrefix}-${item.id}.png`);
      if (result.ok) toast('图片已保存', 'success');
      else if (!result.canceled) toast('保存失败：' + (result.error || '未知错误'), 'error');
    } catch (error) {
      toast('保存失败：' + error.message, 'error');
    }
  });

  if (item.canDelete) {
    root.querySelector('#btn-delete').addEventListener('click', async () => {
      if (!await confirmDialog('确定删除这张图片吗？')) return;
      deleteHistory(item.id);
      toast('已删除', 'success');
      navigate(backTarget.path === '/generate' ? '/generate' : '/history');
    });
  }

  root.querySelector('#btn-regenerate').addEventListener('click', () => {
    const prompt = root.querySelector('#detail-prompt').value;
    saveLastSettings({
      prompt,
      providerId: item.providerId,
      modelId: item.modelId || undefined,
      ratio: item.ratio,
      quality: item.quality,
    });
    navigate('/generate');
  });

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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
