import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../src/js/ui.js';

test('转义 HTML 文本，供设置页安全渲染供应商和模型名称', () => {
  assert.equal(typeof ui.escapeHtml, 'function');
  assert.equal(
    ui.escapeHtml('<供应商&"\'>'),
    '&lt;供应商&amp;&quot;&#39;&gt;',
  );
});

test('转义 HTML 属性值，供供应商表单安全回填', () => {
  assert.equal(typeof ui.escapeAttr, 'function');
  assert.equal(
    ui.escapeAttr('名称"<供应商>&\''),
    '名称&quot;&lt;供应商&gt;&amp;&#39;',
  );
});
