// 页面切换时保留尚未提交的输入区草稿；仅存在于当前应用进程，不写入持久状态。
import { normalizeReferenceImages } from './reference-images.js';

function normalizeKey(key) {
  return String(key || '');
}

function cloneDraft(draft) {
  const clone = {
    prompt: String(draft.prompt || ''),
    sourceImages: [...draft.sourceImages],
  };
  // 选项字段按需保留，兼容只保存提示词与参考图的旧调用方。
  ['providerId', 'modelId', 'ratio', 'quality', 'quantity'].forEach((key) => {
    if (draft[key] !== undefined) clone[key] = draft[key];
  });
  return clone;
}

function copyOptionFields(target, source) {
  ['providerId', 'modelId', 'ratio', 'quality', 'quantity'].forEach((key) => {
    if (source && source[key] !== undefined) target[key] = source[key];
  });
  return target;
}

export function createComposerDraftStore() {
  const drafts = new Map();

  return {
    read(key, fallback = {}) {
      const normalizedKey = normalizeKey(key);
      if (drafts.has(normalizedKey)) return cloneDraft(drafts.get(normalizedKey));
      return copyOptionFields({
        prompt: String(fallback.prompt || ''),
        sourceImages: normalizeReferenceImages(fallback.sourceImages, fallback.sourceImage),
      }, fallback);
    },
    write(key, value = {}) {
      const normalizedKey = normalizeKey(key);
      if (!normalizedKey) return;
      const previous = drafts.get(normalizedKey) || { prompt: '', sourceImages: [] };
      const next = {
        prompt: typeof value.prompt === 'string' ? value.prompt : previous.prompt,
        sourceImages: value.sourceImages === undefined
          ? [...previous.sourceImages]
          : normalizeReferenceImages(value.sourceImages),
      };
      ['providerId', 'modelId', 'ratio', 'quality', 'quantity'].forEach((field) => {
        if (value[field] !== undefined) next[field] = value[field];
        else if (previous[field] !== undefined) next[field] = previous[field];
      });
      drafts.set(normalizedKey, next);
    },
    clear(key) {
      drafts.delete(normalizeKey(key));
    },
  };
}
