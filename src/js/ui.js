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

// 渲染容器内图标 + 触发进入动画
export function mountPage(container, element) {
  container.innerHTML = '';
  element.classList.add('page-enter');
  container.appendChild(element);
  renderIcons(container);
}

// 确认对话框（使用原生 confirm，简单可靠）
export function confirmDialog(message) {
  return window.confirm(message);
}
