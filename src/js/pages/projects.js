// 项目列表页
import { icon, renderIcons } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog } from '../ui.js';
import {
  getProjects,
  createProject,
  deleteProject,
  getProjectCover,
  getProjectStats,
  getProviders,
  getDefaultProvider,
  getEnabledModels,
  formatRelativeTime,
} from '../store.js';
import { navigate } from '../router.js';

export function renderProjects(container) {
  renderView(container, getProjects());

  function renderView(container, items) {
    const cards = items.map((p) => projectCardHtml(p)).join('');
    const inner = cards
      ? `<div class="project-grid">${cards}</div>`
      : `<div class="history-empty">${icon('folder', 40)}<span>还没有项目，新建一个开始为某件事持续创作</span>
          <button class="btn btn-primary" id="go-create">${icon('plus', 16)}<span>新建项目</span></button>
        </div>`;

    const root = htmlToElement(`
      <div>
        <div class="projects-header">
          <div>
            <h1 class="projects-title">项目</h1>
            <p class="projects-subtitle">为同一件事持续创作，每个项目维护独立的提示词版本树</p>
          </div>
          <div class="projects-toolbar">
            <div class="search-box">
              ${icon('search', 14)}
              <input type="text" class="search-input" id="search-input" placeholder="搜索项目…" />
            </div>
            <button type="button" class="btn btn-primary" id="btn-create">${icon('plus', 16)}<span>新建项目</span></button>
          </div>
        </div>
        <div id="project-list">${inner}</div>
      </div>
    `);
    mountPage(container, root);

    const listEl = root.querySelector('#project-list');
    const searchInput = root.querySelector('#search-input');

    // 搜索过滤
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const all = getProjects();
      const filtered = q ? all.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) : all;
      listEl.innerHTML = filtered.length
        ? `<div class="project-grid">${filtered.map((p) => projectCardHtml(p)).join('')}</div>`
        : `<div class="history-empty">${icon('search', 40)}<span>没有匹配的项目</span></div>`;
      bindCards();
      renderIcons(listEl);
    });

    // 新建项目
    const onCreate = () => openCreateDialog(container, (project) => navigate(`/project/${project.id}`));
    root.querySelector('#btn-create').addEventListener('click', onCreate);
    const goCreate = root.querySelector('#go-create');
    if (goCreate) goCreate.addEventListener('click', onCreate);

    function bindCards() {
      listEl.querySelectorAll('.project-card').forEach((card) => {
        card.addEventListener('click', (e) => {
          // 点击删除按钮不触发跳转
          if (e.target.closest('.project-card-delete')) return;
          e.preventDefault();
          navigate(`/project/${card.getAttribute('data-id')}`);
        });
      });
      listEl.querySelectorAll('.project-card-delete').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const p = getProjects().find((x) => x.id === id);
          if (!p) return;
          if (!confirmDialog(`确定删除项目「${p.name}」吗？所有版本与图片将一并删除，此操作不可撤销。`)) return;
          deleteProject(id);
          toast('项目已删除', 'success');
          renderView(container, getProjects());
        });
      });
    }
    bindCards();
  }
}

function projectCardHtml(p) {
  const cover = getProjectCover(p);
  const stats = getProjectStats(p);
  const curVer = p.versions.find((v) => v.id === p.currentVersionId) || p.versions[0];
  const coverHtml = cover
    ? `<img src="${cover}" alt="${escapeHtml(p.name)}" class="project-cover" />`
    : `<div class="project-cover project-cover-placeholder">${icon('folder', 36)}</div>`;
  return `
    <a class="project-card" data-id="${p.id}" href="#/project/${p.id}">
      ${coverHtml}
      <button type="button" class="project-card-delete" data-id="${p.id}" title="删除项目">${icon('trash-2', 14)}</button>
      <div class="project-body">
        <span class="project-name">${escapeHtml(p.name)}</span>
        <p class="project-desc">${escapeHtml(p.description) || '<span class="project-desc-empty">暂无描述</span>'}</p>
        <div class="project-meta">
          <span class="meta-badge">${icon('git-branch', 12)}${stats.versionCount} 版本</span>
          <span class="meta-badge">${icon('image', 12)}${stats.imageCount} 张图</span>
          ${curVer && curVer.modelId ? `<span class="meta-badge">${icon('cpu', 12)}${escapeHtml(curVer.modelId)}</span>` : ''}
          <span class="meta-time">${formatRelativeTime(p.updatedAt)}</span>
        </div>
      </div>
    </a>`;
}

