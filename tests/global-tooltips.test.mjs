import assert from 'node:assert/strict';
import test from 'node:test';
import { initGlobalTooltips } from '../src/js/tooltips.js';

const WAIT_AFTER_ENTER_MS = 1150;

function createFakeElement(tagName = 'button') {
  const element = {
    tagName,
    isConnected: true,
    ownerDocument: null,
    attributes: new Map(),
    classNames: new Set(),
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 56, height: 34, bottom: 34, right: 56 }),
  };

  element.setAttribute = (name, value) => element.attributes.set(name, String(value));
  element.getAttribute = (name) => element.attributes.get(name) ?? null;
  element.hasAttribute = (name) => element.attributes.has(name);
  element.contains = (node) => node === element || Boolean(node && element.descendants?.has(node));
  element.closest = (selector) => {
    if (selector === '[data-tooltip]' && element.hasAttribute('data-tooltip')) return element;
    if (selector === '.composer-chip.is-open') return null;
    return null;
  };
  element.remove = () => {
    element.isConnected = false;
    element.parentDocument?.removeChild?.(element);
  };

  return element;
}

function createFakeDocument() {
  const documentRef = {
    children: [],
    body: null,
    querySelector: () => null,
    defaultView: null,
    createElement() {
      const element = createFakeElement('div');
      element.ownerDocument = documentRef;
      element.classList = {
        add: (...names) => names.forEach((name) => element.classNames.add(name)),
        remove: (...names) => names.forEach((name) => element.classNames.delete(name)),
      };
      element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 44, bottom: 44, right: 240 });
      return element;
    },
    appendChild(element) {
      element.parentDocument = documentRef;
      this.children.push(element);
      return element;
    },
    removeChild(element) {
      const index = this.children.indexOf(element);
      if (index >= 0) this.children.splice(index, 1);
      return element;
    },
    addEventListener() {},
    removeEventListener() {},
    dispatch(type, event) {
      (this.listeners?.get(type) || []).forEach((listener) => listener(event));
    },
  };
  documentRef.body = { appendChild: (element) => documentRef.appendChild(element) };
  return documentRef;
}

function createFakeWindow() {
  return {
    innerWidth: 1200,
    addEventListener() {},
    removeEventListener() {},
  };
}

function createEvent(target, relatedTarget = null) {
  return { target, relatedTarget };
}

async function waitForHoverDelay() {
  await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_ENTER_MS));
}

test('进入控件 1 秒后显示；内部移动不关闭；移出控件立即关闭', async () => {
  const documentRef = createFakeDocument();
  const listeners = new Map();
  documentRef.listeners = listeners;
  documentRef.defaultView = createFakeWindow();
  documentRef.addEventListener = (type, listener) => {
    const items = listeners.get(type) || [];
    items.push(listener);
    listeners.set(type, items);
  };
  documentRef.removeEventListener = (type, listener) => {
    listeners.set(type, (listeners.get(type) || []).filter((item) => item !== listener));
  };

  const cleanup = initGlobalTooltips(documentRef, documentRef.defaultView);
  const target = createFakeElement();
  const icon = createFakeElement('span');
  target.descendants = new Set([icon]);
  target.ownerDocument = documentRef;
  target.setAttribute('data-tooltip', '上传本地图片作为图生图参考。');

  documentRef.dispatch('pointerover', createEvent(target));
  assert.equal(documentRef.children.length, 0, '停留不足 1 秒不应显示');

  documentRef.dispatch('pointerout', createEvent(target, icon));
  assert.equal(documentRef.children.length, 0, '控件内部移动不应取消计时');

  await waitForHoverDelay();
  assert.equal(documentRef.children.length, 1, '停留 1 秒后应显示');
  assert.equal(documentRef.children[0].classNames.has('is-visible'), true, '悬浮说明应处于可见状态');

  documentRef.dispatch('pointerout', createEvent(target, icon));
  assert.equal(documentRef.children[0].classNames.has('is-visible'), true, '控件内部移动不应关闭悬浮说明');

  documentRef.dispatch('pointerout', createEvent(target, null));
  assert.equal(documentRef.children[0].classNames.has('is-visible'), false, '移出控件应立即开始关闭');

  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal(documentRef.children.length, 0, '悬浮说明最终应从文档移除');

  cleanup();
});
