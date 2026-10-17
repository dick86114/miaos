// 图像模型的用户可选参数能力表。
// 这里的选项必须与主进程各供应商适配器实际发送的字段保持一致。

const STANDARD_QUALITIES = [
  { value: '标准', label: '标准' },
  { value: '高清', label: '高清' },
  { value: '超高清', label: '超高清' },
];

const AUTO_QUALITY = [{ value: '自动', label: '自动（模型固定）' }];

const COMMON_RATIOS = ['1:1', '4:3', '16:9', '9:16'];
const DOC_RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16'];
const EXTENDED_RATIOS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'];
const GRSAI_RATIOS = [
  '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9',
];
const GRSAI_NANO_2_RATIOS = [...GRSAI_RATIOS, '1:4', '4:1', '1:8', '8:1'];
const GPT_IMAGE_RATIOS = [
  '1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '5:4', '4:5',
  '21:9', '9:21', '1:2', '2:1',
];

const GRSAI_ALL_RESOLUTIONS = new Set(['nano-banana-2', 'nano-banana-pro']);
const GRSAI_1K_ONLY = new Set([
  'nano-banana', 'nano-banana-fast', 'nano-banana-2-cl',
  'nano-banana-pro-cl', 'nano-banana-pro-vt',
]);
const GRSAI_2K_ONLY = new Set(['nano-banana-2-2k-cl']);
const GRSAI_4K_ONLY = new Set(['nano-banana-2-4k-cl', 'nano-banana-pro-4k-vip']);
const GRSAI_1K_2K = new Set(['nano-banana-pro-vip']);

const AIPING_STANDARD_HD = new Set([
  'Kling-V2.1', 'Kling-V1', '即梦文生图 3.0',
  '即梦文生图 3.1', '即梦图片生成 4.0', 'Kolors',
]);
const AIPING_HD_ONLY = new Set([
  'Doubao-Seedream-5.0-lite', 'Doubao-Seedream-4.5',
]);
const AIPING_FIXED_QUALITY = new Set([
  'Qwen-Image', 'Qwen-Image-Edit', 'HunyuanImage-3.0', 'glm-image',
  'Qwen-Image-Plus', 'Qwen-Image-Edit-Plus', 'Wan2.5-T2I-Preview',
  'Wan2.5-I2I-Preview',
]);

const AIPING_RATIO_PROFILES = {
  'Qwen-Image': DOC_RATIOS,
  'Qwen-Image-Plus': DOC_RATIOS,
  'Qwen-Image-Edit': EXTENDED_RATIOS,
  'Qwen-Image-Edit-Plus': EXTENDED_RATIOS,
  'Doubao-Seedream-4.0': EXTENDED_RATIOS,
  'Doubao-Seedream-4.5': EXTENDED_RATIOS,
  'Doubao-Seedream-5.0-lite': EXTENDED_RATIOS,
  'Kling-V2.1': ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'],
  'Kling-V1': ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9'],
  'glm-image': ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'],
  '即梦文生图 3.0': ['1:1', '4:3', '3:2', '16:9', '9:16', '21:9'],
  '即梦文生图 3.1': ['1:1', '4:3', '3:2', '16:9', '9:16', '21:9'],
  '即梦图片生成 4.0': ['1:1', '4:3', '3:2', '16:9', '9:16', '21:9'],
  'HunyuanImage-3.0': COMMON_RATIOS,
  Kolors: COMMON_RATIOS,
  'Wan2.5-T2I-Preview': COMMON_RATIOS,
  'Wan2.5-I2I-Preview': COMMON_RATIOS,
};

function qualities(...values) {
  return STANDARD_QUALITIES.filter((quality) => values.includes(quality.value));
}

