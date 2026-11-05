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

test('输入区草稿同时保留供应商、模型、比例、质量与数量，避免预览返回后重置', () => {
  const drafts = createComposerDraftStore();
  drafts.write('quick', {
    prompt: '雨夜城市',
    sourceImages: [],
    providerId: 'p_grsai',
    modelId: 'nano-banana-2',
    ratio: '16:9',
    quality: '超高清',
    quantity: 4,
  });

  assert.deepEqual(drafts.read('quick'), {
    prompt: '雨夜城市',
    sourceImages: [],
    providerId: 'p_grsai',
    modelId: 'nano-banana-2',
    ratio: '16:9',
    quality: '超高清',
    quantity: 4,
  });

  drafts.write('quick', { prompt: '只更新提示词' });
  const preserved = drafts.read('quick');
  assert.equal(preserved.modelId, 'nano-banana-2');
  assert.equal(preserved.ratio, '16:9');
  assert.equal(preserved.quality, '超高清');
  assert.equal(preserved.quantity, 4);
});
