// 项目工作台：横向时间轴（主线节点+分支卡片） + 详情面板
import { icon, renderIcons } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog } from '../ui.js';
import {
  getProject,
  updateProject,
  deleteProject,
  setCurrentVersion,
  createRootVersion,
  createVersion,
  deleteVersion,
  generateSmart,
  deleteImage,
  setProjectCover,
  getVersionLabels,
  getProviders,
  getEnabledModels,
  formatRelativeTime,
  formatDateTime,
  ratioToSize,
  imageToDataUrl,
  updateVersionFields,
  getImageBranchCount,
  optimizePrompt,
  getTextProvider,
} from '../store.js';
import { navigate } from '../router.js';
import * as queue from '../queue.js';

const RATIOS = ['1:1', '4:3', '16:9', '9:16'];
const QUALITIES = ['标准', '高清', '超高清'];

export function renderProject(container, params) {
  const projectId = params[0];
  const project = getProject(projectId);

  if (!project) {
    const notFound = htmlToElement(`
      <div class="detail-not-found">
        ${icon('folder', 40)}
        <span>未找到该项目，可能已被删除</span>
        <button class="btn btn-primary" id="back-projects">${icon('arrow-left', 16)}<span>返回项目列表</span></button>
      </div>
    `);
    mountPage(container, notFound);
    notFound.querySelector('#back-projects').addEventListener('click', () => navigate('/projects'));
    return;
  }

  renderWorkbench(container, project);

  // 根据版本获取其父图（供 buildTimelineHtml 和 renderWorkbench 共用）
  function getParentImage(ver, proj) {
    if (!ver || !ver.parentId || !ver.parentImageId) return null;
    const p = proj.versions.find((x) => x.id === ver.parentId);
    return p ? p.images.find((i) => i.id === ver.parentImageId) : null;
  }

  // 递归渲染树节点（主节点和子节点使用相同的视觉结构，子节点横向平行排列在父节点下方）
  function buildTimelineHtml(project, curVerId) {
    const roots = project.versions.filter((v) => v.parentId === null).sort((a, b) => a.createdAt - b.createdAt);

    // 渲染单个节点的标记+标签（主节点与子节点复用相同视觉结构）
    function renderNodeMarkup(ver) {
      const latestImg = ver.images[0];
      const latestTime = latestImg ? formatRelativeTime(latestImg.createdAt) : (ver.createdAt ? formatRelativeTime(ver.createdAt) : '未生成');
      const promptPreview = ver.prompt.trim() ? escapeHtml(ver.prompt.trim().slice(0, 30) + (ver.prompt.trim().length > 30 ? '…' : '')) : '未填写提示词';

      return `
        <div class="pwb-timeline-node" data-version-id="${ver.id}">
          <div class="pwb-marker-wrap">
            <div class="pwb-marker" title="切换到该版本">${latestImg
              ? `<img src="${latestImg.image}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`
              : icon('minus', 18)}</div>
            <button type="button" class="pwb-timeline-delete icon-btn" data-root-delete="${ver.id}" title="删除该版本及其所有下游节点">${icon('trash-2', 12)}</button>
          </div>
          <div class="pwb-labels">
            <span class="pwb-label-title" data-root-name="${ver.id}">${escapeHtml(ver.name)}</span>
            <span class="pwb-label-meta" title="${escapeHtml(ver.prompt)}">${promptPreview}</span>
            <span class="pwb-label-count-time">
              <span class="pwb-label-count">${ver.images.length} 张</span>
              <span class="pwb-label-time">· ${latestTime}</span>
            </span>
          </div>
        </div>`;
    }

    // 递归渲染节点树：节点自身 + 子节点横向排列
    function renderNodeTree(ver, depth) {
      const children = project.versions.filter((v) => v.parentId === ver.id).sort((a, b) => a.createdAt - b.createdAt);
      const isActive = ver.id === curVerId;
      const nodeHtml = renderNodeMarkup(ver);

      if (children.length === 0) {
        return `<div class="pwb-tree-node-col ${isActive ? 'is-active' : ''}" data-version-id="${ver.id}" data-depth="${depth}">
          ${nodeHtml}
        </div>`;
      }

      const childrenHtml = children.map((c) => renderNodeTree(c, depth + 1)).join('');

      return `<div class="pwb-tree-node-col ${isActive ? 'is-active' : ''}" data-version-id="${ver.id}" data-depth="${depth}">
        ${nodeHtml}
        <div class="pwb-tree-children">
          ${childrenHtml}
        </div>
      </div>`;
    }

    return `<div class="pwb-tree-root">${roots.map((r) => renderNodeTree(r, 0)).join('')}</div>`;
  }

  function renderWorkbench(container, project) {
    const curVer = project.versions.find((v) => v.id === project.currentVersionId) || project.versions[0];
    const isChild = !!curVer.parentId;
    const providers = getProviders();
    const modelToProvider = buildModelToProviderMap(providers);

    // 根版本（主线）按创建时间从左到右排列
    const roots = project.versions.filter((v) => v.parentId === null).sort((a, b) => a.createdAt - b.createdAt);

    // 统计时间轴 hint
    const totalRoots = roots.length;
    const totalBranches = project.versions.length - totalRoots;
    const totalImages = project.versions.reduce((acc, v) => acc + v.images.length, 0);

    // ============= 渲染时间轴 =============
    const timelineCols = buildTimelineHtml(project, curVer.id);

    // ============= 画廊 =============
    function galleryItemHtml(img) {
      const branchCount = getImageBranchCount(project.id, img.id);
      const branchBadge = branchCount > 0
        ? `<span class="pwb-gallery-branch-badge">${icon('git-branch', 10)}${branchCount} 分支</span>`
        : '';
      return `
        <div class="gallery-item pwb-gallery-item" data-image-id="${img.id}">
          <img src="${img.image}" alt="生成结果" loading="lazy" />
          ${branchBadge}
          <div class="gallery-item-meta">
            <span class="gallery-item-time">${formatRelativeTime(img.createdAt)}</span>
            <div class="gallery-item-actions">
              <button type="button" class="icon-btn" data-act="zoom" data-image-id="${img.id}" title="查看大图">${icon('maximize-2', 13)}</button>
              <button type="button" class="icon-btn" data-act="derive" data-image-id="${img.id}" title="基于此图派生分支">${icon('git-branch', 13)}</button>
              <button type="button" class="icon-btn" data-act="cover" data-image-id="${img.id}" title="设为项目封面">${icon('pin', 13)}</button>
              <button type="button" class="icon-btn" data-act="download" data-image-id="${img.id}" title="保存到本地">${icon('download', 13)}</button>
              <button type="button" class="icon-btn danger" data-act="delete" data-image-id="${img.id}" title="删除">${icon('trash-2', 13)}</button>
            </div>
          </div>
        </div>`;
    }

    function taskPlaceholderHtml(t) {
      const i2iBadge = t.isImageToImage ? `${icon('git-branch', 11)}图生图` : '';
      if (t.status === 'running') {
        return `
          <div class="gallery-item gallery-placeholder task-running" data-task-id="${t.id}">
            <div class="placeholder-cover">${icon('loader', 28)}<span>生成中…</span></div>
            <div class="gallery-item-meta">
              <span class="gallery-item-time">${t.ratio} · ${escapeHtml(t.quality)} ${i2iBadge}</span>
            </div>
          </div>`;
      }
      if (t.status === 'failed') {
        const errMsg = t.error && String(t.error).trim() ? String(t.error).trim() : '未知错误';
        const shortMsg = errMsg.length > 36 ? errMsg.slice(0, 36) + '…' : errMsg;
        return `
          <div class="gallery-item gallery-placeholder task-failed" data-task-id="${t.id}">
            <div class="placeholder-cover task-error-cover">
              ${icon('alert-circle', 24)}
              <span class="task-error-title">生成失败</span>
              <span class="task-error-detail" title="${escapeHtml(errMsg)}">${escapeHtml(shortMsg)}</span>
            </div>
            <div class="gallery-item-meta">
              <span class="gallery-item-time">${t.ratio} · ${escapeHtml(t.quality)}</span>
              <button type="button" class="icon-btn task-dismiss" data-task-id="${t.id}" title="移除">${icon('x', 13)}</button>
            </div>
          </div>`;
      }
      // queued
      return `
        <div class="gallery-item gallery-placeholder task-queued" data-task-id="${t.id}">
          <div class="placeholder-cover">${icon('clock', 28)}<span>排队中</span></div>
          <div class="gallery-item-meta">
            <span class="gallery-item-time">${t.ratio} · ${escapeHtml(t.quality)} ${i2iBadge}</span>
            <button type="button" class="icon-btn task-cancel" data-task-id="${t.id}" title="取消任务">${icon('x', 13)}</button>
          </div>
        </div>`;
    }

    function renderGalleryContent(versionId, images) {
      const visibleTasks = queue.getTasksByVersion(versionId).filter(
        (t) => t.status === 'queued' || t.status === 'running' || t.status === 'failed'
      );
      const placeholders = visibleTasks.map(taskPlaceholderHtml).join('');
      const imgs = images.length ? images.map(galleryItemHtml).join('') : '';
      if (!placeholders && !imgs) {
        return `<div class="gallery-empty">${icon('image', 32)}<span>${isChild
          ? '此分支基于父图派生，修改提示词后点击「生成图片」图生图迭代'
          : '该主线还没有生成图片，填写提示词后点击「生成图片」'}</span></div>`;
      }
      return placeholders + imgs;
    }

    const galleryHtml = renderGalleryContent(curVer.id, curVer.images);

    // ============= 详情面板 =============
    const typeBadge = isChild
      ? `<span class="pwb-type-badge branch">${icon('git-branch', 12)}分支</span>`
      : `<span class="pwb-type-badge">${icon('layers', 12)}主线</span>`;
    const lineageBadge = (() => {
      if (!isChild) return '';
      const parent = project.versions.find((v) => v.id === curVer.parentId);
      if (!parent) return '';
      const pImg = getParentImage(curVer, project);
      return `<span class="pwb-source-badge">${icon('git-branch', 12)} 基于 ${escapeHtml(parent.name)} · ${pImg ? formatRelativeTime(pImg.createdAt) : '丢失的图'}</span>`;
    })();

    // 子版本参考图条
    const sourceImageHtml = (() => {
      if (!isChild) return '';
      const pImg = getParentImage(curVer, project);
      return pImg
        ? `<div class="pwb-source-image-bar">${icon('git-branch', 14)}<span>父图：<strong>${formatRelativeTime(pImg.createdAt)}</strong> 生成 · <em>点击查看</em></span><div class="pwb-source-image-thumb-wrap"><img src="${pImg.image}" class="pwb-source-image-thumb" alt="参考图" />${icon('maximize-2', 11)}</div></div>`
        : `<div class="pwb-source-image-bar"><span class="pwb-source-image-missing">⚠ 父参考图已被删除，无法继续图生图，请重新派生</span></div>`;
    })();

    const root = htmlToElement(`
      <div>
        <div class="breadcrumb">
          <a href="#/projects" id="back-projects">项目</a>
          ${icon('chevron-right', 14)}
          <span class="breadcrumb-current">${escapeHtml(project.name)}</span>
        </div>
        <div class="project-header">
          <div>
            <h1 class="project-title">${escapeHtml(project.name)}</h1>
            <p class="project-desc">${escapeHtml(project.description) || '<span class="project-desc-empty">暂无描述</span>'}</p>
          </div>
          <div class="project-actions">
            <button type="button" class="btn btn-ghost" id="btn-settings">${icon('settings', 16)}<span>项目设置</span></button>
            <button type="button" class="btn btn-ghost danger" id="btn-delete-project">${icon('trash-2', 16)}<span>删除项目</span></button>
          </div>
        </div>
        <div class="pwb-layout">
          <!-- 横向时间轴 -->
          <div class="pwb-timeline-section">
            <div class="pwb-timeline-header">
              <div class="pwb-timeline-title">
                ${icon('arrow-right-left', 16)}
                <span>探索时间轴</span>
              </div>
              <div style="display:flex; align-items:center; gap:12px">
                <span class="pwb-timeline-hint">${totalRoots} 条主线 · ${totalBranches} 个分支 · 共 ${totalImages} 张图</span>
                <button type="button" class="btn btn-ghost btn-sm" id="btn-new-root">${icon('plus', 14)}<span>新主线</span></button>
              </div>
            </div>
            <div class="pwb-timeline-outer">
              ${timelineCols}
            </div>
          </div>

          <!-- 详情面板 -->
          <div class="pwb-detail">
            <div class="pwb-detail-header">
              <div class="pwb-detail-title-row">
                <span class="pwb-detail-name" id="detail-name">${escapeHtml(curVer.name)}</span>
                ${typeBadge}
                ${lineageBadge}
              </div>
              <span class="pwb-detail-time">${curVer.images.length} 张图片${isChild ? ' · 分支派生自父' : ''}</span>
            </div>

            ${sourceImageHtml}

            <div class="composer-card">
              <div class="composer-textarea-wrap">
                <div class="composer-source-preview" id="source-preview" style="display:${!isChild && curVer.sourceImage ? 'flex' : 'none'};">
                  <div class="composer-source-preview-img-wrap">
                    <img id="source-thumb" src="${curVer.sourceImage ? 'file://' + encodeURI(curVer.sourceImage) : ''}" alt="参考图" />
                  </div>
                  <div class="composer-source-preview-info">
                    <span class="composer-source-preview-label">${icon('git-branch', 14)} 参考图</span>
                    <span class="composer-source-preview-hint">图生图模式，基于此图迭代生成</span>
                  </div>
                  <button class="icon-btn" type="button" id="btn-remove-source" title="移除参考图">${icon('x', 14)}</button>
                </div>
                <textarea class="composer-textarea" id="version-prompt" spellcheck="false" placeholder="描述你想生成的画面…">${escapeHtml(curVer.prompt)}</textarea>
              </div>
              <div class="composer-toolbar">
                <button class="composer-tool-btn" type="button" id="btn-upload-image" ${isChild ? 'disabled title="分支使用父图作为参考，无需上传"' : 'title="上传图片（图生图）"'}>${icon('plus', 16)}</button>
                <button class="composer-tool-btn" type="button" id="btn-upload-file" title="上传文件（长文本提示词）">${icon('file-text', 16)}</button>
                <div class="composer-chip" id="model-chip">
                  <span class="chip-icon">${icon('cpu', 13)}</span>
                  <span class="chip-value" id="model-chip-value">${escapeHtml(curVer.modelId || '选择模型')}</span>
                  <span class="chip-caret">${icon('chevron-down', 13)}</span>
                </div>
                <div class="composer-chip" id="ratio-chip">
                  <span class="chip-icon">${icon('aperture', 13)}</span>
                  <span class="chip-value" id="ratio-chip-value">${curVer.images[0] ? curVer.images[0].ratio : '1:1'}</span>
                  <span class="chip-caret">${icon('chevron-down', 13)}</span>
                </div>
                <div class="composer-chip" id="quality-chip">
                  <span class="chip-icon">${icon('sparkles', 13)}</span>
                  <span class="chip-value" id="quality-chip-value">${curVer.images[0] ? curVer.images[0].quality : '高清'}</span>
                  <span class="chip-caret">${icon('chevron-down', 13)}</span>
                </div>
                <button class="composer-tool-btn" type="button" id="btn-optimize" title="优化提示词">${icon('wand', 15)}</button>
                <div class="composer-toolbar-spacer"></div>
                <button class="composer-generate-round" id="btn-generate" title="生成图片">
                  ${icon('arrow-up', 20)}
                </button>
              </div>
            </div>

            <div class="gallery-section">
              <div class="gallery-header">
                <span class="gallery-title">生成结果</span>
                <span class="gallery-count" id="gallery-count">${curVer.images.length} 张图片</span>
              </div>
              <div class="gallery-grid" id="gallery-grid">${galleryHtml}</div>
            </div>
          </div>
        </div>
      </div>
    `);
    mountPage(container, root);
    renderIcons(root);

    // ============= 交互 =============
    const promptInput = root.querySelector('#version-prompt');
    const btnGenerate = root.querySelector('#btn-generate');
    const btnNewRoot = root.querySelector('#btn-new-root');

    // 初始化比例和质量
    let currentRatio = curVer.images[0] ? curVer.images[0].ratio : '1:1';
    let currentQuality = curVer.images[0] ? curVer.images[0].quality : '高清';
    let currentModelId = curVer.modelId || '';
    let currentProviderId = curVer.providerId || '';

    // ===== Chip 下拉 =====
    const modelChip = root.querySelector('#model-chip');
    const modelChipValue = root.querySelector('#model-chip-value');
    const ratioChip = root.querySelector('#ratio-chip');
    const ratioChipValue = root.querySelector('#ratio-chip-value');
    const qualityChip = root.querySelector('#quality-chip');
    const qualityChipValue = root.querySelector('#quality-chip-value');

    function buildModelChipValue() {
      if (!currentModelId) { modelChipValue.textContent = '选择模型'; return; }
      const p = modelToProvider.get(currentModelId);
      modelChipValue.textContent = p ? `${p.name} · ${currentModelId}` : currentModelId;
    }
    buildModelChipValue();

    function buildModelDropdownHtml() {
      const pList = providers.filter((p) => p.models.some((m) => m.enabled));
      let html = '';
      for (const p of pList) {
        const models = p.models.filter((m) => m.enabled);
        html += `<div style="font-size:11px;color:var(--ink-3);padding:4px 10px 2px;">${escapeHtml(p.name)}</div>`;
        for (const m of models) {
          const active = m.id === currentModelId;
          html += `<div class="composer-dropdown-item ${active ? 'is-active' : ''}" data-provider="${p.id}" data-model="${m.id}">
            <span class="item-left">${escapeHtml(m.name)}</span>
            <span class="item-right">${active ? icon('check', 14) : ''}</span>
          </div>`;
        }
      }
      return html || '<div style="padding:8px 10px;color:var(--ink-3);font-size:12px;">暂无可用模型</div>';
    }

    function buildRatioDropdownHtml() {
      return RATIOS.map((r) => {
        const active = r === currentRatio;
        return `<div class="composer-dropdown-item ${active ? 'is-active' : ''}" data-ratio="${r}">
          <span class="item-left">${r}</span>
          <span class="item-right">${active ? icon('check', 14) : ''}</span>
        </div>`;
      }).join('');
    }

    function buildQualityDropdownHtml() {
      return QUALITIES.map((q) => {
        const active = q === currentQuality;
        return `<div class="composer-dropdown-item ${active ? 'is-active' : ''}" data-quality="${q}">
          <span class="item-left">${q}</span>
          <span class="item-right">${active ? icon('check', 14) : ''}</span>
        </div>`;
      }).join('');
    }

    // 通用下拉
    let openDropdown = null;
    function closeDropdown() {
      if (openDropdown) { openDropdown.remove(); openDropdown = null; }
      root.querySelectorAll('.composer-chip.is-open').forEach((c) => c.classList.remove('is-open'));
    }
    function openChipDropdown(chip, html) {
      closeDropdown();
      const dd = htmlToElement(`<div class="composer-dropdown">${html}</div>`);
      chip.appendChild(dd);
      chip.classList.add('is-open');
      renderIcons(dd);
      openDropdown = dd;
      setTimeout(() => {
        const handler = (e) => {
          if (!chip.contains(e.target)) { closeDropdown(); document.removeEventListener('click', handler); }
        };
        document.addEventListener('click', handler);
      }, 0);
    }

    modelChip.addEventListener('click', (e) => {
      if (e.target.closest('.composer-dropdown-item')) return;
      e.stopPropagation();
      if (openDropdown && openDropdown.parentElement === modelChip) closeDropdown();
      else openChipDropdown(modelChip, buildModelDropdownHtml());
    });
    ratioChip.addEventListener('click', (e) => {
      if (e.target.closest('.composer-dropdown-item')) return;
      e.stopPropagation();
      if (openDropdown && openDropdown.parentElement === ratioChip) closeDropdown();
      else openChipDropdown(ratioChip, buildRatioDropdownHtml());
    });
    qualityChip.addEventListener('click', (e) => {
      if (e.target.closest('.composer-dropdown-item')) return;
      e.stopPropagation();
      if (openDropdown && openDropdown.parentElement === qualityChip) closeDropdown();
      else openChipDropdown(qualityChip, buildQualityDropdownHtml());
    });

    root.addEventListener('click', (e) => {
      const item = e.target.closest('.composer-dropdown-item');
      if (!item) return;
      if (item.hasAttribute('data-model')) {
        currentProviderId = item.getAttribute('data-provider');
        currentModelId = item.getAttribute('data-model');
        buildModelChipValue();
      } else if (item.hasAttribute('data-ratio')) {
        currentRatio = item.getAttribute('data-ratio');
        ratioChipValue.textContent = currentRatio;
      } else if (item.hasAttribute('data-quality')) {
        currentQuality = item.getAttribute('data-quality');
        qualityChipValue.textContent = currentQuality;
      }
      closeDropdown();
    });

    // ========== 工具栏：上传图片 / 上传文件 / 优化提示词 ==========
    let sourceImagePath = (!isChild && curVer.sourceImage) ? curVer.sourceImage : '';
    const sourcePreview = root.querySelector('#source-preview');
    const sourceThumb = root.querySelector('#source-thumb');
    const btnUploadImage = root.querySelector('#btn-upload-image');
    const btnRemoveSource = root.querySelector('#btn-remove-source');

    if (sourceImagePath) {
      sourcePreview.style.display = 'flex';
      sourceThumb.src = 'file://' + encodeURI(sourceImagePath);
    }

    if (btnUploadImage && !isChild) {
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
    }

    if (btnRemoveSource) {
      btnRemoveSource.addEventListener('click', () => {
        sourceImagePath = '';
        sourcePreview.style.display = 'none';
        sourceThumb.src = '';
      });
    }

    const btnUploadFile = root.querySelector('#btn-upload-file');
    if (btnUploadFile) {
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
    }

    const btnOptimize = root.querySelector('#btn-optimize');
    if (btnOptimize) {
      btnOptimize.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) { toast('请先输入提示词', 'error'); promptInput.focus(); return; }
        const tp = getTextProvider();
        if (!tp || !tp.endpoint || !tp.model) {
          toast('请先在「供应商配置」页配置文本模型', 'error');
          return;
        }
        const originalHtml = btnOptimize.innerHTML;
        btnOptimize.disabled = true;
        btnOptimize.innerHTML = icon('loader', 14);
        try {
          const optimized = await optimizePrompt(prompt);
          promptInput.value = optimized;
          toast('提示词已优化', 'success');
        } catch (err) {
          toast('优化失败：' + err.message, 'error');
        } finally {
          btnOptimize.disabled = false;
          btnOptimize.innerHTML = originalHtml;
        }
      });
    }

    // ⌘/Ctrl + Enter 快捷生成
    promptInput.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        doGenerate();
      }
    });

    // ===== 粘贴图片（从剪贴板） =====
    const composerCard = root.querySelector('.composer-card');
    if (composerCard) {
      composerCard.addEventListener('paste', async (e) => {
        if (!window.api || !window.api.savePastedImage) return;
        if (isChild) return; // 子版本使用父图，不支持粘贴
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
    }

    // ===== 父图缩略图点击查看详情 =====
    const sourceImgThumb = root.querySelector('.pwb-source-image-thumb-wrap');
    if (sourceImgThumb) {
      sourceImgThumb.style.cursor = 'pointer';
      sourceImgThumb.title = '点击查看父图详情';
      sourceImgThumb.addEventListener('click', () => {
        const pImg = getParentImage(curVer, project);
        const parent = project.versions.find((v) => v.id === curVer.parentId);
        if (pImg && parent) {
          openLightbox(pImg, parent);
        }
      });
    }

    // ========== 生成图片 ==========
    function doGenerate() {
      const editedPrompt = promptInput.value.trim();
      const editedModelId = currentModelId;
      if (!editedPrompt) { toast('请输入提示词', 'error'); promptInput.focus(); return; }
      if (!editedModelId) { toast('请选择模型', 'error'); return; }
      const provider = modelToProvider.get(editedModelId);
      if (!provider) { toast('所选模型不可用', 'error'); return; }

      const willCreateRoot = curVer.parentId === null &&
        (editedPrompt !== curVer.prompt.trim() || editedModelId !== curVer.modelId || sourceImagePath !== (curVer.sourceImage || ''));

      updateVersionFields(curVer.id, {
        prompt: editedPrompt,
        modelId: editedModelId,
        providerId: provider.id,
        providerName: provider.name,
      });

      queue.enqueue({
        source: 'project',
        projectId: project.id,
        versionId: curVer.id,
        prompt: editedPrompt,
        providerId: provider.id,
        providerName: provider.name,
        modelId: editedModelId,
        ratio: currentRatio,
        quality: currentQuality,
        isImageToImage: isChild || !!sourceImagePath,
        sourceImage: sourceImagePath || null,
      });

      toast(willCreateRoot ? '已创建新主线并加入生成队列' : '已加入生成队列', 'info');
    }
    btnGenerate.addEventListener('click', doGenerate);

    // ========== 新主线按钮 ==========
    btnNewRoot.addEventListener('click', () => {
      const editedPrompt = promptInput.value.trim();
      const editedModelId = currentModelId;
      const provider = modelToProvider.get(editedModelId);
      const newProj = createRootVersion(project.id, {
        name: editedPrompt.slice(0, 10) || '新主线',
        prompt: editedPrompt,
        providerId: provider ? provider.id : '',
        providerName: provider ? provider.name : '',
        modelId: editedModelId,
      });
      toast('已新建主线', 'success');
      renderWorkbench(container, newProj);
    });

    // ========== 时间轴：切换节点 / 删除节点 ==========
    root.querySelector('.pwb-timeline-outer').addEventListener('click', (e) => {
      // 删节点（主节点或子节点统一处理）
      const nodeDel = e.target.closest('[data-root-delete]');
      if (nodeDel) {
        e.stopPropagation();
        const rid = nodeDel.getAttribute('data-root-delete');
        const ver = project.versions.find((x) => x.id === rid);
        if (!ver) return;
        const descendants = collectDescendants(project, rid);
        const imgCount = ver.images.length + descendants.reduce((s, id) => {
          const v = project.versions.find(x => x.id === id);
          return s + (v ? v.images.length : 0);
        }, 0);
        const label = ver.parentId ? '分支' : '主线';
        const message = `确定删除${label}「${ver.name}」吗？\n\n该${label}及其下 ${descendants.length} 个衍生节点、共 ${imgCount} 张生成图都将一并删除，且无法恢复。`;
        if (!confirmDialog(message)) return;
        // 先删子节点，再删自身
        descendants.forEach((id) => deleteVersion(project.id, id));
        deleteVersion(project.id, rid);
        toast('已删除', 'success');
        renderWorkbench(container, getProject(project.id));
        return;
      }
      // 点节点
      const nodeCol = e.target.closest('.pwb-tree-node-col');
      if (nodeCol) {
        const vid = nodeCol.getAttribute('data-version-id');
        if (vid === curVer.id) return;
        const outerEl = root.querySelector('.pwb-timeline-outer');
        const savedScroll = outerEl ? outerEl.scrollLeft : 0;
        setCurrentVersion(project.id, vid);
        renderWorkbench(container, getProject(project.id));
        // 恢复时间轴横向滚动位置
        const newOuter = container.querySelector('.pwb-timeline-outer');
        if (newOuter && savedScroll) newOuter.scrollLeft = savedScroll;
        return;
      }
    });

    // 收集所有后代节点 ID
    function collectDescendants(proj, parentId) {
      const result = [];
      const stack = proj.versions.filter(v => v.parentId === parentId);
      while (stack.length) {
        const v = stack.pop();
        result.push(v.id);
        const children = proj.versions.filter(x => x.parentId === v.id);
        stack.push(...children);
      }
      return result;
    }

    // ========== 节点名称可编辑（双击） ==========
    root.querySelectorAll('[data-root-name]').forEach((el) => {
      el.addEventListener('dblclick', () => {
        const vid = el.getAttribute('data-root-name');
        const v = project.versions.find((x) => x.id === vid);
        if (!v) return;
        const isRoot = !v.parentId;
        const newName = prompt(isRoot ? '修改主线名称：' : '修改分支名称：', v.name);
        if (newName === null) return;
        const trimmed = newName.trim().slice(0, 20);
        if (!trimmed) { toast('名称不能为空', 'error'); return; }
        updateVersionFields(vid, { name: trimmed });
        el.textContent = trimmed;
      });
    });

    // ========== 画廊操作 ==========
    const galleryGrid = root.querySelector('#gallery-grid');
    galleryGrid.addEventListener('click', async (e) => {
      // 取消排队任务
      const cancelBtn = e.target.closest('.task-cancel');
      if (cancelBtn) { queue.cancel(cancelBtn.getAttribute('data-task-id')); return; }
      // 移除失败卡片
      const dismissBtn = e.target.closest('.task-dismiss');
      if (dismissBtn) { queue.removeTask(dismissBtn.getAttribute('data-task-id')); return; }

      const btn = e.target.closest('[data-act]');
      const imgEl = e.target.closest('.gallery-item img');

      if (!btn && imgEl) {
        const item = e.target.closest('.gallery-item');
        const imgId = item.getAttribute('data-image-id');
        if (!imgId) return;
        const fresh = getProject(project.id);
        const v = fresh.versions.find((x) => x.id === fresh.currentVersionId);
        const img = v.images.find((i) => i.id === imgId);
        if (img) openLightbox(img, v);
        return;
      }
      if (!btn) return;

      const act = btn.getAttribute('data-act');
      const imgId = btn.getAttribute('data-image-id');
      if (!imgId) return;

      const fresh = getProject(project.id);
      const v = fresh.versions.find((x) => x.id === fresh.currentVersionId);
      const img = v.images.find((i) => i.id === imgId);
      if (!img) return;

      if (act === 'zoom') {
        openLightbox(img, v);
      } else if (act === 'derive') {
        openDeriveDialog(project.id, v.id, container, renderWorkbench, img.id);
      } else if (act === 'cover') {
        setProjectCover(project.id, img.id);
        toast('已设为项目封面', 'success');
      } else if (act === 'download') {
        await downloadImage(img.image, img.id);
      } else if (act === 'delete') {
        if (!confirmDialog('确定删除这张图片吗？')) return;
        deleteImage(project.id, v.id, img.id);
        toast('已删除', 'success');
        refreshGallery();
      }
    });

    // ========== 刷新画廊（队列变化时） ==========
    function refreshGallery() {
      const fresh = getProject(project.id);
      if (!fresh) return;
      const v = fresh.versions.find((x) => x.id === fresh.currentVersionId);
      if (!v) return;
      galleryGrid.innerHTML = renderGalleryContent(v.id, v.images);
      renderIcons(galleryGrid);
      const countEl = root.querySelector('#gallery-count');
      if (countEl) countEl.textContent = `${v.images.length} 张图片`;

      // 如果当前版本 id 变了（因为主线变更建了新节点），要重渲染整个工作台
      if (fresh.currentVersionId !== curVer.id) {
        renderWorkbench(container, fresh);
        return;
      }

      // 版本没变：局部刷新时间轴
      const outerEl = root.querySelector('.pwb-timeline-outer');
      if (outerEl) {
        outerEl.innerHTML = buildTimelineHtml(fresh, v.id);
        renderIcons(outerEl);
      }
    }
    const unsubscribe = queue.subscribe(refreshGallery);
    const observer = new MutationObserver(() => {
      if (!document.contains(root)) { unsubscribe(); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ========== 项目设置 / 删除 ==========
    root.querySelector('#btn-settings').addEventListener('click', () => {
      openSettingsDialog(project, (updated) => renderWorkbench(container, updated));
    });
    root.querySelector('#back-projects').addEventListener('click', (e) => {
      e.preventDefault(); navigate('/projects');
    });
    root.querySelector('#btn-delete-project').addEventListener('click', () => {
      if (!confirmDialog(`确定删除项目「${project.name}」吗？所有版本与图片将一并删除。`)) return;
      deleteProject(project.id);
      toast('项目已删除', 'success');
      navigate('/projects');
    });
  }
}

// ===== 派生对话框（选图） =====
function openDeriveDialog(projectId, parentVersionId, container, renderWorkbench, preselectedImageId) {
  const project = getProject(projectId);
  if (!project) return;
  const parent = project.versions.find((v) => v.id === parentVersionId);
  if (!parent) return;
  if (!parent.images.length) { toast('该版本还没有生成图片，无法派生分支', 'error'); return; }

  const defaultImgId = preselectedImageId || parent.images[0].id;
  const gridHtml = parent.images.map((img) => `
    <div class="derive-image-item ${img.id === defaultImgId ? 'selected' : ''}" data-image-id="${img.id}">
      <img src="${img.image}" alt="参考图" loading="lazy" />
      <span class="derive-image-time">${formatRelativeTime(img.createdAt)}</span>
    </div>
  `).join('');

  const overlay = htmlToElement(`
    <div class="modal-overlay" id="derive-modal">
      <div class="modal-card modal-card-wide">
        <div class="modal-header">
          <span class="modal-title">${icon('git-branch', 18)}<span>从 ${escapeHtml(parent.name)} 派生分支</span></span>
          <button type="button" class="modal-close" id="modal-close">${icon('x', 16)}</button>
        </div>
        <div class="modal-body">
          <p class="derive-desc">选择一张图作为参考图，分支将通过图生图基于该图迭代生成新图。</p>
          <div class="derive-image-grid" id="derive-image-grid">${gridHtml}</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="modal-cancel">取消</button>
          <button type="button" class="btn btn-primary" id="modal-submit">${icon('git-branch', 16)}<span>派生分支</span></button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  renderIcons(overlay);

  let selectedImageId = defaultImgId;
  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#derive-image-grid').addEventListener('click', (e) => {
    const item = e.target.closest('.derive-image-item');
    if (!item) return;
    selectedImageId = item.getAttribute('data-image-id');
    overlay.querySelectorAll('.derive-image-item').forEach((el) => el.classList.remove('selected'));
    item.classList.add('selected');
  });
  overlay.querySelector('#modal-submit').addEventListener('click', () => {
    if (!selectedImageId) { toast('请选择参考图', 'error'); return; }
    const newProj = createVersion(projectId, parentVersionId, selectedImageId, {
      prompt: parent.prompt,
      providerId: parent.providerId,
      providerName: parent.providerName,
      modelId: parent.modelId,
    });
    close();
    toast('已派生出新分支', 'success');
    renderWorkbench(container, newProj);
  });
}

