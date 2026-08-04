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

function createBinding({
  manager,
  context,
  prompt = '初始提示词',
  createOverlay,
  controls = [],
  controlInitialDisabled = [],
} = {}) {
  const textarea = createControl(prompt);
  const button = createControl();
  const container = {};
  const controlElements = controls.map((label, index) => {
    const control = createControl(label);
    if (controlInitialDisabled[index]) control.disabled = true;
    return control;
  });
  const toasts = [];
  const closedToasts = [];
  const overlays = [];
  const binding = createPromptOptimizationPageBinding({
    manager,
    context,
    container,
    textarea,
    button,
    toast: (...args) => {
      toasts.push(args);
      return () => closedToasts.push(args);
    },
    controls: controlElements,
    createOverlay: createOverlay
      ? (options) => {
        const overlay = createOverlay(options);
        overlays.push(overlay);
        return overlay;
      }
      : (options) => {
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
  return { binding, textarea, button, controls: controlElements, toasts, closedToasts, overlays };
}

function assertOptimizingUi(view) {
  assert.equal(view.textarea.readOnly, true);
  assert.equal(view.button.disabled, true);
  assert.equal(view.button.getAttribute('aria-busy'), 'true');
  assert.equal(view.button.classList.contains('is-loading'), true);
  assert.equal(view.button.classList.contains('is-optimizing'), true);
  assert.equal(view.textarea.classList.contains('is-optimizing'), true);
  assert.equal(view.overlays.length, 1);
  assert.equal(view.overlays[0].mounted, 1);
  view.controls.forEach((control) => {
    assert.equal(control.disabled, true, '优化期间其他工具栏控件必须禁用');
    assert.equal(control.getAttribute('aria-disabled'), 'true', '优化期间其他控件必须标记 aria-disabled');
    assert.equal(control.classList.contains('is-disabled'), true, '优化期间其他控件必须带有禁用样式类');
  });
}

function assertIdleUi(view) {
  assert.equal(view.textarea.readOnly, false);
  assert.equal(view.button.disabled, false);
  assert.equal(view.button.getAttribute('aria-busy'), null);
  assert.equal(view.button.classList.contains('is-loading'), false);
  assert.equal(view.button.classList.contains('is-optimizing'), false);
  assert.equal(view.textarea.classList.contains('is-optimizing'), false);
}

test('优化中禁用其他工具栏控件，完成后恢复各自初始可用状态', async () => {
  const request = createDeferred();
  const overlaySettlement = createDeferred();
  const manager = createPromptOptimizationManager({ optimize: () => request.promise });
  const view = createBinding({
    manager,
    context: 'quick',
    controls: ['chip', 'upload-button'],
    controlInitialDisabled: [false, true],
    createOverlay: () => {
      const overlay = {
        mounted: 0,
        settled: 0,
        destroyed: 0,
        mount() { this.mounted += 1; },
        settle() {
          this.settled += 1;
          return overlaySettlement.promise;
        },
        destroy() { this.destroyed += 1; },
      };
      return overlay;
    },
  });
  const started = view.binding.start('一只橘猫');
  await Promise.resolve();
  assertOptimizingUi(view);

  request.resolve('优化后的提示词');
  await started.promise;
  await Promise.resolve();
  assert.equal(view.controls[0].disabled, true, '碎片结算期间其他控件必须继续保持禁用');

  overlaySettlement.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assertIdleUi(view);
  assert.equal(view.controls[0].disabled, false);
  assert.equal(view.controls[1].disabled, true, '原本就禁用的控件恢复后必须保持禁用');
  for (const control of view.controls) {
    assert.equal(control.getAttribute('aria-disabled'), null, '完成后必须移除 aria-disabled');
    assert.equal(control.classList.contains('is-disabled'), false, '完成后必须移除优化期禁用样式类');
  }
  view.binding.destroy();
});

test('销毁页面 binding 会关闭本页创建的常驻优化 Toast，但保留共享请求', async () => {
  const deferred = createDeferred();
  const manager = createPromptOptimizationManager({ optimize: () => deferred.promise });
  const view = createBinding({ manager, context: 'quick' });

  const started = view.binding.start('一只橘猫');
  await Promise.resolve();
  assert.deepEqual(view.toasts, [['正在优化提示词…', 'info', { key: 'prompt-optimize:quick', duration: 0 }]]);

  view.binding.destroy();

  assert.deepEqual(view.closedToasts, [view.toasts[0]], '离页时必须关闭由当前 binding 创建的常驻 Toast');
  assert.equal(manager.getState('quick').status, 'optimizing', '关闭 Toast 不得取消共享优化请求');

  deferred.resolve('高细节的橘猫');
  await started.promise;
});

test('成功结果必须等碎片结算完成后写回，并在结算后才清空共享状态', async () => {
  const request = createDeferred();
  const overlaySettlement = createDeferred();
  const manager = createPromptOptimizationManager({ optimize: () => request.promise });
  const overlays = [];
  const view = createBinding({
    manager,
    context: 'quick',
    prompt: '原始提示词',
    createOverlay: (options) => {
      const overlay = {
        options,
        mounted: 0,
        settled: 0,
        destroyed: 0,
        mount() { this.mounted += 1; },
        settle() {
          this.settled += 1;
          return overlaySettlement.promise;
        },
        destroy() { this.destroyed += 1; },
      };
      overlays.push(overlay);
      return overlay;
    },
  });

  const started = view.binding.start('原始提示词');
  request.resolve('优化后的提示词');
  await started.promise;
  await Promise.resolve();

  assert.equal(overlays[0].settled, 1, '成功后必须先发起碎片结算');
  assert.equal(view.textarea.value, '原始提示词', '碎片未结算前不得写入优化结果');
  assert.equal(view.textarea.readOnly, true, '结算期间 textarea 必须继续保持只读');
  assert.equal(view.button.disabled, true, '结算期间不得重复触发优化');
  assert.equal(view.button.classList.contains('is-optimizing'), true);
  assert.equal(view.textarea.classList.contains('is-optimizing'), true);
  assert.equal(manager.getState('quick').status, 'succeeded', '碎片未结算前共享状态不得提前变为 idle');

  overlaySettlement.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(view.textarea.value, '优化后的提示词');
  assertIdleUi(view);
  assert.equal(manager.getState('quick').status, 'idle');

  view.binding.destroy();
});

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

test('同一页面连续优化会在成功和失败结算后重新创建并挂载碎片层', async () => {
  const firstDeferred = createDeferred();
  const secondDeferred = createDeferred();
  const thirdDeferred = createDeferred();
  const pending = [firstDeferred, secondDeferred, thirdDeferred];
  const manager = createPromptOptimizationManager({
    optimize: () => pending.shift().promise,
  });
  const view = createBinding({ manager, context: 'quick' });

  const first = view.binding.start('第一轮');
  firstDeferred.resolve('第一轮结果');
  await first.promise;
  assert.equal(view.overlays.length, 1);
  assert.equal(view.overlays[0].settled, 1);

  const second = view.binding.start('第二轮');
  assert.equal(view.overlays.length, 2, '成功结算后的下一轮必须创建新的 overlay');
  assert.equal(view.overlays[1].mounted, 1, '新的 overlay 必须重新挂载碎片层');
  const error = new Error('第二轮失败');
  secondDeferred.reject(error);
  await assert.rejects(second.promise, error);
  assert.equal(view.overlays[1].settled, 1);

  const third = view.binding.start('第三轮');
  assert.equal(view.overlays.length, 3, '失败结算后的下一轮也必须创建新的 overlay');
  assert.equal(view.overlays[2].mounted, 1);
  thirdDeferred.resolve('第三轮结果');
  await third.promise;
  assert.equal(view.overlays[2].settled, 1);

  view.binding.destroy();
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
