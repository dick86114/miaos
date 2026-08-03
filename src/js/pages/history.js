// 历史记录页
import { icon } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog } from '../ui.js';
import { getHistory, clearHistory, formatRelativeTime } from '../store.js';
import { navigate } from '../router.js';

export function renderHistory(container) {
  renderView(container, getHistory());

  function renderView(container, items) {
    const cards = items
      .map(
        (it) => `
        <a class="history-card" data-id="${it.id}" href="#/detail/${it.id}">
          <img src="${it.image}" alt="${escapeHtml(it.prompt)}" loading="lazy" />
          <div class="history-card-body">
            <p class="history-card-prompt">${escapeHtml(it.prompt)}</p>
            <div class="history-card-meta">
              <span class="history-card-model">${escapeHtml(it.model)}</span>
              <span class="history-card-time">${formatRelativeTime(it.createdAt)}</span>
            </div>
          </div>
        </a>`
      )
      .join('');

    const inner = cards
      ? `<div class="history-grid">${cards}</div>`
      : `<div class="history-empty">${icon('image', 40)}<span>还没有生成记录，去生图页创建第一张吧</span>
          <button class="btn btn-primary" id="go-generate">${icon('sparkles', 16)}<span>去生图</span></button>
        </div>`;

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
        <div id="history-list">${inner}</div>
      </div>
    `);
    mountPage(container, root);

    const searchInput = root.querySelector('#search-input');
    const listEl = root.querySelector('#history-list');

    // 搜索过滤
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const all = getHistory();
      const filtered = q ? all.filter((it) => it.prompt.toLowerCase().includes(q) || it.model.toLowerCase().includes(q)) : all;
      listEl.innerHTML = filtered
        .map(
          (it) => `
          <a class="history-card" data-id="${it.id}" href="#/detail/${it.id}">
            <img src="${it.image}" alt="${escapeHtml(it.prompt)}" loading="lazy" />
            <div class="history-card-body">
              <p class="history-card-prompt">${escapeHtml(it.prompt)}</p>
              <div class="history-card-meta">
                <span class="history-card-model">${escapeHtml(it.model)}</span>
                <span class="history-card-time">${formatRelativeTime(it.createdAt)}</span>
              </div>
            </div>
          </a>`
        )
        .join('') || `<div class="history-empty">${icon('search', 40)}<span>没有匹配的记录</span></div>`;
      // 重新渲染图标
      bindCards();
    });

    // 清空历史
    root.querySelector('#btn-clear').addEventListener('click', async () => {
      if (getHistory().length === 0) {
        toast('历史记录已是空的', 'info');
        return;
      }
      if (!await confirmDialog('确定清空全部历史记录吗？此操作不可撤销。')) return;
      clearHistory();
      toast('已清空历史记录', 'success');
      renderView(container, []);
    });

    function bindCards() {
      listEl.querySelectorAll('.history-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          e.preventDefault();
          navigate(`/detail/${card.getAttribute('data-id')}`);
        });
      });
    }
    bindCards();

    const goGen = root.querySelector('#go-generate');
    if (goGen) goGen.addEventListener('click', () => navigate('/generate'));
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
