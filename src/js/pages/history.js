// 全量历史页：混合快速生图与项目图片，统一提供筛选、预览和批量删除。
import { icon, renderIcons } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog, createKeyedListRenderer } from '../ui.js';
import {
  getHistory,
  getProjects,
  deleteHistoryRecords,
  formatRelativeTime,
  imageToDataUrl,
} from '../store.js';
import { navigate } from '../router.js';
import { getUnifiedHistory } from '../history-data.js';
import { openImagePreview } from '../image-preview.js';

const HISTORY_PAGE_SIZE = 24;

/**
 * 管理历史页的筛选、分页和批量选择状态。
 * 依赖通过参数注入，避免页面状态逻辑依赖 DOM，便于独立测试。
 */
export function createHistoryPageController(dependencies = {}) {
  const {
    getUnifiedHistory: selectUnifiedHistory = getUnifiedHistory,
    getHistory: readHistory = getHistory,
    getProjects: readProjects = getProjects,
    deleteHistoryRecords: deleteRecords = deleteHistoryRecords,
    confirmDialog: confirmDelete = confirmDialog,
  } = dependencies;
  let page = 1;
  let query = '';
  let source = 'all';
  let projectId = '';
  let batchMode = false;
  const selected = new Map();

  function getPage() {
    const result = selectUnifiedHistory({
      history: readHistory(),
      projects: readProjects(),
    }, {
      page,
      pageSize: HISTORY_PAGE_SIZE,
      query,
      source,
      projectId,
    });
    page = result.page;
    return result;
  }

  function setFilters(next = {}) {
    const nextQuery = next.query === undefined ? query : String(next.query || '').trim();
    const nextSource = next.source === undefined ? source : String(next.source || 'all');
    const nextProjectId = next.projectId === undefined ? projectId : String(next.projectId || '').trim();
    if (nextQuery === query && nextSource === source && nextProjectId === projectId) return;
    query = nextQuery;
    source = nextSource;
    // 项目筛选只对项目来源有意义；切换来源时清除，避免隐藏状态下残留选择。
    projectId = source === 'project' ? nextProjectId : '';
    page = 1;
    selected.clear();
  }

  function setPage(nextPage) {
    const parsed = Number.parseInt(nextPage, 10);
    page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  function setBatchMode(enabled) {
    batchMode = Boolean(enabled);
    if (!batchMode) selected.clear();
  }

  function toggleSelection(record) {
    if (!batchMode || !record?.key) return;
    if (selected.has(record.key)) selected.delete(record.key);
    else selected.set(record.key, record);
  }

  function getSelectedItems() {
    return Array.from(selected.values());
  }

  async function deleteSelected() {
    const records = getSelectedItems();
    if (records.length === 0) return 0;
    const quickCount = records.filter((item) => item.source === 'quick').length;
    const projectCount = records.filter((item) => item.source === 'project').length;
    const sources = [
      quickCount ? `快速生图 ${quickCount} 张` : '',
      projectCount ? `项目生图 ${projectCount} 张` : '',
    ].filter(Boolean).join('，');
    const projectWarning = projectCount ? '项目图片删除会影响对应项目版本。' : '';
    const confirmed = await confirmDelete(`确定删除所选 ${records.length} 张图片吗？（${sources}）此操作不可撤销。${projectWarning}`);
    if (!confirmed) return 0;

    const deletedCount = deleteRecords(records);
    selected.clear();
    // 继续以删除前的请求页查询，让选择器将已经越界的页码收敛到最后有效页。
    getPage();
    return deletedCount;
  }

  return {
    getPage,
    setFilters,
    setPage,
    setBatchMode,
    toggleSelection,
    getSelectedItems,
    deleteSelected,
    getState: () => ({ page, query, source, projectId, batchMode }),
  };
}

export function renderHistory(container) {
  const root = htmlToElement(`
    <div class="history-page">
      <div class="history-header">
        <div>
          <h1 class="history-title">历史记录</h1>
          <p class="history-subtitle">查看快速生图和项目生图的全部结果</p>
        </div>
        <div class="history-toolbar">
          <div class="search-box">
            ${icon('search', 14)}
            <input type="search" class="search-input" id="history-search-input" placeholder="搜索提示词、模型或项目…" aria-label="搜索历史记录" />
          </div>
          <select class="history-source-filter" id="history-source-filter" aria-label="筛选历史来源">
            <option value="all">全部来源</option>
            <option value="quick">快速生图</option>
            <option value="project">项目生图</option>
          </select>
          <select class="history-source-filter" id="history-project-filter" aria-label="筛选项目" hidden>
            <option value="">全部项目</option>
          </select>
          <button type="button" class="text-btn" id="history-batch-toggle">${icon('check-square', 14)}<span>批量管理</span></button>
        </div>
      </div>
      <div id="history-list">
        <div class="history-grid gallery-grid" data-history-grid></div>
        <div class="history-empty" data-history-empty hidden>
          ${icon('image', 40)}
          <span data-history-empty-text></span>
          <button class="btn btn-primary" type="button" data-history-go-generate>${icon('sparkles', 16)}<span>去快速生图</span></button>
        </div>
        <div class="history-pagination" data-history-pagination hidden>
          <button class="btn btn-ghost btn-sm" type="button" data-history-page="previous">${icon('chevron-left', 14)}<span>上一页</span></button>
          <span class="history-page-label" data-history-page-label></span>
          <button class="btn btn-ghost btn-sm" type="button" data-history-page="next"><span>下一页</span>${icon('chevron-right', 14)}</button>
        </div>
      </div>
      <div class="history-batch-bar" data-history-batch-bar hidden>
        <span data-history-selected-count>已选择 0 张</span>
        <div class="history-batch-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-history-batch-cancel>取消</button>
          <button class="btn btn-danger btn-sm" type="button" data-history-delete-selected disabled>${icon('trash-2', 14)}<span>删除所选</span></button>
        </div>
      </div>
    </div>
  `);
  mountPage(container, root);
  renderIcons(root);

  const controller = createHistoryPageController();
  const searchInput = root.querySelector('#history-search-input');
  const sourceFilter = root.querySelector('#history-source-filter');
  const projectFilter = root.querySelector('#history-project-filter');
  const listEl = root.querySelector('#history-list');
  const historyGrid = root.querySelector('[data-history-grid]');
  const emptyState = root.querySelector('[data-history-empty]');
  const emptyText = root.querySelector('[data-history-empty-text]');
  const pagination = root.querySelector('[data-history-pagination]');
  const previousPage = root.querySelector('[data-history-page="previous"]');
  const nextPage = root.querySelector('[data-history-page="next"]');
  const pageLabel = root.querySelector('[data-history-page-label]');
  const batchToggle = root.querySelector('#history-batch-toggle');
  const batchBar = root.querySelector('[data-history-batch-bar]');
  const selectedCount = root.querySelector('[data-history-selected-count]');
  const deleteSelectedButton = root.querySelector('[data-history-delete-selected]');
  let closeImagePreview = null;

  function renderProjectFilterOptions() {
    const projects = getProjects();
    projectFilter.innerHTML = '<option value="">全部项目</option>' + projects
      .map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name || '未命名项目')}</option>`)
      .join('');
  }
  renderProjectFilterOptions();

  const historyRenderer = createKeyedListRenderer(historyGrid, {
    getKey: (item) => item.key,
    getSignature: (item) => JSON.stringify(item),
    createNode: (item) => htmlToElement(createHistoryCardHtml(item, controller.getState().batchMode, controller.getSelectedItems())),
    updateNode: (node, item) => updateHistoryCard(node, item, controller.getState().batchMode, controller.getSelectedItems()),
    afterNode: (node) => renderIcons(node),
  });

  function updateHistoryCard(node, item, batchMode, selectedItems) {
    const next = htmlToElement(createHistoryCardHtml(item, batchMode, selectedItems));
    Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
    Array.from(next.attributes).forEach((attribute) => node.setAttribute(attribute.name, attribute.value));
    node.className = next.className;
    node.replaceChildren(...Array.from(next.childNodes));
  }

  function renderView() {
    const pageData = controller.getPage();
    const state = controller.getState();
    const selectedItems = controller.getSelectedItems();
    projectFilter.hidden = state.source !== 'project';
    if (projectFilter.value !== state.projectId) projectFilter.value = state.projectId;
    const records = pageData.items.map((item) => ({
      ...item,
      selected: selectedItems.some((selected) => selected.key === item.key),
    }));
    historyRenderer.render(records);

    const isEmpty = pageData.total === 0;
    historyGrid.hidden = isEmpty;
    emptyState.hidden = !isEmpty;
    emptyText.textContent = state.query || state.source !== 'all' || state.projectId
      ? '没有匹配的历史记录'
      : '还没有生成记录，去快速生图页创建第一张吧';
    root.querySelector('[data-history-go-generate]').hidden = Boolean(state.query || state.source !== 'all' || state.projectId);

    pagination.hidden = isEmpty || pageData.totalPages <= 1;
    pageLabel.textContent = `第 ${pageData.page} / ${pageData.totalPages} 页 · 共 ${pageData.total} 张`;
    previousPage.disabled = pageData.page <= 1;
    nextPage.disabled = pageData.page >= pageData.totalPages;

    batchToggle.classList.toggle('is-active', state.batchMode);
    batchToggle.innerHTML = `${icon(state.batchMode ? 'x' : 'check-square', 14)}<span>${state.batchMode ? '退出批量管理' : '批量管理'}</span>`;
    renderIcons(batchToggle);
    batchBar.hidden = !state.batchMode;
    selectedCount.textContent = `已选择 ${selectedItems.length} 张`;
    deleteSelectedButton.disabled = selectedItems.length === 0;
  }

  function openHistoryPreview(record) {
    closeImagePreview?.();
    closeImagePreview = openImagePreview({
      ...record,
      modelId: record.model || record.modelId || '',
      versionName: record.versionName || record.projectName || '',
    }, {
      onClose: () => { closeImagePreview = null; },
      onNavigateToProject: ({ projectId, versionId, imageId }) => {
        closeImagePreview?.();
        navigate(`/project/${encodeURIComponent(projectId)}?version=${encodeURIComponent(versionId || '')}&image=${encodeURIComponent(imageId || '')}`);
      },
      onDownload: (item) => downloadImage(item.image, item.id || item.imageId),
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

  function findPageRecord(key) {
    return controller.getPage().items.find((item) => item.key === key) || null;
  }

  searchInput.addEventListener('input', () => {
    controller.setFilters({ query: searchInput.value });
    renderView();
  });
  sourceFilter.addEventListener('change', () => {
    controller.setFilters({ source: sourceFilter.value });
    renderView();
  });
  projectFilter.addEventListener('change', () => {
    controller.setFilters({ projectId: projectFilter.value });
    renderView();
  });
  batchToggle.addEventListener('click', () => {
    controller.setBatchMode(!controller.getState().batchMode);
    renderView();
  });

  listEl.addEventListener('click', async (event) => {
    if (event.target.closest?.('[data-history-go-generate]')) {
      navigate('/generate');
      return;
    }
    const pageButton = event.target.closest?.('[data-history-page]');
    if (pageButton) {
      const currentPage = controller.getState().page;
      controller.setPage(currentPage + (pageButton.getAttribute('data-history-page') === 'next' ? 1 : -1));
      renderView();
      return;
    }
    const selectionControl = event.target.closest?.('[data-history-select]');
    if (selectionControl) {
      const record = findPageRecord(selectionControl.getAttribute('data-history-key'));
      if (record) controller.toggleSelection(record);
      renderView();
      return;
    }
    const historyCard = event.target.closest?.('.history-card');
    if (historyCard && controller.getState().batchMode) {
      const record = findPageRecord(historyCard.getAttribute('data-history-key'));
      if (record) controller.toggleSelection(record);
      renderView();
      return;
    }
    const actionButton = event.target.closest?.('[data-history-act]');
    if (actionButton) {
      const record = findPageRecord(actionButton.getAttribute('data-history-key'));
      if (!record) return;
      const action = actionButton.getAttribute('data-history-act');
      if (action === 'preview') openHistoryPreview(record);
      else if (action === 'download') await downloadImage(record.image, record.id || record.imageId);
      else if (action === 'project') navigateToProject(record);
      return;
    }
    const image = event.target.closest?.('.history-card img');
    if (!image || controller.getState().batchMode) return;
    const record = findPageRecord(image.closest('.history-card')?.getAttribute('data-history-key'));
    if (record) openHistoryPreview(record);
  });

  batchBar.addEventListener('click', async (event) => {
    if (event.target.closest?.('[data-history-batch-cancel]')) {
      controller.setBatchMode(false);
      renderView();
      return;
    }
    if (!event.target.closest?.('[data-history-delete-selected]')) return;
    const deletedCount = await controller.deleteSelected();
    if (deletedCount > 0) toast(`已删除 ${deletedCount} 张图片`, 'success');
    renderView();
  });

  renderView();
  return () => closeImagePreview?.();
}

export function createHistoryCardHtml(item, batchMode = false, selectedItems = []) {
  const isProject = item.source === 'project';
  const isSelected = item.selected || selectedItems.some((record) => record.key === item.key);
  const sourceLabel = isProject ? '项目生图' : '快速生图';
  const model = item.model || item.modelId || '未记录模型';
  const parameters = [item.ratio, item.quality].filter(Boolean).join(' · ') || '未记录参数';
  const projectName = isProject && item.projectName
    ? `<span class="history-card-project" title="${escapeHtml(item.projectName)}">${icon('folder', 11)}${escapeHtml(item.projectName)}</span>`
    : '';
  const selectControl = batchMode ? `
    <label class="history-card-select" data-history-select data-history-key="${escapeHtml(item.key)}">
      <input type="checkbox" ${isSelected ? 'checked' : ''} aria-label="选择图片" />
      <span>${icon('check', 14)}</span>
    </label>` : '';
  const projectAction = isProject
    ? `<button type="button" class="icon-btn" data-history-act="project" data-history-key="${escapeHtml(item.key)}" title="前往项目对应图片" aria-label="前往项目对应图片">${icon('folder-open', 14)}</button>`
    : '';

  return `
    <article class="gallery-item history-card ${batchMode ? 'is-batch-mode' : ''} ${isSelected ? 'is-selected' : ''}" data-history-key="${escapeHtml(item.key)}" data-history-source="${escapeHtml(item.source)}">
      <div class="gallery-item-img-wrap">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.prompt || '生成结果')}" loading="lazy" />
        <div class="history-card-tags">
          <span class="history-source-badge ${isProject ? 'is-project' : 'is-quick'}">${escapeHtml(sourceLabel)}</span>
          ${projectName}
        </div>
        ${selectControl}
        <div class="gallery-item-hover-actions">
          <button type="button" class="icon-btn" data-history-act="preview" data-history-key="${escapeHtml(item.key)}" title="查看大图" aria-label="查看大图">${icon('maximize-2', 14)}</button>
          <button type="button" class="icon-btn" data-history-act="download" data-history-key="${escapeHtml(item.key)}" title="保存到本地" aria-label="保存到本地">${icon('download', 14)}</button>
          ${projectAction}
        </div>
      </div>
      <div class="gallery-item-meta">
        <span class="gallery-item-meta-model" title="${escapeHtml(model)}">${escapeHtml(model)}</span>
        <span class="gallery-item-meta-params">${escapeHtml(parameters)}</span>
        <span class="gallery-item-meta-time">${formatRelativeTime(item.createdAt)}</span>
      </div>
    </article>`;
}

function navigateToProject(record) {
  if (!record?.projectId) return;
  navigate(`/project/${encodeURIComponent(record.projectId)}?version=${encodeURIComponent(record.versionId || '')}&image=${encodeURIComponent(record.imageId || record.id || '')}`);
}

async function downloadImage(src, id) {
  try {
    const dataUrl = await imageToDataUrl(src);
    const result = await window.api.saveImage(dataUrl, `miaos-${id}.png`);
    if (result.ok) toast('图片已保存', 'success');
    else if (!result.canceled) toast('保存失败：' + (result.error || '未知错误'), 'error');
  } catch (error) {
    toast('保存失败：' + error.message, 'error');
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