function getGrsaiOptions(modelId) {
  if (modelId === 'gpt-image-2') {
    return { ratios: GPT_IMAGE_RATIOS, qualities: STANDARD_QUALITIES };
  }
  if (['gpt-image-2-vip', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'].includes(modelId)) {
    return { ratios: GPT_IMAGE_RATIOS, qualities: STANDARD_QUALITIES };
  }
  if (modelId === 'gpt-image-2.5') {
    return { ratios: GPT_IMAGE_RATIOS, qualities: qualities('标准') };
  }
  if (GRSAI_ALL_RESOLUTIONS.has(modelId)) {
    const ratios = modelId === 'nano-banana-2' ? GRSAI_NANO_2_RATIOS : GRSAI_RATIOS;
    return { ratios, qualities: STANDARD_QUALITIES };
  }
  if (GRSAI_1K_ONLY.has(modelId)) {
    return { ratios: GRSAI_RATIOS, qualities: qualities('标准') };
  }
  if (GRSAI_2K_ONLY.has(modelId)) {
    return { ratios: GRSAI_RATIOS, qualities: qualities('高清') };
  }
  if (GRSAI_4K_ONLY.has(modelId)) {
    return { ratios: GRSAI_RATIOS, qualities: qualities('超高清') };
  }
  if (GRSAI_1K_2K.has(modelId)) {
    return { ratios: GRSAI_RATIOS, qualities: qualities('标准', '高清') };
  }
  // 未匹配的动态模型先保守使用官方 nano-banana 通用比例，不让它选择清晰度。
  if (modelId.startsWith('nano-banana')) {
    return { ratios: GRSAI_RATIOS, qualities: AUTO_QUALITY };
  }
  return { ratios: COMMON_RATIOS, qualities: AUTO_QUALITY };
}

function getAipingOptions(modelId) {
  const ratios = AIPING_RATIO_PROFILES[modelId] || COMMON_RATIOS;
  if (modelId === 'Doubao-Seedream-4.0') return { ratios, qualities: STANDARD_QUALITIES };
  if (AIPING_STANDARD_HD.has(modelId)) return { ratios, qualities: qualities('标准', '高清') };
  if (AIPING_HD_ONLY.has(modelId)) {
    return { ratios, qualities: qualities('高清', '超高清') };
  }
  return { ratios, qualities: AUTO_QUALITY };
}


const AIPING_REFERENCE_IMAGE_LIMITS = new Map([
  ['Qwen-Image', 0],
  ['Qwen-Image-Plus', 0],
  ['Qwen-Image-Edit', 3],
  ['Qwen-Image-Edit-Plus', 3],
  ['HunyuanImage-3.0', 3],
  ['Doubao-Seedream-4.0', 10],
  ['Doubao-Seedream-4.5', 10],
  ['Doubao-Seedream-5.0-lite', 10],
  ['即梦图片生成 4.0', 10],
  ['即梦文生图 3.0', 0],
  ['即梦文生图 3.1', 0],
  ['Kling-V1', 10],
  ['Kling-V2.1', 10],
  ['Kolors', 0],
  ['glm-image', 0],
  ['Wan2.5-T2I-Preview', 0],
  ['Wan2.5-I2I-Preview', 3],
]);

const AIPING_APPLICATION_LIMIT_MODELS = new Set(['Kling-V1', 'Kling-V2.1']);

function referenceImageResult(maxImages, limitKind) {
  if (maxImages <= 0) {
    return { supported: false, maxImages: 0, limitKind: 'unsupported', message: '当前模型不支持参考图' };
  }
  if (limitKind === 'application') {
    return {
      supported: true,
      maxImages,
      limitKind,
      message: `当前模型支持多图，应用最多允许 ${maxImages} 张`,
    };
  }
  if (limitKind === 'documented') {
    return {
      supported: true,
      maxImages,
      limitKind,
      message: `当前模型最多支持 ${maxImages} 张参考图`,
    };
  }
  return {
    supported: true,
    maxImages,
    limitKind: 'unknown',
    message: '当前模型未声明多图能力，仅支持 1 张参考图',
  };
}

// 参考图上限来自供应商公开文档；文档未给数字时使用应用级安全上限，避免发出不可控的大请求。
export function getReferenceImageOptions(providerType, modelId) {
  const type = String(providerType || '').toLowerCase();
  const model = String(modelId || '').trim();

  if (type === 'grsai' || type === 'agnes-ai') {
    return referenceImageResult(10, 'application');
  }

  if (type === 'aiping') {
    if (!AIPING_REFERENCE_IMAGE_LIMITS.has(model)) return referenceImageResult(1, 'unknown');
    const maxImages = AIPING_REFERENCE_IMAGE_LIMITS.get(model);
    if (maxImages === 0) return referenceImageResult(0, 'unsupported');
    return referenceImageResult(maxImages, AIPING_APPLICATION_LIMIT_MODELS.has(model) ? 'application' : 'documented');
  }

  return referenceImageResult(1, 'unknown');
}

export function getImageParameterOptions(providerType, modelId) {
  const type = String(providerType || '').toLowerCase();
  const model = String(modelId || '').trim();

  if (type === 'grsai') return getGrsaiOptions(model);
  if (type === 'aiping') return getAipingOptions(model);

  // OpenAI 兼容、Agnes 与自定义供应商没有统一能力接口，保持现有四比例兜底。
  return { ratios: COMMON_RATIOS, qualities: STANDARD_QUALITIES };
}

export function normalizeImageParameters(providerType, modelId, ratio, quality) {
  const options = getImageParameterOptions(providerType, modelId);
  const nextRatio = options.ratios.includes(ratio) ? ratio : options.ratios[0];
  const nextQualityOption = options.qualities.find((item) => item.value === quality)
    || options.qualities.find((item) => item.value === '高清')
    || options.qualities[0];
  return {
    ratio: nextRatio,
    quality: nextQualityOption ? nextQualityOption.value : '高清',
    options,
  };
}

export const IMAGE_PARAMETER_QUALITY_LABELS = Object.fromEntries(
  STANDARD_QUALITIES.concat(AUTO_QUALITY).map((quality) => [quality.value, quality.label]),
);
