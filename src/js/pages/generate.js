// 生图页：豆包风格 Composer 布局 + 全局任务队列
import { icon, renderIcons } from '../icons.js';
import { mountPage, htmlToElement, toast, withButtonLoading } from '../ui.js';
import {
  getProviders,
  getDefaultProvider,
  getEnabledModels,
  getRandomPrompt,
  ratioToSize,
  saveLastSettings,
  getLastSettings,
  imageToDataUrl,
  optimizePrompt,
  getTextProvider,
  formatDateTime,
  getDefaults,
} from '../store.js';
import * as queue from '../queue.js';
import { navigate } from '../router.js';

const RATIOS = ['1:1', '4:3', '16:9', '9:16'];
const QUALITIES = ['标准', '高清', '超高清'];

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
  let sourceImagePath = '';

  const root = htmlToElement(`
    <div class="generate-panel">
      <div class="page-header">
        <h1 class="page-title">生图</h1>
        <p class="page-subtitle">输入提示词，选择供应商与模型，即可开始创作</p>
      </div>
      <div class="composer-card" id="composer">
        <div class="composer-textarea-wrap">
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
          <button class="composer-tool-btn" type="button" id="btn-optimize" title="优化提示词">${icon('wand', 15)}</button>
          <button class="composer-tool-btn" type="button" id="btn-random" title="随机提示词">${icon('shuffle', 15)}</button>
          <div class="composer-toolbar-spacer"></div>
          <button class="composer-generate-round" id="btn-generate" title="开始生成">
            ${icon('arrow-up', 20)}
          </button>
        </div>
      </div>
      <div id="result-area"></div>
    </div>
  `);
  mountPage(container, root);

  const promptInput = root.querySelector('#prompt-input');
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
  btnOptimize.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) { toast('请先输入提示词', 'error'); promptInput.focus(); return; }
    const tp = getTextProvider();
    if (!tp || !tp.endpoint || !tp.model) {
      toast('请先在「设置 → 模型供应商」中配置文本模型', 'error');
      return;
    }
    // 输入区域保留波浪反馈，按钮状态由统一包装器管理。
    const feedbackKey = 'prompt-optimize';
    await withButtonLoading(btnOptimize, '优化中…', async () => {
      toast('正在优化提示词…', 'info', { key: feedbackKey, duration: 0 });
      btnOptimize.classList.add('is-optimizing');
      promptInput.readOnly = true;
      promptInput.classList.add('is-optimizing');
      const composerCard = root.querySelector('.composer-card');
      const waveBar = document.createElement('div');
      waveBar.className = 'composer-wave-bar';
      if (composerCard) composerCard.appendChild(waveBar);
      try {
        const optimized = await optimizePrompt(prompt);
        promptInput.value = optimized;
        toast('提示词已优化', 'success', { key: feedbackKey });
      } catch (err) {
        toast('优化失败：' + err.message, 'error', { key: feedbackKey });
      } finally {
        btnOptimize.classList.remove('is-optimizing');
        promptInput.readOnly = false;
        promptInput.classList.remove('is-optimizing');
        waveBar.remove();
      }
    });
  });

  // ===== 随机提示词 =====
  btnRandom.addEventListener('click', () => {
    promptInput.value = getRandomPrompt();
    promptInput.focus();
  });

  // ===== 快捷键 =====
  promptInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      doGenerate();
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

    queue.enqueue({
      source: 'quick',
      prompt,
      providerId: currentProviderId,
      providerName: provider ? provider.name : '',
      modelId: currentModelId,
      ratio: currentRatio,
      quality: currentQuality,
      sourceImage: sourceImagePath || null,
      isImageToImage: !!sourceImagePath,
    });
    toast(sourceImagePath ? '已加入生成队列（图生图）' : '已加入生成队列', 'info');
  }

  btnGenerate.addEventListener('click', doGenerate);

  // 初始化
  updateModelChip();

  // ===== 订阅队列，渲染结果区 =====
  function renderTasks(tasks) {
    const quick = tasks.filter((t) => t.source === 'quick');
    if (quick.length === 0) {
      resultArea.innerHTML = `
        <div class="empty-state">
          ${icon('image', 40)}
          <span class="empty-state-text">生成的图片将显示在这里</span>
        </div>`;
      renderIcons(resultArea);
      return;
    }

    const active = quick.filter((t) => t.status === 'queued' || t.status === 'running');
    const finished = quick.filter((t) => t.status === 'done' || t.status === 'failed' || t.status === 'canceled')
      .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));

    const activeHtml = active.map(taskCardHtml).join('');
    const finishedHtml = finished.map(taskCardHtml).join('');

    const parts = [];
    if (activeHtml) {
      parts.push(`
        <div class="queue-section">
          <div class="queue-header">
            <span class="queue-title">${icon('loader', 14)}生成中</span>
            <span class="queue-count">${active.length} 个任务</span>
            ${active.some((t) => t.status === 'queued') ? `<button type="button" class="btn btn-ghost btn-sm" id="btn-cancel-all-queued">${icon('x', 14)}<span>取消未开始</span></button>` : ''}
          </div>
          <div class="queue-list">${activeHtml}</div>
        </div>`);
    }
    if (finishedHtml) {
      parts.push(`
        <div class="queue-section">
          <div class="queue-header">
            <span class="queue-title">最近完成</span>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-clear-finished">${icon('trash-2', 14)}<span>清空</span></button>
          </div>
          <div class="queue-list">${finishedHtml}</div>
        </div>`);
    }

    resultArea.innerHTML = parts.join('');
    renderIcons(resultArea);
    bindTaskActions();
  }

  function taskCardHtml(t) {
    if (t.status === 'queued') {
      return `
        <div class="task-card task-queued" data-task-id="${t.id}">
          <div class="task-card-status">${icon('clock', 16)}<span>排队中</span></div>
          <div class="task-card-body">
            <p class="task-card-prompt">${escapeHtml(t.prompt) || '<span class="task-card-empty">无提示词</span>'}</p>
            <div class="task-card-meta">
              ${t.providerName ? `<span>${icon('server', 12)}${escapeHtml(t.providerName)}</span>` : ''}
              <span>${icon('cpu', 12)}${escapeHtml(t.modelId)}</span>
              <span>${t.ratio}</span>
              <span>${escapeHtml(t.quality)}</span>
            </div>
          </div>
          <button type="button" class="icon-btn task-cancel" data-task-id="${t.id}" title="取消">${icon('x', 14)}</button>
        </div>`;
    }
    if (t.status === 'running') {
      return `
        <div class="task-card task-running" data-task-id="${t.id}">
          <div class="task-card-status">${icon('loader', 16)}<span>生成中…</span></div>
          <div class="task-card-body">
            <p class="task-card-prompt">${escapeHtml(t.prompt) || '<span class="task-card-empty">无提示词</span>'}</p>
            <div class="task-card-meta">
              ${t.providerName ? `<span>${icon('server', 12)}${escapeHtml(t.providerName)}</span>` : ''}
              <span>${icon('cpu', 12)}${escapeHtml(t.modelId)}</span>
              <span>${t.ratio}</span>
              <span>${escapeHtml(t.quality)}</span>
            </div>
          </div>
        </div>`;
    }
    if (t.status === 'failed') {
      return `
        <div class="task-card task-failed" data-task-id="${t.id}">
          <div class="task-card-status">${icon('alert-circle', 16)}<span>失败</span></div>
          <div class="task-card-body">
            <p class="task-card-prompt">${escapeHtml(t.prompt) || '<span class="task-card-empty">无提示词</span>'}</p>
            <p class="task-card-error">${escapeHtml(t.error || '未知错误')}</p>
          </div>
          <button type="button" class="icon-btn task-dismiss" data-task-id="${t.id}" title="移除">${icon('x', 14)}</button>
        </div>`;
    }
    if (t.status === 'canceled') {
      return `
        <div class="task-card task-canceled" data-task-id="${t.id}">
          <div class="task-card-status">${icon('x-circle', 16)}<span>已取消</span></div>
          <div class="task-card-body">
            <p class="task-card-prompt">${escapeHtml(t.prompt) || '<span class="task-card-empty">无提示词</span>'}</p>
          </div>
          <button type="button" class="icon-btn task-dismiss" data-task-id="${t.id}" title="移除">${icon('x', 14)}</button>
        </div>`;
    }
    const r = t.result;
    return `
      <div class="task-card task-done" data-task-id="${t.id}">
        <div class="task-card-image-wrap">
          <img src="${r.image}" alt="生成结果" loading="lazy" />
          <div class="task-card-image-actions">
            <button type="button" class="icon-btn" data-act="zoom" data-task-id="${t.id}" title="查看大图">${icon('maximize-2', 13)}</button>
            <button type="button" class="icon-btn" data-act="download" data-task-id="${t.id}" title="保存到本地">${icon('download', 13)}</button>
            <button type="button" class="icon-btn" data-act="detail" data-task-id="${t.id}" title="查看详情">${icon('external-link', 13)}</button>
            <button type="button" class="icon-btn task-dismiss" data-task-id="${t.id}" title="移除">${icon('x', 13)}</button>
          </div>
        </div>
        <div class="task-card-body">
          <p class="task-card-prompt">${escapeHtml(t.prompt) || '<span class="task-card-empty">无提示词</span>'}</p>
          <div class="task-card-meta">
            ${t.providerName ? `<span>${icon('server', 12)}${escapeHtml(t.providerName)}</span>` : ''}
            <span>${icon('cpu', 12)}${escapeHtml(t.modelId)}</span>
            <span>${t.ratio}</span>
            <span>${escapeHtml(t.quality)}</span>
            <span>${ratioToSize(t.ratio)}</span>
          </div>
        </div>
      </div>`;
  }

  function bindTaskActions() {
    resultArea.querySelectorAll('.task-cancel').forEach((btn) => {
      btn.addEventListener('click', () => {
        queue.cancel(btn.getAttribute('data-task-id'));
      });
    });
    resultArea.querySelectorAll('.task-dismiss').forEach((btn) => {
      btn.addEventListener('click', () => {
        queue.removeTask(btn.getAttribute('data-task-id'));
      });
    });
    const cancelAllBtn = resultArea.querySelector('#btn-cancel-all-queued');
    if (cancelAllBtn) {
      cancelAllBtn.addEventListener('click', () => {
        queue.cancelAll((t) => t.source === 'quick' && t.status === 'queued');
        toast('已取消未开始的任务', 'success');
      });
    }
    const clearBtn = resultArea.querySelector('#btn-clear-finished');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        queue.clearFinished(0);
      });
    }
    resultArea.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.getAttribute('data-act');
        const id = btn.getAttribute('data-task-id');
        const t = queue.getTasks().find((x) => x.id === id);
        if (!t || !t.result) return;
        if (act === 'zoom') {
          openLightbox(t);
        } else if (act === 'download') {
          await downloadImage(t.result.image, t.result.id);
        } else if (act === 'detail') {
          navigate(`/detail/${t.result.id}`);
        }
      });
    });
    resultArea.querySelectorAll('.task-done img').forEach((img) => {
      img.addEventListener('click', () => {
        const card = img.closest('.task-card');
        const id = card.getAttribute('data-task-id');
        const t = queue.getTasks().find((x) => x.id === id);
        if (t && t.result) openLightbox(t);
      });
    });
  }

  let closeLightbox = null;

  function openLightbox(t) {
    closeLightbox?.();
    const providerText = t.providerName || '未知供应商';
    const modelText = t.modelId || '未知模型';
    const overlay = htmlToElement(`
      <div class="lightbox-overlay" id="lightbox">
        <button type="button" class="lightbox-close" id="lightbox-close">${icon('x', 20)}</button>
        <div class="lightbox-content">
          <img src="${t.result.image}" alt="生成结果" class="lightbox-image" />
          <div class="lightbox-info">
            <div class="lightbox-info-row">
              <span class="lightbox-info-label">模型</span>
              <span class="lightbox-info-value">${escapeHtml(providerText)} / ${escapeHtml(modelText)}</span>
            </div>
            <div class="lightbox-info-row">
              <span class="lightbox-info-label">参数</span>
              <span class="lightbox-info-value">${t.ratio} · ${escapeHtml(t.quality)} · ${ratioToSize(t.ratio)} · ${formatDateTime(t.createdAt)}</span>
            </div>
            <div class="lightbox-info-row lightbox-prompt-row">
              <span class="lightbox-info-label">提示词</span>
              <span class="lightbox-info-value lightbox-prompt-text">${escapeHtml(t.prompt)}</span>
            </div>
          </div>
          <div class="lightbox-meta">
            <div style="flex:1"></div>
            <button type="button" class="btn btn-secondary btn-sm" id="lb-download">${icon('download', 14)}<span>保存</span></button>
            <button type="button" class="btn btn-ghost btn-sm" id="lb-copy">${icon('copy', 14)}<span>复制提示词</span></button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(overlay);
    renderIcons(overlay);
    const esc = (event) => {
      if (event.key === 'Escape') close();
    };
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', esc);
      if (closeLightbox === close) closeLightbox = null;
    };
    closeLightbox = close;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('#lightbox-close').addEventListener('click', close);
    document.addEventListener('keydown', esc);
    overlay.querySelector('#lb-download').addEventListener('click', () => downloadImage(t.result.image, t.result.id));
    overlay.querySelector('#lb-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(t.prompt); toast('提示词已复制', 'success'); } catch { toast('复制失败', 'error'); }
    });
  }

  const unsubscribe = queue.subscribe(renderTasks);
  renderTasks(queue.getTasks());

  return () => {
    closeDropdown();
    closeLightbox?.();
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