// 新建项目对话框
function openCreateDialog(container, onCreated) {
  const providers = getProviders().filter((p) => p.imageModels.some((m) => m.enabled));
  if (providers.length === 0) {
    toast('请先在「设置 → 模型提供商」中配置并启用图像模型', 'error');
    navigate('/settings');
    return;
  }
  const def = getDefaultProvider();
  const initialProviderId = (def && def.id) || providers[0].id;

  const providerOptions = providers
    .map((p) => `<option value="${p.id}" ${p.id === initialProviderId ? 'selected' : ''}>${escapeHtml(p.name)}${p.isDefault ? '（默认）' : ''}</option>`)
    .join('');

  const overlay = htmlToElement(`
    <div class="modal-overlay" id="create-project-modal">
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title">${icon('folder', 18)}<span>新建项目</span></span>
          <button type="button" class="modal-close" id="modal-close">${icon('x', 16)}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">项目名称</label>
            <input type="text" class="form-input" id="np-name" placeholder="例如：极简风景系列" maxlength="40" />
          </div>
          <div class="form-group">
            <label class="form-label">项目描述（选填）</label>
            <input type="text" class="form-input" id="np-desc" placeholder="一句话描述创作目标" maxlength="80" />
          </div>
          <div class="form-group">
            <label class="form-label">初始提示词（选填，可在项目内继续完善）</label>
            <textarea class="prompt-textarea" id="np-prompt" placeholder="描述你想生成的画面…" style="min-height:72px"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">供应商</label>
            <select class="form-select" id="np-provider">${providerOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">模型</label>
            <select class="form-select" id="np-model"></select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="modal-cancel">取消</button>
          <button type="button" class="btn btn-primary" id="modal-submit">${icon('plus', 16)}<span>创建项目</span></button>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
  renderIcons(overlay);

  const providerSelect = overlay.querySelector('#np-provider');
  const modelSelect = overlay.querySelector('#np-model');

  function updateModelSelect() {
    const pid = providerSelect.value;
    const enabledModels = getEnabledModels(pid);
    modelSelect.innerHTML = enabledModels.length
      ? enabledModels.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')
      : '<option value="">请先启用模型</option>';
    modelSelect.disabled = enabledModels.length === 0;
  }
  updateModelSelect();
  providerSelect.addEventListener('change', updateModelSelect);

  const nameInput = overlay.querySelector('#np-name');
  nameInput.focus();

  function close() {
    overlay.remove();
  }
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  overlay.querySelector('#modal-submit').addEventListener('click', () => {
    const name = nameInput.value.trim();
    const description = overlay.querySelector('#np-desc').value.trim();
    const prompt = overlay.querySelector('#np-prompt').value.trim();
    const providerId = providerSelect.value;
    const modelId = modelSelect.value;
    if (!name) {
      toast('请填写项目名称', 'error');
      nameInput.focus();
      return;
    }
    if (!providerId || !modelId) {
      toast('请选择供应商与模型', 'error');
      return;
    }
    const provider = getProviders().find((p) => p.id === providerId);
    const project = createProject({
      name,
      description,
      prompt,
      providerId,
      providerName: provider ? provider.name : '',
      modelId,
    });
    close();
    toast('项目已创建', 'success');
    onCreated(project);
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
