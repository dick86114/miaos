// 生图页：豆包风格 Composer 布局 + 全局任务队列
import { icon, renderIcons } from '../icons.js';
import { mountPage, htmlToElement, toast, createEventLoopGuard, createKeyedListRenderer } from '../ui.js';
import {
  getProviders,
  getEnabledModels,
  getRandomPrompt,
  saveLastSettings,
  getLastSettings,
  imageToDataUrl,
  optimizePrompt,
  getTextProvider,
  getDefaults,
  getHistory,
  formatRelativeTime,
} from '../store.js';
import * as queue from '../queue.js';
import { navigate } from '../router.js';
import { getPaginatedQuickHistory } from '../history-data.js';
import { openImagePreview } from '../image-preview.js';
import { createPromptOptimizationManager, createPromptFragmentOverlay } from '../prompt-optimization.js';

const promptOptimizationManager = createPromptOptimizationManager({
  optimize: (prompt) => optimizePrompt(prompt),
});

export function createPromptOptimizationPageBinding({
  manager,
  context,
  container,
  textarea,
  button,
  particleField,
  toast: toastFn = toast,
  createOverlay = createPromptFragmentOverlay,
}) {
  let overlay = null;
  let destroyed = false;
  const feedbackKey = `prompt-optimize:${context}`;

  function setOptimizingUi(optimizing) {
    textarea.readOnly = optimizing;
    button.disabled = optimizing;
    button.classList?.toggle?.('is-loading', optimizing);
    button.classList?.toggle?.('is-optimizing', optimizing);
    textarea.classList?.toggle?.('is-optimizing', optimizing);
    particleField.classList?.toggle?.('is-optimizing', optimizing);
    if (optimizing) button.setAttribute?.('aria-busy', 'true');
    else button.removeAttribute?.('aria-busy');
  }

  function ensureOverlay(prompt) {
    if (overlay) return overlay;
    overlay = createOverlay({
      container,
      textarea,
      prompt,
      maxFragments: 36,
    });
    overlay.mount();
    return overlay;
  }

  function settleOverlay(prompt) {
    const settledOverlay = ensureOverlay(prompt);
    overlay = null;
    settledOverlay.settle();
  }

  function applyState(state) {
    if (destroyed) return;

    if (state.status === 'optimizing') {
      setOptimizingUi(true);
      ensureOverlay(state.prompt);
      toastFn('正在优化提示词…', 'info', { key: feedbackKey, duration: 0 });
      return;
    }

    setOptimizingUi(false);
    if (state.status === 'idle') return;

    settleOverlay(state.prompt);
    if (state.status === 'succeeded') {
      textarea.value = String(state.result ?? '');
      toastFn('提示词已优化', 'success', { key: feedbackKey });
    } else if (state.status === 'failed') {
      const message = state.error?.message || '未知错误';
      toastFn(`优化失败：${message}`, 'error', { key: feedbackKey });
    }
    manager.clear(context);
  }

  const unsubscribe = manager.subscribe(context, applyState);
  applyState(manager.getState(context));

  return {
    start(prompt) {
      const started = manager.start(context, prompt);
      started.promise?.catch(() => {});
      return started;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      overlay?.destroy();
      overlay = null;
    },
  };
}

const RATIOS = ['1:1', '4:3', '16:9', '9:16'];
const QUALITIES = ['标准', '高清', '超高清'];
const QUANTITIES = [1, 2, 3, 4];

