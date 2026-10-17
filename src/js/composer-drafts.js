// 页面切换时保留尚未提交的输入区草稿；仅存在于当前应用进程，不写入持久状态。
import { normalizeReferenceImages } from './reference-images.js';

function normalizeKey(key) {
  return String(key || '');
}

function cloneDraft(draft) {
  return {
    prompt: String(draft.prompt || ''),
    sourceImages: [...draft.sourceImages],
  };
}

export function createComposerDraftStore() {
  const drafts = new Map();

  return {
    read(key, fallback = {}) {
      const normalizedKey = normalizeKey(key);
      if (drafts.has(normalizedKey)) return cloneDraft(drafts.get(normalizedKey));
      return {
        prompt: String(fallback.prompt || ''),
        sourceImages: normalizeReferenceImages(fallback.sourceImages, fallback.sourceImage),
      };
    },
    write(key, value = {}) {
      const normalizedKey = normalizeKey(key);
      if (!normalizedKey) return;
      const previous = drafts.get(normalizedKey) || { prompt: '', sourceImages: [] };
      drafts.set(normalizedKey, {
        prompt: typeof value.prompt === 'string' ? value.prompt : previous.prompt,
        sourceImages: value.sourceImages === undefined
          ? [...previous.sourceImages]
          : normalizeReferenceImages(value.sourceImages),
      });
    },
    clear(key) {
      drafts.delete(normalizeKey(key));
    },
  };
}
