import assert from 'node:assert/strict';
import test from 'node:test';

import { createComposerDraftStore } from '../src/js/composer-drafts.js';

test('输入区草稿同时保留提示词与参考图，并在无草稿时回退到已保存值', () => {
  const drafts = createComposerDraftStore();
  assert.deepEqual(drafts.read('quick', { prompt: '已保存提示词', sourceImages: ['/tmp/old.png'] }), {
    prompt: '已保存提示词',
    sourceImages: ['/tmp/old.png'],
  });

  drafts.write('quick', {
    prompt: '尚未生成的提示词',
    sourceImages: ['/tmp/a.png', '/tmp/b.png'],
  });
  assert.deepEqual(drafts.read('quick', { prompt: '已保存提示词', sourceImages: [] }), {
    prompt: '尚未生成的提示词',
    sourceImages: ['/tmp/a.png', '/tmp/b.png'],
  });

  drafts.clear('quick');
  assert.deepEqual(drafts.read('quick', { prompt: '已保存提示词', sourceImages: ['/tmp/old.png'] }), {
    prompt: '已保存提示词',
    sourceImages: ['/tmp/old.png'],
  });
});

test('读取草稿返回独立数组，页面修改不会污染会话草稿', () => {
  const drafts = createComposerDraftStore();
  drafts.write('project:1:2', { prompt: '提示词', sourceImages: ['/tmp/a.png'] });
  const first = drafts.read('project:1:2');
  first.sourceImages.push('/tmp/b.png');
  assert.deepEqual(drafts.read('project:1:2').sourceImages, ['/tmp/a.png']);
});
