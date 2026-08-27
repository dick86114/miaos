import test from 'node:test';
import assert from 'node:assert/strict';

const {
  createRunningTaskTicker,
  formatGenerationDuration,
} = await import(`../src/js/generation-timing.js?generation-timing=${Date.now()}-${Math.random()}`);

test('生图耗时以秒和分钟格式展示', () => {
  assert.equal(formatGenerationDuration(0), '0 秒');
  assert.equal(formatGenerationDuration(58_900), '58 秒');
  assert.equal(formatGenerationDuration(61_000), '1 分 1 秒');
});

test('运行中任务存在时启动计时器，结束后停止并可销毁', () => {
  let intervalCallback = null;
  let clearCount = 0;
  let tickCount = 0;
  const ticker = createRunningTaskTicker({
    getTasks: () => [{ status: 'running' }],
    onTick: () => { tickCount += 1; },
    setIntervalFn: (callback) => {
      intervalCallback = callback;
      return 'timer-id';
    },
    clearIntervalFn: (timerId) => {
      assert.equal(timerId, 'timer-id');
      clearCount += 1;
    },
  });

  ticker.sync([{ status: 'running' }]);
  assert.equal(tickCount, 1);
  intervalCallback();
  assert.equal(tickCount, 2);
  ticker.sync([{ status: 'done' }]);
  assert.equal(clearCount, 1);
  ticker.destroy();
  assert.equal(clearCount, 1);
});
