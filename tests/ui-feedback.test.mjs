import test from 'node:test';
import assert from 'node:assert/strict';
import { toast, withButtonLoading, confirmDialog, dismissActiveConfirm, createEventLoopGuard } from '../src/js/ui.js';
import { syncUpdateCheckButton } from '../src/js/pages/settings.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toString() { return [...this.values].join(' '); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.style = {};
    this.listeners = new Map();
    this._textContent = '';
    this.disabled = false;
    this.type = '';
    this.tabIndex = 0;
    this.focused = false;
  }

  set className(value) {
    this.classList = new FakeClassList();
    String(value).split(/\s+/).filter(Boolean).forEach((item) => this.classList.add(item));
  }

  get className() { return this.classList.toString(); }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) { children.forEach((child) => this.appendChild(child)); }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this._textContent = '';
    children.forEach((child) => this.appendChild(child));
  }

  get childNodes() { return this.children; }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }

  dispatchEvent(event) {
    const payload = { target: this, preventDefault() {}, ...event };
    (this.listeners.get(payload.type) || []).forEach((listener) => listener(payload));
    return true;
  }

  set textContent(value) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this._textContent = String(value);
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  focus() { this.focused = true; this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { width: 120, height: 36 }; }

  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attr) return attr[2] == null ? this.hasAttribute(attr[1]) : this.getAttribute(attr[1]) === attr[2];
    return this.tagName === selector.toUpperCase();
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }
}

function createDocument() {
  const documentRef = {
    activeElement: null,
    createElement(tagName) { return new FakeElement(tagName, documentRef); },
    createElementNS(_namespace, tagName) { return new FakeElement(tagName, documentRef); },
    createTextNode(text) { const node = new FakeElement('#text', documentRef); node.textContent = text; return node; },
    body: null,
    addEventListener() {},
    removeEventListener() {},
  };
  documentRef.body = documentRef.createElement('body');
  return documentRef;
}

