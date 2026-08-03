// 极简 hash 路由
// 路由格式：#/generate  #/projects  #/project/:id  #/history  #/settings  #/detail/:id
import { renderGenerate } from './pages/generate.js';
import { renderProjects } from './pages/projects.js';
import { renderProject } from './pages/project.js';
import { renderHistory } from './pages/history.js';
import { renderDetail } from './pages/detail.js';
import { renderSettings } from './pages/settings.js';
import { createPageErrorState, mountPage } from './ui.js';

const ROUTES = [
  { pattern: /^\/generate\/?$/, render: renderGenerate },
  { pattern: /^\/projects\/?$/, render: renderProjects },
  { pattern: /^\/project\/([^/]+)\/?$/, render: renderProject },
  { pattern: /^\/history\/?$/, render: renderHistory },
  { pattern: /^\/settings\/?$/, render: renderSettings },
  { pattern: /^\/detail\/([^/]+)\/?$/, render: renderDetail },
];

export function createRouter({ routes = ROUTES, windowRef = window } = {}) {
  let mainContainer = null;
  let navItems = [];
  let currentCleanup = null;

  function parseHash() {
    let hash = windowRef.location.hash.replace(/^#/, '');
    if (!hash) hash = '/generate';
    if (!hash.startsWith('/')) hash = '/' + hash;
    return hash;
  }

  function updateNav(activeKey) {
    navItems.forEach((item) => {
      const key = item.getAttribute('data-nav-key');
      item.setAttribute('data-active', String(key === activeKey));
    });
  }

  function cleanupCurrentPage() {
    try {
      if (typeof currentCleanup === 'function') currentCleanup();
    } catch (error) {
      console.error('页面清理失败：', error);
    } finally {
      currentCleanup = null;
    }
  }

  function showRenderError() {
    const retry = () => dispatch();
    mountPage(mainContainer, createPageErrorState(), { retry });
  }

  function dispatch() {
    const path = parseHash();
    let activeKey = 'generate';
    if (path.startsWith('/projects') || path.startsWith('/project')) activeKey = 'projects';
    else if (path.startsWith('/history')) activeKey = 'history';
    else if (path.startsWith('/settings')) activeKey = 'settings';
    else if (path.startsWith('/detail')) activeKey = 'history';
    updateNav(activeKey);

    for (const route of routes) {
      const match = route.pattern.exec(path);
      if (!match) continue;

      cleanupCurrentPage();
      try {
        const cleanup = route.render(mainContainer, match.slice(1));
        currentCleanup = typeof cleanup === 'function' ? cleanup : null;
      } catch (error) {
        console.error('页面渲染失败：', error);
        showRenderError();
      }
      mainContainer?.scrollTo?.({ top: 0 });
      return;
    }

    // 未知路由 → 生图
    navigate('/generate');
  }

  function init(container, items) {
    mainContainer = container;
    navItems = items;
    windowRef.addEventListener('hashchange', dispatch);
    dispatch();
  }

  function navigate(path) {
    const target = path.startsWith('#') ? path : '#' + (path.startsWith('/') ? path : '/' + path);
    if (windowRef.location.hash === target) {
      dispatch(); // 同址也刷新
    } else {
      windowRef.location.hash = target;
    }
  }

  return { init, navigate, dispatch };
}

const appRouter = createRouter();

export function initRouter(container, items) {
  appRouter.init(container, items);
}

export function navigate(path) {
  appRouter.navigate(path);
}
