// 参考图数组的纯数据工具：兼容旧 sourceImage，并统一多图上限行为。

function appendUnique(target, value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || target.includes(normalized)) return false;
  target.push(normalized);
  return true;
}

export function normalizeReferenceImages(sourceImages, sourceImage = '') {
  const normalized = [];
  if (Array.isArray(sourceImages)) {
    sourceImages.forEach((image) => appendUnique(normalized, image));
  } else if (typeof sourceImages === 'string') {
    appendUnique(normalized, sourceImages);
  }
  appendUnique(normalized, sourceImage);
  return normalized;
}

export function mergeReferenceImages(existing, incoming, maxImages) {
  const images = normalizeReferenceImages(existing);
  const uniqueIncoming = normalizeReferenceImages(incoming);
  const limit = Number.isFinite(Number(maxImages)) ? Math.max(0, Math.floor(Number(maxImages))) : 0;
  const available = Math.max(0, limit - images.length);
  const accepted = [];
  let overflowCount = 0;

  for (const image of uniqueIncoming) {
    if (images.includes(image)) continue;
    if (accepted.length >= available) {
      overflowCount += 1;
      continue;
    }
    accepted.push(image);
  }

  images.push(...accepted);
  return { images, accepted, overflowCount };
}
