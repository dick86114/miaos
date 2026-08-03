// 设置页面：通用设置 / 模型供应商 / 关于与更新
import { icon, renderIcons } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog, escapeHtml } from '../ui.js';
import { renderReleaseNotes } from '../release-notes.js';
import {
  getProviders,
  getProvider,
  saveProvider,
  deleteProvider,
  toggleImageModel,
  toggleTextModel,
  toggleVideoModel,
  addCustomModelByCat,
  removeModelByCat,
  setProviderModelsByCat,
  uid,
  testConnection,
  fetchModels,
  getDefaults,
  setDefaults,
} from '../store.js';

const PROVIDER_TYPES = [
  { value: 'grsai', label: 'Grsai', defaultEndpoint: 'https://grsaiapi.com/v1/api/generate', defaultCaps: ['image'] },
  { value: 'agnes-ai', label: 'Agnes AI', defaultEndpoint: 'https://apihub.agnes-ai.com/v1', defaultCaps: ['image', 'text', 'video'] },
  { value: 'deepseek', label: 'DeepSeek', defaultEndpoint: 'https://api.deepseek.com/v1', defaultCaps: ['text'] },
  { value: 'openai', label: 'OpenAI 兼容', defaultEndpoint: '', defaultCaps: ['image', 'text'] },
  { value: 'custom', label: '自定义', defaultEndpoint: '', defaultCaps: ['image'] },
];

const CATEGORIES = [
  { key: 'image', label: '生图模型', icon: 'image', color: 'image' },
  { key: 'text', label: '文本模型', icon: 'file-text', color: 'text' },
  { key: 'video', label: '生视频模型', icon: 'video', color: 'video' },
 ];

function toProviderMetadata(form) {
  return {
    id: form.id,
    name: form.name,
    type: form.type,
    endpoint: form.endpoint,
    capabilities: [...form.capabilities],
    imageModels: form.imageModels.map((model) => ({ ...model })),
    textModels: form.textModels.map((model) => ({ ...model })),
    videoModels: form.videoModels.map((model) => ({ ...model })),
  };
}

const UPDATE_STATE_TEXT = {
  idle: '尚未检查',
  checking: '正在检查更新…',
  available: '发现新版本',
  'not-available': '当前已是最新版本',
  error: '检查时出错',
};

