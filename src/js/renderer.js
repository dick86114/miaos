// 渲染进程入口：初始化外壳导航 + 路由
import { renderIcons } from './icons.js';
import { initRouter, navigate } from './router.js';
import { toast } from './ui.js';
import { discardLegacyProviderSecrets, getThemeMode } from './store.js';

async function init() {
  const legacyLocalKeys = discardLegacyProviderSecrets();
  if (legacyLocalKeys.clearedCount > 0) {
    toast(`已清除 ${legacyLocalKeys.clearedCount} 个旧版本地 API Key，请前往“系统设置”重新保存`, 'info', 8000);
  }

  // 默认本地保存模式不会读取旧版钥匙串密文；仅提示用户主动重新配置或选择迁移。
  window.api?.getProviderSecretStorage?.().then((result) => {
    const legacyCount = Number(result?.legacySecretCount) || 0;
    if (result?.ok && legacyCount > 0) {
      toast(`检测到 ${legacyCount} 个旧版 API Key 未读取，请前往“系统设置”重新保存或主动开启钥匙串迁移`, 'info', 8000);
    }
  }).catch(() => {});

  // 应用主题
  applyTheme(getThemeMode());

  renderIcons(document);

  const navItems = Array.from(document.querySelectorAll('.sidebar-item'));
  const mainContent = document.getElementById('main-content');

  // 侧边栏导航
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const key = item.getAttribute('data-nav-key');
      const routeMap = { generate: '/generate', projects: '/projects', history: '/history', settings: '/settings' };
      if (routeMap[key]) navigate(routeMap[key]);
    });
  });

  initRouter(mainContent, navItems);

  // 侧边栏宽度由整条分割线调整，避免额外的悬浮收缩按钮打断导航。
  const sidebar = document.querySelector('.sidebar');
  const resizeHandle = document.getElementById('sidebar-resize-handle');
  initSidebarResize(sidebar, resizeHandle);

  // 填充侧边栏版本号
  fillSidebarVersion();

  // 监听更新事件（用于全局提示）
  bindGlobalUpdateListener();
}

export function initSidebarResize(sidebar, resizeHandle, {
  storage = typeof localStorage === 'undefined' ? null : localStorage,
  minWidth = 60,
  maxWidth = 320,
  defaultWidth = 200,
} = {}) {
  if (!sidebar || !resizeHandle) return () => {};
  const savedWidth = Number.parseInt(storage?.getItem('miaos.sidebar.width') || '', 10);
  const compactViewport = window.matchMedia?.('(max-width: 880px)').matches;
  let width = Number.isFinite(savedWidth) ? savedWidth : (compactViewport ? 60 : defaultWidth);
  let dragging = false;
  let pointerId = null;

  const clamp = (value) => Math.min(maxWidth, Math.max(minWidth, Math.round(value)));
  const applyWidth = (nextWidth, persist = true) => {
    width = clamp(nextWidth);
    sidebar.style.width = `${width}px`;
    sidebar.classList.toggle('is-collapsed', width <= minWidth + 12);
    document.body.setAttribute('data-sidebar', width <= minWidth + 12 ? 'collapsed' : 'expanded');
    resizeHandle.setAttribute('aria-valuemin', String(minWidth));
    resizeHandle.setAttribute('aria-valuemax', String(maxWidth));
    resizeHandle.setAttribute('aria-valuenow', String(width));
    if (persist) storage?.setItem('miaos.sidebar.width', String(width));
  };

  const onPointerMove = (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    applyWidth(event.clientX);
  };
  const stopDragging = (event) => {
    if (!dragging || (event?.pointerId !== undefined && event.pointerId !== pointerId)) return;
    dragging = false;
    pointerId = null;
    resizeHandle.releasePointerCapture?.(event?.pointerId);
    resizeHandle.classList.remove('is-dragging');
    document.body.classList.remove('is-sidebar-resizing');
  };
  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    dragging = true;
    pointerId = event.pointerId;
    resizeHandle.setPointerCapture?.(event.pointerId);
    resizeHandle.classList.add('is-dragging');
    document.body.classList.add('is-sidebar-resizing');
    event.preventDefault?.();
  };
  const onKeydown = (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); applyWidth(width - 16); }
    if (event.key === 'ArrowRight') { event.preventDefault(); applyWidth(width + 16); }
    if (event.key === 'Home') { event.preventDefault(); applyWidth(minWidth); }
    if (event.key === 'End') { event.preventDefault(); applyWidth(maxWidth); }
  };

  applyWidth(width, false);
  resizeHandle.addEventListener('pointerdown', onPointerDown);
  resizeHandle.addEventListener('pointermove', onPointerMove);
  resizeHandle.addEventListener('pointerup', stopDragging);
  resizeHandle.addEventListener('pointercancel', stopDragging);
  resizeHandle.addEventListener('keydown', onKeydown);
  return () => {
    stopDragging();
    resizeHandle.removeEventListener('pointerdown', onPointerDown);
    resizeHandle.removeEventListener('pointermove', onPointerMove);
    resizeHandle.removeEventListener('pointerup', stopDragging);
    resizeHandle.removeEventListener('pointercancel', stopDragging);
    resizeHandle.removeEventListener('keydown', onKeydown);
  };
}

function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode || 'system');
}

function fillSidebarVersion() {
  const el = document.getElementById('sidebar-version');
  if (!el) return;
  if (window.api && window.api.updateGetCurrentVersion) {
    window.api.updateGetCurrentVersion().then((info) => {
      if (info && info.version) {
        el.textContent = 'v' + info.version;
      }
    }).catch(() => {});
  }
}

let lastNotifiedVersion = null;
function bindGlobalUpdateListener() {
  if (!window.api || !window.api.onUpdateStatus) return;
  window.api.onUpdateStatus((payload) => {
    if (!payload || !payload.state) return;
    if (payload.state === 'available' && payload.version) {
      if (lastNotifiedVersion === payload.version) return;
      lastNotifiedVersion = payload.version;
      toast(`发现新版本 v${payload.version}，前往「设置」下载`, 'info', 4500);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
