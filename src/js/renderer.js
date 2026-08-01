// 渲染进程入口：初始化外壳导航 + 路由
import { renderIcons, icon } from './icons.js';
import { initRouter, navigate } from './router.js';

function init() {
  renderIcons(document);

  const navItems = Array.from(document.querySelectorAll('.sidebar-item'));
  const mainContent = document.getElementById('main-content');

  // 侧边栏导航
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const key = item.getAttribute('data-nav-key');
      const routeMap = { generate: '/generate', projects: '/projects', history: '/history', models: '/models' };
      if (routeMap[key]) navigate(routeMap[key]);
    });
  });

  initRouter(mainContent, navItems);

  // 顶部标题栏双击最大化（macOS 习惯）由系统处理；这里仅留扩展位
}

document.addEventListener('DOMContentLoaded', init);
