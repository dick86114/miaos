import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createPromptOptimizationManager } from '../src/js/prompt-optimization.js';

const previousWindow = globalThis.window;
globalThis.window = { location: { hash: '#/generate' }, addEventListener() {}, removeEventListener() {} };
const { createPromptOptimizationPageBinding } = await import(`../src/js/pages/generate.js?prompt-optimization=${Date.now()}`);
globalThis.window = previousWindow;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : Boolean(force);
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    },
  };
}

function createControl(value = '') {
  const attributes = new Map();
  return {
    value,
    readOnly: false,
    disabled: false,
    classList: createClassList(),
    setAttribute(name, attributeValue) { attributes.set(name, String(attributeValue)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; },
  };
}

function createBinding({ manager, context, prompt = '初始提示词' }) {
  const textarea = createControl(prompt);
  const button = createControl();
  const particleField = createControl();
  const container = {};
  const toasts = [];
  const overlays = [];
  const binding = createPromptOptimizationPageBinding({
    manager,
    context,
    container,
    textarea,
    button,
    particleField,
    toast: (...args) => toasts.push(args),
    createOverlay: (options) => {
      const overlay = {
        options,
        mounted: 0,
        settled: 0,
        destroyed: 0,
        mount() { this.mounted += 1; },
        settle() { this.settled += 1; },
        destroy() { this.destroyed += 1; },
      };
      overlays.push(overlay);
      return overlay;
    },
  });
  return { binding, textarea, button, particleField, toasts, overlays };
}

function assertOptimizingUi(view) {
  assert.equal(view.textarea.readOnly, true);
  assert.equal(view.button.disabled, true);
  assert.equal(view.button.getAttribute('aria-busy'), 'true');
  assert.equal(view.button.classList.contains('is-loading'), true);
  assert.equal(view.button.classList.contains('is-optimizing'), true);
  assert.equal(view.textarea.classList.contains('is-optimizing'), true);
  assert.equal(view.particleField.classList.contains('is-optimizing'), true);
  assert.equal(view.overlays.length, 1);
  assert.equal(view.overlays[0].mounted, 1);
}

function assertIdleUi(view) {
  assert.equal(view.textarea.readOnly, false);
  assert.equal(view.button.disabled, false);
  assert.equal(view.button.getAttribute('aria-busy'), null);
  assert.equal(view.button.classList.contains('is-loading'), false);
  assert.equal(view.button.classList.contains('is-optimizing'), false);
  assert.equal(view.textarea.classList.contains('is-optimizing'), false);
  assert.equal(view.particleField.classList.contains('is-optimizing'), false);
}

test('快速页离开后重新挂载会恢复共享 optimizing 状态且重复启动不会创建第二个请求', async () => {
  const deferred = createDeferred();
  let calls = 0;
  const manager = createPromptOptimizationManager({
    optimize: () => {
      calls += 1;
      return deferred.promise;
    },
  });
  const firstView = createBinding({ manager, context: 'quick' });

  const first = firstView.binding.start('一只橘猫');
  const duplicate = firstView.binding.start('另一只橘猫');
  assert.equal(first.started, true);
  assert.deepEqual(duplicate, { started: false, reason: 'optimizing' });
  await Promise.resolve();
  assert.equal(calls, 1);
  assertOptimizingUi(firstView);

  firstView.binding.destroy();
  assert.equal(firstView.overlays[0].destroyed, 1, '离页只清理覆盖层');
  assert.equal(manager.getState('quick').status, 'optimizing', '离页不得取消共享请求');

  const remountedView = createBinding({ manager, context: 'quick', prompt: '旧提示词' });
  assertOptimizingUi(remountedView);
  assert.equal(calls, 1, '重新挂载不得重新发起请求');

  deferred.resolve('高细节的橘猫');
  await first.promise;
  assert.equal(remountedView.textarea.value, '高细节的橘猫');
  assertIdleUi(remountedView);
  assert.equal(remountedView.overlays[0].settled, 1);
  assert.equal(manager.getState('quick').status, 'idle', '成功状态只能被当前挂载页面消费一次');
  assert.equal(remountedView.toasts.filter(([message]) => message === '提示词已优化').length, 1);

  remountedView.binding.destroy();
});

test('项目页离开期间失败后重新挂载会显示错误并恢复编辑', async () => {
  const deferred = createDeferred();
  const manager = createPromptOptimizationManager({ optimize: () => deferred.promise });
  const context = 'project:project-42:version:version-7';
  const firstView = createBinding({ manager, context });
  const started = firstView.binding.start('雨夜街道');
  assert.equal(started.started, true);
  firstView.binding.destroy();

  const error = new Error('优化服务不可用');
  deferred.reject(error);
  await assert.rejects(started.promise, error);

  const remountedView = createBinding({ manager, context });
  assertIdleUi(remountedView);
  assert.equal(remountedView.overlays.length, 1);
  assert.equal(remountedView.overlays[0].settled, 1);
  assert.equal(manager.getState(context).status, 'idle', '失败状态只能被当前挂载页面消费一次');
  assert.deepEqual(remountedView.toasts.at(-1), ['优化失败：优化服务不可用', 'error', { key: `prompt-optimize:${context}` }]);

  remountedView.binding.destroy();
});

test('项目页仅在项目和当前版本均存在时创建组合上下文并在清理时保留请求', async () => {
  const source = await readFile(new URL('../src/js/pages/project.js', import.meta.url), 'utf8');
  assert.match(source, /if \(btnOptimize && projectId && curVer\?\.id\) \{/u);
  assert.match(source, /context:\s*`project:\$\{projectId\}:\$\{curVer\.id\}`/u);
  assert.match(source, /promptOptimizationBinding\?\.destroy\(\);/u);
  assert.doesNotMatch(source, /promptOptimizationManager\.clear\(/u, '页面 cleanup 不得清空共享优化请求');
});
