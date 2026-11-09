// Klong 使用 OpenAI Images 兼容协议：文生图走 generations，图生图走 edits。
const KLONG_IMAGE_MODELS = [
  { id: 'gpt-image-2', name: 'GPT Image 2' },
  { id: 'gpt-image-2.5', name: 'GPT Image 2.5' },
  { id: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare' },
  { id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst' },
  { id: 'gpt-image-2-exact', name: 'GPT Image 2 精确尺寸' },
  { id: 'gpt-image-2.5-exact', name: 'GPT Image 2.5 精确尺寸' },
  { id: 'gpt-image-2-1k', name: 'GPT Image 2 1K 直出' },
  { id: 'gpt-image-2.5-1k', name: 'GPT Image 2.5 1K 直出' },
  { id: 'gpt-image-2-vip', name: 'GPT Image 2 VIP' },
  { id: 'gpt-image-2-high', name: 'GPT Image 2 High' },
  { id: 'nano-banana2', name: 'Nano Banana 2' },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro' },
  { id: 'grok-imagine-image-2.0', name: 'Grok Imagine Image 2.0' },
];
const KLONG_IMAGE_MODEL_IDS = new Set(KLONG_IMAGE_MODELS.map((model) => model.id));

const KLONG_DIRECT_1K_MODELS = new Set(['gpt-image-2-1k', 'gpt-image-2.5-1k']);
const KLONG_GPT_IMAGE_MODELS = new Set([
  'gpt-image-2', 'gpt-image-2.5', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst',
  'gpt-image-2-exact', 'gpt-image-2.5-exact', 'gpt-image-2-1k', 'gpt-image-2.5-1k',
  'gpt-image-2-vip', 'gpt-image-2-high',
]);
const KLONG_SINGLE_IMAGE_MODELS = new Set(['grok-imagine-image-2.0']);
const KLONG_IMAGE_SIZE = {
  标准: '1K',
  高清: '2K',
  超高清: '4K',
};

// -exact 模型必须同时收到明确像素 size，才会执行精确缩放。
const KLONG_RATIO_SIZES = {
  '1K': {
    '1:1': '1024x1024',
    '4:3': '1280x960',
    '3:4': '960x1280',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '16:9': '1536x864',
    '9:16': '864x1536',
  },
  '2K': {
    '1:1': '2048x2048',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    '3:2': '2304x1536',
    '2:3': '1536x2304',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
  },
  '4K': {
    '1:1': '4096x4096',
    '4:3': '4096x3072',
    '3:4': '3072x4096',
    '3:2': '4086x2724',
    '2:3': '2724x4086',
    '16:9': '4096x2304',
    '9:16': '2304x4096',
  },
};

function normalizeSourceImages(sourceImages, sourceImage) {
  const normalized = [];
  const add = (value) => {
    const image = typeof value === 'string' ? value.trim() : '';
    if (image && !normalized.includes(image)) normalized.push(image);
  };
  if (Array.isArray(sourceImages)) sourceImages.forEach(add);
  add(sourceImage);
  return normalized;
}

function isKlongImageModelId(modelId) {
  const id = String(modelId || '').trim();
  return KLONG_IMAGE_MODEL_IDS.has(id) || /image|nano-banana|grok-imagine/i.test(id);
}

function resolveKlongImageModels(models) {
  const knownNames = new Map(KLONG_IMAGE_MODELS.map((model) => [model.id, model.name]));
  const knownOrder = new Map(KLONG_IMAGE_MODELS.map((model, index) => [model.id, index]));
  return (Array.isArray(models) ? models : [])
    .filter((model) => model && isKlongImageModelId(model.id))
    .sort((left, right) => (knownOrder.get(left.id) ?? Infinity) - (knownOrder.get(right.id) ?? Infinity))
    .map((model) => ({ id: model.id, name: knownNames.get(model.id) || model.name || model.id }));
}

function resolveKlongImageEndpoints(endpoint) {
  const raw = String(endpoint || '').trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return {
      generationUrl: raw,
      editUrl: raw.replace(/generations(\?.*)?$/i, 'edits'),
    };
  }

  let path = parsed.pathname.replace(/\/+$/u, '');
  path = path.replace(/\/images\/(?:generations|edits)$/iu, '');
  if (!/\/v\d+$/iu.test(path)) path = `${path}/v1`;

  const buildUrl = (suffix) => {
    const url = new URL(parsed.origin);
    url.pathname = `${path}${suffix}`;
    return url.toString();
  };

  return {
    generationUrl: buildUrl('/images/generations'),
    editUrl: buildUrl('/images/edits'),
  };
}

function buildKlongImageRequest({
  modelId,
  prompt,
  ratio = '1:1',
  quality = '高清',
  sourceImage,
  sourceImages,
}) {
  const model = String(modelId || '').trim();
  if (!model) throw new Error('Klong 模型名称不能为空');

  const normalizedRatio = KLONG_RATIO_SIZES['2K'][ratio] ? ratio : '1:1';
  const requestedImageSize = KLONG_IMAGE_SIZE[quality] || '2K';
  const imageSize = KLONG_DIRECT_1K_MODELS.has(model) ? '1K' : requestedImageSize;
  const body = {
    model,
    prompt,
    n: 1,
    response_format: 'b64_json',
    output_format: 'png',
  };

  body.size = KLONG_RATIO_SIZES[imageSize][normalizedRatio];

  const images = normalizeSourceImages(sourceImages, sourceImage);
  if (images.length > 0) {
    if (KLONG_SINGLE_IMAGE_MODELS.has(model) && images.length > 1) {
      throw new Error(`${model} 当前只支持 1 张参考图`);
    }
    if (KLONG_GPT_IMAGE_MODELS.has(model)) {
      body.reference_images = images;
    } else {
      body.image = images.length === 1 ? images[0] : images;
    }
  }
  return body;
}

module.exports = {
  KLONG_GPT_IMAGE_MODELS,
  KLONG_IMAGE_MODELS,
  KLONG_RATIO_SIZES,
  buildKlongImageRequest,
  isKlongImageModelId,
  resolveKlongImageModels,
  resolveKlongImageEndpoints,
};
