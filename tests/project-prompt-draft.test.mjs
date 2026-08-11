import test from 'node:test';
import assert from 'node:assert/strict';

const previousWindow = globalThis.window;
globalThis.window = { location: { hash: '#/project/project-1' }, addEventListener() {}, removeEventListener() {} };
const { createProjectPromptDraftStore } = await import(`../src/js/pages/project.js?prompt-draft=${Date.now()}-${Math.random()}`);
globalThis.window = previousWindow;

test('项目提示词草稿在离开详情页后优先于节点已保存提示词恢复', () => {
  const drafts = createProjectPromptDraftStore();

  assert.equal(drafts.read('project-1', 'child', '父节点保存的提示词'), '父节点保存的提示词');

  drafts.write('project-1', 'child', '用户尚未生成的新提示词');
  assert.equal(drafts.read('project-1', 'child', '父节点保存的提示词'), '用户尚未生成的新提示词');

  drafts.write('project-1', 'child', '');
  assert.equal(drafts.read('project-1', 'child', '父节点保存的提示词'), '');

  drafts.clear('project-1', 'child');
  assert.equal(drafts.read('project-1', 'child', '父节点保存的提示词'), '父节点保存的提示词');
});
