// 通用 UI 工具：toast 通知、DOM 辅助
import { renderIcons, createIcon } from './icons.js';

// 转义插入 HTML 模板的文本，避免名称与提示词破坏页面结构。
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 属性值与文本使用相同的 HTML 实体编码规则。
export function escapeAttr(value) {
  return escapeHtml(value);
}

// 轻量 Toast。相同 key 的状态会原位更新，避免高频请求堆叠重复提示。
const toastRecordsByDocument = new WeakMap();
const loadingButtons = new WeakSet();
let activeConfirm = null;

function normalizeToastOptions(options) {
  if (typeof options === 'number') return { duration: options };
  return options && typeof options === 'object' ? options : {};
}

function getToastRecords(documentRef) {
  let records = toastRecordsByDocument.get(documentRef);
  if (!records) {
    records = new Map();
    toastRecordsByDocument.set(documentRef, records);
  }
  return records;
}

function getToastStack(documentRef) {
  let stack = documentRef.querySelector?.('.toast-stack');
  if (!stack) {
    stack = documentRef.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    documentRef.body.appendChild(stack);
  }
  return stack;
}

function getToastIconName(type) {
  return type === 'success' ? 'check' : type === 'error' ? 'alert-circle' : 'sparkles';
}

// 返回关闭函数；第三个参数兼容旧版毫秒数，也支持 { key, duration }。
export function toast(message, type = 'info', options = {}) {
  if (typeof document === 'undefined' || !document.body) return () => {};
  const documentRef = document;
  const normalized = normalizeToastOptions(options);
  const key = normalized.key == null ? null : String(normalized.key);
  const duration = normalized.duration === undefined ? 2600 : normalized.duration;
  const records = getToastRecords(documentRef);
  let record = key ? records.get(key) : null;

  if (!record || !record.element.parentNode) {
    const element = documentRef.createElement('div');
    element.className = `toast toast-${type}`;
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');

    const iconNode = createIcon(getToastIconName(type), 16);
    const messageNode = documentRef.createElement('span');
    messageNode.className = 'toast-message';
    const closeButton = documentRef.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'toast-close';
    closeButton.setAttribute('aria-label', '关闭提示');
    closeButton.appendChild(createIcon('x', 14));
    element.append(iconNode, messageNode, closeButton);

    record = {
      element,
      messageNode,
      closeButton,
      key,
      timer: null,
      close: null,
    };
    const finishRemoval = (event) => {
      if (event?.animationName && event.animationName !== 'toastOut') return;
      element.removeEventListener('animationend', finishRemoval);
      if (record.timer) clearTimeout(record.timer);
      if (key && records.get(key) === record) records.delete(key);
      element.remove();
    };
    record.close = () => {
      if (!element.parentNode || element.classList.contains('fade-out')) return;
      if (record.timer) clearTimeout(record.timer);
      element.classList.add('fade-out');
      element.addEventListener('animationend', finishRemoval);
    };
    closeButton.addEventListener('click', record.close);
    getToastStack(documentRef).appendChild(element);
    if (key) records.set(key, record);
  }

  const { element, messageNode } = record;
  if (record.timer) clearTimeout(record.timer);
  element.classList.remove('fade-out', 'toast-success', 'toast-error', 'toast-info');
  element.classList.add(`toast-${type}`);
  const existingIcon = element.children[0];
  const nextIcon = createIcon(getToastIconName(type), 16);
  if (existingIcon?.replaceWith) existingIcon.replaceWith(nextIcon);
  else if (existingIcon?.parentNode) {
    const parent = existingIcon.parentNode;
    const index = parent.children.indexOf?.(existingIcon) ?? 0;
    parent.children[index] = nextIcon;
    nextIcon.parentNode = parent;
  }
  messageNode.textContent = String(message ?? '');

  if (Number.isFinite(duration) && duration > 0) {
    record.timer = setTimeout(record.close, duration);
  }
  return record.close;
}

