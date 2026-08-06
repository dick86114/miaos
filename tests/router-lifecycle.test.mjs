import test from 'node:test';
import assert from 'node:assert/strict';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.className = '';
    this.parentElement = null;
    this._textContent = '';
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get('click')?.({ preventDefault() {} });
  }

  querySelector(selector) {
    if (selector === '[data-page-retry]' && this.attributes.has('data-page-retry')) return this;
    for (const child of this.children) {
      const result = child.querySelector(selector);
      if (result) return result;
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  scrollTo() {}

  set textContent(value) {
    this._textContent = String(value);
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }
}

function createWindow(initialHash = '#/first') {
  return {
    location: { hash: initialHash },
    addEventListener() {},
  };
}

function createDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
}

async function loadRouter() {
  const moduleUrl = new URL(`../src/js/router.js?router-lifecycle=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(moduleUrl.href);
}

test('路由切换和同址刷新都会恰好清理上一个页面', async () => {
  globalThis.document = createDocument();
  globalThis.window = createWindow('#/first');
  const { createRouter } = await loadRouter();
  const container = new FakeElement();
  let firstRenderCount = 0;
  let secondRenderCount = 0;
  let cleanupCount = 0;
  const router = createRouter({
    windowRef: globalThis.window,
    routes: [
      { pattern: /^\/first\/?$/, render() { firstRenderCount += 1; return () => { cleanupCount += 1; }; } },
      { pattern: /^\/second\/?$/, render() { secondRenderCount += 1; return () => { cleanupCount += 1; }; } },
    ],
  });

  router.init(container, []);
  router.navigate('/first');
  router.navigate('/second');
  router.dispatch();

  assert.equal(firstRenderCount, 2);
  assert.equal(secondRenderCount, 1);
  assert.equal(cleanupCount, 2);
});

test('页面渲染异常时显示中文可恢复错误状态，重试会重新执行当前路由', async () => {
  globalThis.document = createDocument();
  globalThis.window = createWindow('#/broken');
  const { createRouter } = await loadRouter();
  const container = new FakeElement();
  let renderCount = 0;
  const router = createRouter({
    windowRef: globalThis.window,
    routes: [{
      pattern: /^\/broken\/?$/,
      render() {
        renderCount += 1;
        if (renderCount === 1) throw new Error('设置页模板异常');
        container.replaceChildren(new FakeElement());
        return undefined;
      },
    }],
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    router.init(container, []);

    assert.match(container.textContent, /页面加载失败/);
    assert.match(container.textContent, /重新加载/);
    const retryButton = container.querySelector('[data-page-retry]');
    assert.ok(retryButton);

    retryButton.click();
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(renderCount, 2);
  assert.equal(container.textContent, '');
});

test('项目路由解析版本和图片定位参数并传给项目页', async () => {
  globalThis.document = createDocument();
  globalThis.window = createWindow('#/project/project-1?version=version%20A&image=image-2');
  const { createRouter } = await loadRouter();
  const container = new FakeElement();
  let received = null;
  const router = createRouter({
    windowRef: globalThis.window,
    routes: [{
      pattern: /^\/project\/([^/]+)\/?$/,
      render(_container, params, routeOptions) {
        received = { params, routeOptions };
      },
    }],
  });

  router.init(container, []);

  assert.deepEqual(received, {
    params: ['project-1'],
    routeOptions: { version: 'version A', image: 'image-2' },
  });
});

test('详情页左侧菜单按进入来源高亮，而不是按图片来源高亮', async () => {
  globalThis.document = createDocument();
  globalThis.window = createWindow('#/detail/image-1?source=quick&origin=generate');
  const { createRouter } = await loadRouter();
  const container = new FakeElement();
  const navItems = ['generate', 'projects', 'history'].map((key) => {
    const item = new FakeElement('button');
    item.setAttribute('data-nav-key', key);
    return item;
  });
  const router = createRouter({
    windowRef: globalThis.window,
    routes: [{ pattern: /^\/detail\/([^/]+)\/?$/, render() {} }],
  });

  router.init(container, navItems);
  assert.equal(navItems[0].getAttribute('data-active'), 'true');
  assert.equal(navItems[2].getAttribute('data-active'), 'false');

  globalThis.window.location.hash = '#/detail/image-2?source=project&origin=history';
  router.dispatch();
  assert.equal(navItems[1].getAttribute('data-active'), 'false');
  assert.equal(navItems[2].getAttribute('data-active'), 'true');

  globalThis.window.location.hash = '#/detail/image-3?source=project&origin=project';
  router.dispatch();
  assert.equal(navItems[1].getAttribute('data-active'), 'true');
});
