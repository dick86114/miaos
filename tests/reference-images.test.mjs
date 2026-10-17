import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeReferenceImages,
  normalizeReferenceImages,
} from '../src/js/reference-images.js';

test('旧 sourceImage 会归一化为单元素 sourceImages，并保持原顺序去重', () => {
  assert.deepEqual(normalizeReferenceImages(undefined, '/tmp/old.png'), ['/tmp/old.png']);
  assert.deepEqual(
    normalizeReferenceImages(['/tmp/a.png', '/tmp/b.png', '/tmp/a.png'], '/tmp/legacy.png'),
    ['/tmp/a.png', '/tmp/b.png', '/tmp/legacy.png'],
  );
});

test('追加参考图只接受剩余容量内的新图片并报告溢出数量', () => {
  assert.deepEqual(
    mergeReferenceImages(['/tmp/a.png'], ['/tmp/b.png', '/tmp/a.png', '/tmp/c.png', '/tmp/d.png'], 3),
    {
      images: ['/tmp/a.png', '/tmp/b.png', '/tmp/c.png'],
      accepted: ['/tmp/b.png', '/tmp/c.png'],
      overflowCount: 1,
    },
  );
  assert.deepEqual(
    mergeReferenceImages([], ['/tmp/a.png'], 0),
    { images: [], accepted: [], overflowCount: 1 },
  );
});
