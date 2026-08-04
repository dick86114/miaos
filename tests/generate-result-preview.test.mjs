import assert from 'node:assert/strict';
import test from 'node:test';
import { getLatestQuickDoneTask } from '../src/js/quick-result.js';

test('快速生图主展示区选择最新完成且有图片结果的任务', () => {
  const latest = getLatestQuickDoneTask([
    { id: 'history', source: 'history', status: 'done', finishedAt: 400, result: { image: 'history.png' } },
    { id: 'failed', source: 'quick', status: 'failed', finishedAt: 500 },
    { id: 'no-image', source: 'quick', status: 'done', finishedAt: 600, result: {} },
    { id: 'older', source: 'quick', status: 'done', finishedAt: 100, result: { image: 'older.png' } },
    { id: 'latest', source: 'quick', status: 'done', finishedAt: 300, result: { image: 'latest.png' } },
  ]);

  assert.equal(latest?.id, 'latest');
});

test('没有成功图片时，快速生图主展示区保持空状态', () => {
  assert.equal(getLatestQuickDoneTask([
    { id: 'queued', source: 'quick', status: 'queued' },
    { id: 'failed', source: 'quick', status: 'failed' },
  ]), null);
});

test('主展示结果选择不会改变调用方任务顺序', () => {
  const tasks = [
    { id: 'first', source: 'quick', status: 'done', finishedAt: 100, result: { image: 'first.png' } },
    { id: 'second', source: 'quick', status: 'done', finishedAt: 200, result: { image: 'second.png' } },
  ];
  const before = tasks.map((task) => task.id);

  const latest = getLatestQuickDoneTask(tasks);

  assert.equal(latest?.id, 'second');
  assert.deepEqual(tasks.map((task) => task.id), before);
});