// 在异步操作期间稳定按钮尺寸并阻止重复触发，完成后始终恢复原有状态。
export async function withButtonLoading(button, label, operation) {
  if (!button || typeof operation !== 'function' || loadingButtons.has(button) || button.disabled) return undefined;
  loadingButtons.add(button);
  const originalDisabled = button.disabled;
  const labelTarget = button.querySelector?.('span') || null;
  const originalLabel = labelTarget?.textContent;
  const originalNodes = labelTarget ? null : Array.from(button.childNodes || button.children || []);
  const isIconOnly = !labelTarget
    && !String(button.textContent || '').trim()
    && originalNodes.some((node) => node?.tagName === 'SVG' || node?.hasAttribute?.('data-lucide'));
  const hadAriaBusy = button.hasAttribute?.('aria-busy') || false;
  const originalAriaBusy = button.getAttribute?.('aria-busy');
  const originalMinWidth = button.style?.minWidth || '';
  const originalMinHeight = button.style?.minHeight || '';
  const rect = button.getBoundingClientRect?.();
  if (rect?.width) button.style.minWidth = `${Math.ceil(rect.width)}px`;
  if (rect?.height) button.style.minHeight = `${Math.ceil(rect.height)}px`;
  button.disabled = true;
  button.setAttribute?.('aria-busy', 'true');
  button.classList?.add('is-loading');
  if (labelTarget) {
    labelTarget.textContent = label;
  } else if (!isIconOnly) {
    const loadingLabel = button.ownerDocument?.createElement?.('span') || document.createElement('span');
    loadingLabel.className = 'button-loading-label';
    loadingLabel.textContent = label;
    button.replaceChildren?.(loadingLabel);
  }

  try {
    return await operation();
  } finally {
    if (labelTarget) labelTarget.textContent = originalLabel;
    else if (!isIconOnly) button.replaceChildren?.(...originalNodes);
    if (hadAriaBusy) button.setAttribute?.('aria-busy', originalAriaBusy);
    else button.removeAttribute?.('aria-busy');
    button.disabled = originalDisabled;
    button.classList?.remove('is-loading');
    button.style.minWidth = originalMinWidth || (rect?.width ? `${Math.ceil(rect.width)}px` : '');
    button.style.minHeight = originalMinHeight || (rect?.height ? `${Math.ceil(rect.height)}px` : '');
    loadingButtons.delete(button);
  }
}

// 同一事件循环内只允许一次同步动作；用于避免双击把同一请求重复加入队列。
export function createEventLoopGuard(onDuplicate) {
  let locked = false;
  return (operation) => {
    if (locked) {
      onDuplicate?.();
      return false;
    }
    locked = true;
    queueMicrotask(() => { locked = false; });
    operation?.();
    return true;
  };
}

// 关闭当前确认会话。路由切换时调用，保证旧页面不会继续执行删除操作。
export function dismissActiveConfirm() {
  activeConfirm?.dismiss();
}

