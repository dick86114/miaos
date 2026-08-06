// 图片详情的纯数据选择器：统一快速历史和项目图片的详情记录、返回路径与父节点提示词链。

function findVersion(project, versionId, imageId) {
  const versions = Array.isArray(project?.versions) ? project.versions : [];
  if (versionId) {
    const matched = versions.find((version) => version.id === versionId);
    if (matched) return matched;
  }
  return versions.find((version) => (Array.isArray(version.images) ? version.images : []).some((image) => image.id === imageId)) || null;
}

function findImage(version, imageId) {
  return (Array.isArray(version?.images) ? version.images : []).find((image) => image.id === imageId) || null;
}

function getBackTarget({ source, origin, projectId, versionId, imageId }) {
  if (origin === 'generate') return { label: '返回快速生图', path: '/generate' };
  if (source === 'project' && origin === 'project' && projectId) {
    return {
      label: '返回项目',
      path: `/project/${encodeURIComponent(projectId)}?version=${encodeURIComponent(versionId || '')}&image=${encodeURIComponent(imageId || '')}`,
    };
  }
  return { label: '返回历史', path: '/history' };
}

/**
 * 构建从根节点到当前版本父节点的提示词链。
 * 每一级优先使用实际作为参考图的图片提示词，缺失时回退版本提示词。
 */
export function buildProjectPromptChain(project, version) {
  const chain = [];
  let current = version;
  let guard = 0;
  while (current && current.parentId && guard < 50) {
    guard += 1;
    const parent = (Array.isArray(project?.versions) ? project.versions : []).find((item) => item.id === current.parentId);
    if (!parent) break;
    const parentImage = current.parentImageId ? findImage(parent, current.parentImageId) : null;
    chain.unshift({
      label: parent.name || '未命名节点',
      prompt: parentImage?.prompt || parent.prompt || '',
    });
    current = parent;
  }
  return chain;
}

/**
 * 将卡片记录转换为详情页地址。origin 决定详情页返回的页面。
 */
export function buildImageDetailRoute(record, { origin = 'history' } = {}) {
  const imageId = record?.imageId || record?.id || '';
  const source = record?.source === 'project' ? 'project' : 'quick';
  const params = new URLSearchParams({ source, origin: String(origin || 'history') });
  if (source === 'project') {
    if (record.projectId) params.set('project', record.projectId);
    if (record.versionId) params.set('version', record.versionId);
  }
  return `/detail/${encodeURIComponent(imageId)}?${params.toString()}`;
}

/**
 * 根据详情页路由参数解析统一图片记录；不存在时返回 null。
 */
export function resolveImageDetailRecord(route = {}, { history = [], projects = [] } = {}) {
  const imageId = String(route.imageId || route.id || '');
  const source = route.source === 'project' ? 'project' : 'quick';
  const origin = String(route.origin || 'history');

  if (source === 'project') {
    const project = (Array.isArray(projects) ? projects : []).find((item) => item.id === route.projectId);
    const version = findVersion(project, route.versionId, imageId);
    const image = findImage(version, imageId);
    if (!project || !version || !image) return null;

    return {
      ...image,
      id: image.id,
      imageId: image.id,
      source: 'project',
      projectId: project.id,
      projectName: project.name || '',
      versionId: version.id,
      versionName: version.name || '',
      prompt: image.prompt || version.prompt || '',
      promptChain: buildProjectPromptChain(project, version),
      providerId: image.providerId || version.providerId || '',
      providerName: image.providerName || version.providerName || '',
      modelId: image.modelId || image.model || version.modelId || '',
      model: image.model || image.modelId || version.modelId || '',
      ratio: image.ratio || version.ratio || '',
      quality: image.quality || version.quality || '',
      createdAt: image.createdAt || version.createdAt || 0,
      canDelete: false,
      backTarget: getBackTarget({ source, origin, projectId: project.id, versionId: version.id, imageId: image.id }),
    };
  }

  const item = (Array.isArray(history) ? history : []).find((record) => record.id === imageId);
  if (!item) return null;
  return {
    ...item,
    id: item.id,
    imageId: item.id,
    source: 'quick',
    prompt: item.prompt || '',
    promptChain: [],
    modelId: item.modelId || item.model || '',
    model: item.model || item.modelId || '',
    canDelete: true,
    backTarget: getBackTarget({ source, origin, imageId: item.id }),
  };
}