export function renderGenerate(container) {
  const providers = getProviders();
  const defaults = getDefaults();
  const last = getLastSettings();

  const initialPrompt = (last && last.prompt) || '';
  const initialProviderId = (last && last.providerId) || defaults.defaultImageProvider || (providers[0] && providers[0].id) || '';
  const initialModelId = (last && last.modelId) || defaults.defaultImageModel || '';
  const initialRatio = (last && last.ratio) || '1:1';
  const initialQuality = (last && last.quality) || '高清';

  let currentProviderId = initialProviderId;
  let currentModelId = initialModelId;
  let currentRatio = initialRatio;
  let currentQuality = initialQuality;
  let currentQuantity = 1;
  let sourceImagePath = '';

  const root = htmlToElement(`
    <div class="generate-panel">
      <div class="page-header">
        <h1 class="page-title">生图</h1>
        <p class="page-subtitle">输入提示词，选择供应商与模型，即可开始创作</p>
      </div>
      <div class="composer-card" id="composer">
        <div class="composer-textarea-wrap">
          <div class="composer-particle-field" aria-hidden="true">
            <span class="composer-particle particle-one"></span>
            <span class="composer-particle particle-two"></span>
            <span class="composer-particle particle-three"></span>
            <span class="composer-particle particle-four"></span>
          </div>
          <div class="composer-source-preview" id="source-preview" style="display:none;">
            <div class="composer-source-preview-img-wrap">
              <img id="source-thumb" alt="参考图" />
            </div>
            <div class="composer-source-preview-info">
              <span class="composer-source-preview-label">${icon('git-branch', 14)} 参考图</span>
              <span class="composer-source-preview-hint">图生图模式，基于此图迭代生成</span>
            </div>
            <button class="icon-btn" type="button" id="btn-remove-source" title="移除参考图">${icon('x', 14)}</button>
          </div>
          <textarea class="composer-textarea" id="prompt-input" placeholder="描述你想生成的画面，例如：清晨的湖边，薄雾缭绕，极简风格…">${escapeHtml(initialPrompt)}</textarea>
        </div>
        <div class="composer-toolbar" id="composer-toolbar">
          <button class="composer-tool-btn" type="button" id="btn-upload-image" title="上传图片（图生图）">${icon('plus', 16)}</button>
          <button class="composer-tool-btn" type="button" id="btn-upload-file" title="上传文件（长文本提示词）">${icon('file-text', 16)}</button>
          <div class="composer-chip" id="model-chip">
            <span class="chip-icon">${icon('cpu', 13)}</span>
            <span class="chip-value" id="model-chip-value">选择模型</span>
            <span class="chip-caret">${icon('chevron-down', 13)}</span>
          </div>
          <div class="composer-chip" id="ratio-chip">
            <span class="chip-icon">${icon('aperture', 13)}</span>
            <span class="chip-value" id="ratio-chip-value">${currentRatio}</span>
            <span class="chip-caret">${icon('chevron-down', 13)}</span>
          </div>
          <div class="composer-chip" id="quality-chip">
            <span class="chip-icon">${icon('sparkles', 13)}</span>
            <span class="chip-value" id="quality-chip-value">${currentQuality}</span>
            <span class="chip-caret">${icon('chevron-down', 13)}</span>
          </div>
          <div class="composer-chip" id="quantity-chip">
            <span class="chip-value" id="quantity-chip-value">${currentQuantity} 张</span>
            <span class="chip-caret">${icon('chevron-down', 13)}</span>
          </div>
          <button class="composer-tool-btn" type="button" id="btn-optimize" title="优化提示词">${icon('wand', 15)}</button>
          <button class="composer-tool-btn" type="button" id="btn-random" title="随机提示词">${icon('shuffle', 15)}</button>
          <div class="composer-toolbar-spacer"></div>
          <button class="composer-generate-round" id="btn-generate" title="开始生成">
            ${icon('arrow-down', 20)}
          </button>
        </div>
      </div>
      <div id="result-area"></div>
    </div>
  `);
  mountPage(container, root);

  const promptInput = root.querySelector('#prompt-input');
  const particleField = root.querySelector('.composer-particle-field');
  const btnGenerate = root.querySelector('#btn-generate');
  const btnRandom = root.querySelector('#btn-random');
  const resultArea = root.querySelector('#result-area');
  const sourcePreview = root.querySelector('#source-preview');
  const sourceThumb = root.querySelector('#source-thumb');
  const composerCard = root.querySelector('#composer');

  // ===== 模型下拉 =====
  const modelChip = root.querySelector('#model-chip');
  const modelChipValue = root.querySelector('#model-chip-value');

  function getEnabledModelsForProvider(pid) {
    return pid ? getEnabledModels(pid) : [];
  }

  function getDefaultModelId() {
    const models = getEnabledModelsForProvider(currentProviderId);
    if (currentModelId && models.find((m) => m.id === currentModelId)) return currentModelId;
    const lastModelId = last && last.providerId === currentProviderId ? last.modelId : null;
    const found = models.find((m) => m.id === lastModelId);
    if (found) return found.id;
    return models[0] ? models[0].id : '';
  }

  function updateModelChip() {
    const models = getEnabledModelsForProvider(currentProviderId);
    const defModelId = getDefaultModelId();
    currentModelId = defModelId;
    if (!defModelId) {
      modelChipValue.textContent = '选择模型';
    } else {
      const m = models.find((x) => x.id === defModelId);
      modelChipValue.textContent = m ? m.name : '选择模型';
    }
  }

  function buildModelDropdownHtml() {
    const pList = providers.filter((p) => p.imageModels.some((m) => m.enabled));
    let html = '';
    for (const p of pList) {
      const models = p.imageModels.filter((m) => m.enabled);
      html += `<div style="font-size:11px;color:var(--ink-3);padding:4px 10px 2px;">${escapeHtml(p.name)}</div>`;
      for (const m of models) {
        const active = m.id === currentModelId && p.id === currentProviderId;
        html += `<div class="composer-dropdown-item ${active ? 'is-active' : ''}" data-provider="${p.id}" data-model="${m.id}">
          <span class="item-left">${escapeHtml(m.name)}</span>
          <span class="item-right">${active ? icon('check', 14) : ''}</span>
        </div>`;
      }
    }
    if (!html) {
      html = `<div style="padding:12px 10px;color:var(--ink-3);font-size:12px;text-align:center;">
        暂无可用生图模型<br/><a href="#/settings" style="color:var(--brand);text-decoration:none;">前往设置 → 模型供应商配置</a>
      </div>`;
    }
    return html;
  }

  // ===== 比例下拉 =====
  const ratioChip = root.querySelector('#ratio-chip');
  const ratioChipValue = root.querySelector('#ratio-chip-value');

  function buildRatioDropdownHtml() {
    return RATIOS.map((r) => {
      const active = r === currentRatio;
      return `<div class="composer-dropdown-item ${active ? 'is-active' : ''}" data-ratio="${r}">
        <span class="item-left">${r}</span>
        <span class="item-right">${active ? icon('check', 14) : ''}</span>
      </div>`;
    }).join('');
  }

  // ===== 质量下拉 =====
  const qualityChip = root.querySelector('#quality-chip');
  const qualityChipValue = root.querySelector('#quality-chip-value');

  function buildQualityDropdownHtml() {
    return QUALITIES.map((q) => {
      const active = q === currentQuality;
      return `<div class="composer-dropdown-item ${active ? 'is-active' : ''}" data-quality="${q}">
        <span class="item-left">${q}</span>
        <span class="item-right">${active ? icon('check', 14) : ''}</span>
      </div>`;
    }).join('');
  }

  const quantityChip = root.querySelector('#quantity-chip');
  const quantityChipValue = root.querySelector('#quantity-chip-value');

  function buildQuantityDropdownHtml() {
    return QUANTITIES.map((quantity) => {
      const active = quantity === currentQuantity;
      return `<div class="composer-dropdown-item ${active ? 'is-active' : ''}" data-quantity="${quantity}">
        <span class="item-left">${quantity} 张</span>
        <span class="item-right">${active ? icon('check', 14) : ''}</span>
      </div>`;
    }).join('');
  }

  // ===== 通用下拉控制 =====
  let openDropdown = null;
  let dropdownCloseTimer = null;
  let dropdownCloseListener = null;

  function closeDropdown() {
    if (dropdownCloseTimer !== null) {
      clearTimeout(dropdownCloseTimer);
      dropdownCloseTimer = null;
    }
    if (dropdownCloseListener) {
      document.removeEventListener('click', dropdownCloseListener);
      dropdownCloseListener = null;
    }
    if (openDropdown) {
      openDropdown.remove();
      openDropdown = null;
    }
    root.querySelectorAll('.composer-chip.is-open').forEach((c) => c.classList.remove('is-open'));
  }

  function openChipDropdown(chip, html) {
    closeDropdown();
    const dd = htmlToElement(`<div class="composer-dropdown">${html}</div>`);
    chip.appendChild(dd);
    chip.classList.add('is-open');
    renderIcons(dd);
    openDropdown = dd;

    // 延迟注册，避免当前点击立即关闭下拉框。
    dropdownCloseTimer = setTimeout(() => {
      dropdownCloseTimer = null;
      dropdownCloseListener = (event) => {
        if (!chip.contains(event.target)) closeDropdown();
      };
      document.addEventListener('click', dropdownCloseListener);
    }, 0);
  }

  // ===== Chip 点击事件 =====
  modelChip.addEventListener('click', (e) => {
    if (e.target.closest('.composer-dropdown-item')) return;
    e.stopPropagation();
    if (openDropdown && openDropdown.parentElement === modelChip) {
      closeDropdown();
    } else {
      openChipDropdown(modelChip, buildModelDropdownHtml());
    }
  });

  ratioChip.addEventListener('click', (e) => {
    if (e.target.closest('.composer-dropdown-item')) return;
    e.stopPropagation();
    if (openDropdown && openDropdown.parentElement === ratioChip) {
      closeDropdown();
    } else {
      openChipDropdown(ratioChip, buildRatioDropdownHtml());
    }
  });

  qualityChip.addEventListener('click', (e) => {
    if (e.target.closest('.composer-dropdown-item')) return;
    e.stopPropagation();
    if (openDropdown && openDropdown.parentElement === qualityChip) {
      closeDropdown();
    } else {
      openChipDropdown(qualityChip, buildQualityDropdownHtml());
    }
  });

  quantityChip.addEventListener('click', (e) => {
    if (e.target.closest('.composer-dropdown-item')) return;
    e.stopPropagation();
    if (openDropdown && openDropdown.parentElement === quantityChip) {
      closeDropdown();
    } else {
      openChipDropdown(quantityChip, buildQuantityDropdownHtml());
    }
  });

  // 下拉项点击处理
  root.addEventListener('click', (e) => {
    const item = e.target.closest('.composer-dropdown-item');
    if (!item) return;

    if (item.hasAttribute('data-model')) {
      currentProviderId = item.getAttribute('data-provider');
      currentModelId = item.getAttribute('data-model');
      updateModelChip();
    } else if (item.hasAttribute('data-ratio')) {
      currentRatio = item.getAttribute('data-ratio');
      ratioChipValue.textContent = currentRatio;
    } else if (item.hasAttribute('data-quality')) {
      currentQuality = item.getAttribute('data-quality');
      qualityChipValue.textContent = currentQuality;
    } else if (item.hasAttribute('data-quantity')) {
      currentQuantity = Number(item.getAttribute('data-quantity'));
      quantityChipValue.textContent = `${currentQuantity} 张`;
    }
    closeDropdown();
  });

  // ===== 上传图片 =====
  const btnUploadImage = root.querySelector('#btn-upload-image');
  btnUploadImage.addEventListener('click', async () => {
    if (!window.api || !window.api.pickImageFile) { toast('运行环境异常', 'error'); return; }
    try {
      const res = await window.api.pickImageFile();
      if (res.canceled) return;
      sourceImagePath = res.filePath;
      sourceThumb.src = 'file://' + encodeURI(res.filePath);
      sourcePreview.style.display = 'flex';
      toast('参考图已添加，将使用图生图模式', 'success');
    } catch (e) {
      toast('选择图片失败：' + e.message, 'error');
    }
  });

  root.querySelector('#btn-remove-source').addEventListener('click', () => {
    sourceImagePath = '';
    sourcePreview.style.display = 'none';
    sourceThumb.src = '';
  });

  // ===== 上传文件 =====
  const btnUploadFile = root.querySelector('#btn-upload-file');
  btnUploadFile.addEventListener('click', async () => {
    if (!window.api || !window.api.pickTextFile) { toast('运行环境异常', 'error'); return; }
    try {
      const res = await window.api.pickTextFile();
      if (res.canceled) return;
      promptInput.value = res.content;
      promptInput.focus();
      toast(`已导入文件「${res.fileName}」`, 'success');
    } catch (e) {
      toast('读取文件失败：' + e.message, 'error');
    }
  });

  // ===== 粘贴图片（从剪贴板） =====
  composerCard.addEventListener('paste', async (e) => {
    if (!window.api || !window.api.savePastedImage) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgItem = Array.from(items).find((i) => i.type.startsWith('image/'));
    if (!imgItem) return;
    e.preventDefault();
    const file = imgItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await window.api.savePastedImage(reader.result);
        if (res.ok) {
          sourceImagePath = res.filePath;
          sourceThumb.src = 'file://' + encodeURI(res.filePath);
          sourcePreview.style.display = 'flex';
          toast('参考图已粘贴，将使用图生图模式', 'success');
        } else {
          toast('粘贴失败：' + res.error, 'error');
        }
      } catch (err) {
        toast('粘贴图片失败', 'error');
      }
    };
    reader.readAsDataURL(file);
  });

  // ===== 优化提示词 =====
  const btnOptimize = root.querySelector('#btn-optimize');
  const promptOptimizationBinding = createPromptOptimizationPageBinding({
    manager: promptOptimizationManager,
    context: 'quick',
    container: root.querySelector('.composer-textarea-wrap'),
    textarea: promptInput,
    button: btnOptimize,
    particleField,
  });
  btnOptimize.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) { toast('请先输入提示词', 'error'); promptInput.focus(); return; }
    const tp = getTextProvider();
    if (!tp || !tp.endpoint || !tp.model) {
      toast('请先在「设置 → 模型供应商」中配置文本模型', 'error');
      return;
    }
    promptOptimizationBinding.start(prompt);
  });

  // ===== 随机提示词 =====
  btnRandom.addEventListener('click', () => {
    promptInput.value = getRandomPrompt();
    promptInput.focus();
  });

  const runGenerateOnce = createEventLoopGuard(() => {
    toast('已加入生成队列', 'info', { key: 'quick-generate-enqueue' });
  });

  // ===== 快捷键 =====
  promptInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runGenerateOnce(doGenerate);
    }
  });

  // ===== 生成 =====
  function doGenerate() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      toast('请输入提示词', 'error');
      promptInput.focus();
      return;
    }
    if (!currentProviderId) {
      toast('请先在「设置 → 模型供应商」中配置供应商', 'error');
      return;
    }
    if (!currentModelId) {
      toast('请选择模型', 'error');
      return;
    }

    saveLastSettings({
      prompt,
      providerId: currentProviderId,
      modelId: currentModelId,
      ratio: currentRatio,
      quality: currentQuality,
    });
    const provider = providers.find((p) => p.id === currentProviderId);

    queue.enqueueBatch({
      source: 'quick',
      prompt,
      providerId: currentProviderId,
      providerName: provider ? provider.name : '',
      modelId: currentModelId,
      ratio: currentRatio,
      quality: currentQuality,
      sourceImage: sourceImagePath || null,
      isImageToImage: !!sourceImagePath,
    }, currentQuantity);
    const batchLabel = currentQuantity > 1 ? `（${currentQuantity} 张）` : '';
    toast(sourceImagePath ? `已加入生成队列（图生图）${batchLabel}` : `已加入生成队列${batchLabel}`, 'info', { key: 'quick-generate-enqueue' });
  }

  btnGenerate.addEventListener('click', () => runGenerateOnce(doGenerate));

  // 初始化
  updateModelChip();

  // ===== 活跃队列与持久化快速历史 =====
  // 队列只承载尚未结束的任务；成功结果由 store.generateImage 持久化后进入快速历史。
  const queueView = htmlToElement(`
    <div class="queue-result-view">
      <section class="queue-section" data-queue-active hidden>
        <div class="queue-header">
          <span class="queue-title">${icon('loader', 14)}生成中</span>
          <span class="queue-count" data-queue-active-count>0 个任务</span>
          <button type="button" class="btn btn-ghost btn-sm" data-queue-cancel-all hidden>${icon('x', 14)}<span>取消未开始</span></button>
        </div>
        <div class="queue-list" data-queue-active-list></div>
      </section>
      <section class="quick-history-section" aria-labelledby="quick-history-title">
        <div class="gallery-header">
          <span class="gallery-title" id="quick-history-title">快速历史</span>
          <span class="gallery-count" data-quick-history-count>0 条记录</span>
        </div>
        <div class="gallery-grid" data-quick-history-grid></div>
        <div class="gallery-empty" data-quick-history-empty hidden>
          ${icon('image', 40)}
          <span>还没有快速生图记录，输入提示词开始创作吧</span>
        </div>
        <div class="quick-history-pagination" data-quick-history-pagination hidden>
          <button type="button" class="btn btn-ghost btn-sm" data-quick-history-page="previous">${icon('chevron-left', 14)}<span>上一页</span></button>
          <span class="quick-history-page-label" data-quick-history-page-label></span>
          <button type="button" class="btn btn-ghost btn-sm" data-quick-history-page="next"><span>下一页</span>${icon('chevron-right', 14)}</button>
        </div>
      </section>
    </div>
  `);
  resultArea.replaceChildren(queueView);
  renderIcons(queueView);

  const activeSection = queueView.querySelector('[data-queue-active]');
  const activeCount = queueView.querySelector('[data-queue-active-count]');
  const cancelAllQueued = queueView.querySelector('[data-queue-cancel-all]');
  const quickHistoryGrid = queueView.querySelector('[data-quick-history-grid]');
  const quickHistoryEmpty = queueView.querySelector('[data-quick-history-empty]');
  const quickHistoryCount = queueView.querySelector('[data-quick-history-count]');
  const quickHistoryPagination = queueView.querySelector('[data-quick-history-pagination]');
  const quickHistoryPageLabel = queueView.querySelector('[data-quick-history-page-label]');
  const previousHistoryPage = queueView.querySelector('[data-quick-history-page="previous"]');
  const nextHistoryPage = queueView.querySelector('[data-quick-history-page="next"]');
  const activeTaskRenderer = createKeyedListRenderer(queueView.querySelector('[data-queue-active-list]'), {
    getKey: (task) => task.id,
    getSignature: (task) => JSON.stringify(task),
    createNode: (task) => htmlToElement(activeTaskCardHtml(task)),
    updateNode: (node, task) => updateActiveTaskCard(node, task),
    afterNode: (node) => renderIcons(node),
  });
  const quickHistoryRenderer = createKeyedListRenderer(quickHistoryGrid, {
    getKey: (item) => item.key,
    getSignature: (item) => JSON.stringify(item),
    createNode: (item) => htmlToElement(quickHistoryCardHtml(item)),
    updateNode: (node, item) => updateQuickHistoryCard(node, item),
    afterNode: (node) => renderIcons(node),
  });

  let quickHistoryPage = 1;
  let previousCompletedQuickTaskIds = new Set();
  let closeImagePreview = null;

  function updateActiveTaskCard(node, task) {
    const next = htmlToElement(activeTaskCardHtml(task));
    node.className = next.className;
    node.setAttribute('data-task-id', task.id);
    node.replaceChildren(...Array.from(next.childNodes));
  }

  function activeTaskCardHtml(task) {
    const isRunning = task.status === 'running';
    const isFailed = task.status === 'failed';
    const batchLabel = task.batchTotal > 1 ? `第 ${task.batchIndex || 1}/${task.batchTotal} 张` : '';
    const paramsText = [task.ratio, task.quality, batchLabel].filter(Boolean).join(' · ');
    if (isFailed) {
      const errorText = task.error && String(task.error).trim() ? String(task.error).trim() : '未知错误';
      const shortError = errorText.length > 36 ? `${errorText.slice(0, 36)}…` : errorText;
      return `
        <article class="gallery-item gallery-placeholder task-failed" data-task-id="${task.id}">
          <div class="placeholder-cover task-error-cover">
            ${icon('alert-circle', 24)}
            <span class="task-error-title">生成失败</span>
            <span class="task-error-detail" title="${escapeHtml(errorText)}">${escapeHtml(shortError)}</span>
          </div>
          <div class="gallery-item-meta">
            <span class="gallery-item-time">${escapeHtml(paramsText)}</span>
            <button type="button" class="btn btn-ghost btn-sm task-failure-detail" data-task-id="${task.id}" title="查看失败详情">${icon('alert-circle', 13)}<span>查看失败详情</span></button>
            <button type="button" class="icon-btn task-dismiss" data-task-id="${task.id}" title="移除">${icon('x', 13)}</button>
          </div>
        </article>`;
    }
    return `
      <article class="gallery-item gallery-placeholder ${isRunning ? 'task-running' : 'task-queued'}" data-task-id="${task.id}">
        <div class="placeholder-cover">${icon(isRunning ? 'loader' : 'clock', 28)}<span>${isRunning ? '生成中…' : '排队中'}</span></div>
        <div class="gallery-item-meta">
          <span class="gallery-item-time">${escapeHtml(paramsText)}</span>
          ${isRunning ? '' : `<button type="button" class="icon-btn task-cancel" data-task-id="${task.id}" title="取消任务">${icon('x', 13)}</button>`}
        </div>
      </article>`;
  }

  function quickHistoryCardHtml(item) {
    const model = item.model || item.modelId || '';
    const modelText = [item.providerName, model].filter(Boolean).join(' / ') || '未记录模型';
    const paramsText = [item.ratio, item.quality].filter(Boolean).join(' · ') || '未记录参数';
    return `
      <article class="gallery-item quick-history-card" data-history-id="${escapeHtml(item.historyId)}">
        <div class="gallery-item-img-wrap">
          <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.prompt || '生成结果')}" loading="lazy" />
          <div class="gallery-item-hover-actions">
            <button type="button" class="icon-btn" data-history-act="preview" data-history-id="${escapeHtml(item.historyId)}" title="查看大图">${icon('maximize-2', 14)}</button>
            <button type="button" class="icon-btn" data-history-act="download" data-history-id="${escapeHtml(item.historyId)}" title="保存到本地">${icon('download', 14)}</button>
            <button type="button" class="icon-btn" data-history-act="detail" data-history-id="${escapeHtml(item.historyId)}" title="查看详情">${icon('external-link', 14)}</button>
          </div>
        </div>
        <div class="gallery-item-meta">
          <span class="gallery-item-meta-model" title="${escapeHtml(modelText)}">${escapeHtml(modelText)}</span>
          <span class="gallery-item-meta-params">${escapeHtml(paramsText)}</span>
          <span class="gallery-item-meta-time">${formatRelativeTime(item.createdAt)}</span>
        </div>
      </article>`;
  }

  function updateQuickHistoryCard(node, item) {
    const next = htmlToElement(quickHistoryCardHtml(item));
    node.className = next.className;
    node.setAttribute('data-history-id', item.historyId);
    node.replaceChildren(...Array.from(next.childNodes));
  }

  function renderQuickHistory() {
    const pageData = getPaginatedQuickHistory(getHistory(), { page: quickHistoryPage });
    quickHistoryPage = pageData.page;
    quickHistoryRenderer.render(pageData.items);
    quickHistoryGrid.hidden = pageData.items.length === 0;
    quickHistoryEmpty.hidden = pageData.items.length > 0;
    quickHistoryCount.textContent = `${pageData.total} 条记录`;
    quickHistoryPagination.hidden = pageData.totalPages <= 1;
    quickHistoryPageLabel.textContent = `第 ${pageData.page} / ${pageData.totalPages} 页`;
    previousHistoryPage.disabled = pageData.page <= 1;
    nextHistoryPage.disabled = pageData.page >= pageData.totalPages;
  }

  function getQuickHistoryRecord(historyId) {
    return getHistory().find((item) => item.id === historyId) || null;
  }

  function openQuickHistoryPreview(record) {
    closeImagePreview?.();
    closeImagePreview = openImagePreview({
      ...record,
      modelId: record.model || record.modelId || '',
    }, {
      onClose: () => { closeImagePreview = null; },
      onDownload: (item) => downloadImage(item.image, item.id),
      onCopyPrompt: async (promptText) => {
        try {
          await navigator.clipboard.writeText(promptText);
          toast('提示词已复制', 'success');
        } catch {
          toast('复制失败', 'error');
        }
      },
    });
  }

  function openQuickTaskFailurePreview(task) {
    closeImagePreview?.();
    closeImagePreview = openImagePreview({
      ...task,
      contextLabel: '快速生图任务',
    }, {
      onClose: () => { closeImagePreview = null; },
      onCopyPrompt: async (promptText) => {
        try {
          await navigator.clipboard.writeText(promptText);
          toast('提示词已复制', 'success');
        } catch {
          toast('复制失败', 'error');
        }
      },
    });
  }

  function renderTasks(tasks) {
    const quick = tasks.filter((task) => task.source === 'quick');
    const active = quick.filter((task) => task.status === 'queued' || task.status === 'running' || task.status === 'failed');
    const completedQuickTaskIds = new Set(quick.filter((task) => task.status === 'done').map((task) => task.id));
    const hasNewQuickCompletion = [...completedQuickTaskIds].some((taskId) => !previousCompletedQuickTaskIds.has(taskId));

    activeTaskRenderer.render(active);
    activeSection.hidden = active.length === 0;
    activeCount.textContent = `${active.length} 个任务`;
    cancelAllQueued.hidden = !active.some((task) => task.status === 'queued');

    if (hasNewQuickCompletion) quickHistoryPage = 1;
    if (hasNewQuickCompletion || completedQuickTaskIds.size !== previousCompletedQuickTaskIds.size) renderQuickHistory();
    previousCompletedQuickTaskIds = completedQuickTaskIds;
  }

  // 操作统一委托到结果区，历史卡片局部更新或分页时无需重复绑定监听器。
  resultArea.addEventListener('click', async (event) => {
    const target = event.target;
    const failureDetailButton = target.closest?.('.task-failure-detail');
    if (failureDetailButton) {
      const taskId = failureDetailButton.getAttribute('data-task-id');
      const task = queue.getTasks().find((item) => item.id === taskId && item.source === 'quick' && item.status === 'failed');
      if (task) openQuickTaskFailurePreview(task);
      return;
    }
    const dismissButton = target.closest?.('.task-dismiss');
    if (dismissButton) {
      queue.removeTask(dismissButton.getAttribute('data-task-id'));
      return;
    }
    const cancelButton = target.closest?.('.task-cancel');
    if (cancelButton) {
      queue.cancel(cancelButton.getAttribute('data-task-id'));
      return;
    }
    if (target.closest?.('[data-queue-cancel-all]')) {
      queue.cancelAll((task) => task.source === 'quick' && task.status === 'queued');
      toast('已取消未开始的任务', 'success');
      return;
    }
    const pageButton = target.closest?.('[data-quick-history-page]');
    if (pageButton) {
      const direction = pageButton.getAttribute('data-quick-history-page');
      quickHistoryPage += direction === 'next' ? 1 : -1;
      renderQuickHistory();
      return;
    }
    const actionButton = target.closest?.('[data-history-act]');
    if (actionButton) {
      const record = getQuickHistoryRecord(actionButton.getAttribute('data-history-id'));
      if (!record) return;
      const action = actionButton.getAttribute('data-history-act');
      if (action === 'preview') openQuickHistoryPreview(record);
      else if (action === 'download') await downloadImage(record.image, record.id);
      else if (action === 'detail') navigate(`/detail/${record.id}`);
      return;
    }
    const image = target.closest?.('.quick-history-card img');
    if (!image) return;
    const historyId = image.closest('.quick-history-card')?.getAttribute('data-history-id');
    const record = historyId ? getQuickHistoryRecord(historyId) : null;
    if (record) openQuickHistoryPreview(record);
  });

  const unsubscribe = queue.subscribe(renderTasks);
  renderQuickHistory();
  renderTasks(queue.getTasks());

  return () => {
    closeDropdown();
    closeImagePreview?.();
    promptOptimizationBinding.destroy();
    unsubscribe();
  };
}

async function downloadImage(src, id) {
  try {
    const dataUrl = await imageToDataUrl(src);
    const res = await window.api.saveImage(dataUrl, `miaos-${id}.png`);
    if (res.ok) toast('图片已保存', 'success');
    else if (!res.canceled) toast('保存失败：' + (res.error || '未知错误'), 'error');
  } catch (e) {
    toast('保存失败：' + e.message, 'error');
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}