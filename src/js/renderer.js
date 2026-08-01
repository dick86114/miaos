// 渲染进程入口：初始化外壳导航 + 路由
import { renderIcons, icon } from './icons.js';
import { initRouter, navigate } from './router.js';
import { toast } from './ui.js';

function init() {
  renderIcons(document);

  const navItems = Array.from(document.querySelectorAll('.sidebar-item'));
  const mainContent = document.getElementById('main-content');

  // 侧边栏导航
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const key = item.getAttribute('data-nav-key');
      const routeMap = { generate: '/generate', projects: '/projects', history: '/history', models: '/models', settings: '/settings' };
      if (routeMap[key]) navigate(routeMap[key]);
    });
  });

  initRouter(mainContent, navItems);

  // 填充侧边栏版本号
  fillSidebarVersion();

  // 监听更新事件（用于全局提示）
  bindGlobalUpdateListener();
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
      toast(`发现新版本 v${payload.version}，前往「设置」下载安装`, 'info', 4500);
    } else if (payload.state === 'downloaded' && payload.version) {
      toast(`新版本 v${payload.version} 已下载，点击重启即可安装`, 'success', 5000);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
