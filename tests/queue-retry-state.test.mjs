import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../src/js/queue.js';
import { getQuickQueueViewState } from '../src/js/queue-view-state.js';

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('失败任务可原地重新排队并保留原始生成参数', async () => {
  let attempt = 0;
  const queue = createQueue({
    uid: () => 'task-retry',
    generateImage: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('临时失败');
      return { id: 'image-ok' };
    },
  });
  queue.enqueue({ source: 'quick', prompt: '猫', providerId: 'p', modelId: 'm', ratio: '4:3', quality: '高清' });
  await flush();
  const failed = queue.getTasks()[0];
  assert.equal(failed.status, 'failed');
  assert.equal(queue.retry('task-retry'), true);
  const queued = queue.getTasks()[0];
  assert.equal(queued.status, 'queued');
  assert.equal(queued.prompt, '猫');
  assert.equal(queued.modelId, 'm');
  assert.equal('error' in queued, false);
  await flush();
  assert.equal(queue.getTasks()[0].status, 'done');
  assert.equal(queue.getTasks()[0].retryCount, 1);
});

test('只有失败任务时不再显示生成中，也不显示取消未开始', () => {
  const failedOnly = getQuickQueueViewState([
    { id: 'a', source: 'quick', status: 'failed' },
    { id: 'b', source: 'quick', status: 'failed' },
  ]);
  assert.equal(failedOnly.title, '生成失败');
  assert.equal(failedOnly.icon, 'alert-circle');
  assert.equal(failedOnly.isGenerating, false);
  assert.equal(failedOnly.showCancelQueued, false);
  assert.equal(failedOnly.countText, '2 个失败任务');

  const mixed = getQuickQueueViewState([
    { id: 'a', source: 'quick', status: 'running' },
    { id: 'b', source: 'quick', status: 'queued' },
    { id: 'c', source: 'quick', status: 'failed' },
  ]);
  assert.equal(mixed.title, '生成中');
  assert.equal(mixed.isGenerating, true);
  assert.equal(mixed.showCancelQueued, true);
  assert.equal(mixed.countText, '2 个进行中 · 1 个失败');
});