// ===== 工具函数 =====
function buildModelToProviderMap(providers) {
  const map = new Map();
  providers.forEach((p) => p.models.filter((m) => m.enabled).forEach((m) => map.set(m.id, p)));
  return map;
}
async function downloadImage(src, id) {
  try {
    const dataUrl = await imageToDataUrl(src);
    const res = await window.api.saveImage(dataUrl, `miaos-proj-${id}.png`);
    if (res.ok) toast('图片已保存', 'success');
    else if (!res.canceled) toast('保存失败：' + (res.error || '未知错误'), 'error');
  } catch (e) { toast('保存失败：' + e.message, 'error'); }
}
function openLightbox(img, version) {
  const typeLabel = version.parentId ? '分支' : '主线';
  const providerText = version.providerName || version.providerId || '未知供应商';
  const modelText = version.modelId || '未知模型';
  const overlay = htmlToElement(`
    <div class="lightbox-overlay" id="lightbox">
      <button type="button" class="lightbox-close" id="lightbox-close">${icon('x', 20)}</button>
      <div class="lightbox-content">
        <img src="${img.image}" alt="生成结果" class="lightbox-image" />
        <div class="lightbox-info">
          <div class="lightbox-info-row">
            <span class="lightbox-info-label">模型</span>
            <span class="lightbox-info-value">${escapeHtml(providerText)} / ${escapeHtml(modelText)}</span>
          </div>
          <div class="lightbox-info-row">
            <span class="lightbox-info-label">版本</span>
            <span class="lightbox-info-value"><span class="pwb-type-badge ${version.parentId ? 'branch' : ''}" style="transform:scale(0.9);transform-origin:left">${icon(version.parentId ? 'git-branch' : 'layers', 12)}${typeLabel}</span> ${escapeHtml(version.name)}</span>
          </div>
          <div class="lightbox-info-row">
            <span class="lightbox-info-label">参数</span>
            <span class="lightbox-info-value">${img.ratio} · ${escapeHtml(img.quality)} · ${ratioToSize(img.ratio)} · ${formatDateTime(img.createdAt)}</span>
          </div>
          <div class="lightbox-info-row lightbox-prompt-row">
            <span class="lightbox-info-label">提示词</span>
            <span class="lightbox-info-value lightbox-prompt-text">${escapeHtml(version.prompt)}</span>
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
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#lightbox-close').addEventListener('click', close);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  overlay.querySelector('#lb-download').addEventListener('click', () => downloadImage(img.image, img.id));
  overlay.querySelector('#lb-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(version.prompt); toast('提示词已复制', 'success'); }
    catch { toast('复制失败', 'error'); }
  });
}
function openSettingsDialog(project, onUpdated) {
  const overlay = htmlToElement(`
    <div class="modal-overlay" id="settings-modal">
      <div class="modal-card">
        <div class="modal-header"><span class="modal-title">${icon('settings', 18)}<span>项目设置</span></span>
          <button type="button" class="modal-close" id="modal-close">${icon('x', 16)}</button></div>
        <div class="modal-body">
          <div class="form-group"><label class="form-label">项目名称</label>
            <input type="text" class="form-input" id="set-name" value="${escapeHtml(project.name)}" maxlength="40" /></div>
          <div class="form-group"><label class="form-label">项目描述</label>
            <input type="text" class="form-input" id="set-desc" value="${escapeHtml(project.description)}" placeholder="一句话描述创作目标" maxlength="80" /></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="modal-cancel">取消</button>
          <button type="button" class="btn btn-primary" id="modal-submit">${icon('save', 16)}<span>保存</span></button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  renderIcons(overlay);
  const nameInput = overlay.querySelector('#set-name');
  nameInput.focus(); nameInput.select();
  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  overlay.querySelector('#modal-submit').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const description = overlay.querySelector('#set-desc').value.trim();
    if (!name) { toast('请填写项目名称', 'error'); nameInput.focus(); return; }
    const updated = updateProject(project.id, { name, description });
    close(); toast('项目已更新', 'success');
    onUpdated(updated);
  });
}
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
