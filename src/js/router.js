// 极简 hash 路由
// 路由格式：#/generate  #/projects  #/project/:id  #/history  #/settings  #/detail/:id
import { renderGenerate } from './pages/generate.js';
import { renderProjects } from './pages/projects.js';
import { renderProject } from './pages/project.js';
import { renderHistory } from './pages/history.js';
import { renderDetail } from './pages/detail.js';
import { renderSettings } from './pages/settings.js';

const ROUTES = [
  { pattern: /^\/generate\/?$/, render: renderGenerate },
  { pattern: /^\/projects\/?$/, render: renderProjects },
  { pattern: /^\/project\/([^/]+)\/?$/, render: renderProject },
  { pattern: /^\/history\/?$/, render: renderHistory },
  { pattern: /^\/settings\/?$/, render: renderSettings },
  { pattern: /^\/detail\/([^/]+)\/?$/, render: renderDetail },
];

let mainContainer = null;
let navItems = [];

export function initRouter(container, items) {
  mainContainer = container;
  navItems = items;
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

export function navigate(path) {
  if (!path.startsWith('#')) path = '#' + (path.startsWith('/') ? path : '/' + path);
  if (window.location.hash === path) {
    dispatch(); // 同址也刷新
  } else {
    window.location.hash = path;
  }
}

function parseHash() {
  let h = window.location.hash.replace(/^#/, '');
  if (!h) h = '/generate';
  if (!h.startsWith('/')) h = '/' + h;
  return h;
}

function updateNav(activeKey) {
  navItems.forEach((item) => {
    const key = item.getAttribute('data-nav-key');
    item.setAttribute('data-active', String(key === activeKey));
  });
}

function dispatch() {
  const path = parseHash();
  // 计算高亮的导航项
  let activeKey = 'generate';
  if (path.startsWith('/projects') || path.startsWith('/project')) activeKey = 'projects';
  else if (path.startsWith('/history')) activeKey = 'history';
  else if (path.startsWith('/settings')) activeKey = 'settings';
  else if (path.startsWith('/detail')) activeKey = 'history'; // 详情页高亮"历史"
  updateNav(activeKey);

  for (const route of ROUTES) {
    const match = route.pattern.exec(path);
    if (match) {
      const params = match.slice(1);
      route.render(mainContainer, params);
      // 滚动到顶部
      mainContainer.scrollTo({ top: 0 });
      return;
    }
  }
  // 未知路由 → 生图
  navigate('/generate');
}
