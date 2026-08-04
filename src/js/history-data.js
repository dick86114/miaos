// 统一生成历史的数据选择器：只负责标准化、筛选、排序与分页，不读写应用状态。

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizePage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function normalizePageSize(value, fallback) {
  const pageSize = Number.parseInt(value, 10);
  return Number.isFinite(pageSize) && pageSize > 0 ? pageSize : fallback;
}

function paginate(items, { page, pageSize }, defaultPageSize) {
  const normalizedPageSize = normalizePageSize(pageSize, defaultPageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const currentPage = Math.min(normalizePage(page), totalPages);
  const start = (currentPage - 1) * normalizedPageSize;

  return {
    items: items.slice(start, start + normalizedPageSize),
    page: currentPage,
    pageSize: normalizedPageSize,
    total,
    totalPages,
  };
}

function sortByCreatedAtDescending(items) {
  return items.slice().sort((left, right) => {
    const timeDifference = normalizeTimestamp(right.createdAt) - normalizeTimestamp(left.createdAt);
    if (timeDifference !== 0) return timeDifference;
    return left.key.localeCompare(right.key);
  });
}

function normalizeQuickRecord(record) {
  return {
    ...record,
    id: record.id,
    historyId: record.id,
    key: `quick:${record.id}`,
    source: 'quick',
    createdAt: normalizeTimestamp(record.createdAt),
  };
}

function normalizeProjectImage(project, version, image) {
  return {
    ...image,
    id: image.id,
    key: `project:${project.id}:${version.id}:${image.id}`,
    source: 'project',
    projectId: project.id,
    versionId: version.id,
    imageId: image.id,
    projectName: project.name || '',
    prompt: image.prompt || version.prompt || '',
    providerId: image.providerId || version.providerId || '',
    providerName: image.providerName || version.providerName || '',
    model: image.model || image.modelId || version.modelId || '',
    createdAt: normalizeTimestamp(image.createdAt),
  };
}

function normalizeProjectHistory(projects) {
  return (Array.isArray(projects) ? projects : []).flatMap((project) => (
    (Array.isArray(project?.versions) ? project.versions : []).flatMap((version) => (
      (Array.isArray(version?.images) ? version.images : []).map((image) => normalizeProjectImage(project, version, image))
    ))
  ));
}

function matchesQuery(item, query) {
  if (!query) return true;
  const haystack = [
    item.prompt,
    item.providerName,
    item.model,
    item.projectName,
  ].join('\n').toLocaleLowerCase();
  return haystack.includes(query);
}

function filterUnifiedHistory(items, { query, source }) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  const normalizedSource = String(source || '').trim().toLocaleLowerCase();
  return items.filter((item) => {
    const sourceMatches = !normalizedSource || normalizedSource === 'all' || item.source === normalizedSource;
    return sourceMatches && matchesQuery(item, normalizedQuery);
  });
}

export function getPaginatedQuickHistory(records, options = {}) {
  const items = sortByCreatedAtDescending(
    (Array.isArray(records) ? records : []).map(normalizeQuickRecord),
  );
  return paginate(items, options, 12);
}

export function getUnifiedHistory({ history, projects } = {}, options = {}) {
  const quickItems = (Array.isArray(history) ? history : []).map(normalizeQuickRecord);
  const projectItems = normalizeProjectHistory(projects);
  const filteredItems = filterUnifiedHistory([...quickItems, ...projectItems], options);
  return paginate(sortByCreatedAtDescending(filteredItems), options, 24);
}
