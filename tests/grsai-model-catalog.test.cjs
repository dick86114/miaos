const test = require('node:test');
const assert = require('node:assert/strict');

const { parseGrsaiModelCatalog } = require('../src/main/services/grsai-model-catalog');

function createCatalogHtml(models) {
  // 还原 Grsai 页面中 Next.js 序列化数据的一层字符串包装。
  const serialized = JSON.stringify({ models });
  return `<html><script>self.__next_f.push([1, ${JSON.stringify(serialized)}])</script></html>`;
}

test('Grsai 模型目录只返回可调用模型并过滤维护或关闭模型', () => {
  const html = createCatalogHtml([
    {
      name: 'gpt-image-2',
      desc: '正常模型',
      type: 'image',
      closeModel: false,
      maintenance: '',
    },
    {
      name: 'gpt-image-2.5-sunburst',
      desc: '维护中模型',
      type: 'image',
      closeModel: false,
      maintenance: '维护中，模型正在修复',
    },
    {
      name: 'gpt-image-2.5-flare',
      desc: '已关闭模型',
      type: 'image',
      closeModel: true,
      maintenance: '',
    },
    {
      name: 'gpt-5.5',
      desc: '文本模型',
      type: 'text',
      closeModel: false,
      maintenance: '',
    },
  ]);

  assert.deepEqual(parseGrsaiModelCatalog(html, 'image'), [
    { id: 'gpt-image-2', name: '正常模型' },
  ]);
});

test('Grsai 维护状态只按非空文案判断', () => {
  const html = createCatalogHtml([
    {
      name: 'model-active',
      desc: '空维护字段',
      type: 'image',
      closeModel: false,
      maintenance: '   ',
    },
  ]);

  assert.deepEqual(parseGrsaiModelCatalog(html, 'image'), [
    { id: 'model-active', name: '空维护字段' },
  ]);
});
