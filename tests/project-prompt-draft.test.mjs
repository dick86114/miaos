import test from 'node:test';
import assert from 'node:assert/strict';

import { createComposerDraftStore } from '../src/js/composer-drafts.js';

test('项目提示词与参考图草稿在离开详情页后优先于节点已保存值恢复', () => {
  const drafts = createComposerDraftStore();
  const key = 'project:project-1:child';
  const fallback = { prompt: '父节点保存的提示词', sourceImages: ['/tmp/parent.png'] };

  assert.deepEqual(drafts.read(key, fallback), fallback);

  drafts.write(key, {
    prompt: '用户尚未生成的新提示词',
    sourceImages: ['/tmp/upload.png'],
  });
  assert.deepEqual(drafts.read(key, fallback), {
    prompt: '用户尚未生成的新提示词',
    sourceImages: ['/tmp/upload.png'],
  });

  drafts.clear(key);
  assert.deepEqual(drafts.read(key, fallback), fallback);
});
