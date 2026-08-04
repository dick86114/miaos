const AIPING_IMAGE_MODEL_IDS = [
  'Qwen-Image', 'Qwen-Image-Edit', 'HunyuanImage-3.0', '即梦文生图 3.0', '即梦文生图 3.1',
  'Doubao-Seedream-4.0', 'Kling-V2.1', 'Kling-V1', 'glm-image', 'Doubao-Seedream-5.0-lite',
  'Doubao-Seedream-4.5', '即梦图片生成 4.0', 'Kolors', 'Qwen-Image-Plus', 'Qwen-Image-Edit-Plus',
  'Wan2.5-T2I-Preview', 'Wan2.5-I2I-Preview',
];

const PROVIDER_OPTIONS = {
  enable_image_base64: false,
  enable_image_origin_data: false,
};

const EDIT_ONLY_MODELS = new Set(['Qwen-Image-Edit', 'Qwen-Image-Edit-Plus', 'Wan2.5-I2I-Preview']);
const TEXT_ONLY_MODELS = new Set([
  'Qwen-Image', 'HunyuanImage-3.0', '即梦文生图 3.0', '即梦文生图 3.1',
  'glm-image', 'Kolors', 'Qwen-Image-Plus', 'Wan2.5-T2I-Preview',
]);

const RATIO_MAPS = {
  qwen: { '1:1': '1280*1280', '4:3': '1280*960', '16:9': '1280*720', '9:16': '720*1280' },
  hunyuan: { '1:1': '1024*1024', '4:3': '1152*864', '16:9': '1344*768', '9:16': '768*1344' },
  jimeng1k: { '1:1': [1328, 1328], '4:3': [1472, 1104], '16:9': [1664, 936], '9:16': [936, 1664] },
  jimeng2k: { '1:1': [2048, 2048], '4:3': [2304, 1728], '16:9': [2560, 1440], '9:16': [1440, 2560] },
  seedream4_1k: { '1:1': '1024*1024', '4:3': '1280*960', '16:9': '1600*900', '9:16': '900*1600' },
  seedream2k: { '1:1': '2048*2048', '4:3': '2304*1728', '16:9': '2560*1440', '9:16': '1440*2560' },
  seedream5: { '1:1': '2048*2048', '4:3': '2304*1728', '16:9': '2848*1600', '9:16': '1600*2848' },
  glm: { '1:1': '1280x1280', '4:3': '1472x1088', '16:9': '1728x960', '9:16': '960x1728' },
  kolors: { '1:1': '1024x1024', '4:3': '1280x960', '16:9': '1280x720', '9:16': '720x1280' },
  wan: { '1:1': '1280*1280', '4:3': '1280*960', '16:9': '1280*720', '9:16': '720*1280' },
};

function valueForRatio(map, ratio) {
  return map[ratio] || map['1:1'];
}

function commonBody(modelId, prompt, sourceImage) {
  return {
    model: modelId,
    prompt,
    ...(sourceImage ? { image: sourceImage } : {}),
    extra_body: { provider: { ...PROVIDER_OPTIONS } },
  };
}

function requireCompatibleImageMode(modelId, sourceImage) {
  if (EDIT_ONLY_MODELS.has(modelId) && !sourceImage) {
    throw new Error(`${modelId} 是图片编辑模型，需要先上传参考图`);
  }
  if (TEXT_ONLY_MODELS.has(modelId) && sourceImage) {
    throw new Error(`${modelId} 不支持图生图，请改用图片编辑模型`);
  }
}

function buildAipingImageRequest({ modelId, prompt, ratio = '1:1', quality = '高清', size, sourceImage }) {
  const normalizedModel = String(modelId || '').trim();
  if (!normalizedModel) throw new Error('Aiping 模型名称不能为空');
  requireCompatibleImageMode(normalizedModel, sourceImage);
  const body = commonBody(normalizedModel, prompt, sourceImage);
  const standardQuality = quality === '标准';

  if (normalizedModel === 'Doubao-Seedream-5.0-lite') {
    return { ...body, size: valueForRatio(RATIO_MAPS.seedream5, ratio), output_format: 'png', watermark: false, sequential_image_generation: 'disabled' };
  }
  if (normalizedModel === 'Doubao-Seedream-4.5') {
    return { ...body, size: valueForRatio(RATIO_MAPS.seedream2k, ratio), output_format: 'jpeg', watermark: false, force_single: true, optimize_prompt_options: { mode: 'standard' } };
  }
  if (normalizedModel === 'Doubao-Seedream-4.0') {
    const sizes = standardQuality ? RATIO_MAPS.seedream4_1k : RATIO_MAPS.seedream2k;
    return { ...body, size: valueForRatio(sizes, ratio), watermark: false, force_single: true, optimize_prompt_options: { mode: standardQuality ? 'fast' : 'standard' } };
  }
  if (normalizedModel === 'Kling-V2.1' || normalizedModel === 'Kling-V1') {
    return { ...body, resolution: standardQuality ? '1k' : '2k', n: 1, aspect_ratio: ratio };
  }
  if (normalizedModel === 'glm-image') {
    return { ...body, size: valueForRatio(RATIO_MAPS.glm, ratio), quality: 'hd' };
  }
  if (normalizedModel === '即梦文生图 3.0' || normalizedModel === '即梦文生图 3.1') {
    const [width, height] = valueForRatio(standardQuality ? RATIO_MAPS.jimeng1k : RATIO_MAPS.jimeng2k, ratio);
    return { ...body, use_pre_llm: true, seed: -1, width, height };
  }
  if (normalizedModel === '即梦图片生成 4.0') {
    const [width, height] = valueForRatio(standardQuality ? RATIO_MAPS.jimeng1k : RATIO_MAPS.jimeng2k, ratio);
    return { ...body, width, height, scale: sourceImage ? 0.6 : 0.5, force_single: true };
  }
  if (normalizedModel === 'Kolors') {
    return { ...body, image_size: valueForRatio(RATIO_MAPS.kolors, ratio), num_inference_steps: standardQuality ? 20 : 30 };
  }
  if (normalizedModel === 'HunyuanImage-3.0') {
    return { ...body, size: valueForRatio(RATIO_MAPS.hunyuan, ratio), seed: -1 };
  }
  if (normalizedModel === 'Qwen-Image' || normalizedModel === 'Qwen-Image-Plus') {
    return { ...body, size: valueForRatio(RATIO_MAPS.qwen, ratio), n: 1, prompt_extend: true, watermark: false };
  }
  if (normalizedModel === 'Qwen-Image-Edit' || normalizedModel === 'Qwen-Image-Edit-Plus') {
    return { ...body, size: valueForRatio(RATIO_MAPS.qwen, ratio), n: 1, prompt_extend: true, watermark: false };
  }
  if (normalizedModel === 'Wan2.5-T2I-Preview' || normalizedModel === 'Wan2.5-I2I-Preview') {
    return { ...body, size: valueForRatio(RATIO_MAPS.wan, ratio), n: 1, prompt_extend: false, watermark: false };
  }

  const fallbackSize = String(size || '1024x1024').replace(/[x×]/i, '*');
  return { ...body, n: 1, size: fallbackSize };
}

module.exports = {
  AIPING_IMAGE_MODEL_IDS,
  buildAipingImageRequest,
};
