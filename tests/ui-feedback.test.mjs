import test from 'node:test';
import assert from 'node:assert/strict';
import { toast, withButtonLoading, confirmDialog } from '../src/js/ui.js';

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
    this.textContent = '';
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
