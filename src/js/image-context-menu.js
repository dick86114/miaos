// 图片右键菜单：详情页、放大查看与通用预览共用同一套快速操作。
import { icon, renderIcons } from './icons.js';
import { toast } from './ui.js';

let activeMenu = null;
let activeCleanup = null;

export function closeImageContextMenu() {
  activeCleanup?.();
}

function toLocalFilePath(imageSource) {
  const source = String(imageSource || '');
  if (source.startsWith('/')) return source;
  if (!source.startsWith('file://')) return '';
  try {
    const url = new URL(source);
    if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) return '';
    return decodeURIComponent(url.pathname || '');
  } catch (_) {
    return '';
  }
}

async function copyImage(imageSource) {
  if (!window.api?.copyImage) throw new Error('当前环境不支持复制图片');
  const result = await window.api.copyImage(imageSource);
  if (!result?.ok) throw new Error(result?.error || '复制图片失败');
  toast('图片已复制到剪贴板', 'success');
}

async function saveImage(imageSource, suggestedName) {
  if (!window.api?.saveImage) throw new Error('当前环境不支持保存图片');
  const result = await window.api.saveImage(imageSource, suggestedName || 'miaos-image.png');
  if (result?.ok) toast('图片已保存', 'success');
  else if (!result?.canceled) throw new Error(result?.error || '保存图片失败');
}

async function copyPrompt(prompt, onCopyPrompt) {
  if (typeof onCopyPrompt === 'function') {
    await onCopyPrompt(prompt);
    return;
  }
  await navigator.clipboard.writeText(prompt);
  toast('提示词已复制', 'success');
}

function createMenuItem(documentRef, { iconName, label, shortcut, onSelect }) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'image-context-menu-item';
  button.setAttribute('role', 'menuitem');
  button.innerHTML = `${icon(iconName, 14)}<span class="image-context-menu-label"></span>${shortcut ? `<kbd>${shortcut}</kbd>` : ''}`;
  button.querySelector('.image-context-menu-label').textContent = label;
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeImageContextMenu();
    try {
      await onSelect();
    } catch (error) {
      toast(error?.message || '操作失败', 'error');
    }
  });
  return button;
}

/**
 * 在鼠标位置打开图片右键菜单。
 * 返回关闭函数，调用方可在页面或全屏预览销毁时主动收起菜单。
 */
export function openImageContextMenu(event, options = {}) {
  event.preventDefault?.();
  event.stopPropagation?.();
  closeImageContextMenu();

  const {
    imageSource = '',
    prompt = '',
    suggestedName = 'miaos-image.png',
    onSave,
    onCopyPrompt,
    onCloseFullscreen,
    documentRef = document,
  } = options;
  const menu = documentRef.createElement('div');
  menu.className = 'image-context-menu';
  menu.setAttribute('role', 'menu');

  const localFilePath = toLocalFilePath(imageSource);
  const items = [];
  if (imageSource) {
    items.push(createMenuItem(documentRef, {
      iconName: 'copy',
      label: '复制图片',
      shortcut: '⌘C',
      onSelect: () => copyImage(imageSource),
    }));
    items.push(createMenuItem(documentRef, {
      iconName: 'download',
      label: '保存图片…',
      shortcut: '⌘S',
      onSelect: () => (typeof onSave === 'function' ? onSave() : saveImage(imageSource, suggestedName)),
    }));
  }
  if (prompt) {
    items.push(createMenuItem(documentRef, {
      iconName: 'file-text',
      label: '复制提示词',
      onSelect: () => copyPrompt(prompt, onCopyPrompt),
    }));
  }
  if (localFilePath) {
    items.push(createMenuItem(documentRef, {
      iconName: 'folder-open',
      label: '在文件夹中显示',
      onSelect: async () => {
        const result = await window.api?.showInFolder?.(localFilePath);
        if (!result?.ok) throw new Error(result?.error || '无法定位文件');
      },
    }));
  }
  if (typeof onCloseFullscreen === 'function') {
    items.push(createMenuItem(documentRef, {
      iconName: 'x',
      label: '关闭放大查看',
      shortcut: 'Esc',
      onSelect: onCloseFullscreen,
    }));
  }
  if (!items.length) return () => {};

  items.forEach((item) => menu.appendChild(item));
  documentRef.body.appendChild(menu);
  renderIcons(menu);

  const rect = menu.getBoundingClientRect?.();
  const menuWidth = rect?.width || 190;
  const menuHeight = rect?.height || items.length * 34;
  const left = Math.min(window.innerWidth - menuWidth - 8, Math.max(8, event.clientX || 0));
  const top = Math.min(window.innerHeight - menuHeight - 8, Math.max(8, event.clientY || 0));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;

  const onPointerDown = (pointerEvent) => {
    if (!menu.contains(pointerEvent.target)) closeImageContextMenu();
  };
  const onKeyDown = (keyEvent) => {
    if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault?.();
      keyEvent.stopPropagation?.();
      closeImageContextMenu();
    }
  };
  const cleanup = () => {
    documentRef.removeEventListener('pointerdown', onPointerDown, true);
    documentRef.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('blur', cleanup);
    window.removeEventListener('resize', cleanup);
    menu.remove();
    if (activeMenu === menu) {
      activeMenu = null;
      activeCleanup = null;
    }
  };
  activeMenu = menu;
  activeCleanup = cleanup;
  documentRef.addEventListener('pointerdown', onPointerDown, true);
  documentRef.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', cleanup);
  window.addEventListener('resize', cleanup);
  return cleanup;
}