// 确认对话框：有 DOM 时使用应用内对话框；无 DOM 测试环境保留原生 confirm 回退。
export function confirmDialog(message, options = {}) {
  const fallback = typeof options.confirmFallback === 'function'
    ? options.confirmFallback
    : typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm.bind(window)
      : () => false;
  if (typeof document === 'undefined' || !document.body || !document.createElement) return Boolean(fallback(message));

  dismissActiveConfirm();
  const documentRef = document;
  const previousFocus = documentRef.activeElement;
  const overlay = documentRef.createElement('div');
  overlay.className = 'confirm-dialog-overlay';
  overlay.tabIndex = -1;
  overlay.setAttribute('role', 'presentation');
  const dialog = documentRef.createElement('section');
  dialog.className = 'confirm-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'confirm-dialog-title');
  const title = documentRef.createElement('h2');
  title.id = 'confirm-dialog-title';
  title.className = 'confirm-dialog-title';
  title.textContent = '请确认操作';
  const content = documentRef.createElement('p');
  content.className = 'confirm-dialog-message';
  content.textContent = String(message ?? '');
  const footer = documentRef.createElement('div');
  footer.className = 'confirm-dialog-actions';
  const cancelButton = documentRef.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-ghost';
  cancelButton.setAttribute('data-confirm-cancel', 'true');
  cancelButton.textContent = '取消';
  const confirmButton = documentRef.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'btn btn-danger';
  confirmButton.setAttribute('data-confirm-accept', 'true');
  confirmButton.textContent = '确认';
  footer.append(cancelButton, confirmButton);
  dialog.append(title, content, footer);
  overlay.appendChild(dialog);
  documentRef.body.appendChild(overlay);

  return new Promise((resolve) => {
    const record = { settled: false, canceled: false, dismiss: null };
    const cleanup = () => {
      overlay.removeEventListener?.('keydown', onKeydown);
      documentRef.removeEventListener?.('keydown', onKeydown);
      overlay.remove();
      previousFocus?.focus?.();
    };
    const finish = (accepted) => {
      if (record.settled) return;
      record.settled = true;
      queueMicrotask(() => {
        cleanup();
        if (activeConfirm === record) activeConfirm = null;
        resolve(Boolean(accepted) && !record.canceled);
      });
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault?.();
        finish(false);
      }
    };
    record.dismiss = () => {
      record.canceled = true;
      cleanup();
      finish(false);
    };
    activeConfirm = record;
    cancelButton.addEventListener('click', () => finish(false));
    confirmButton.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) finish(false); });
    overlay.addEventListener('keydown', onKeydown);
    documentRef.addEventListener?.('keydown', onKeydown);
    cancelButton.focus?.();
  });
}

// 把 HTML 字符串转为 DOM 元素
export function htmlToElement(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

// 使用稳定 key 批量更新列表：仅更新变化项，复用未变化节点，避免高频状态通知触发整页重建。
export function createKeyedListRenderer(container, options) {
  const getKey = options?.getKey;
  const createNode = options?.createNode;
  const updateNode = options?.updateNode;
  const getSignature = options?.getSignature || ((item) => JSON.stringify(item));
  const afterNode = options?.afterNode;
  let records = new Map();

  if (!container || typeof getKey !== 'function' || typeof createNode !== 'function') {
    throw new Error('稳定列表渲染器参数无效');
  }

  return {
    render(items = []) {
      const fragment = container.ownerDocument?.createDocumentFragment?.() || document.createDocumentFragment();
      const nextRecords = new Map();

      items.forEach((item) => {
        const key = String(getKey(item));
        const signature = getSignature(item);
        const previous = records.get(key);
        let node;
        let changed = false;

        if (previous) {
          node = previous.node;
          if (previous.signature !== signature) {
            updateNode?.(node, item);
            changed = true;
          }
        } else {
          node = createNode(item);
          changed = true;
        }

        if (!node) throw new Error('稳定列表渲染器未返回节点');
        node.dataset.itemKey = key;
        if (changed) afterNode?.(node, item);
        nextRecords.set(key, { node, signature });
        fragment.appendChild(node);
      });

      container.replaceChildren(fragment);
      records = nextRecords;
    },
    clear() {
      records.clear();
      container.replaceChildren();
    },
  };
}

// 创建可恢复的页面渲染错误状态，避免异常后只留下空白区域。
export function createPageErrorState() {
  const root = document.createElement('section');
  root.className = 'page-error-state';

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '页面加载失败';
  root.appendChild(title);

  const message = document.createElement('p');
  message.className = 'page-subtitle';
  message.textContent = '页面出现异常，请重新加载后再试。';
  root.appendChild(message);

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'btn btn-primary';
  retryButton.setAttribute('data-page-retry', 'true');
  retryButton.textContent = '重新加载';
  root.appendChild(retryButton);

  return root;
}

// 渲染容器内图标 + 触发进入动画。传入 retry 时绑定错误状态的重试按钮。
export function mountPage(container, element, options = {}) {
  container.replaceChildren(element);
  element.classList.add('page-enter');
  if (typeof options.retry === 'function') {
    const retryButton = element.querySelector('[data-page-retry]');
    retryButton?.addEventListener('click', options.retry);
  }
  renderIcons(container);
}
