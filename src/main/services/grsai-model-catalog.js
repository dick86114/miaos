const GRSAI_MODEL_CATALOG_URL = 'https://grsai.ai/dashboard/models';

function decodeNextPayloads(html) {
  const payloads = [];
  const pattern = /self\.__next_f\.push\(\[1,\s*"((?:\\.|[^"\\])*)"\]\)/gu;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    try {
      payloads.push(JSON.parse(`"${match[1]}"`));
    } catch (_) {
      // 单段数据损坏不影响后续 Next payload 解析。
    }
  }
  return payloads;
}

function readJsonArrayAfterKey(source, key) {
  const keyIndex = source.indexOf(`"${key}":`);
  if (keyIndex < 0) return null;
  const startIndex = source.indexOf('[', keyIndex + key.length + 3);
  if (startIndex < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(source.slice(startIndex, index + 1));
          return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

function parseGrsaiModelCatalog(html, category = 'image') {
  if (typeof html !== 'string' || !html) return null;
  for (const payload of decodeNextPayloads(html)) {
    const remoteModels = readJsonArrayAfterKey(payload, 'models');
    if (!remoteModels) continue;

    const models = [];
    const seen = new Set();
    for (const item of remoteModels) {
      const id = typeof item?.name === 'string' ? item.name.trim() : '';
      if (!id || item.type !== category || seen.has(id)) continue;
      seen.add(id);
      const description = typeof item.desc === 'string' ? item.desc.trim() : '';
      models.push({ id, name: description || id });
    }
    if (models.length > 0) return models;
  }
  return null;
}

module.exports = {
  GRSAI_MODEL_CATALOG_URL,
  parseGrsaiModelCatalog,
};
