import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isModelOptionSelected } from '../src/js/model-selection.js';

const root = new URL('..', import.meta.url);

test('不同供应商下的同名模型只选中当前供应商', () => {
  const modelId = 'gpt-image-2.5-sunburst';
  assert.equal(isModelOptionSelected('p_primary', modelId, 'p_primary', modelId), true);
  assert.equal(isModelOptionSelected('p_klong', modelId, 'p_primary', modelId), false);
  assert.equal(isModelOptionSelected('p_primary', 'gpt-image-2.5-flare', 'p_primary', modelId), false);
  assert.equal(isModelOptionSelected('', modelId, '', modelId), false);
});

test('快速生图和项目生图都使用供应商与模型双 ID 判定选中项', async () => {
  const [generate, project] = await Promise.all([
    readFile(new URL('src/js/pages/generate.js', root), 'utf8'),
    readFile(new URL('src/js/pages/project.js', root), 'utf8'),
  ]);

  for (const [pageName, source] of [['快速生图', generate], ['项目生图', project]]) {
    assert.match(source, /import \{ isModelOptionSelected \} from '\.\.\/model-selection\.js';/u, `${pageName}必须复用统一选中判定`);
    assert.match(
      source,
      /const active = isModelOptionSelected\(p\.id, m\.id, currentProviderId, currentModelId\);/u,
      `${pageName}必须同时比较供应商与模型 ID`,
    );
    assert.doesNotMatch(
      source,
      /const active = m\.id === currentModelId(?: && p\.id === currentProviderId)?;/u,
      `${pageName}不得只按模型 ID 标记选中项`,
    );
  }
});
