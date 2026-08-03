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

// 轻量 toast
export function toast(message, type = 'info', duration = 2600) {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const iconName =
    type === 'success' ? 'check' : type === 'error' ? 'alert-circle' : 'sparkles';
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.appendChild(createIcon(iconName, 16));
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.remove(), 260);
  }, duration);
}

// 把 HTML 字符串转为 DOM 元素
export function htmlToElement(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
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

// 确认对话框（使用原生 confirm，简单可靠）
export function confirmDialog(message) {
  return window.confirm(message);
}
