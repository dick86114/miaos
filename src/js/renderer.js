// 渲染进程入口：初始化外壳导航 + 路由
import { renderIcons, icon } from './icons.js';
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

  // 侧边栏折叠/展开：开关必须留在应用外壳中，避免被路由页面替换。
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebar = document.querySelector('.sidebar');
  const savedCollapse = localStorage.getItem('miaos.sidebar.collapsed');
  const compactViewport = window.matchMedia?.('(max-width: 880px)').matches;

  function setSidebarCollapsed(collapsed, persist = true) {
    if (!sidebar || !toggleBtn) return;
    sidebar.classList.toggle('is-collapsed', collapsed);
    document.body.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded');
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
    toggleBtn.setAttribute('title', collapsed ? '展开侧边栏' : '收起侧边栏');
    toggleBtn.innerHTML = icon(collapsed ? 'panel-left-open' : 'panel-left-close', 16);
    renderIcons(toggleBtn);
    if (persist) localStorage.setItem('miaos.sidebar.collapsed', String(collapsed));
  }

  setSidebarCollapsed(savedCollapse === null ? compactViewport : savedCollapse === 'true', false);
  toggleBtn?.addEventListener('click', () => {
    setSidebarCollapsed(!sidebar.classList.contains('is-collapsed'));
  });

  // 填充侧边栏版本号
  fillSidebarVersion();

  // 监听更新事件（用于全局提示）
  bindGlobalUpdateListener();
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
