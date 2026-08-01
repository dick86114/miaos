// 供应商配置页
import { icon } from '../icons.js';
import { mountPage, htmlToElement, toast, confirmDialog } from '../ui.js';
import {
  getProviders,
  getProvider,
  saveProvider,
  deleteProvider,
  setDefaultProvider,
  toggleModel,
  setProviderModels,
  addCustomModel,
  removeModel,
  testConnection,
  fetchModels,
  getTextProvider,
  setTextProvider,
  optimizePrompt,
} from '../store.js';

const PROVIDER_TYPES = [
  { value: 'grsai', label: 'Grsai' },
  { value: 'openai', label: 'OpenAI 兼容' },
  { value: 'custom', label: '自定义' },
];

export function renderModels(container) {
  refresh(container);

  function refresh(container, editingId = null) {
    const providers = getProviders();
    const editing = editingId ? getProvider(editingId) : null;
    const tp = getTextProvider();

    const providerListHtml = providers.length
      ? providers
          .map(
            (p) => `
          <div class="provider-item" data-id="${p.id}">
            <div class="provider-item-header">
              <div class="provider-info">
                <div class="provider-name-row">
                  <span class="provider-name-text">${escapeHtml(p.name)}</span>
                  <span class="provider-type-tag">${escapeHtml(p.type)}</span>
                  ${p.isDefault ? `<span class="model-badge">${icon('check', 10)}<span>默认</span></span>` : ''}
                </div>
                <div class="provider-meta">${escapeHtml(p.endpoint || '未配置地址')}</div>
              </div>
              <div class="provider-actions">
                ${p.isDefault ? '' : `<button class="icon-btn" data-act="default" title="设为默认">${icon('check', 14)}</button>`}
                <button class="icon-btn" data-act="fetch" title="获取模型">${icon('refresh-cw', 14)}</button>
                <button class="icon-btn" data-act="edit" title="编辑">${icon('pencil', 14)}</button>
                <button class="icon-btn danger" data-act="delete" title="删除">${icon('trash-2', 14)}</button>
                <button class="icon-btn" data-act="toggle" title="展开/折叠">${icon('chevron-down', 14)}</button>
              </div>
            </div>
            <div class="provider-models" data-expanded="false">
              <div class="models-toolbar">
                <span class="models-count">${p.models.filter((m) => m.enabled).length}/${p.models.length} 个已启用</span>
                <div class="models-toolbar-actions">
                  <button class="text-btn-mini" data-act="add-model">${icon('plus', 12)}<span>添加模型</span></button>
                </div>
              </div>
              <div class="model-checklist">
                ${p.models.length
                  ? p.models
                      .map(
                        (m) => `
                  <label class="model-check-item" data-mid="${m.id}">
                    <input type="checkbox" ${m.enabled ? 'checked' : ''} data-act="toggle-model" />
                    <span class="model-check-name">${escapeHtml(m.name)}</span>
                    <button class="icon-btn mini" data-act="remove-model" title="移除">${icon('x', 12)}</button>
                  </label>`
                      )
                      .join('')
                  : '<div class="models-empty-hint">暂无模型，点击「获取模型」或「添加模型」</div>'
                }
              </div>
              <div class="add-model-row" style="display:none;">
                <input type="text" class="form-input mini-input" placeholder="输入模型名称，如 dall-e-3" data-add-input />
                <button class="btn btn-primary btn-sm" data-act="confirm-add">${icon('plus', 12)}<span>添加</span></button>
                <button class="btn btn-ghost btn-sm" data-act="cancel-add">${icon('x', 12)}</button>
              </div>
            </div>
          </div>`
          )
          .join('')
      : `<div class="models-empty">还没有配置供应商，请在左侧表单添加</div>`;

    const root = htmlToElement(`
      <div class="models-wrap">
        <div class="models-page-header">
          <h1 class="models-page-title">供应商配置</h1>
          <p class="models-page-subtitle">配置大模型供应商端点与密钥，获取并勾选可用模型后即可在生图页使用</p>
        </div>
        <div class="models-grid">
          <section class="config-form">
            <input type="hidden" id="f-id" value="${editing ? editing.id : ''}" />
            <div class="form-group">
              <label class="form-label" for="f-name">供应商名称</label>
              <input class="form-input" id="f-name" type="text" placeholder="Grsai / OpenAI" value="${editing ? escapeAttr(editing.name) : ''}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="f-type">供应商类型</label>
              <select class="form-select" id="f-type">
                ${PROVIDER_TYPES.map((t) => `<option value="${t.value}" ${editing && editing.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="f-endpoint">API 地址</label>
              <input class="form-input" id="f-endpoint" type="text" placeholder="https://grsaiapi.com/v1/api/generate" value="${editing ? escapeAttr(editing.endpoint) : ''}" />
              <div class="form-hint" id="endpoint-hint"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="f-key">API Key</label>
              <input class="form-input" id="f-key" type="password" placeholder="sk-...（可选）" value="${editing ? escapeAttr(editing.apiKey) : ''}" />
              <div class="form-hint">密钥仅存储在本地，不会上传至任何服务器</div>
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" type="button" id="btn-save">${icon('save', 14)}<span>${editing ? '更新' : '保存'}</span></button>
              <button class="btn btn-secondary" type="button" id="btn-test">${icon('plug', 14)}<span>测试连接</span></button>
              <button class="btn btn-secondary" type="button" id="btn-fetch">${icon('refresh-cw', 14)}<span>获取模型</span></button>
              ${editing ? `<button class="btn btn-ghost" type="button" id="btn-cancel">${icon('x', 14)}<span>取消</span></button>` : ''}
            </div>
          </section>
          <section class="models-card">
            <div class="models-header">
              <div class="models-title">已配置供应商</div>
              <div class="models-subtitle">点击 ${icon('check', 12)} 设为默认，点击 ${icon('refresh-cw', 12)} 获取模型</div>
            </div>
            <div id="providers-list">${providerListHtml}</div>
          </section>
        </div>
        <div class="text-provider-card">
          <div class="text-provider-header">
            <div>
              <div class="text-provider-title">${icon('wand', 16)}<span>文本模型配置</span></div>
              <div class="text-provider-subtitle">用于「优化提示词」功能，支持 DeepSeek / OpenAI 等 OpenAI 兼容接口</div>
            </div>
            ${tp ? `<span class="model-badge">${icon('check', 10)}<span>已配置</span></span>` : ''}
          </div>
          <div class="text-provider-form">
            <div class="form-group">
              <label class="form-label" for="tp-endpoint">API 地址</label>
              <input class="form-input" id="tp-endpoint" type="text" placeholder="https://api.deepseek.com/v1" value="${escapeAttr(tp ? tp.endpoint : '')}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="tp-key">API Key</label>
              <input class="form-input" id="tp-key" type="password" placeholder="sk-...（可选）" value="${escapeAttr(tp ? tp.apiKey : '')}" />
            </div>
            <div class="form-group">
              <label class="form-label" for="tp-model">模型名称</label>
              <input class="form-input" id="tp-model" type="text" placeholder="deepseek-chat" value="${escapeAttr(tp ? tp.model : '')}" />
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" type="button" id="btn-tp-save">${icon('save', 14)}<span>保存</span></button>
              <button class="btn btn-secondary" type="button" id="btn-tp-test">${icon('sparkles', 14)}<span>测试优化</span></button>
            </div>
          </div>
        </div>
        <div class="security-note">
          ${icon('shield-check', 16)}
          <span>所有密钥仅存储在本地，不会上传至任何服务器。建议生产环境使用系统 Keychain 管理。</span>
        </div>
      </div>
    `);
    mountPage(container, root);

    // 类型联动提示
    const typeEl = root.querySelector('#f-type');
    const endpointEl = root.querySelector('#f-endpoint');
    const hintEl = root.querySelector('#endpoint-hint');
    function updateEndpointHint() {
      const t = typeEl.value;
      if (t === 'grsai' && !endpointEl.value) {
        endpointEl.value = 'https://grsaiapi.com/v1/api/generate';
        hintEl.textContent = '已填入 Grsai 默认地址';
      } else if (t === 'openai') {
        hintEl.textContent = 'OpenAI 兼容端点，如 https://api.openai.com/v1/images/generations';
      } else {
        hintEl.textContent = '';
      }
    }
    typeEl.addEventListener('change', updateEndpointHint);
    if (editing) updateEndpointHint();

    const nameEl = root.querySelector('#f-name');
    if (!editing) nameEl.focus();

    root.querySelector('#btn-save').addEventListener('click', () => doSave());
    root.querySelector('#btn-test').addEventListener('click', () => doTest());
    root.querySelector('#btn-fetch').addEventListener('click', () => doFetch());
    const cancelBtn = root.querySelector('#btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => refresh(container));

    // 列表操作
    bindProviderList(root, container);

    // ===== 文本模型配置 =====
    root.querySelector('#btn-tp-save').addEventListener('click', () => {
      const endpoint = root.querySelector('#tp-endpoint').value.trim();
      const apiKey = root.querySelector('#tp-key').value.trim();
      const model = root.querySelector('#tp-model').value.trim();
      if (!endpoint) { toast('请填写 API 地址', 'error'); return; }
      if (!model) { toast('请填写模型名称', 'error'); return; }
      setTextProvider({ endpoint, apiKey, model });
      toast('文本模型已保存', 'success');
      refresh(container, editingId);
    });

    root.querySelector('#btn-tp-test').addEventListener('click', async () => {
      const endpoint = root.querySelector('#tp-endpoint').value.trim();
      const apiKey = root.querySelector('#tp-key').value.trim();
      const model = root.querySelector('#tp-model').value.trim();
      if (!endpoint || !model) { toast('请先填写并保存文本模型配置', 'error'); return; }
      // 先临时保存，再测试
      setTextProvider({ endpoint, apiKey, model });
      const btn = root.querySelector('#btn-tp-test');
      setBtnLoading(btn, '优化中…');
      try {
        const optimized = await optimizePrompt('一只猫坐在窗台上');
        toast('优化成功：' + optimized.slice(0, 40) + '…', 'success');
      } catch (err) {
        toast('测试失败：' + err.message, 'error');
      } finally {
        resetBtn(btn);
      }
    });

    function collectForm() {
      return {
        id: root.querySelector('#f-id').value || undefined,
        name: root.querySelector('#f-name').value.trim(),
        type: root.querySelector('#f-type').value,
        endpoint: root.querySelector('#f-endpoint').value.trim(),
        apiKey: root.querySelector('#f-key').value.trim(),
      };
    }

    function validate(d) {
      if (!d.name) { toast('请填写供应商名称', 'error'); return false; }
      if (!d.endpoint) { toast('请填写 API 地址', 'error'); return false; }
      return true;
    }

    function doSave() {
      const d = collectForm();
      if (!validate(d)) return;
      const existing = d.id ? getProvider(d.id) : null;
      // 保存时如果是新建或类型变了，自动获取/填充模型
      let models = existing ? existing.models : undefined;
      if (!existing) {
        // 新建时根据类型预填模型
        if (d.type === 'grsai') {
          // Grsai 内置模型，默认启用 gpt-image-2、nano-banana-2、nano-banana-pro
          models = [
            { id: 'gpt-image-2', name: 'gpt-image-2', enabled: true },
            { id: 'gpt-image-2-vip', name: 'gpt-image-2-vip', enabled: false },
            { id: 'nano-banana', name: 'nano-banana', enabled: false },
            { id: 'nano-banana-fast', name: 'nano-banana-fast', enabled: false },
            { id: 'nano-banana-2', name: 'nano-banana-2', enabled: true },
            { id: 'nano-banana-2-cl', name: 'nano-banana-2-cl', enabled: false },
            { id: 'nano-banana-pro', name: 'nano-banana-pro', enabled: true },
            { id: 'nano-banana-pro-vt', name: 'nano-banana-pro-vt', enabled: false },
            { id: 'nano-banana-pro-cl', name: 'nano-banana-pro-cl', enabled: false },
            { id: 'nano-banana-pro-vip', name: 'nano-banana-pro-vip', enabled: false },
          ];
        } else {
          models = [];
        }
      }
      saveProvider({ ...d, isDefault: existing ? existing.isDefault : false, models });
      toast(existing ? '供应商已更新' : '供应商已保存', 'success');
      refresh(container, null);
    }

    async function doTest() {
      const d = collectForm();
      if (!d.endpoint) { toast('请先填写 API 地址', 'error'); return; }
      const btn = root.querySelector('#btn-test');
      setBtnLoading(btn, '测试中…');
      try {
        await testConnection(d);
        toast('连接测试成功', 'success');
      } catch (err) {
        toast('连接失败：' + err.message, 'error');
      } finally {
        resetBtn(btn);
      }
    }

    async function doFetch() {
      const d = collectForm();
      if (!d.endpoint) { toast('请先填写 API 地址', 'error'); return; }
      const btn = root.querySelector('#btn-fetch');
      setBtnLoading(btn, '获取中…');
      try {
        const models = await fetchModels(d);
        if (models && models.length) {
          if (d.id) {
            setProviderModels(d.id, models);
            toast(`获取到 ${models.length} 个模型`, 'success');
            refresh(container, d.id);
          } else {
            // 未保存的情况，提示先保存
            toast(`获取到 ${models.length} 个模型，请保存供应商后再获取以自动填充`, 'info');
          }
        } else {
          toast('未获取到模型，可手动添加', 'info');
        }
      } catch (err) {
        toast('获取模型失败：' + err.message, 'error');
      } finally {
        resetBtn(btn);
      }
    }
  }

  function bindProviderList(root, container) {
    root.querySelectorAll('.provider-item').forEach((item) => {
      const pid = item.getAttribute('data-id');
      const modelsEl = item.querySelector('.provider-models');
      const toggleBtn = item.querySelector('[data-act="toggle"]');

      // 展开/折叠
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = modelsEl.getAttribute('data-expanded') === 'true';
        modelsEl.setAttribute('data-expanded', expanded ? 'false' : 'true');
        toggleBtn.innerHTML = icon(expanded ? 'chevron-down' : 'chevron-up', 14);
      });

      // 默认是折叠的，点击 header 区域展开
      item.querySelector('.provider-item-header').addEventListener('click', (e) => {
        if (e.target.closest('.provider-actions')) return;
        const expanded = modelsEl.getAttribute('data-expanded') === 'true';
        modelsEl.setAttribute('data-expanded', expanded ? 'false' : 'true');
        toggleBtn.innerHTML = icon(expanded ? 'chevron-down' : 'chevron-up', 14);
      });

      // 操作按钮
      item.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const act = btn.getAttribute('data-act');
          if (act === 'default') {
            setDefaultProvider(pid);
            toast('已设为默认供应商', 'success');
            refresh(container);
          } else if (act === 'edit') {
            refresh(container, pid);
          } else if (act === 'delete') {
            const p = getProvider(pid);
            if (confirmDialog(`确定删除供应商「${p ? p.name : ''}」吗？该供应商下所有模型配置将被移除。`)) {
              deleteProvider(pid);
              toast('已删除供应商', 'success');
              refresh(container);
            }
          } else if (act === 'fetch') {
            const p = getProvider(pid);
            if (!p) return;
            btn.disabled = true;
            btn.innerHTML = icon('loader', 14);
            try {
              const models = await fetchModels(p);
              if (models && models.length) {
                setProviderModels(pid, models);
                toast(`获取到 ${models.length} 个模型`, 'success');
              } else {
                toast('未获取到模型，可手动添加', 'info');
              }
            } catch (err) {
              toast('获取失败：' + err.message, 'error');
            } finally {
              btn.disabled = false;
              refresh(container);
            }
          }
        });
      });

      // 模型勾选
      item.querySelectorAll('[data-act="toggle-model"]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const checkItem = cb.closest('.model-check-item');
          const mid = checkItem.getAttribute('data-mid');
          toggleModel(pid, mid, cb.checked);
          // 更新计数
          const countEl = item.querySelector('.models-count');
          const p = getProvider(pid);
          if (p && countEl) {
            countEl.textContent = `${p.models.filter((m) => m.enabled).length}/${p.models.length} 个已启用`;
          }
        });
      });

      // 移除模型
      item.querySelectorAll('[data-act="remove-model"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const checkItem = btn.closest('.model-check-item');
          const mid = checkItem.getAttribute('data-mid');
          removeModel(pid, mid);
          refresh(container);
        });
      });

      // 添加模型行
      const addModelBtn = item.querySelector('[data-act="add-model"]');
      const addRow = item.querySelector('.add-model-row');
      if (addModelBtn) {
        addModelBtn.addEventListener('click', () => {
          addRow.style.display = 'flex';
          addRow.querySelector('[data-add-input]').focus();
        });
      }
      const cancelAddBtn = item.querySelector('[data-act="cancel-add"]');
      if (cancelAddBtn) {
        cancelAddBtn.addEventListener('click', () => {
          addRow.style.display = 'none';
        });
      }
      const confirmAddBtn = item.querySelector('[data-act="confirm-add"]');
      if (confirmAddBtn) {
        confirmAddBtn.addEventListener('click', () => {
          const input = addRow.querySelector('[data-add-input]');
          const name = input.value.trim();
          if (name) {
            addCustomModel(pid, name);
            toast('已添加模型', 'success');
            refresh(container);
          }
        });
        addRow.querySelector('[data-add-input]').addEventListener('keydown', (e) => {
          if (e.key === 'Enter') confirmAddBtn.click();
        });
      }
    });
  }
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

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
