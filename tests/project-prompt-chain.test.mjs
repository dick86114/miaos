import test from 'node:test';
import assert from 'node:assert/strict';

const previousWindow = globalThis.window;
globalThis.window = { location: { hash: '#/project/project-1' }, addEventListener() {}, removeEventListener() {} };
const { buildProjectPromptChain } = await import(`../src/js/pages/project.js?prompt-chain=${Date.now()}-${Math.random()}`);
globalThis.window = previousWindow;

function createImage(id, prompt) {
  return { id, image: `file:///${id}.png`, prompt, createdAt: 1 };
}

function createVersion({ id, parentId = null, parentImageId = null, name, prompt, images = [] }) {
  return { id, parentId, parentImageId, name, prompt, images };
}

test('衍生图片的提示词链按 根→父 顺序包含各级节点与参考图提示词', () => {
  const project = {
    versions: [
      createVersion({ id: 'root', name: '主线·星空', prompt: '浩瀚星空', images: [createImage('root-img', '星空的原始提示词')] }),
      createVersion({
        id: 'child', parentId: 'root', parentImageId: 'root-img', name: '分支·城市', prompt: '城市夜景',
        images: [createImage('child-img', '城市的生成提示词')],
      }),
      createVersion({
        id: 'grandchild', parentId: 'child', parentImageId: 'child-img', name: '分支·雨夜', prompt: '雨夜街道',
        images: [createImage('grandchild-img', '雨夜的生成提示词')],
      }),
    ],
  };

  const chain = buildProjectPromptChain(project, project.versions.find((v) => v.id === 'grandchild'));

  assert.deepEqual(chain.map((node) => node.label), ['主线·星空', '分支·城市']);
  assert.deepEqual(chain.map((node) => node.prompt), ['星空的原始提示词', '城市的生成提示词']);
});

test('参考图缺失 prompt 时回退到父版本提示词，且根版本不产生提示词链', () => {
  const project = {
    versions: [
      createVersion({ id: 'root', name: '根节点', prompt: '根版本提示词', images: [createImage('root-img', null)] }),
      createVersion({ id: 'child', parentId: 'root', parentImageId: 'root-img', name: '子节点', prompt: '子版本提示词' }),
    ],
  };

  const childChain = buildProjectPromptChain(project, project.versions.find((v) => v.id === 'child'));
  assert.deepEqual(childChain, [{ label: '根节点', prompt: '根版本提示词' }]);

  const rootChain = buildProjectPromptChain(project, project.versions.find((v) => v.id === 'root'));
  assert.deepEqual(rootChain, []);
});

test('父版本被删除时提示词链以当前版本终止且不抛错', () => {
  const project = {
    versions: [
      createVersion({ id: 'orphan', parentId: 'missing-parent', parentImageId: 'missing-img', name: '孤儿节点', prompt: '孤儿的提示词' }),
    ],
  };

  const chain = buildProjectPromptChain(project, project.versions[0]);
  assert.deepEqual(chain, []);
});
