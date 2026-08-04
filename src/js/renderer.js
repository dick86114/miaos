// 渲染进程入口：初始化外壳导航 + 路由
import { renderIcons, icon } from './icons.js';
import { initRouter, navigate } from './router.js';
import { toast } from './ui.js';
import { migrateLegacyProviderSecrets, getThemeMode } from './store.js';

async function init() {
  const migration = await migrateLegacyProviderSecrets();
  if (!migration.ok) {
    const message = migration.code === 'CONFIGURATION_STATE_UNCERTAIN'
      || String(migration.code || '').startsWith('SECRET_VAULT_APPLIED_')
      ? '配置状态不确定，请重试/检查'
      : 'API Key 安全迁移失败，旧配置已保留，请检查系统钥匙串';
    toast(message, 'error', 8000);
  }

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

  // 侧边栏折叠/展开
  const collapseBtn = document.getElementById('sidebar-collapse-btn');
  const expandBtn = document.getElementById('sidebar-expand-btn');
  const sidebar = document.querySelector('.sidebar');
  const savedCollapse = localStorage.getItem('miaos.sidebar.collapsed');
  if (savedCollapse === 'true') {
    sidebar.classList.add('is-collapsed');
    document.body.setAttribute('data-sidebar', 'collapsed');
  }
  collapseBtn?.addEventListener('click', () => {
    sidebar.classList.add('is-collapsed');
    document.body.setAttribute('data-sidebar', 'collapsed');
    localStorage.setItem('miaos.sidebar.collapsed', 'true');
    renderIcons(document);
  });
  expandBtn?.addEventListener('click', () => {
    sidebar.classList.remove('is-collapsed');
    document.body.removeAttribute('data-sidebar');
    localStorage.setItem('miaos.sidebar.collapsed', 'false');
    renderIcons(document);
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
