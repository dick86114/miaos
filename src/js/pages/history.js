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


const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;
const HEATMAP_DAYS = 15 * 7;

function startOfLocalDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 0;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function formatChartDate(timestamp, includeYear = false) {
  const date = new Date(timestamp);
  if (includeYear) return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function countBy(items, selectKey, fallback) {
  const counts = new Map();
  items.forEach((item) => {
    const key = String(selectKey(item) || fallback || '').trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'));
}

export function buildStatisticsData(records, now = Date.now()) {
  const items = Array.isArray(records) ? records : [];
  const today = startOfLocalDay(now);
  const trendStart = today - (TREND_DAYS - 1) * DAY_MS;
  const currentWeekStart = today - ((new Date(today).getDay() + 6) % 7) * DAY_MS;
  const heatmapStart = currentWeekStart - 14 * 7 * DAY_MS;
  const dailyCounts = new Map();

  items.forEach((item) => {
    const day = startOfLocalDay(item.createdAt);
    if (!day) return;
    dailyCounts.set(day, (dailyCounts.get(day) || 0) + 1);
  });

  const trend = Array.from({ length: TREND_DAYS }, (_, index) => {
    const timestamp = trendStart + index * DAY_MS;
    return {
      timestamp,
      label: formatChartDate(timestamp),
      count: dailyCounts.get(timestamp) || 0,
    };
  });
  const maxTrendCount = Math.max(0, ...trend.map((item) => item.count));
  const peak = trend.reduce((best, item) => (item.count > best.count ? item : best), trend[0]);
  const heatmapMax = Math.max(0, ...Array.from({ length: HEATMAP_DAYS }, (_, index) => dailyCounts.get(heatmapStart + index * DAY_MS) || 0));
  const heatmap = Array.from({ length: HEATMAP_DAYS }, (_, index) => {
    const timestamp = heatmapStart + index * DAY_MS;
    const count = dailyCounts.get(timestamp) || 0;
    const level = count === 0 || heatmapMax === 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((count / heatmapMax) * 4)));
    return {
      timestamp,
      label: formatChartDate(timestamp, true),
      count,
      level,
    };
  });
  const quickCount = items.filter((item) => item.source === 'quick').length;
  const projectCount = items.filter((item) => item.source === 'project').length;
  const models = countBy(
    items.filter((item) => String(item.model || item.modelId || '').trim()),
    (item) => item.model || item.modelId,
    '',
  );
  const prompts = countBy(
    items.filter((item) => String(item.prompt || '').trim()),
    (item) => String(item.prompt || '').trim(),
    '',
  ).map(({ name, count }) => ({ text: name, count }));

  return {
    total: items.length,
    last7Days: trend.slice(-7).reduce((sum, item) => sum + item.count, 0),
    quickCount,
    projectCount,
    quickShare: items.length > 0 ? Math.round((quickCount / items.length) * 100) : 0,
    models,
    prompts,
    trend,
    maxTrendCount,
    peak,
    heatmap,
  };
}

function createTrendChartHtml(data) {
  const width = 680;
  const height = 236;
  const padding = { top: 18, right: 18, bottom: 38, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxCount = Math.max(1, data.maxTrendCount);
  const points = data.trend.map((item, index) => {
    const x = padding.left + (index / Math.max(1, data.trend.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - (item.count / maxCount) * plotHeight;
    return { ...item, x, y };
  });
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const first = points[0];
  const last = points.at(-1);
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${(padding.top + plotHeight).toFixed(2)} L ${first.x.toFixed(2)} ${(padding.top + plotHeight).toFixed(2)} Z`;
  const labelIndexes = [0, 7, 14, 21, data.trend.length - 1];
  const gridLines = [0, 0.5, 1].map((ratio) => {
    const y = padding.top + plotHeight * ratio;
    const label = Math.round(maxCount * (1 - ratio));
    return `
      <line class="stats-chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
      <text class="stats-chart-axis-label" x="${padding.left - 8}" y="${y + 4}" text-anchor="end">${label}</text>`;
  }).join('');
  const xLabels = labelIndexes.map((index) => {
    const point = points[index];
    return `<text class="stats-chart-axis-label" x="${point.x}" y="${height - 12}" text-anchor="middle">${point.label}</text>`;
  }).join('');
  const dots = points.filter((point) => point.count > 0).map((point) => `
    <circle class="stats-trend-point" cx="${point.x}" cy="${point.y}" r="3.5">
      <title>${escapeHtml(point.label)}：${point.count} 张</title>
    </circle>`).join('');

  return `
    <svg class="stats-trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="近 30 天每日生成数量趋势图">
      <defs>
        <linearGradient id="stats-trend-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.32"></stop>
          <stop offset="100%" stop-color="var(--brand)" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      ${gridLines}
      <path class="stats-trend-area" d="${areaPath}"></path>
      <path class="stats-trend-line" d="${linePath}"></path>
      ${dots}
      ${xLabels}
    </svg>`;
}

function createDonutHtml(data) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const quickLength = data.total > 0 ? circumference * (data.quickCount / data.total) : 0;
  const projectLength = data.total > 0 ? circumference * (data.projectCount / data.total) : 0;
  return `
    <div class="stats-donut-layout">
      <div class="stats-donut" role="img" aria-label="快速生图 ${data.quickCount} 张，项目生图 ${data.projectCount} 张">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="stats-donut-track" cx="60" cy="60" r="${radius}"></circle>
          <circle class="stats-donut-segment is-quick" cx="60" cy="60" r="${radius}" stroke-dasharray="${quickLength} ${circumference}" stroke-dashoffset="0"></circle>
          <circle class="stats-donut-segment is-project" cx="60" cy="60" r="${radius}" stroke-dasharray="${projectLength} ${circumference}" stroke-dashoffset="-${quickLength}"></circle>
        </svg>
        <div class="stats-donut-center"><strong>${data.total}</strong><span>总计</span></div>
      </div>
      <div class="stats-donut-legend">
        <div><span class="stats-legend-dot is-quick"></span><span>快速生图</span><strong>${data.quickCount}</strong></div>
        <div><span class="stats-legend-dot is-project"></span><span>项目生图</span><strong>${data.projectCount}</strong></div>
      </div>
    </div>`;
}

export function createStatisticsDashboardHtml(data) {
  const maxModelCount = Math.max(1, ...data.models.map((item) => item.count));
  const maxPromptCount = Math.max(1, ...data.prompts.map((item) => item.count));
  const modelBars = data.models.slice(0, 7).map((item, index) => {
    const percentage = data.total > 0 ? Math.round((item.count / data.total) * 100) : 0;
    return `
      <div class="stats-model-bar-row">
        <div class="stats-model-bar-heading">
          <span class="stats-model-rank">${String(index + 1).padStart(2, '0')}</span>
          <span class="stats-model-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <strong>${item.count}</strong><small>${percentage}%</small>
        </div>
        <div class="stats-model-bar-track"><span style="width: ${(item.count / maxModelCount) * 100}%"></span></div>
      </div>`;
  }).join('');
  const promptCloud = data.prompts.slice(0, 10).map((item) => {
    const weight = 0.88 + (item.count / maxPromptCount) * 0.28;
    return `<span class="stats-prompt-bubble" style="--prompt-scale: ${weight.toFixed(2)}" title="使用 ${item.count} 次"><span>${escapeHtml(item.text)}</span><strong>${item.count}</strong></span>`;
  }).join('');
  const heatmapCells = data.heatmap.map((item) => `
    <span class="stats-heatmap-cell level-${item.level}" aria-label="${escapeHtml(item.label)}，${item.count} 张">
      <span class="sr-only">${escapeHtml(item.label)}：${item.count} 张</span>
    </span>`).join('');
  const peakText = data.peak?.count > 0 ? `${data.peak.label} 峰值 ${data.peak.count} 张` : '近 30 天暂无生成';

  return `
    <section class="stats-dashboard" aria-label="生成统计仪表盘">
      <div class="stats-summary-cards">
        <article class="stats-card is-primary">
          <span class="stats-card-eyebrow">累计产出</span>
          <strong class="stats-card-value">${data.total}</strong>
          <span class="stats-card-label">总生成量</span>
          <small>包含快速生图与项目版本</small>
        </article>
        <article class="stats-card">
          <span class="stats-card-eyebrow">近期活跃</span>
          <strong class="stats-card-value">${data.last7Days}</strong>
          <span class="stats-card-label">近 7 天生成</span>
          <small>${escapeHtml(peakText)}</small>
        </article>
        <article class="stats-card">
          <span class="stats-card-eyebrow">使用构成</span>
          <strong class="stats-card-value">${data.quickShare}%</strong>
          <span class="stats-card-label">快速生图占比</span>
          <small>项目生图 ${data.projectCount} 张</small>
        </article>
        <article class="stats-card">
          <span class="stats-card-eyebrow">模型覆盖</span>
          <strong class="stats-card-value">${data.models.length}</strong>
          <span class="stats-card-label">使用模型数</span>
          <small>${data.models[0] ? `最常用 ${escapeHtml(data.models[0].name)}` : '暂无模型记录'}</small>
        </article>
      </div>

      <div class="stats-dashboard-grid is-overview">
        <article class="stats-report-card stats-trend-panel">
          <header class="stats-report-header">
            <div><span class="stats-report-kicker">近 30 日活跃</span><h3>近 30 天生成趋势</h3></div>
            <span class="stats-report-meta">${data.trend.reduce((sum, item) => sum + item.count, 0)} 张</span>
          </header>
          ${createTrendChartHtml(data)}
        </article>
        <article class="stats-report-card stats-source-panel">
          <header class="stats-report-header">
            <div><span class="stats-report-kicker">来源分布</span><h3>来源构成</h3></div>
          </header>
          ${createDonutHtml(data)}
        </article>
      </div>

      <div class="stats-dashboard-grid is-detail">
        <article class="stats-report-card">
          <header class="stats-report-header">
            <div><span class="stats-report-kicker">模型排行</span><h3>模型使用排行</h3></div>
            <span class="stats-report-meta">前 7 名</span>
          </header>
          <div class="stats-model-bars">${modelBars || '<div class="stats-empty">暂无模型数据</div>'}</div>
        </article>
        <article class="stats-report-card">
          <header class="stats-report-header">
            <div><span class="stats-report-kicker">提示词信号</span><h3>高频提示词</h3></div>
            <span class="stats-report-meta">前 10 名</span>
          </header>
          <div class="stats-prompt-cloud">${promptCloud || '<div class="stats-empty">暂无提示词数据</div>'}</div>
        </article>
      </div>

      <article class="stats-report-card stats-heatmap-panel">
        <header class="stats-report-header">
          <div><span class="stats-report-kicker">创作连续性</span><h3>近 15 周活跃热力图</h3></div>
          <div class="stats-heatmap-legend"><span>少</span>${[0, 1, 2, 3, 4].map((level) => `<i class="level-${level}"></i>`).join('')}<span>多</span></div>
        </header>
        <div class="stats-heatmap-layout">
          <div class="stats-heatmap-days"><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span></div>
          <div class="stats-heatmap">${heatmapCells}</div>
        </div>
      </article>
    </section>`;
}

export function renderHistory(container) {
  const root = htmlToElement(`
    <div class="history-page">
      <div class="settings-tabs history-page-tabs">
        <button class="settings-tab is-active" data-history-tab="query">
          ${icon('search', 16)}<span>查询历史记录</span>
        </button>
        <button class="settings-tab" data-history-tab="stats">
          ${icon('bar-chart-2', 16)}<span>统计分析</span>
        </button>
      </div>

      <div class="history-tab-content" id="history-tab-query">
        <div class="history-filter-section">
          <div class="history-filter-row">
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
          </div>
          <div class="history-filter-actions">
            <button type="button" class="text-btn" id="history-batch-toggle">${icon('check-square', 14)}<span>批量管理</span></button>
          </div>
        </div>
        <div id="history-list">
          <div class="history-grid gallery-grid" data-history-grid></div>
          <div class="history-empty" data-history-empty hidden>
            ${icon('image', 40)}
            <span data-history-empty-text>还没有生成记录</span>
          </div>
          <div class="history-pagination" data-history-pagination hidden>
            <button class="btn btn-ghost btn-sm" type="button" data-history-page="previous">${icon('chevron-left', 14)}<span>上一页</span></button>
            <span class="history-page-label" data-history-page-label></span>
            <button class="btn btn-ghost btn-sm" type="button" data-history-page="next"><span>下一页</span>${icon('chevron-right', 14)}</button>
          </div>
        </div>
      </div>

      <div class="history-tab-content" id="history-tab-stats" hidden>
        <div id="stats-content"></div>
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
      : '还没有生成记录';

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

  function renderStats() {
    const allItems = getUnifiedHistory({
      history: getHistory(),
      projects: getProjects(),
    }, {
      page: 1,
      pageSize: Number.MAX_SAFE_INTEGER,
      query: '',
      source: 'all',
      projectId: '',
    }).items;
    statsContent.innerHTML = createStatisticsDashboardHtml(buildStatisticsData(allItems));
  }

  // Tab 切换
  let currentTab = 'query';
  const historyTabs = root.querySelectorAll('[data-history-tab]');
  const tabQuery = root.querySelector('#history-tab-query');
  const tabStats = root.querySelector('#history-tab-stats');
  const statsContent = root.querySelector('#stats-content');

  historyTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      currentTab = tab.getAttribute('data-history-tab');
      historyTabs.forEach((t) => t.classList.toggle('is-active', t.getAttribute('data-history-tab') === currentTab));
      tabQuery.hidden = currentTab !== 'query';
      tabStats.hidden = currentTab !== 'stats';
      if (currentTab === 'stats') renderStats();
    });
  });

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
    // 去掉了引导按钮
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