export function renderSettings(container) {
  let pageState = {
    tab: 'general', // general | providers | about
    selectedProviderId: null,
    isAddingProvider: false,
    // 编辑表单临时状态
    form: null, // { id, name, type, endpoint, hasApiKey, capabilities, imageModels, textModels, videoModels }
    testStatus: null, // { ok, message, warning? }
    testLoading: false,
    fetchLoadingCat: null, // 当前正在获取模型的分类：'image' | 'text' | 'video' | null
    keyVisible: false, // API Key 是否显示明文
    // 更新
    update: {
      current: null,
      latest: null,
      state: 'idle',
      payload: null,
    },
    // 默认模型
    defaults: getDefaults(),
  };

  const root = htmlToElement(`<div class="settings-wrap"><div class="settings-layout"></div></div>`);
  mountPage(container, root);

  refresh();
  loadVersion();
  bindUpdateEvents();

  function getInner() { return root.querySelector('.settings-layout'); }

  function refresh() {
    const providers = getProviders();
    // 如果没有选中的供应商，选中第一个
    if (!pageState.selectedProviderId && providers.length && !pageState.isAddingProvider) {
      pageState.selectedProviderId = providers[0].id;
    }
    // 获取当前选中的供应商（如果不是新增模式）
    const selectedProvider = pageState.isAddingProvider ? null : (pageState.selectedProviderId ? getProvider(pageState.selectedProviderId) : null);
    // 初始化表单：新增模式初始化为空，编辑模式用供应商数据填充
    if (!pageState.form) {
      if (pageState.isAddingProvider) {
        pageState.form = {
          id: uid('p'),
          name: '',
          type: 'grsai',
          endpoint: 'https://grsaiapi.com/v1/api/generate',
          hasApiKey: false,
          capabilities: ['image'],
          imageModels: [],
          textModels: [],
          videoModels: [],
        };
      } else if (selectedProvider) {
        // 用已有供应商数据填充表单（深拷贝避免直接修改store数据）
        pageState.form = {
          id: selectedProvider.id,
          name: selectedProvider.name,
          type: selectedProvider.type,
          endpoint: selectedProvider.endpoint,
          hasApiKey: !!selectedProvider.hasApiKey,
          capabilities: [...(selectedProvider.capabilities || [])],
          imageModels: (selectedProvider.imageModels || []).map((m) => ({ ...m })),
          textModels: (selectedProvider.textModels || []).map((m) => ({ ...m })),
          videoModels: (selectedProvider.videoModels || []).map((m) => ({ ...m })),
        };
      }
    }
    const inner = getInner();
    // 保存滚动位置（避免 refresh 后跳到顶部）
    const scrollContainer = inner.querySelector('.settings-content') || inner;
    const savedScrollTop = scrollContainer.scrollTop || 0;
    const savedScrollLeft = scrollContainer.scrollLeft || 0;
    inner.innerHTML = renderLayout(providers);
    renderIcons(inner);
    // 恢复滚动位置
    const newScrollContainer = inner.querySelector('.settings-content') || inner;
    newScrollContainer.scrollTop = savedScrollTop;
    newScrollContainer.scrollLeft = savedScrollLeft;
    bindEvents();
  }

  function renderLayout(providers) {
    const { tab } = pageState;
    return `
      <div class="settings-tabs">
        <button class="settings-tab ${tab === 'general' ? 'is-active' : ''}" data-tab="general">
          ${icon('sliders', 16)}<span>通用</span>
        </button>
        <button class="settings-tab ${tab === 'providers' ? 'is-active' : ''}" data-tab="providers">
          ${icon('server', 16)}<span>模型供应商</span>
        </button>
        <button class="settings-tab ${tab === 'about' ? 'is-active' : ''}" data-tab="about">
          ${icon('info', 16)}<span>关于与更新</span>
        </button>
      </div>
      <div class="settings-content">
        ${tab === 'general' ? renderGeneral(providers) : ''}
        ${tab === 'providers' ? renderProviders(providers) : ''}
        ${tab === 'about' ? renderAbout() : ''}
      </div>
    `;
  }

  // ========== 通用设置 ==========
  function renderGeneral(providers) {
    const d = pageState.defaults;

    function modelOptions(cat) {
      const key = cat === 'image' ? 'defaultImage' : cat === 'text' ? 'defaultText' : 'defaultVideo';
      const selectedPid = d[key + 'Provider'];
      const selectedMid = d[key + 'Model'];
      const options = [];
      providers.forEach((p) => {
        const models = cat === 'image' ? p.imageModels : cat === 'text' ? p.textModels : p.videoModels;
        const enabled = models.filter((m) => m.enabled);
        if (enabled.length === 0) return;
        options.push(`<optgroup label="${escapeHtml(p.name)}">`);
        enabled.forEach((m) => {
          const selected = p.id === selectedPid && m.id === selectedMid ? 'selected' : '';
          options.push(`<option value="${p.id}::${m.id}" ${selected}>${escapeHtml(m.name)}</option>`);
        });
        options.push('</optgroup>');
      });
      if (options.length === 0) {
        return `<option value="">（暂无可用模型，请先在「模型供应商」中配置）</option>`;
      }
      return options.join('');
    }

    return `
      <div class="page-header">
        <h1 class="page-title">通用设置</h1>
        <p class="page-subtitle">配置默认使用的模型和偏好</p>
      </div>

      <div class="settings-card">
        <div class="settings-section-header">
          <div class="settings-section-title">${icon('cpu', 16)}<span>默认模型</span></div>
        </div>
        <div class="form-group">
          <label class="form-label">默认生图模型</label>
          <select class="form-select" id="def-image">${modelOptions('image')}</select>
          <div class="form-hint">快速生图和项目生图默认使用此模型</div>
        </div>
        <div class="form-group">
          <label class="form-label">默认文本模型</label>
          <select class="form-select" id="def-text">${modelOptions('text')}</select>
          <div class="form-hint">用于「优化提示词」功能</div>
        </div>
        <div class="form-group">
          <label class="form-label">默认生视频模型</label>
          <select class="form-select" id="def-video" disabled>
            <option value="">（即将支持）</option>
          </select>
          <div class="form-hint">视频生成功能开发中</div>
        </div>
      </div>
    `;
  }

  // ========== 模型供应商 ==========
  function renderProviders(providers) {
    const selected = pageState.isAddingProvider ? null : (pageState.selectedProviderId ? getProvider(pageState.selectedProviderId) : null);
    const form = pageState.form;

    return `
      <div class="page-header">
        <h1 class="page-title">模型供应商</h1>
        <p class="page-subtitle">配置大模型 API 端点和密钥，管理可用模型</p>
      </div>
      <div class="providers-layout">
        <div class="providers-list-panel">
          <button class="provider-add-btn" id="btn-add-provider" type="button">
            ${icon('plus', 14)}<span>添加供应商</span>
          </button>
          <div class="providers-list">
            ${providers.map((p) => {
              const isActive = !pageState.isAddingProvider && p.id === pageState.selectedProviderId;
              const imgCount = p.imageModels.filter((m) => m.enabled).length;
              const txtCount = p.textModels.filter((m) => m.enabled).length;
              const vidCount = p.videoModels.filter((m) => m.enabled).length;
              const totalEnabled = imgCount + txtCount + vidCount;
              return `
                <div class="provider-list-item ${isActive ? 'is-active' : ''}" data-pid="${p.id}">
                  <div class="provider-list-item-main">
                    <div class="provider-list-name">${escapeHtml(p.name)}</div>
                    <div class="provider-list-meta">
                      <span class="provider-type-tag-mini">${escapeHtml(p.type)}</span>
                      ${totalEnabled > 0 ? `<span class="provider-model-count">${totalEnabled} 个模型</span>` : '<span class="provider-model-count empty">未配置模型</span>'}
                    </div>
                  </div>
                  ${isActive ? icon('chevron-right', 14) : ''}
                </div>
              `;
            }).join('')}
            ${providers.length === 0 ? '<div class="providers-empty">还没有供应商，点击上方添加</div>' : ''}
          </div>
        </div>
        <div class="provider-detail-panel">
          ${pageState.isAddingProvider || selected ? renderProviderForm(selected) : `
            <div class="provider-detail-empty">
              ${icon('server', 32)}
              <p>选择一个供应商查看详情，或添加新供应商</p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function renderProviderForm(existing) {
    const f = pageState.form;
    const isNew = !existing;
    const testStatus = pageState.testStatus;
    const testLoading = pageState.testLoading;

    return `
      <div class="provider-form-scroll">
        <div class="provider-form-header">
          <div>
            <h2 class="provider-form-title">${isNew ? '添加供应商' : '编辑供应商'}</h2>
            <p class="provider-form-subtitle">填写 API 信息，测试连接后获取模型列表</p>
          </div>
          <div class="provider-form-actions-top">
            ${!isNew ? `<button class="btn btn-ghost btn-sm danger" id="btn-delete-provider" type="button">${icon('trash-2', 12)}<span>删除</span></button>` : ''}
          </div>
        </div>

        <!-- 步骤 1：基础信息 -->
        <div class="form-step">
          <div class="form-step-header">
            <span class="form-step-num">1</span>
            <span class="form-step-label">填写基础信息</span>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="pf-name">供应商名称</label>
              <input class="form-input" id="pf-name" type="text" placeholder="例：Grsai、DeepSeek" value="${escapeAttr(f.name || '')}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="pf-type">API 类型</label>
              <select class="form-select" id="pf-type">
                ${PROVIDER_TYPES.map((t) => `<option value="${t.value}" ${f.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="pf-endpoint">API 地址</label>
            <input class="form-input" id="pf-endpoint" type="text" placeholder="https://api.example.com/v1" value="${escapeAttr(f.endpoint || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="pf-key">API Key</label>
            <div class="input-with-action">
              <input class="form-input" id="pf-key" type="${pageState.keyVisible ? 'text' : 'password'}" placeholder="${f.hasApiKey ? '已安全保存，留空表示不修改' : 'sk-...（可选，公开接口可留空）'}" value="" />
              <button class="input-action-btn" type="button" id="btn-toggle-key" title="${pageState.keyVisible ? '隐藏密钥' : '显示密钥'}">
                ${icon(pageState.keyVisible ? 'eye-off' : 'eye', 16)}
              </button>
            </div>
            <div class="form-hint">密钥通过系统钥匙串加密保存在本机，不会写入应用状态</div>
          </div>

          <!-- 能力选择 -->
          <div class="form-group">
            <label class="form-label">支持的功能</label>
            <div class="capability-toggles">
              ${CATEGORIES.map((c) => `
                <label class="cap-toggle ${f.capabilities.includes(c.key) ? 'is-on' : ''}" data-cat="${c.key}">
                  <input type="checkbox" ${f.capabilities.includes(c.key) ? 'checked' : ''} />
                  ${icon(c.icon, 14)}<span>${c.label}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- 步骤 2：测试连接 -->
        <div class="form-step">
          <div class="form-step-header">
            <span class="form-step-num">2</span>
            <span class="form-step-label">测试连接</span>
            <span class="form-step-optional">（可选）</span>
          </div>
          <div class="test-connection-row">
            <button class="btn btn-secondary" id="btn-test" type="button" ${testLoading ? 'disabled' : ''}>
              ${testLoading ? icon('loader', 14) : icon('plug', 14)}<span>${testLoading ? '测试中…' : '测试连接'}</span>
            </button>
            ${testStatus ? `
              <span class="test-result ${testStatus.ok ? 'is-ok' : 'is-fail'}">
                ${testStatus.ok ? icon('check-circle', 14) : icon('x-circle', 14)}
                <span>${escapeHtml(testStatus.message)}</span>
              </span>
            ` : ''}
          </div>
        </div>

        <!-- 步骤 3：模型配置 -->
        <div class="form-step">
          <div class="form-step-header">
            <span class="form-step-num">3</span>
            <span class="form-step-label">配置模型</span>
          </div>

          ${f.capabilities.length === 0 ? '<div class="form-hint">请先在上方勾选该供应商支持的功能</div>' : ''}

          ${CATEGORIES.filter((c) => f.capabilities.includes(c.key)).map((c) => {
            const key = c.key + 'Models';
            const models = f[key] || [];
            const enabledCount = models.filter((m) => m.enabled).length;
            return `
              <div class="model-category-section" data-cat="${c.key}">
                <div class="model-cat-header">
                  <div class="model-cat-title">
                    ${icon(c.icon, 14)}<span>${c.label}</span>
                    ${models.length > 0 ? `<span class="model-cat-count">${enabledCount}/${models.length} 已启用</span>` : ''}
                  </div>
                  <div class="model-cat-actions">
                    <button class="btn btn-ghost btn-sm" type="button" data-act="fetch-models" data-cat="${c.key}" ${(pageState.fetchLoadingCat === c.key) ? 'disabled' : ''}>
                      ${(pageState.fetchLoadingCat === c.key) ? icon('loader', 12) : icon('refresh-cw', 12)}<span>获取模型</span>
                    </button>
                    <button class="btn btn-ghost btn-sm" type="button" data-act="show-add-model" data-cat="${c.key}">
                      ${icon('plus', 12)}<span>添加模型</span>
                    </button>
                  </div>
                </div>
                ${models.length > 0 ? `
                  <div class="model-checklist">
                    ${models.map((m) => `
                      <label class="model-check-item" data-mid="${m.id}">
                        <input type="checkbox" ${m.enabled ? 'checked' : ''} data-act="toggle-model" data-cat="${c.key}" data-mid="${m.id}" />
                        <span class="model-check-name">${escapeHtml(m.name)}</span>
                        <button class="icon-btn mini" type="button" data-act="remove-model" data-cat="${c.key}" data-mid="${m.id}" title="移除">${icon('x', 10)}</button>
                      </label>
                    `).join('')}
                  </div>
                ` : `
                  <div class="models-empty-hint">暂无模型，点击「获取模型」自动拉取，或手动添加</div>
                `}
                <div class="add-model-row" data-cat="${c.key}" style="display:none;">
                  <input type="text" class="form-input mini-input" placeholder="输入模型名称，如 gpt-image-2、deepseek-chat" data-add-input data-cat="${c.key}" />
                  <button class="btn btn-primary btn-sm" type="button" data-act="confirm-add" data-cat="${c.key}">${icon('plus', 12)}<span>添加</span></button>
                  <button class="btn btn-ghost btn-sm" type="button" data-act="cancel-add" data-cat="${c.key}">${icon('x', 12)}</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- 步骤 4：保存 -->
        <div class="form-step form-step-save">
          <div class="form-actions">
            <button class="btn btn-primary" id="btn-save-provider" type="button">
              ${icon('save', 14)}<span>${isNew ? '保存供应商' : '保存修改'}</span>
            </button>
            ${isNew ? `<button class="btn btn-ghost" id="btn-cancel-add" type="button">取消</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // ========== 关于与更新 ==========
  function renderAbout() {
    const u = pageState.update;
    return `
      <div class="page-header">
        <h1 class="page-title">关于与更新</h1>
        <p class="page-subtitle">应用版本信息与自动更新</p>
      </div>

      <div class="settings-card">
        <div class="settings-section-header">
          <div class="settings-section-title">${icon('info', 16)}<span>关于 妙生</span></div>
        </div>
        <div class="settings-about">
          <div class="settings-about-logo"><img src="assets/logo.png" alt="妙生" /></div>
          <div class="settings-about-info">
            <div class="settings-about-name">妙生 · miaos</div>
            <div class="settings-about-version">当前版本：<span id="cur-ver">—</span></div>
            <div class="settings-about-desc">本地运行的 AI 生图工具，支持 Grsai 与 OpenAI 兼容供应商。</div>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <div class="settings-section-header">
          <div class="settings-section-title">${icon('refresh-cw', 16)}<span>软件更新</span></div>
          <div id="update-state-chip" class="tag tag-soft">${UPDATE_STATE_TEXT[u.state]}</div>
        </div>
        <div class="update-panel">
          <div class="update-row">
            <div class="update-latest-info">
              <div class="update-label">最新版本</div>
              <div id="latest-ver" class="update-ver">—</div>
              <div id="latest-date" class="update-hint"></div>
            </div>
            <div class="update-actions">
              <button class="btn btn-primary" id="btn-check" type="button">
                ${icon('refresh-cw', 14)}<span>检查更新</span>
              </button>
              <button class="btn btn-primary" id="btn-download" type="button" style="display:none;">
                ${icon('external-link', 14)}<span>前往 GitHub 下载</span>
              </button>
            </div>
          </div>
          <div id="update-notes" class="update-notes" style="display:none;">
            <div class="update-notes-title">更新说明</div>
            <div id="update-notes-body" class="update-notes-body"></div>
          </div>
          <div id="update-error" class="update-error" style="display:none;">
            ${icon('alert-circle', 14)}<span id="update-error-msg">—</span>
          </div>
        </div>
      </div>
    `;
  }

  // ========== 事件绑定 ==========
  function bindEvents() {
    const inner = getInner();

    // Tab 切换
    inner.querySelectorAll('.settings-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        pageState.tab = btn.getAttribute('data-tab');
        pageState.isAddingProvider = false;
        pageState.form = null;
        pageState.testStatus = null;
        refresh();
      });
    });

    if (pageState.tab === 'general') {
      bindGeneralEvents();
    } else if (pageState.tab === 'providers') {
      bindProviderEvents();
    } else if (pageState.tab === 'about') {
      bindAboutEvents();
    }
  }

  function bindGeneralEvents() {
    const inner = getInner();
    const saveDef = (cat) => {
      const sel = inner.querySelector('#def-' + cat);
      if (!sel) return;
      const val = sel.value;
      if (!val || !val.includes('::')) return;
      const [pid, mid] = val.split('::');
      const patch = {};
      const cap = cat === 'image' ? 'Image' : cat === 'text' ? 'Text' : 'Video';
      patch['default' + cap + 'Provider'] = pid;
      patch['default' + cap + 'Model'] = mid;
      setDefaults(patch);
      pageState.defaults = getDefaults();
      toast('默认模型已保存', 'success');
    };
    const imgSel = inner.querySelector('#def-image');
    const txtSel = inner.querySelector('#def-text');
    if (imgSel) imgSel.addEventListener('change', () => saveDef('image'));
    if (txtSel) txtSel.addEventListener('change', () => saveDef('text'));
  }

  function bindProviderEvents() {
    const inner = getInner();

    // 添加供应商
    const addBtn = inner.querySelector('#btn-add-provider');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        pageState.isAddingProvider = true;
        pageState.selectedProviderId = null;
        pageState.form = null;
        pageState.testStatus = null;
        refresh();
      });
    }

    // 选中已有供应商
    inner.querySelectorAll('.provider-list-item').forEach((item) => {
      item.addEventListener('click', () => {
        const pid = item.getAttribute('data-pid');
        pageState.selectedProviderId = pid;
        pageState.isAddingProvider = false;
        // 加载表单数据
        const p = getProvider(pid);
        pageState.form = {
          id: p.id,
          name: p.name,
          type: p.type,
          endpoint: p.endpoint,
          hasApiKey: !!p.hasApiKey,
          capabilities: [...p.capabilities],
          imageModels: p.imageModels.map((m) => ({ ...m })),
          textModels: p.textModels.map((m) => ({ ...m })),
          videoModels: p.videoModels.map((m) => ({ ...m })),
        };
        pageState.testStatus = p.lastTestResult || null;
        refresh();
      });
    });

    // 有表单时绑定表单事件
    if (pageState.form) {
      bindFormEvents();
    }
  }

  function bindFormEvents() {
    const inner = getInner();
    const f = pageState.form;

    // 同步输入到 form 状态
    const syncInput = (id, key) => {
      const el = inner.querySelector('#' + id);
      if (el) el.addEventListener('input', () => { f[key] = el.value; });
    };
    const syncSelect = (id, key) => {
      const el = inner.querySelector('#' + id);
      if (el) el.addEventListener('change', () => {
        f[key] = el.value;
        // 类型切换时自动填充默认地址和功能
        if (key === 'type') {
          const pt = PROVIDER_TYPES.find((t) => t.value === el.value);
          if (pt) {
            if (pt.defaultEndpoint && (!f.endpoint || f.endpoint === 'https://grsaiapi.com/v1/api/generate')) {
              f.endpoint = pt.defaultEndpoint;
            }
            f.capabilities = [...pt.defaultCaps];
          }
          refresh();
        }
      });
    };

    syncInput('pf-name', 'name');
    syncInput('pf-endpoint', 'endpoint');
    syncSelect('pf-type', 'type');

    // API Key 显示/隐藏切换（不刷新页面，直接操作DOM）
    const toggleKeyBtn = inner.querySelector('#btn-toggle-key');
    const keyInput = inner.querySelector('#pf-key');
    if (toggleKeyBtn && keyInput) {
      toggleKeyBtn.addEventListener('click', () => {
        pageState.keyVisible = !pageState.keyVisible;
        keyInput.type = pageState.keyVisible ? 'text' : 'password';
        toggleKeyBtn.title = pageState.keyVisible ? '隐藏密钥' : '显示密钥';
        toggleKeyBtn.innerHTML = icon(pageState.keyVisible ? 'eye-off' : 'eye', 16);
        renderIcons(toggleKeyBtn);
        // 保持焦点在输入框
        keyInput.focus();
        // 将光标移到末尾
        const len = keyInput.value.length;
        keyInput.setSelectionRange(len, len);
      });
    }

    // 能力勾选
    inner.querySelectorAll('.cap-toggle').forEach((tog) => {
      tog.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = tog.getAttribute('data-cat');
        const idx = f.capabilities.indexOf(cat);
        if (idx >= 0) {
          f.capabilities.splice(idx, 1);
        } else {
          f.capabilities.push(cat);
        }
        refresh();
      });
    });

    // 测试连接
    const testBtn = inner.querySelector('#btn-test');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        const endpointInput = inner.querySelector('#pf-endpoint');
        const keyInput = inner.querySelector('#pf-key');
        const nameInput = inner.querySelector('#pf-name');
        const typeInput = inner.querySelector('#pf-type');
        const typedApiKey = keyInput?.value || '';
        const providerData = {
          name: nameInput?.value || f.name,
          type: typeInput?.value || f.type,
          endpoint: endpointInput?.value || f.endpoint,
          ...(pageState.isAddingProvider ? { apiKeyOverride: typedApiKey } : { providerId: f.id }),
        };
        if (!providerData.endpoint) { toast('请先填写 API 地址', 'error'); return; }
        pageState.testLoading = true;
        pageState.testStatus = null;
        refresh();
        try {
          const result = await testConnection(providerData);
          const hasWarning = result && result.warning;
          pageState.testStatus = { ok: true, message: hasWarning ? result.warning : '连接成功' };
          toast(hasWarning ? '连接测试完成：' + result.warning : '连接测试成功', hasWarning ? 'info' : 'success');
        } catch (err) {
          pageState.testStatus = { ok: false, message: err.message || '连接失败' };
          toast('连接失败：' + err.message, 'error');
        } finally {
          pageState.testLoading = false;
          // 更新当前表单中的 endpoint/type，密钥不进入表单状态。
          f.endpoint = providerData.endpoint;
          f.type = providerData.type;
          refresh();
        }
      });
    }

    // 模型操作
    // 获取模型
    inner.querySelectorAll('[data-act="fetch-models"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const cat = btn.getAttribute('data-cat');
        const endpointInput = inner.querySelector('#pf-endpoint');
        const keyInput = inner.querySelector('#pf-key');
        const typeInput = inner.querySelector('#pf-type');
        const typedApiKey = keyInput?.value || '';
        const providerData = {
          type: typeInput?.value || f.type,
          endpoint: endpointInput?.value || f.endpoint,
          ...(pageState.isAddingProvider ? { apiKeyOverride: typedApiKey } : { providerId: f.id }),
        };
        if (!providerData.endpoint) { toast('请先填写 API 地址', 'error'); return; }
        pageState.fetchLoadingCat = cat;
        refresh();
        try {
          const models = await fetchModels(providerData, cat);
          if (models && models.length) {
            const key = cat + 'Models';
            // 合并已有启用状态
            const existing = new Map((f[key] || []).map((m) => [m.id, m.enabled]));
            f[key] = models.map((m) => ({
              id: m.id,
              name: m.name || m.id,
              enabled: existing.has(m.id) ? existing.get(m.id) : true,
            }));
            toast(`获取到 ${models.length} 个${cat === 'image' ? '生图' : cat === 'text' ? '文本' : '视频'}模型`, 'success');
          } else {
            toast('未获取到模型，可手动添加', 'info');
          }
        } catch (err) {
          toast('获取失败：' + err.message, 'error');
        } finally {
          pageState.fetchLoadingCat = null;
          refresh();
        }
      });
    });

    // 勾选模型
    inner.querySelectorAll('[data-act="toggle-model"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const cat = cb.getAttribute('data-cat');
        const mid = cb.getAttribute('data-mid');
        const key = cat + 'Models';
        const m = (f[key] || []).find((x) => x.id === mid);
        if (m) m.enabled = cb.checked;
        // 不刷新，只更新计数
        const catSection = inner.querySelector(`.model-category-section[data-cat="${cat}"]`);
        const countEl = catSection?.querySelector('.model-cat-count');
        if (countEl) {
          const enabled = (f[key] || []).filter((x) => x.enabled).length;
          const total = (f[key] || []).length;
          countEl.textContent = `${enabled}/${total} 已启用`;
        }
      });
    });

    // 移除模型
    inner.querySelectorAll('[data-act="remove-model"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = btn.getAttribute('data-cat');
        const mid = btn.getAttribute('data-mid');
        const key = cat + 'Models';
        f[key] = (f[key] || []).filter((m) => m.id !== mid);
        refresh();
      });
    });

    // 显示添加模型行
    inner.querySelectorAll('[data-act="show-add-model"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        const row = inner.querySelector(`.add-model-row[data-cat="${cat}"]`);
        if (row) {
          row.style.display = 'flex';
          row.querySelector('[data-add-input]').focus();
        }
      });
    });

    // 取消添加模型
    inner.querySelectorAll('[data-act="cancel-add"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        const row = inner.querySelector(`.add-model-row[data-cat="${cat}"]`);
        if (row) row.style.display = 'none';
      });
    });

    // 确认添加模型
    inner.querySelectorAll('[data-act="confirm-add"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-cat');
        const row = inner.querySelector(`.add-model-row[data-cat="${cat}"]`);
        const input = row?.querySelector('[data-add-input]');
        const name = input?.value.trim();
        if (!name) { toast('请输入模型名称', 'error'); return; }
        const key = cat + 'Models';
        if (!f[key]) f[key] = [];
        if (f[key].some((m) => m.id === name)) {
          const m = f[key].find((x) => x.id === name);
          m.enabled = true;
        } else {
          f[key].push({ id: name, name, enabled: true });
        }
        toast('模型已添加', 'success');
        refresh();
      });
      // Enter 键添加
      const row = btn.closest('.add-model-row');
      const input = row?.querySelector('[data-add-input]');
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') btn.click();
        });
      }
    });

    // 保存供应商
    const saveBtn = inner.querySelector('#btn-save-provider');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        // 同步输入值
        const nameInput = inner.querySelector('#pf-name');
        const endpointInput = inner.querySelector('#pf-endpoint');
        const keyInput = inner.querySelector('#pf-key');
        const typeInput = inner.querySelector('#pf-type');
        const isNewProvider = pageState.isAddingProvider;
        const previousProvider = isNewProvider ? null : getProvider(f.id);
        f.name = (nameInput?.value || f.name || '').trim();
        f.endpoint = (endpointInput?.value || f.endpoint || '').trim();
        const typedApiKey = keyInput?.value || '';
        f.type = typeInput?.value || f.type;

        if (!f.name) { toast('请填写供应商名称', 'error'); nameInput?.focus(); return; }
        if (!f.endpoint) { toast('请填写 API 地址', 'error'); endpointInput?.focus(); return; }
        if (f.capabilities.length === 0) { toast('请至少勾选一项支持的功能', 'error'); return; }
        // 检查每个已勾选的分类是否有模型
        for (const c of CATEGORIES) {
          if (f.capabilities.includes(c.key)) {
            const key = c.key + 'Models';
            const enabledModels = (f[key] || []).filter((m) => m.enabled);
            if (enabledModels.length === 0) {
              toast(`${c.label}至少需要启用一个模型`, 'error');
              return;
            }
          }
        }

        const metadata = toProviderMetadata(f);
        const secretResult = await window.api?.setProviderSecret?.(f.id, typedApiKey, metadata, { transactional: true });
        if (!secretResult || !secretResult.ok || !secretResult.transactionId) {
          const rollback = secretResult?.transactionId
            ? await window.api?.completeProviderSecretTransaction?.('rollback', secretResult.transactionId)
            : { ok: true };
          const message = !rollback || !rollback.ok || String(secretResult?.code || '').startsWith('SECRET_VAULT_APPLIED_')
            ? '配置状态不确定，请重试/检查'
            : '密钥保存失败：' + (secretResult?.error || '系统钥匙串不可用');
          toast(message, 'error');
          return;
        }
        let localSaved = false;
        try {
          if (typedApiKey) f.hasApiKey = true;
          const saved = saveProvider({
            id: f.id,
            name: f.name,
            type: f.type,
            endpoint: f.endpoint,
            hasApiKey: !!f.hasApiKey,
            capabilities: f.capabilities,
            imageModels: f.imageModels,
            textModels: f.textModels,
            videoModels: f.videoModels,
            lastTestResult: pageState.testStatus,
          });
          localSaved = true;
          const committed = await window.api?.completeProviderSecretTransaction?.('commit', secretResult.transactionId);
          if (!committed || !committed.ok) throw new Error(committed?.error || '密钥事务提交失败');
          pageState.selectedProviderId = saved.id;
        } catch (error) {
          const rollback = await window.api?.completeProviderSecretTransaction?.('rollback', secretResult.transactionId);
          if (!rollback || !rollback.ok) {
            toast('配置状态不确定，请重试/检查', 'error');
            return;
          }
          if (localSaved) {
            try {
              if (previousProvider) saveProvider(previousProvider);
              else deleteProvider(f.id);
            } catch (_) {}
          }
          toast('供应商保存失败：' + (error.message || '本地状态写入失败'), 'error');
          return;
        }
        pageState.isAddingProvider = false;
        pageState.form = null;
        pageState.testStatus = null;
        pageState.defaults = getDefaults();
        toast(isNewProvider ? '供应商已保存' : '供应商已更新', 'success');
        refresh();
      });
    }

    // 删除供应商
    const delBtn = inner.querySelector('#btn-delete-provider');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (confirmDialog(`确定删除供应商「${f.name}」吗？该供应商下的所有模型配置将被移除。`)) {
          const previousProvider = getProvider(f.id);
          const secretResult = await window.api?.deleteProviderSecret?.(f.id, { transactional: true });
          if (!secretResult || !secretResult.ok || !secretResult.transactionId) {
            const rollback = secretResult?.transactionId
              ? await window.api?.completeProviderSecretTransaction?.('rollback', secretResult.transactionId)
              : { ok: true };
            const message = !rollback || !rollback.ok || String(secretResult?.code || '').startsWith('SECRET_VAULT_APPLIED_')
              ? '配置状态不确定，请重试/检查'
              : '密钥删除失败：' + (secretResult?.error || '系统钥匙串不可用');
            toast(message, 'error');
            return;
          }
          let localDeleted = false;
          try {
            deleteProvider(f.id);
            localDeleted = true;
            const committed = await window.api?.completeProviderSecretTransaction?.('commit', secretResult.transactionId);
            if (!committed || !committed.ok) throw new Error(committed?.error || '密钥事务提交失败');
          } catch (error) {
            const rollback = await window.api?.completeProviderSecretTransaction?.('rollback', secretResult.transactionId);
            if (!rollback || !rollback.ok) {
              toast('配置状态不确定，请重试/检查', 'error');
              return;
            }
            if (localDeleted && previousProvider) {
              try { saveProvider(previousProvider); } catch (_) {}
            }
            toast('供应商删除失败：' + (error.message || '本地状态写入失败'), 'error');
            return;
          }
          pageState.selectedProviderId = null;
          pageState.form = null;
          pageState.defaults = getDefaults();
          toast('已删除供应商', 'success');
          refresh();
        }
      });
    }

    // 取消添加
    const cancelBtn = inner.querySelector('#btn-cancel-add');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        pageState.isAddingProvider = false;
        pageState.form = null;
        pageState.testStatus = null;
        refresh();
      });
    }

    // 类型切换时自动填充 endpoint（Grsai）
    const typeEl = inner.querySelector('#pf-type');
    if (typeEl && f.type === 'grsai' && !f.endpoint) {
      const epEl = inner.querySelector('#pf-endpoint');
      if (epEl && !epEl.value) epEl.value = 'https://grsaiapi.com/v1/api/generate';
    }
  }

  function bindAboutEvents() {
    const inner = getInner();
    // 检查更新按钮
    const btnCheck = inner.querySelector('#btn-check');
    if (btnCheck) {
      btnCheck.addEventListener('click', async () => {
        if (!window.api || !window.api.updateCheck) { toast('运行环境异常', 'error'); return; }
        setBtnLoading(btnCheck, '检查中…');
        try {
          const res = await window.api.updateCheck();
          if (res && res.ok === false) {
            handleUpdateEvent({ state: 'error', message: res.error });
          }
        } catch (e) {
          handleUpdateEvent({ state: 'error', message: e.message || '检查失败' });
        } finally {
          resetBtn(btnCheck);
        }
      });
    }
    const btnDownload = inner.querySelector('#btn-download');
    if (btnDownload) {
      btnDownload.addEventListener('click', async () => {
        if (!window.api || !window.api.openReleasePage) { toast('运行环境异常', 'error'); return; }
        await window.api.openReleasePage();
      });
    }
  }

  // ========== 更新相关 ==========
  function loadVersion() {
    if (!window.api || !window.api.updateGetCurrentVersion) return;
    window.api.updateGetCurrentVersion().then((info) => {
      pageState.update.current = info;
      const el = document.getElementById('cur-ver');
      if (el) {
        el.textContent = info.version || '—';
        if (info.isPackaged === false) {
          el.insertAdjacentHTML('afterend', ' <span class="tag tag-soft">开发模式</span>');
        }
      }
    });
  }

  function bindUpdateEvents() {
    if (!window.api || !window.api.onUpdateStatus) return;
    window.api.onUpdateStatus((payload) => {
      handleUpdateEvent(payload);
    });
  }

  function handleUpdateEvent(payload) {
    const s = payload?.state;
    pageState.update.state = s;
    pageState.update.payload = payload;
    if (pageState.tab !== 'about') return;

    const chip = document.getElementById('update-state-chip');
    const errorEl = document.getElementById('update-error');
    const notesEl = document.getElementById('update-notes');
    const btnCheck = document.getElementById('btn-check');
    const btnDownload = document.getElementById('btn-download');
    const latestVer = document.getElementById('latest-ver');
    const latestDate = document.getElementById('latest-date');

    if (chip) chip.textContent = UPDATE_STATE_TEXT[s] || s || UPDATE_STATE_TEXT.idle;
    if (chip) chip.className = 'tag tag-soft';
    if (errorEl) errorEl.style.display = 'none';
    if (notesEl) notesEl.style.display = 'none';
    if (btnCheck) btnCheck.style.display = 'inline-flex';
    if (btnDownload) btnDownload.style.display = 'none';
    if (btnCheck) resetBtn(btnCheck);

    switch (s) {
      case 'checking':
        if (btnCheck) setBtnLoading(btnCheck, '检查中…');
        break;
      case 'available': {
        const ver = payload.version || '未知';
        if (latestVer) latestVer.textContent = `v${ver}`;
        pageState.update.latest = ver;
        if (payload.releaseDate && latestDate) latestDate.textContent = '发布时间：' + formatDate(payload.releaseDate);
        if (payload.releaseNotes && notesEl) {
          notesEl.style.display = 'block';
          const body = document.getElementById('update-notes-body');
          if (body) renderReleaseNotes(body, payload.releaseNotes);
        }
        if (btnCheck) btnCheck.style.display = 'none';
        if (btnDownload) btnDownload.style.display = 'inline-flex';
        if (chip) chip.className = 'tag tag-primary';
        break;
      }
      case 'not-available':
        if (latestVer) latestVer.textContent = pageState.update.current ? `v${pageState.update.current.version}` : '—';
        if (latestDate) latestDate.textContent = '当前已是最新版本';
        break;
      case 'error': {
        if (errorEl) {
          errorEl.style.display = 'flex';
          const msg = document.getElementById('update-error-msg');
          if (msg) msg.textContent = payload.message || '未知错误';
        }
        if (chip) chip.className = 'tag tag-danger';
        break;
      }
    }
  }
}

// ========== 工具函数 ==========
function formatDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch { return ''; }
}


function setBtnLoading(btn, text) {
  btn.disabled = true;
  btn._oldHTML = btn.innerHTML;
  btn.innerHTML = icon('loader', 14) + '<span>' + text + '</span>';
}
function resetBtn(btn) {
  btn.disabled = false;
  if (btn._oldHTML) btn.innerHTML = btn._oldHTML;
}