function withFakeDom(run) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const documentRef = createDocument();
  globalThis.document = documentRef;
  globalThis.window = { document: documentRef, confirm: () => true };
  const restore = () => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  };
  try {
    const result = run(documentRef);
    if (result && typeof result.then === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('相同 key 的 Toast 复用节点、更新文案并支持手动关闭', () => {
  withFakeDom((documentRef) => {
    const firstClose = toast('正在连接…', 'info', { key: 'provider-test', duration: 0 });
    const secondClose = toast('连接成功', 'success', { key: 'provider-test', duration: 0 });
    const stack = documentRef.body.querySelector('.toast-stack');
    const notices = stack.querySelectorAll('.toast');

    assert.equal(notices.length, 1);
    assert.equal(notices[0].getAttribute('aria-live'), 'polite');
    assert.equal(notices[0].querySelector('.toast-message').textContent, '连接成功');
    assert.equal(typeof firstClose, 'function');
    assert.equal(secondClose, firstClose);

    notices[0].querySelector('.toast-close').dispatchEvent({ type: 'click' });
    assert.equal(notices[0].classList.contains('fade-out'), true);
    notices[0].dispatchEvent({ type: 'animationend', animationName: 'toastOut' });
    assert.equal(stack.querySelectorAll('.toast').length, 0);
  });
});

test('异步按钮 loading 期间禁用重复操作，失败后恢复原文案与可用状态', async () => {
  await withFakeDom(async (documentRef) => {
    const button = documentRef.createElement('button');
    const label = documentRef.createElement('span');
    label.textContent = '测试连接';
    button.appendChild(label);

    let calls = 0;
    const first = withButtonLoading(button, '测试中…', async () => {
      calls += 1;
      assert.equal(button.disabled, true);
      assert.equal(label.textContent, '测试中…');
      await Promise.resolve();
      throw new Error('请求失败');
    });
    const duplicate = withButtonLoading(button, '测试中…', async () => { calls += 1; });

    await assert.rejects(first, /请求失败/);
    await duplicate;
    assert.equal(calls, 1);
    assert.equal(button.disabled, false);
    assert.equal(label.textContent, '测试连接');
    assert.equal(button.style.minWidth, '120px');
    assert.equal(button.style.minHeight, '36px');
  });
});

test('应用内确认弹窗可用 Escape 与取消返回 false，并恢复触发元素焦点', async () => {
  await withFakeDom(async (documentRef) => {
    const trigger = documentRef.createElement('button');
    documentRef.body.appendChild(trigger);
    trigger.focus();
    const pending = confirmDialog('确定删除吗？');
    const overlay = documentRef.body.querySelector('.confirm-dialog-overlay');
    assert.ok(overlay);

    overlay.dispatchEvent({ type: 'keydown', key: 'Escape' });
    assert.equal(await pending, false);
    assert.equal(documentRef.activeElement, trigger);

    const pendingCancel = confirmDialog('确定删除吗？');
    documentRef.body.querySelector('[data-confirm-cancel]').dispatchEvent({ type: 'click' });
    assert.equal(await pendingCancel, false);
  });
});

test('无 DOM 环境保留原生 confirm fallback 的布尔结果', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = undefined;
  globalThis.window = { confirm: () => false };
  try {
    assert.equal(confirmDialog('确认吗？'), false);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});


test('图标型按钮加载不会因 textContent 清空 SVG，完成后恢复完整子节点', async () => {
  await withFakeDom(async (documentRef) => {
    const button = documentRef.createElement('button');
    const icon = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('data-original-icon', 'true');
    button.appendChild(icon);

    await withButtonLoading(button, '处理中…', async () => {
      assert.equal(button.children.length, 1);
      assert.equal(button.children[0].tagName, 'SPAN');
    });

    assert.equal(button.children.length, 1);
    assert.equal(button.children[0].tagName, 'SVG');
    assert.equal(button.children[0].getAttribute('data-original-icon'), 'true');

    await assert.rejects(
      withButtonLoading(button, '处理中…', async () => { throw new Error('失败'); }),
      /失败/,
    );
    assert.equal(button.children.length, 1);
    assert.equal(button.children[0].tagName, 'SVG');
  });
});

test('更新状态按 checking → not-available/error 顺序恢复检查按钮', () => {
  withFakeDom((documentRef) => {
    const button = documentRef.createElement('button');
    const label = documentRef.createElement('span');
    label.textContent = '检查更新';
    button.appendChild(label);

    syncUpdateCheckButton(button, 'checking');
    assert.equal(button.disabled, true);
    assert.equal(label.textContent, '检查中…');

    syncUpdateCheckButton(button, 'not-available');
    assert.equal(button.disabled, false);
    assert.equal(label.textContent, '检查更新');

    syncUpdateCheckButton(button, 'checking');
    syncUpdateCheckButton(button, 'error');
    assert.equal(button.disabled, false);
    assert.equal(label.textContent, '检查更新');
  });
});

test('确认取消与确认均只结算一次，集中关闭后保持 false', async () => {
  await withFakeDom(async (documentRef) => {
    const accepted = confirmDialog('确定删除吗？');
    const accept = documentRef.body.querySelector('[data-confirm-accept]');
    accept.dispatchEvent({ type: 'click' });
    accept.dispatchEvent({ type: 'click' });
    assert.equal(await accepted, true);

    const pending = confirmDialog('确定删除吗？');
    const pendingAccept = documentRef.body.querySelector('[data-confirm-accept]');
    pendingAccept.dispatchEvent({ type: 'click' });
    dismissActiveConfirm();
    assert.equal(await pending, false);
  });
});

test('同一事件循环内的生成防重只执行一次，下一轮允许再次执行', async () => {
  let calls = 0;
  const guard = createEventLoopGuard(() => { calls += 100; });
  const handler = () => guard(() => { calls += 1; });
  handler();
  handler();
  assert.equal(calls, 101);

  await Promise.resolve();
  handler();
  assert.equal(calls, 102);
});

async function loadRouterForConfirmTest() {
  const moduleUrl = new URL(`../src/js/router.js?confirm-lifecycle=${Date.now()}-${Math.random()}`, import.meta.url);
  return import(moduleUrl.href);
}

test('路由切换会集中关闭未决确认，旧确认不能删除或覆盖新路由', async () => {
  await withFakeDom(async (documentRef) => {
    globalThis.window.location = { hash: '#/first' };
    globalThis.window.addEventListener = () => {};
    const { createRouter } = await loadRouterForConfirmTest();
    const container = documentRef.createElement('main');
    let deleted = 0;
    let oldConfirmHandler;
    const router = createRouter({
      windowRef: globalThis.window,
      routes: [
        {
          pattern: /^\/first\/?$/,
          render() {
            oldConfirmHandler = async () => {
              if (await confirmDialog('确定删除吗？')) deleted += 1;
            };
            return () => {};
          },
        },
        { pattern: /^\/second\/?$/, render() { return () => {}; } },
      ],
    });

    router.init(container, []);
    const pending = oldConfirmHandler();
    const oldAccept = documentRef.body.querySelector('[data-confirm-accept]');
    assert.ok(oldAccept);

    globalThis.window.location.hash = '#/second';
    router.dispatch();
    oldAccept.dispatchEvent({ type: 'click' });
    await pending;

    assert.equal(deleted, 0);
    assert.equal(documentRef.body.querySelector('.confirm-dialog-overlay'), null);
  });
});
