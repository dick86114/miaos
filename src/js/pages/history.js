// 历史记录页
import { icon } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog, createKeyedListRenderer } from '../ui.js';
import { getHistory, clearHistory, formatRelativeTime } from '../store.js';
import { navigate } from '../router.js';

export function renderHistory(container) {
  const root = htmlToElement(`
    <div>
      <div class="history-header">
        <h1 class="history-title">历史记录</h1>
        <div class="history-toolbar">
          <div class="search-box">
            ${icon('search', 14)}
            <input type="text" class="search-input" id="search-input" placeholder="搜索提示词…" />
          </div>
          <button type="button" class="text-btn" id="btn-clear">${icon('trash-2', 14)}<span>清空历史</span></button>
        </div>
      </div>
      <div id="history-list">
        <div class="history-grid" data-history-grid></div>
        <div class="history-empty" data-history-empty hidden>
          ${icon('image', 40)}
          <span data-history-empty-text></span>
          <button class="btn btn-primary" type="button" data-history-go-generate>${icon('sparkles', 16)}<span>去生图</span></button>
        </div>
      </div>
    </div>
  `);
  mountPage(container, root);

  const searchInput = root.querySelector('#search-input');
  const listEl = root.querySelector('#history-list');
  const historyGrid = root.querySelector('[data-history-grid]');
  const emptyState = root.querySelector('[data-history-empty]');
  const emptyText = root.querySelector('[data-history-empty-text]');
  const goGenerate = root.querySelector('[data-history-go-generate]');
  const historyRenderer = createKeyedListRenderer(historyGrid, {
    getKey: (item) => item.id,
    getSignature: (item) => JSON.stringify(item),
    createNode: (item) => htmlToElement(historyCardHtml(item)),
    updateNode: (node, item) => updateHistoryCard(node, item),
  });

  function updateHistoryCard(node, item) {
    const next = htmlToElement(historyCardHtml(item));
    node.className = next.className;
    node.setAttribute('data-id', item.id);
    node.setAttribute('href', `#/detail/${item.id}`);
    node.replaceChildren(...Array.from(next.childNodes));
  }

  function renderView(items, query = '') {
    historyRenderer.render(items);
    const isEmpty = items.length === 0;
    historyGrid.hidden = isEmpty;
    emptyState.hidden = !isEmpty;
    emptyText.textContent = query ? '没有匹配的记录' : '还没有生成记录，去生图页创建第一张吧';
    goGenerate.hidden = Boolean(query);
  }

  function filterHistory() {
    const query = searchInput.value.trim().toLowerCase();
    const all = getHistory();
    const items = query
      ? all.filter((item) => item.prompt.toLowerCase().includes(query) || item.model.toLowerCase().includes(query))
      : all;
    renderView(items, query);
  }

  // 搜索只移动、创建或移除命中的卡片，不再重建整个历史列表与每张卡片的监听器。
  searchInput.addEventListener('input', filterHistory);

  root.querySelector('#btn-clear').addEventListener('click', async () => {
    if (getHistory().length === 0) {
      toast('历史记录已是空的', 'info');
      return;
    }
    if (!await confirmDialog('确定清空全部历史记录吗？此操作不可撤销。')) return;
    clearHistory();
    searchInput.value = '';
    renderView([], '');
    toast('已清空历史记录', 'success');
  });

  // 统一委托图片跳转与空状态操作，稳定卡片在筛选时无需重复绑定事件。
  listEl.addEventListener('click', (event) => {
    const card = event.target.closest?.('.history-card');
    if (card) {
      event.preventDefault();
      navigate(`/detail/${card.getAttribute('data-id')}`);
      return;
    }
    if (event.target.closest?.('[data-history-go-generate]')) navigate('/generate');
  });

  renderView(getHistory());
}

function historyCardHtml(item) {
  return `
    <a class="history-card" data-id="${item.id}" href="#/detail/${item.id}">
      <img src="${item.image}" alt="${escapeHtml(item.prompt)}" loading="lazy" />
      <div class="history-card-body">
        <p class="history-card-prompt">${escapeHtml(item.prompt)}</p>
        <div class="history-card-meta">
          <span class="history-card-model">${escapeHtml(item.model)}</span>
          <span class="history-card-time">${formatRelativeTime(item.createdAt)}</span>
        </div>
      </div>
    </a>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
