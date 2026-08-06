import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildImageDetailRoute,
  buildProjectPromptChain,
  resolveImageDetailRecord,
} = await import(`../src/js/image-detail-data.js?image-detail=${Date.now()}-${Math.random()}`);

function createImage(id, prompt) {
  return {
    id,
    image: `file:///${id}.png`,
    prompt,
    providerId: 'provider-1',
    providerName: '供应商',
    modelId: '模型-1',
    ratio: '1:1',
    quality: '高清',
    createdAt: 1,
  };
}

function createProject() {
  const rootImage = createImage('root-image', '根节点参考图提示词');
  const parentImage = createImage('parent-image', '父节点参考图提示词');
  const childImage = createImage('child-image', '当前图片完整提示词');
  return {
    id: 'project-1',
    name: '项目一',
    versions: [
      { id: 'root', name: '根节点', prompt: '根节点版本提示词', images: [rootImage] },
      { id: 'parent', name: '父节点', parentId: 'root', parentImageId: rootImage.id, prompt: '父节点版本提示词', images: [parentImage] },
      { id: 'child', name: '当前节点', parentId: 'parent', parentImageId: parentImage.id, prompt: '当前版本提示词', images: [childImage] },
    ],
  };
}

test('快速图片详情保留完整提示词并返回快速生图', () => {
  const history = [createImage('quick-image', '快速生图完整提示词')];
  const detail = resolveImageDetailRecord({ imageId: 'quick-image', source: 'quick', origin: 'generate' }, { history, projects: [] });

  assert.equal(detail.source, 'quick');
  assert.equal(detail.prompt, '快速生图完整提示词');
  assert.deepEqual(detail.promptChain, []);
  assert.deepEqual(detail.backTarget, { label: '返回快速生图', path: '/generate' });
  assert.equal(buildImageDetailRoute(detail, { origin: 'generate' }), '/detail/quick-image?source=quick&origin=generate');
});

test('项目图片详情完整展示当前提示词，并按根到父顺序返回父节点提示词', () => {
  const project = createProject();
  const detail = resolveImageDetailRecord({
    imageId: 'child-image', source: 'project', projectId: project.id, versionId: 'child', origin: 'project',
  }, { history: [], projects: [project] });

  assert.equal(detail.source, 'project');
  assert.equal(detail.prompt, '当前图片完整提示词');
  assert.deepEqual(detail.promptChain, [
    { label: '根节点', prompt: '根节点参考图提示词' },
    { label: '父节点', prompt: '父节点参考图提示词' },
  ]);
  assert.deepEqual(detail.backTarget, { label: '返回项目', path: '/project/project-1?version=child&image=child-image' });
  assert.equal(
    buildImageDetailRoute(detail, { origin: 'history' }),
    '/detail/child-image?source=project&origin=history&project=project-1&version=child',
  );
  assert.deepEqual(buildProjectPromptChain(project, project.versions[2]), detail.promptChain);
});

test('项目父节点缺失时详情仍可打开且不虚构提示词链', () => {
  const project = {
    id: 'project-orphan',
    name: '孤儿项目',
    versions: [{
      id: 'orphan', name: '孤儿节点', parentId: 'missing', parentImageId: 'missing-image', prompt: '孤儿版本提示词',
      images: [createImage('orphan-image', '孤儿图片提示词')],
    }],
  };
  const detail = resolveImageDetailRecord({
    imageId: 'orphan-image', source: 'project', projectId: project.id, versionId: 'orphan', origin: 'project',
  }, { history: [], projects: [project] });

  assert.equal(detail.prompt, '孤儿图片提示词');
  assert.deepEqual(detail.promptChain, []);
});
